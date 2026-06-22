
//! Privacy Pool Contract — ZK-native Merkle tree (MiMC-5 over BLS12-381 Fr)
//!
//! # Hash function upgrade (v2)
//!
//! The Merkle tree now uses MiMC-5 Feistel over BLS12-381 Fr instead of SHA-256.
//! Operating in the same field as Groth16/BLS12-381 ZK circuits reduces withdrawal
//! proof size by ~10× (SHA-256 ≈ 27,000 R1CS constraints per call;
//! MiMC-5 ≈ 3 constraints per round × 110 rounds × 20 levels ≈ 6,600 total).
//!
//! Round constants are derived from a public seed via SHA-256 chain and stored
//! in instance storage during `initialize`.  ZK circuit implementations MUST
//! use the same construction:
//!
//!   seed  = SHA-256(b"veilpool_mimc5_bls12381_rc_v1")
//!   c[0]  = seed  with byte[0] = 0x00
//!   c[i]  = SHA-256(c[i-1]) with byte[0] = 0x00   ← chains on the ZEROED buffer
//!   round: (a, b) = (b, a + (b + c[i])^5)  for i in 0..110
//!   output: (a + b).to_bytes()
//!   Leaves are zeroed at byte[0] once on insertion; all subsequent inputs are
//!   already valid Fr elements and are used directly (no additional zeroing).
//!
//! The commitment scheme (SHA-256(secret ‖ nullifier)) is unchanged — it runs
//! off-chain and is circuit-independent.
//!
//! # Architecture
//!
//! DEPOSIT:  sender computes commitment = SHA-256(secret ‖ nullifier), calls
//!           deposit(asset, amount, commitment).  Contract receives SAC transfer,
//!           inserts commitment as a leaf, emits Deposit(leaf_index).
//!
//! WITHDRAW: owner generates Groth16 proof off-chain (binding root, nullifier_hash,
//!           recipient, denomination), submits it to zk-attestation to get an
//!           attestation_id, then calls withdraw(root, nullifier_hash, attestation_id).
//!
//! # Association Set Provider (ASP)
//!   Admin can register an ASP that publishes "clean" inclusion sets for
//!   compliance-friendly anonymous transfers (Privacy Pools paper §4).

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, token, symbol_short,
    crypto::bls12_381::Fr,
    Address, Bytes, BytesN, Env, Val, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PoolError {
    AlreadyInitialized  = 1,
    NotInitialized      = 2,
    Unauthorized        = 3,
    TreeFull            = 4,
    NullifierSpent      = 5,
    InvalidRoot         = 6,
    ProofInvalid        = 7,
    ZkVerifierNotSet    = 8,
    InvalidDenomination = 9,
    Paused              = 10,
    InvalidWithdrawAmt  = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolConfig {
    pub admin: Address,
    pub asset: Address,
    pub denomination: i128,
    pub zk_verifier: Option<Address>,
    pub withdraw_circuit_id: Option<BytesN<32>>,
    pub asp: Option<Address>,
    pub total_deposits: u64,
    pub total_withdrawals: u64,
    pub is_paused: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreeState {
    pub next_index: u32,
    pub depth: u32,
    pub current_root: BytesN<32>,
}

#[contracttype]
pub enum DataKey {
    Config,
    Tree,
    Leaf(u32),
    FilledSubtree(u32),
    /// Fixed zero-subtree hash at depth `level` — used as the right sibling when
    /// inserting at an even position (Tornado Cash standard incremental tree).
    ZeroNode(u32),
    Nullifier(BytesN<32>),
    Root(u32),
    RootIndex,
    /// Pre-computed MiMC-5 round constants (Vec<BytesN<32>>, length = MIMC_ROUNDS).
    MimcConstants,
}


const TREE_DEPTH: u32          = 20;
const MAX_LEAVES: u32          = 1 << TREE_DEPTH;
const ROOTS_HISTORY_SIZE: u32  = 30;
const INSTANCE_TTL: u32        = 1_000_000;
const LEAF_TTL: u32            = 1_000_000;

/// MiMC-5 rounds.  For BLS12-381 Fr (≈255-bit field), security analysis gives
/// ⌈log_5(2^255)⌉ = 110 as the minimum for 128-bit security against algebraic
/// attacks on the Feistel structure.
const MIMC_ROUNDS: u32 = 110;


#[contract]
pub struct PrivacyPoolContract;

#[contractimpl]
impl PrivacyPoolContract {


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

        // Step 1 — precompute and store MiMC round constants so every
        // subsequent hash_pair call is cheap (no SHA-256 per deposit).
        let constants = Self::compute_mimc_constants(&env);
        env.storage().instance().set(&DataKey::MimcConstants, &constants);

        // Step 2 — initialise the incremental Merkle tree.
        //   Zero leaf = 32 zero bytes (Fr(0)).
        //   zero_node[level] = MiMC5(zero_node[level-1], zero_node[level-1]).
        //   FilledSubtree[level] is seeded to zero_node[level] as a safe default;
        //   it will be overwritten on the first even-position insertion at that level.
        let zero = BytesN::from_array(&env, &[0u8; 32]);
        let mut current = zero.clone();
        for level in 0..TREE_DEPTH {
            env.storage().persistent().set(&DataKey::ZeroNode(level), &current);
            env.storage().persistent().extend_ttl(
                &DataKey::ZeroNode(level), LEAF_TTL, LEAF_TTL,
            );
            env.storage().persistent().set(&DataKey::FilledSubtree(level), &current);
            env.storage().persistent().extend_ttl(
                &DataKey::FilledSubtree(level), LEAF_TTL, LEAF_TTL,
            );
            current = Self::hash_pair(&env, &current, &current);
        }

        let initial_root = current;
        let tree = TreeState { next_index: 0, depth: TREE_DEPTH, current_root: initial_root.clone() };
        env.storage().instance().set(&DataKey::Tree, &tree);
        env.storage().instance().set(&DataKey::RootIndex, &0u32);
        Self::store_root(&env, &initial_root);

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
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        Ok(())
    }

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


    pub fn deposit(
        env: Env,
        depositor: Address,
        commitment: BytesN<32>,
    ) -> Result<u32, PoolError> {
        let mut config = Self::load_config(&env)?;
        if config.is_paused { return Err(PoolError::Paused); }
        depositor.require_auth();

        let mut tree: TreeState = env.storage().instance()
            .get(&DataKey::Tree)
            .ok_or(PoolError::NotInitialized)?;

        if tree.next_index >= MAX_LEAVES { return Err(PoolError::TreeFull); }

        token::Client::new(&env, &config.asset)
            .transfer(&depositor, &env.current_contract_address(), &config.denomination);

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

    pub fn withdraw(
        env: Env,
        recipient: Address,
        root: BytesN<32>,
        nullifier_hash: BytesN<32>,
        attestation_id: BytesN<32>,
    ) -> Result<(), PoolError> {
        let mut config = Self::load_config(&env)?;
        if config.is_paused { return Err(PoolError::Paused); }
        recipient.require_auth();

        let null_key = DataKey::Nullifier(nullifier_hash.clone());
        if env.storage().persistent().has(&null_key) {
            return Err(PoolError::NullifierSpent);
        }

        if !Self::check_known_root(&env, &root) {
            return Err(PoolError::InvalidRoot);
        }

        let zk_verifier = config.zk_verifier.as_ref().ok_or(PoolError::ZkVerifierNotSet)?;
        let mut args: Vec<Val> = Vec::new(&env);
        args.push_back(attestation_id.clone().into());
        let proof_valid: bool = env.invoke_contract(
            zk_verifier,
            &soroban_sdk::Symbol::new(&env, "is_valid"),
            args,
        );
        if !proof_valid { return Err(PoolError::ProofInvalid); }

        env.storage().persistent().set(&null_key, &true);
        env.storage().persistent().extend_ttl(&null_key, LEAF_TTL, LEAF_TTL);

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


    pub fn get_config(env: Env) -> Result<PoolConfig, PoolError> {
        Self::load_config(&env)
    }

    pub fn get_tree_state(env: Env) -> Result<TreeState, PoolError> {
        env.storage().instance().get(&DataKey::Tree).ok_or(PoolError::NotInitialized)
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

    pub fn is_known_root(env: Env, root: BytesN<32>) -> bool {
        Self::check_known_root(&env, &root)
    }

    /// Fetch a single committed leaf by its index.
    pub fn get_leaf(env: Env, index: u32) -> Option<BytesN<32>> {
        env.storage().persistent().get(&DataKey::Leaf(index))
    }

    /// Fetch up to 100 consecutive leaves starting at `start`.
    /// Stops early if a leaf is missing (index beyond next_index).
    pub fn get_leaves(env: Env, start: u32, count: u32) -> Vec<BytesN<32>> {
        let cap = count.min(100);
        let mut out = Vec::new(&env);
        for i in start..start.saturating_add(cap) {
            match env.storage().persistent().get::<DataKey, BytesN<32>>(&DataKey::Leaf(i)) {
                Some(leaf) => out.push_back(leaf),
                None => break,
            }
        }
        out
    }

    fn check_known_root(env: &Env, root: &BytesN<32>) -> bool {
        let idx: u32 = env.storage().instance().get(&DataKey::RootIndex).unwrap_or(0);
        for i in 0..ROOTS_HISTORY_SIZE {
            let check_idx = idx.wrapping_sub(i) % ROOTS_HISTORY_SIZE;
            let stored: Option<BytesN<32>> = env.storage().persistent().get(&DataKey::Root(check_idx));
            if let Some(r) = stored { if r == *root { return true; } }
        }
        false
    }


    fn insert_leaf(env: &Env, index: u32, leaf: &BytesN<32>) -> BytesN<32> {
        // Zero byte[0] once so the SHA-256 commitment is a valid Fr element.
        // All subsequent values in the path are Fr outputs — already in range.
        let mut leaf_arr = leaf.to_array();
        leaf_arr[0] = 0x00;
        let leaf_fr = BytesN::from_array(env, &leaf_arr);

        env.storage().persistent().set(&DataKey::Leaf(index), &leaf_fr);
        env.storage().persistent().extend_ttl(&DataKey::Leaf(index), LEAF_TTL, LEAF_TTL);

        let mut current = leaf_fr;
        let mut current_index = index;
        for level in 0..TREE_DEPTH {
            let (left, right) = if current_index % 2 == 0 {
                // Even: current is left child; right sibling is the fixed zero subtree.
                let zero: BytesN<32> = env.storage().persistent()
                    .get(&DataKey::ZeroNode(level))
                    .unwrap_or_else(|| BytesN::from_array(env, &[0u8; 32]));
                // Record this node so a future odd-positioned sibling can find it.
                env.storage().persistent().set(&DataKey::FilledSubtree(level), &current);
                env.storage().persistent().extend_ttl(
                    &DataKey::FilledSubtree(level), LEAF_TTL, LEAF_TTL,
                );
                (current.clone(), zero)
            } else {
                // Odd: left sibling is the previously filled node at this level.
                let left: BytesN<32> = env.storage().persistent()
                    .get(&DataKey::FilledSubtree(level))
                    .unwrap_or_else(|| BytesN::from_array(env, &[0u8; 32]));
                (left, current.clone())
            };
            current = Self::hash_pair(env, &left, &right);
            current_index /= 2;
        }
        current
    }

    /// MiMC-5 Feistel compression over BLS12-381 Fr.
    ///
    /// Both inputs MUST already be valid Fr elements (canonical bytes < field order).
    /// Leaves are pre-zeroed at byte[0] in `insert_leaf`; all other inputs (zero
    /// nodes, filled subtrees, round constants) are produced by prior Fr operations.
    fn hash_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
        let bls = env.crypto().bls12_381();
        let constants: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::MimcConstants)
            .expect("pool not initialized");

        let mut a = Fr::from_bytes(left.clone());
        let mut b = Fr::from_bytes(right.clone());

        for i in 0..MIMC_ROUNDS {
            let c = Fr::from_bytes(constants.get(i).unwrap());
            let t  = bls.fr_add(&b, &c);
            let t2 = bls.fr_mul(&t, &t);
            let t4 = bls.fr_mul(&t2, &t2);
            let t5 = bls.fr_mul(&t4, &t);
            let new_b = bls.fr_add(&a, &t5);
            a = b;
            b = new_b;
        }

        bls.fr_add(&a, &b).to_bytes()
    }

    /// Derive MIMC_ROUNDS round constants from a public SHA-256 seed chain.
    ///
    /// c[0] = SHA-256(seed) with byte[0] = 0
    /// c[i] = SHA-256(c[i-1]) with byte[0] = 0   ← chains on the ZEROED buffer
    fn compute_mimc_constants(env: &Env) -> Vec<BytesN<32>> {
        let mut constants: Vec<BytesN<32>> = Vec::new(env);

        let mut seed_data = Bytes::new(env);
        for b in b"veilpool_mimc5_bls12381_rc_v1" {
            seed_data.push_back(*b);
        }
        let h = env.crypto().sha256(&seed_data);
        let mut arr = h.to_array();
        arr[0] = 0x00;

        for _ in 0..MIMC_ROUNDS {
            constants.push_back(BytesN::from_array(env, &arr));
            // Chain on the zeroed buffer (not the original SHA-256 output)
            let mut d = Bytes::new(env);
            for b in arr { d.push_back(b); }
            let next_h = env.crypto().sha256(&d);
            arr = next_h.to_array();
            arr[0] = 0x00;
        }
        constants
    }

    fn store_root(env: &Env, root: &BytesN<32>) {
        let idx: u32 = env.storage().instance().get(&DataKey::RootIndex).unwrap_or(0);
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


#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    /// Commitment = SHA-256(secret ‖ nullifier) — unchanged from v1.
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
        env.budget().reset_unlimited();
        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone());
        let asset = token.address();
        let id = env.register_contract(None, PrivacyPoolContract);
        let client: PrivacyPoolContractClient<'static> =
            unsafe { core::mem::transmute(PrivacyPoolContractClient::new(&env, &id)) };
        client.initialize(&admin, &asset, &10_000_000_i128);
        Setup { env, admin, asset, client }
    }

    fn mint(env: &Env, asset: &Address, recipient: &Address, amount: i128) {
        use soroban_sdk::token::StellarAssetClient;
        StellarAssetClient::new(env, asset).mint(recipient, &amount);
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
        let nullifier_hash = BytesN::from_array(&s.env, &[0xABu8; 32]);
        assert!(!s.client.is_nullifier_spent(&nullifier_hash));
    }

    #[test]
    fn test_root_in_history_after_deposit() {
        let s = setup();
        let depositor = Address::generate(&s.env);
        mint(&s.env, &s.asset, &depositor, 10_000_000);
        let commitment = make_commitment(&s.env, 7, 8);
        s.client.deposit(&depositor, &commitment);
        let root = s.client.get_current_root();
        assert!(s.client.is_known_root(&root));
    }

    #[test]
    fn test_double_initialize_panics() {
        let s = setup();
        let admin2 = Address::generate(&s.env);
        let asset2 = Address::generate(&s.env);
        let result = s.client.try_initialize(&admin2, &asset2, &10_000_000_i128);
        assert!(result.is_err());
    }

    #[test]
    fn test_zero_denomination_fails() {
        let env = Env::default();
        env.mock_all_auths();
        env.budget().reset_unlimited();
        let admin = Address::generate(&env);
        let asset = Address::generate(&env);
        let id = env.register_contract(None, PrivacyPoolContract);
        let client: PrivacyPoolContractClient<'static> =
            unsafe { core::mem::transmute(PrivacyPoolContractClient::new(&env, &id)) };
        let result = client.try_initialize(&admin, &asset, &0_i128);
        assert!(result.is_err());
    }
}
