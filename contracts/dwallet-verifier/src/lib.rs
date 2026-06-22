//! Ika dWallet Signature Verifier Contract
//!
//! Verifies that signed messages originate from registered Ika dWallets.
//!
//! Architecture:
//!   - Admin registers dWallet public keys (ed25519) linked to Stellar addresses.
//!   - Any caller can verify a (message, signature) pair against a registered dWallet.
//!   - Supports both ed25519 (Stellar-native) signatures produced by dWallet MPC.
//!
//! Off-chain (backend) creates dWallets via Ika's API and registers the resulting
//! public key on-chain via `register_dwallet`.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype,
    Address, Bytes, BytesN, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DWalletError {
    AlreadyInitialized  = 1,
    NotInitialized      = 2,
    Unauthorized        = 3,
    DWalletNotFound     = 4,
    DWalletAlreadyExists = 5,
    InvalidSignature    = 6,
    DWalletRevoked      = 7,
    InvalidPublicKey    = 8,
}


#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DWalletInfo {
    /// Ika dWallet identifier (UUID or content-hash)
    pub dwallet_id: String,
    /// Ed25519 public key of the dWallet (32 bytes)
    pub public_key: BytesN<32>,
    /// Associated Stellar address (owner / controller)
    pub stellar_address: Address,
    /// Human-readable label
    pub label: String,
    /// Whether this dWallet is revoked
    pub revoked: bool,
    /// Registration timestamp
    pub registered_at: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    DWallet(String),            // dwallet_id → DWalletInfo
    AddressDWallet(Address),    // stellar_address → dwallet_id (primary)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
}

const INSTANCE_TTL: u32  = 1_000_000;
const DWALLET_TTL: u32   = 1_000_000;

#[contract]
pub struct DWalletVerifierContract;

#[contractimpl]
impl DWalletVerifierContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), DWalletError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(DWalletError::AlreadyInitialized);
        }
        admin.require_auth();
        let config = Config { admin };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        Ok(())
    }

    /// Register a new dWallet public key (admin only).
    pub fn register_dwallet(
        env: Env,
        dwallet_id: String,
        public_key: BytesN<32>,
        stellar_address: Address,
        label: String,
    ) -> Result<(), DWalletError> {
        let config = Self::get_config(&env)?;
        config.admin.require_auth();

        let key = DataKey::DWallet(dwallet_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(DWalletError::DWalletAlreadyExists);
        }

        let info = DWalletInfo {
            dwallet_id: dwallet_id.clone(),
            public_key,
            stellar_address: stellar_address.clone(),
            label,
            revoked: false,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &info);
        env.storage()
            .persistent()
            .extend_ttl(&key, DWALLET_TTL, DWALLET_TTL);

        let addr_key = DataKey::AddressDWallet(stellar_address.clone());
        env.storage().persistent().set(&addr_key, &dwallet_id);
        env.storage()
            .persistent()
            .extend_ttl(&addr_key, DWALLET_TTL, DWALLET_TTL);

        env.events().publish(
            (soroban_sdk::symbol_short!("DW_REG"), stellar_address),
            dwallet_id,
        );
        Ok(())
    }

    /// Revoke a dWallet (admin only). Does not delete — just marks revoked.
    pub fn revoke_dwallet(env: Env, dwallet_id: String) -> Result<(), DWalletError> {
        let config = Self::get_config(&env)?;
        config.admin.require_auth();

        let key = DataKey::DWallet(dwallet_id.clone());
        let mut info = env
            .storage()
            .persistent()
            .get::<DataKey, DWalletInfo>(&key)
            .ok_or(DWalletError::DWalletNotFound)?;

        info.revoked = true;
        env.storage().persistent().set(&key, &info);

        env.events().publish(
            (soroban_sdk::symbol_short!("DW_REV"), config.admin),
            dwallet_id,
        );
        Ok(())
    }

    /// Verify an ed25519 signature produced by a dWallet over `message`.
    ///
    /// Returns `true` if the signature is valid and the dWallet is not revoked.
    pub fn verify_signature(
        env: Env,
        dwallet_id: String,
        message: Bytes,
        signature: BytesN<64>,
    ) -> Result<bool, DWalletError> {
        let key = DataKey::DWallet(dwallet_id);
        let info = env
            .storage()
            .persistent()
            .get::<DataKey, DWalletInfo>(&key)
            .ok_or(DWalletError::DWalletNotFound)?;

        if info.revoked {
            return Err(DWalletError::DWalletRevoked);
        }

        // Uses Soroban's native ed25519 verification
        env.crypto()
            .ed25519_verify(&info.public_key, &message, &signature);

        Ok(true)
    }

    /// Verify a signature using the dWallet associated with a Stellar address.
    pub fn verify_by_address(
        env: Env,
        stellar_address: Address,
        message: Bytes,
        signature: BytesN<64>,
    ) -> Result<bool, DWalletError> {
        let addr_key = DataKey::AddressDWallet(stellar_address);
        let dwallet_id = env
            .storage()
            .persistent()
            .get::<DataKey, String>(&addr_key)
            .ok_or(DWalletError::DWalletNotFound)?;

        Self::verify_signature(env, dwallet_id, message, signature)
    }

    // Views

    pub fn get_dwallet(env: Env, dwallet_id: String) -> Result<DWalletInfo, DWalletError> {
        env.storage()
            .persistent()
            .get::<DataKey, DWalletInfo>(&DataKey::DWallet(dwallet_id))
            .ok_or(DWalletError::DWalletNotFound)
    }

    pub fn get_dwallet_by_address(
        env: Env,
        stellar_address: Address,
    ) -> Result<DWalletInfo, DWalletError> {
        let addr_key = DataKey::AddressDWallet(stellar_address);
        let dwallet_id = env
            .storage()
            .persistent()
            .get::<DataKey, String>(&addr_key)
            .ok_or(DWalletError::DWalletNotFound)?;
        Self::get_dwallet(env, dwallet_id)
    }

    pub fn is_registered(env: Env, dwallet_id: String) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::DWallet(dwallet_id))
    }

    fn get_config(env: &Env) -> Result<Config, DWalletError> {
        env.storage()
            .instance()
            .get::<DataKey, Config>(&DataKey::Config)
            .ok_or(DWalletError::NotInitialized)
    }
}

// Tests

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup() -> (Env, Address, DWalletVerifierContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register_contract(None, DWalletVerifierContract);
        let client: DWalletVerifierContractClient<'static> =
            unsafe { core::mem::transmute(DWalletVerifierContractClient::new(&env, &id)) };
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn test_register_dwallet() {
        let (env, _admin, client) = setup();
        let owner = Address::generate(&env);
        let pk: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);

        client.register_dwallet(
            &String::from_str(&env, "dwallet-001"),
            &pk,
            &owner,
            &String::from_str(&env, "Agent Wallet"),
        );

        assert!(client.is_registered(&String::from_str(&env, "dwallet-001")));
        let info = client.get_dwallet(&String::from_str(&env, "dwallet-001"));
        assert!(!info.revoked);
    }

    #[test]
    fn test_revoke_dwallet() {
        let (env, _admin, client) = setup();
        let owner = Address::generate(&env);
        let pk: BytesN<32> = BytesN::from_array(&env, &[2u8; 32]);

        client.register_dwallet(
            &String::from_str(&env, "dwallet-002"),
            &pk,
            &owner,
            &String::from_str(&env, "Temp Wallet"),
        );
        client.revoke_dwallet(&String::from_str(&env, "dwallet-002"));
        let info = client.get_dwallet(&String::from_str(&env, "dwallet-002"));
        assert!(info.revoked);
    }

    #[test]
    fn test_verify_revoked_fails() {
        let (env, _admin, client) = setup();
        let owner = Address::generate(&env);
        let pk: BytesN<32> = BytesN::from_array(&env, &[3u8; 32]);

        client.register_dwallet(
            &String::from_str(&env, "dwallet-rev"),
            &pk,
            &owner,
            &String::from_str(&env, "Revoked"),
        );
        client.revoke_dwallet(&String::from_str(&env, "dwallet-rev"));

        let msg = Bytes::from_slice(&env, b"hello");
        let sig: BytesN<64> = BytesN::from_array(&env, &[0u8; 64]);
        let result = client.try_verify_signature(&String::from_str(&env, "dwallet-rev"), &msg, &sig);
        assert!(result.is_err());
    }
}
