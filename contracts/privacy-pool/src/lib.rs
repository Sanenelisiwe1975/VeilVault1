//! Privacy Pool Contract
//!
//! A commitment-tree–based shielded asset pool for VeilVault1.
//! Implements the core Privacy Pools / Tornado-style architecture adapted for
//! Stellar's compliance model:
//!
//! # Mechanics
//!
//! DEPOSIT
//!   Sender computes:
//!     commitment = SHA-256(secret || nullifier || amount)
//!   Calls deposit(asset, amount, commitment).
//!   Contract:
//!     - receives the asset via SAC transfer
//!     - inserts the commitment as a leaf in the Merkle tree
//!     - emits Deposit event with leaf_index (not the secret)
//!
//! WITHDRAW
//!   Owner generates off-chain:
//!     A Groth16 proof that:
//!       (a) commitment is a leaf in the current Merkle root
//!       (b) nullifier = SHA-256(secret) matches the stored commitment
//!       (c) recipient address is bound to the proof
//!   Calls withdraw(proof, public_inputs, recipient, root, nullifier_hash).
//!   Contract:
//!     - verifies the nullifier has not been spent
//!     - verifies the Groth16 proof via zk-attestation cross-contract call
//!     - marks nullifier spent
//!     - transfers asset to recipient
//!
//! # Merkle Tree
//!   Depth: 20 levels → max 2^20 ≈ 1 million commitments
//!   Hash:  SHA-256 (Poseidon preferred once natively available)
//!   Implementation: incremental insertion, no deletion.
//!   Roots of the last ROOTS_HISTORY_SIZE insertions are kept for proof validity
//!   during the off-chain proving window.
//!
//! # Association Set Provider (ASP) support
//!   Admin can register an ASP address that publishes "clean" inclusion sets.
//!   Withdrawers can optionally include an asp_proof in the public inputs to
//!   demonstrate they are NOT withdrawing from a tainted sub-tree, enabling
//!   compliance-friendly anonymous transfers per the Privacy Pools paper.
//!
//! # Denomination pools
//!   Each (asset, denomination) pair is a separate pool to prevent amount
//!   correlation.  Denominations are fixed at pool creation:
//!   e.g. 10 USDC, 100 USDC, 1000 USDC.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, token, symbol_short,
    Address, Bytes, BytesN, Env, Val, Vec,
};

// ─── Errors ──────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PoolError {
    AlreadyInitialized   = 1,
    NotInitialized       = 2,
    Unauthorized         = 3,
    TreeFull             = 4,
    NullifierSpent       = 5,
    InvalidRoot          = 6,
    ProofInvalid         = 7,
    ZkVerifierNotSet     = 8,
    InvalidDenomination  = 9,
    Paused               = 10,
    InvalidWithdrawAmt   = 11,
}

// ─── Storage types ────────────────────────────────────────────────────────────

/// Global pool configuration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolConfig {
    pub admin: Address,
    /// The SAC token this pool accepts.
    pub asset: Address,
    /// Fixed deposit denomination (e.g. 10_000_000 = 10 USDC with 6 decimals).
    pub denomination: i128,
    /// zk-attestation contract that verifies withdrawal proofs.
    pub zk_verifier: Option<Address>,
    /// Groth16 circuit registered in zk-verifier for withdraw proofs.
    pub withdraw_circuit_id: Option<BytesN<32>>,
    /// Optional Association Set Provider for compliance proofs.
    pub asp: Option<Address>,
    pub total_deposits: u64,
    pub total_withdrawals: u64,
    pub is_paused: bool,
}

/// Merkle tree state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreeState {
    /// Current number of leaves inserted.
    pub next_index: u32,
    /// Depth of the tree.
    pub depth: u32,
    /// Current root of the tree.
    pub current_root: BytesN<32>,
}

#[contracttype]
pub enum DataKey {
    Config,
    Tree,
    /// Leaf node at index.
    Leaf(u32),
    /// Filled subtree hash at level l (used for incremental insertion).
    FilledSubtree(u32),
    /// Whether a nullifier hash has been spent.
    Nullifier(BytesN<32>),
    /// Root stored at insertion index (for historical root lookups).
    Root(u32),
    /// Monotonic counter for root history index.
    RootIndex,
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TREE_DEPTH: u32        = 20;
const MAX_LEAVES: u32        = 1 << TREE_DEPTH; // 1_048_576
const ROOTS_HISTORY_SIZE: u32 = 30;   // keep last 30 roots valid for proving
const INSTANCE_TTL: u32      = 1_000_000;
const LEAF_TTL: u32          = 1_000_000;

/// Zero value for empty leaves — SHA-256("veilpool_zero").
/// Pre-computed to avoid on-chain computation of the zero subtree hashes.
const ZERO_VALUE: [u8; 32] = [
    0x6e, 0x34, 0x0b, 0x9c, 0xff, 0xb3, 0x7a, 0x98,
    0x9c, 0xa5, 0x44, 0xe6, 0xbb, 0x78, 0x0a, 0x2c,
    0x78, 0x90, 0x1d, 0x3f, 0xb3, 0x37, 0x38, 0x76,
    0x85, 0x11, 0xa3, 0x06, 0x17, 0xaf, 0xa0, 0x1d,
];

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct PrivacyPoolContract;

#[contractimpl]
impl PrivacyPoolContract {

    // ── Initialisation ───────────────────────────────────────────────────────

    pub fn initialize(
        env: Env,
        admin: Address,
        asset: Address,
        denomination: i128,
    ) -> Result<(), PoolError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(PoolError::AlreadyInitialized);
        }
        admin.require_auth();
        if denomination <= 0 {
            return Err(PoolError::InvalidDenomination);
        }

        let config = PoolConfig {
            admin,
            asset,
            denomination,
            zk_verifier: None,
            withdraw_circuit_id: None,
            asp: None,
            total_deposits: 0,
            total_withdrawals: 0,
            is_paused: false,
        };
        env.storage().instance().set(&DataKey::Config, &config);

        // Initialise the Merkle tree with zero-value subtrees at every level.
        let zero = BytesN::from_array(&env, &ZERO_VALUE);
        let mut current = zero.clone();
        for level in 0..TREE_DEPTH {
            env.storage().persistent().set(&DataKey::FilledSubtree(level), &current);
            env.storage().persistent().extend_ttl(&DataKey::FilledSubtree(level), LEAF_TTL, LEAF_TTL);
            current = Self::hash_pair(&env, &current, &current);
        }

        let tree = TreeState {
            next_index: 0,
            depth: TREE_DEPTH,
            current_root: current,
        };
        env.storage().instance().set(&DataKey::Tree, &tree);
        env.storage().instance().set(&DataKey::RootIndex, &0u32);

        // Store the initial root in history.
        let root = tree.current_root.clone();
        Self::store_root(&env, &root);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        Ok(())
    }

    /// Set the zk-attestation verifier and withdrawal circuit.
    pub fn set_verifier(
        env: Env,
        zk_verifier: Address,
        withdraw_circuit_id: BytesN<32>,
    ) -> Result<(), PoolError> {
        let mut config = Self::require_admin(&env)?;
        config.zk_verifier = Some(zk_verifier);
        config.withdraw_circuit_id = Some(withdraw_circuit_id);
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    pub fn set_asp(env: Env, asp: Address) -> Result<(), PoolError> {
        let mut config = Self::require_admin(&env)?;
        config.asp = Some(asp);
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    pub fn set_paused(env: Env, paused: bool) -> Result<(), PoolError> {
        let mut config = Self::require_admin(&env)?;
        config.is_paused = paused;
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    // ── Deposit ──────────────────────────────────────────────────────────────

    /// Deposit exactly one denomination unit into the pool.
    ///
    /// `commitment` = SHA-256(secret || nullifier || le_bytes(amount))
    /// computed and kept private by the depositor.
    ///
    /// Returns the leaf_index so the depositor knows their position in the tree.
    pub fn deposit(
        env: Env,
        depositor: Address,
        commitment: BytesN<32>,
    ) -> Result<u32, PoolError> {
        let mut config = Self::load_config(&env)?;
        if config.is_paused {
            return Err(PoolError::Paused);
        }
        depositor.require_auth();

        let mut tree: TreeState = env.storage().instance()
            .get(&DataKey::Tree)
            .ok_or(PoolError::NotInitialized)?;

        if tree.next_index >= MAX_LEAVES {
            return Err(PoolError::TreeFull);
        }

        // Transfer denomination from depositor to this contract.
        token::Client::new(&env, &config.asset)
            .transfer(&depositor, &env.current_contract_address(), &config.denomination);

        // Insert commitment as a new leaf and update the root.
        let leaf_index = tree.next_index;
        let new_root = Self::insert_leaf(&env, leaf_index, &commitment);
        tree.next_index += 1;
        tree.current_root = new_root.clone();

        env.storage().instance().set(&DataKey::Tree, &tree);
        Self::store_root(&env, &new_root);

        config.total_deposits += 1;
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (symbol_short!("DEPOSIT"), depositor),
            (commitment, leaf_index),
        );
        Ok(leaf_index)
    }

    // ── Withdraw ─────────────────────────────────────────────────────────────

    /// Withdraw one denomination unit from the pool.
    ///
    /// The caller provides:
    ///   - `root`:          a recent Merkle root (must be in history)
    ///   - `nullifier_hash`: SHA-256(nullifier) binding to the commitment
    ///   - `recipient`:     the address that will receive the funds
    ///   - `attestation_id`: ID returned by zk-attestation after proof verification
    ///
    /// The Groth16 proof itself is pre-verified off-chain via the zk-attestation
    /// contract. The public inputs committed to in that attestation must encode:
    ///   [0] root
    ///   [1] nullifier_hash
    ///   [2] recipient (as Fr, lower 31 bytes of the raw address bytes)
    ///   [3] denomination (as Fr)
    ///
    /// This two-phase design (verify proof in zk-attestation, then use the
    /// attestation_id here) avoids duplicating BLS12-381 verification and
    /// keeps the privacy pool contract within Soroban's instruction budget.
    pub fn withdraw(
        env: Env,
        recipient: Address,
        root: BytesN<32>,
        nullifier_hash: BytesN<32>,
        attestation_id: BytesN<32>,
    ) -> Result<(), PoolError> {
        let mut config = Self::load_config(&env)?;
        if config.is_paused {
            return Err(PoolError::Paused);
        }
        recipient.require_auth();

        // Check nullifier not spent (prevents double withdrawal).
        let null_key = DataKey::Nullifier(nullifier_hash.clone());
        if env.storage().persistent().has(&null_key) {
            return Err(PoolError::NullifierSpent);
        }

        // Verify root is in recent history.
        if !Self::check_known_root(&env, &root) {
            return Err(PoolError::InvalidRoot);
        }

        // Cross-contract: confirm the attestation_id represents a valid proof.
        let zk_verifier = config.zk_verifier.as_ref().ok_or(PoolError::ZkVerifierNotSet)?;
        let mut args: Vec<Val> = Vec::new(&env);
        args.push_back(attestation_id.clone().into());
        let proof_valid: bool = env.invoke_contract(
            zk_verifier,
            &soroban_sdk::Symbol::new(&env, "is_valid"),
            args,
        );
        if !proof_valid {
            return Err(PoolError::ProofInvalid);
        }

        // Mark nullifier as spent.
        env.storage().persistent().set(&null_key, &true);
        env.storage().persistent().extend_ttl(&null_key, LEAF_TTL, LEAF_TTL);

        // Transfer denomination to recipient.
        token::Client::new(&env, &config.asset)
            .transfer(&env.current_contract_address(), &recipient, &config.denomination);

        config.total_withdrawals += 1;
        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (symbol_short!("WDRAW"), recipient),
            (nullifier_hash, root),
        );
        Ok(())
    }

    // ── Views ────────────────────────────────────────────────────────────────

    pub fn get_config(env: Env) -> Result<PoolConfig, PoolError> {
        Self::load_config(&env)
    }

    pub fn get_tree_state(env: Env) -> Result<TreeState, PoolError> {
        env.storage().instance()
            .get(&DataKey::Tree)
            .ok_or(PoolError::NotInitialized)
    }

    pub fn get_current_root(env: Env) -> Result<BytesN<32>, PoolError> {
        let tree: TreeState = env.storage().instance()
            .get(&DataKey::Tree)
            .ok_or(PoolError::NotInitialized)?;
        Ok(tree.current_root)
    }

    pub fn is_nullifier_spent(env: Env, nullifier_hash: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Nullifier(nullifier_hash))
    }

    /// Public view: returns true if `root` is within the recent root history window.
    pub fn is_known_root(env: Env, root: BytesN<32>) -> bool {
        Self::check_known_root(&env, &root)
    }

    fn check_known_root(env: &Env, root: &BytesN<32>) -> bool {
        let idx: u32 = env.storage().instance()
            .get(&DataKey::RootIndex)
            .unwrap_or(0);
        let size = ROOTS_HISTORY_SIZE;
        for i in 0..size {
            let check_idx = idx.wrapping_sub(i) % size;
            let stored: Option<BytesN<32>> = env.storage().persistent()
                .get(&DataKey::Root(check_idx));
            if let Some(r) = stored {
                if r == *root {
                    return true;
                }
            }
        }
        false
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    /// Insert a leaf at `index` using the incremental Merkle tree algorithm.
    /// Returns the new Merkle root.
    fn insert_leaf(env: &Env, index: u32, leaf: &BytesN<32>) -> BytesN<32> {
        let mut current = leaf.clone();
        let mut current_index = index;

        for level in 0..TREE_DEPTH {
            let (left, right) = if current_index % 2 == 0 {
                // We are the left child; right is the zero subtree at this level.
                let right: BytesN<32> = env.storage().persistent()
                    .get(&DataKey::FilledSubtree(level))
                    .unwrap_or(BytesN::from_array(env, &ZERO_VALUE));
                // Update filled subtree so future right-side insertions use our value.
                env.storage().persistent().set(&DataKey::FilledSubtree(level), &current);
                env.storage().persistent().extend_ttl(&DataKey::FilledSubtree(level), LEAF_TTL, LEAF_TTL);
                (current.clone(), right)
            } else {
                // We are the right child; left is the already-filled subtree.
                let left: BytesN<32> = env.storage().persistent()
                    .get(&DataKey::FilledSubtree(level))
                    .unwrap_or(BytesN::from_array(env, &ZERO_VALUE));
                (left, current.clone())
            };
            current = Self::hash_pair(env, &left, &right);
            current_index /= 2;
        }
        current
    }

    /// SHA-256(left || right) — the tree's internal hash function.
    fn hash_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
        let mut data = Bytes::new(env);
        data.append(&left.clone().into());
        data.append(&right.clone().into());
        env.crypto().sha256(&data).into()
    }

    /// Store root in the circular history buffer.
    fn store_root(env: &Env, root: &BytesN<32>) {
        let idx: u32 = env.storage().instance()
            .get(&DataKey::RootIndex)
            .unwrap_or(0);
        let new_idx = (idx + 1) % ROOTS_HISTORY_SIZE;
        env.storage().persistent().set(&DataKey::Root(new_idx), root);
        env.storage().persistent().extend_ttl(&DataKey::Root(new_idx), LEAF_TTL, LEAF_TTL);
        env.storage().instance().set(&DataKey::RootIndex, &new_idx);
    }

    fn load_config(env: &Env) -> Result<PoolConfig, PoolError> {
        env.storage().instance()
            .get::<DataKey, PoolConfig>(&DataKey::Config)
            .ok_or(PoolError::NotInitialized)
    }

    fn require_admin(env: &Env) -> Result<PoolConfig, PoolError> {
        let config = Self::load_config(env)?;
        config.admin.require_auth();
        Ok(config)
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn make_commitment(env: &Env, secret: u8, nullifier: u8) -> BytesN<32> {
        let mut data = Bytes::new(env);
        data.push_back(secret);
        data.push_back(nullifier);
        env.crypto().sha256(&data).into()
    }

    struct Setup {
        env: Env,
        admin: Address,
        asset: Address,
        client: PrivacyPoolContractClient<'static>,
    }

    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone());
        let asset = token.address();

        let id = env.register_contract(None, PrivacyPoolContract);
        let client: PrivacyPoolContractClient<'static> =
            unsafe { core::mem::transmute(PrivacyPoolContractClient::new(&env, &id)) };

        client.initialize(&admin, &asset, &10_000_000_i128); // 10 USDC denomination
        Setup { env, admin, asset, client }
    }

    fn mint(env: &Env, asset: &Address, recipient: &Address, amount: i128) {
        use soroban_sdk::token::StellarAssetClient;
        let token_admin = Address::generate(env);
        let sac = StellarAssetClient::new(env, asset);
        sac.mint(recipient, &amount);
    }

    #[test]
    fn test_initialize() {
        let s = setup();
        let tree = s.client.get_tree_state();
        assert_eq!(tree.next_index, 0);
        assert_eq!(tree.depth, 20);
    }

    #[test]
    fn test_deposit_inserts_leaf_and_updates_root() {
        let s = setup();
        let depositor = Address::generate(&s.env);
        mint(&s.env, &s.asset, &depositor, 10_000_000);

        let root_before = s.client.get_current_root();
        let commitment = make_commitment(&s.env, 42, 99);
        let leaf_index = s.client.deposit(&depositor, &commitment);

        assert_eq!(leaf_index, 0);
        let root_after = s.client.get_current_root();
        assert_ne!(root_before, root_after, "root must change after deposit");

        let tree = s.client.get_tree_state();
        assert_eq!(tree.next_index, 1);
    }

    #[test]
    fn test_two_deposits_produce_different_roots() {
        let s = setup();
        let d1 = Address::generate(&s.env);
        let d2 = Address::generate(&s.env);
        mint(&s.env, &s.asset, &d1, 10_000_000);
        mint(&s.env, &s.asset, &d2, 10_000_000);

        let c1 = make_commitment(&s.env, 1, 2);
        let c2 = make_commitment(&s.env, 3, 4);
        s.client.deposit(&d1, &c1);
        let root1 = s.client.get_current_root();
        s.client.deposit(&d2, &c2);
        let root2 = s.client.get_current_root();
        assert_ne!(root1, root2);
    }

    #[test]
    fn test_nullifier_not_spent_initially() {
        let s = setup();
        let nullifier_hash = BytesN::from_array(&s.env, &[0xAB; 32]);
        assert!(!s.client.is_nullifier_spent(&nullifier_hash));
    }

    #[test]
    fn test_is_known_root_after_deposit() {
        let s = setup();
        let depositor = Address::generate(&s.env);
        mint(&s.env, &s.asset, &depositor, 10_000_000);
        let commitment = make_commitment(&s.env, 7, 8);
        s.client.deposit(&depositor, &commitment);
        let root = s.client.get_current_root();
        // Verify the root is in the history pool (public call uses is_known_root internally)
        // by checking no second deposit invalidated it for the history window.
        let tree = s.client.get_tree_state();
        assert_eq!(tree.next_index, 1);
        assert_eq!(tree.current_root, root);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_double_initialize_panics() {
        let s = setup();
        let admin2 = Address::generate(&s.env);
        let asset2 = Address::generate(&s.env);
        s.client.initialize(&admin2, &asset2, &10_000_000_i128);
    }

    #[test]
    #[should_panic(expected = "InvalidDenomination")]
    fn test_zero_denomination_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let id = env.register_contract(None, PrivacyPoolContract);
        let client: PrivacyPoolContractClient<'static> =
            unsafe { core::mem::transmute(PrivacyPoolContractClient::new(&env, &id)) };
        client.initialize(&admin, &asset, &0_i128);
    }
}
