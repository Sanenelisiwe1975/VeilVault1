//! Passkey Registry
//!
//! A small, durable on-chain index from a hashed WebAuthn credential ID to
//! the `smart-wallet` contract instance it belongs to, plus the verification
//! material (COSE public key, signature counter) the backend needs to check
//! a login assertion.
//!
//! This exists to remove a real gap in the passkey sign-in flow: without it,
//! that mapping lived only in the backend's in-memory state, so a backend
//! restart made every existing passkey wallet unable to log in again (the
//! backend would have no way to know which wallet a given credential
//! belonged to). Storing it on-chain instead means it survives restarts,
//! redeploys, and backend migrations.
//!
//! # This is an index, not an authority
//! Resolving a credential to a wallet here grants no power over that
//! wallet — it's purely a lookup so the backend knows which wallet to
//! generate WebAuthn options for. The actual authority to act as a wallet
//! lives entirely in that wallet's own `smart-wallet` contract instance and
//! its registered signers list (see contracts/smart-wallet). A wrong or
//! malicious registry entry can only point sign-in at the wrong wallet —
//! the resulting WebAuthn signature still won't verify against that
//! wallet's real signers, so it fails closed.
//!
//! Writes (`register`, `update_counter`) are admin-only: the backend is the
//! only party that ever deploys a smart-wallet or approves adding a backup
//! signer to one, so it's the only legitimate writer here.
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Bytes, BytesN, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AlreadyRegistered = 3,
    NotFound = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredentialRecord {
    pub wallet: Address,
    /// Raw COSE-encoded public key bytes, as returned by the WebAuthn
    /// registration ceremony — the exact form @simplewebauthn/server's
    /// verifier needs (distinct from the SEC1 form the smart-wallet
    /// contract itself stores).
    pub public_key_cose: Bytes,
    /// Index of this credential's key in the wallet's `smart-wallet` signers
    /// list (see `get_signers`) — needed to build a `WebAuthnSignature` that
    /// `__check_auth` can verify.
    pub signer_index: u32,
    /// WebAuthn signature counter, for standard replay-detection bookkeeping.
    pub counter: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Credential(BytesN<32>), // sha256(raw credential id) -> CredentialRecord
}

const TTL: u32 = 1_000_000;

#[contract]
pub struct PasskeyRegistryContract;

#[contractimpl]
impl PasskeyRegistryContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), RegistryError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(RegistryError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(TTL, TTL);
        Ok(())
    }

    /// Register a new credential -> wallet mapping. Errors if this
    /// credential hash is already registered (credentials aren't
    /// re-bindable to a different wallet through this entry point).
    pub fn register(
        env: Env,
        credential_id_hash: BytesN<32>,
        wallet: Address,
        public_key_cose: Bytes,
        signer_index: u32,
    ) -> Result<(), RegistryError> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        let key = DataKey::Credential(credential_id_hash);
        if env.storage().persistent().has(&key) {
            return Err(RegistryError::AlreadyRegistered);
        }

        let record = CredentialRecord { wallet, public_key_cose, signer_index, counter: 0 };
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL, TTL);
        Ok(())
    }

    /// Update the stored WebAuthn signature counter after a successful login.
    pub fn update_counter(
        env: Env,
        credential_id_hash: BytesN<32>,
        new_counter: u32,
    ) -> Result<(), RegistryError> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        let key = DataKey::Credential(credential_id_hash);
        let mut record: CredentialRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::NotFound)?;
        record.counter = new_counter;
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL, TTL);
        Ok(())
    }

    /// Look up which wallet (and verification material) a credential
    /// belongs to. Public — see the module doc for why that's safe.
    pub fn resolve(env: Env, credential_id_hash: BytesN<32>) -> Result<CredentialRecord, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::Credential(credential_id_hash))
            .ok_or(RegistryError::NotFound)
    }

    fn get_admin(env: &Env) -> Result<Address, RegistryError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(RegistryError::NotInitialized)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    struct Fixture {
        env: Env,
        admin: Address,
        client: PasskeyRegistryContractClient<'static>,
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register(PasskeyRegistryContract, ());
        let client: PasskeyRegistryContractClient<'static> =
            unsafe { core::mem::transmute(PasskeyRegistryContractClient::new(&env, &contract_id)) };
        client.initialize(&admin);
        Fixture { env, admin, client }
    }

    fn hash_of(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    #[test]
    fn test_register_and_resolve() {
        let f = setup();
        let wallet = Address::generate(&f.env);
        let cose = Bytes::from_slice(&f.env, b"fake-cose-key-bytes");
        let hash = hash_of(&f.env, 1);

        f.client.register(&hash, &wallet, &cose, &0);

        let record = f.client.resolve(&hash);
        assert_eq!(record.wallet, wallet);
        assert_eq!(record.public_key_cose, cose);
        assert_eq!(record.counter, 0);
    }

    #[test]
    fn test_resolve_unknown_fails() {
        let f = setup();
        let result = f.client.try_resolve(&hash_of(&f.env, 99));
        assert!(result.is_err());
    }

    #[test]
    fn test_double_register_same_hash_fails() {
        let f = setup();
        let wallet = Address::generate(&f.env);
        let cose = Bytes::from_slice(&f.env, b"key-1");
        let hash = hash_of(&f.env, 2);

        f.client.register(&hash, &wallet, &cose, &0);
        let result = f.client.try_register(&hash, &wallet, &cose, &0);
        assert_eq!(result, Err(Ok(RegistryError::AlreadyRegistered)));
    }

    #[test]
    fn test_two_credentials_can_point_at_the_same_wallet() {
        // A backup passkey gets its own credential hash but should resolve
        // to the same wallet as the primary one.
        let f = setup();
        let wallet = Address::generate(&f.env);
        let cose_a = Bytes::from_slice(&f.env, b"key-a");
        let cose_b = Bytes::from_slice(&f.env, b"key-b");

        f.client.register(&hash_of(&f.env, 3), &wallet, &cose_a, &0);
        f.client.register(&hash_of(&f.env, 4), &wallet, &cose_b, &1);

        assert_eq!(f.client.resolve(&hash_of(&f.env, 3)).wallet, wallet);
        assert_eq!(f.client.resolve(&hash_of(&f.env, 4)).wallet, wallet);
    }

    #[test]
    fn test_update_counter() {
        let f = setup();
        let wallet = Address::generate(&f.env);
        let cose = Bytes::from_slice(&f.env, b"key");
        let hash = hash_of(&f.env, 5);

        f.client.register(&hash, &wallet, &cose, &0);
        f.client.update_counter(&hash, &42);

        assert_eq!(f.client.resolve(&hash).counter, 42);
    }

    #[test]
    fn test_update_counter_unknown_fails() {
        let f = setup();
        let result = f.client.try_update_counter(&hash_of(&f.env, 6), &1);
        assert!(result.is_err());
    }

    #[test]
    fn test_double_initialize_fails() {
        let f = setup();
        let result = f.client.try_initialize(&f.admin);
        assert!(result.is_err());
    }
}
