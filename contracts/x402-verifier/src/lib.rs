//! x402 Payment Verifier Contract
//!
//! Implements on-chain verification for the x402 HTTP payment protocol on Stellar.
//!
//! Flow:
//!   1. An AI agent makes a Stellar payment to gain access to a service.
//!   2. The backend (trusted oracle) calls `attest_payment` with the signed proof.
//!   3. Any contract / off-chain code calls `consume_payment` to use the proof
//!      exactly once (replay prevention).

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype,
    Address, Bytes, BytesN, Env, String,
};

//Error
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum X402Error {
    AlreadyInitialized = 1,
    NotInitialized     = 2,
    Unauthorized       = 3,
    PaymentNotFound    = 4,
    PaymentAlreadyUsed = 5,
    PaymentExpired     = 6,
    InvalidProof       = 7,
    DuplicatePayment   = 8,
}

// Storage types

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentProof {
    /// Unique payment identifier (typically Stellar transaction hash as hex)
    pub payment_id: String,
    /// Payer Stellar address
    pub from: Address,
    /// Payee Stellar address
    pub to: Address,
    /// Amount in asset base units (stroops for XLM, etc.)
    pub amount: i128,
    /// SAC asset contract address
    pub asset: Address,
    /// Arbitrary memo / service reference
    pub memo: String,
    /// Stellar ledger sequence when payment was confirmed
    pub ledger_sequence: u32,
    /// Unix timestamp the proof expires (0 = no expiry)
    pub expires_at: u64,
}

#[contracttype]
pub enum DataKey {
    Config,
    Payment(String),   // payment_id → PaymentState
    OracleAddress,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentState {
    Verified  = 1,
    Consumed  = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub oracle: Address,
}

const INSTANCE_TTL: u32 = 1_000_000;
const PAYMENT_TTL: u32  = 500_000;

// Contract

#[contract]
pub struct X402VerifierContract;

#[contractimpl]
impl X402VerifierContract {
    pub fn initialize(env: Env, admin: Address, oracle: Address) -> Result<(), X402Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(X402Error::AlreadyInitialized);
        }
        admin.require_auth();
        let config = Config { admin, oracle };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
        Ok(())
    }

    /// Oracle attests that a Stellar payment was confirmed on-chain.
    pub fn attest_payment(
        env: Env,
        proof: PaymentProof,
        _oracle_signature: BytesN<64>, // validated by Stellar auth framework
    ) -> Result<(), X402Error> {
        let config = Self::get_config(&env)?;
        config.oracle.require_auth();

        let key = DataKey::Payment(proof.payment_id.clone());

        if env.storage().persistent().has(&key) {
            return Err(X402Error::DuplicatePayment);
        }

        if proof.expires_at > 0 && env.ledger().timestamp() > proof.expires_at {
            return Err(X402Error::PaymentExpired);
        }

        env.storage()
            .persistent()
            .set(&key, &PaymentState::Verified);
        env.storage()
            .persistent()
            .extend_ttl(&key, PAYMENT_TTL, PAYMENT_TTL);

        env.events().publish(
            (soroban_sdk::symbol_short!("PAY_ATT"), proof.from.clone()),
            (proof.payment_id, proof.amount, proof.asset),
        );

        Ok(())
    }

    /// Mark a verified payment as consumed (one-time use).
    pub fn consume_payment(
        env: Env,
        payment_id: String,
        consumer: Address,
    ) -> Result<(), X402Error> {
        consumer.require_auth();
        let key = DataKey::Payment(payment_id.clone());

        let state = env
            .storage()
            .persistent()
            .get::<DataKey, PaymentState>(&key)
            .ok_or(X402Error::PaymentNotFound)?;

        match state {
            PaymentState::Consumed => Err(X402Error::PaymentAlreadyUsed),
            PaymentState::Verified => {
                env.storage()
                    .persistent()
                    .set(&key, &PaymentState::Consumed);
                env.events().publish(
                    (soroban_sdk::symbol_short!("PAY_USE"), consumer),
                    payment_id,
                );
                Ok(())
            }
        }
    }

    /// Update the trusted oracle address (admin only).
    pub fn set_oracle(env: Env, new_oracle: Address) -> Result<(), X402Error> {
        let mut config = Self::get_config(&env)?;
        config.admin.require_auth();
        config.oracle = new_oracle;
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    pub fn is_verified(env: Env, payment_id: String) -> bool {
        let key = DataKey::Payment(payment_id);
        matches!(
            env.storage()
                .persistent()
                .get::<DataKey, PaymentState>(&key),
            Some(PaymentState::Verified)
        )
    }

    pub fn is_consumed(env: Env, payment_id: String) -> bool {
        let key = DataKey::Payment(payment_id);
        matches!(
            env.storage()
                .persistent()
                .get::<DataKey, PaymentState>(&key),
            Some(PaymentState::Consumed)
        )
    }

    pub fn get_config(env: &Env) -> Result<Config, X402Error> {
        env.storage()
            .instance()
            .get::<DataKey, Config>(&DataKey::Config)
            .ok_or(X402Error::NotInitialized)
    }
}


#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup() -> (Env, Address, Address, X402VerifierContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let contract_id = env.register_contract(None, X402VerifierContract);
        let client: X402VerifierContractClient<'static> =
            unsafe { core::mem::transmute(X402VerifierContractClient::new(&env, &contract_id)) };
        client.initialize(&admin, &oracle);
        (env, admin, oracle, client)
    }

    fn dummy_proof(env: &Env, from: &Address, to: &Address, asset: &Address) -> PaymentProof {
        PaymentProof {
            payment_id: String::from_str(env, "tx_abc123"),
            from: from.clone(),
            to: to.clone(),
            amount: 1_000_000,
            asset: asset.clone(),
            memo: String::from_str(env, "service-access"),
            ledger_sequence: 100,
            expires_at: 0,
        }
    }

    #[test]
    fn test_attest_and_verify() {
        let (env, _admin, oracle, client) = setup();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let asset = Address::generate(&env);
        let sig: BytesN<64> = BytesN::from_array(&env, &[0u8; 64]);

        let proof = dummy_proof(&env, &payer, &payee, &asset);
        client.attest_payment(&proof, &sig);
        assert!(client.is_verified(&String::from_str(&env, "tx_abc123")));
    }

    #[test]
    fn test_consume_payment() {
        let (env, _admin, _oracle, client) = setup();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let asset = Address::generate(&env);
        let sig: BytesN<64> = BytesN::from_array(&env, &[0u8; 64]);

        let proof = dummy_proof(&env, &payer, &payee, &asset);
        client.attest_payment(&proof, &sig);

        let consumer = Address::generate(&env);
        client.consume_payment(&String::from_str(&env, "tx_abc123"), &consumer);
        assert!(client.is_consumed(&String::from_str(&env, "tx_abc123")));
        assert!(!client.is_verified(&String::from_str(&env, "tx_abc123")));
    }

    #[test]
    #[should_panic(expected = "PaymentAlreadyUsed")]
    fn test_double_consume_fails() {
        let (env, _admin, _oracle, client) = setup();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let asset = Address::generate(&env);
        let sig: BytesN<64> = BytesN::from_array(&env, &[0u8; 64]);
        let proof = dummy_proof(&env, &payer, &payee, &asset);
        client.attest_payment(&proof, &sig);
        let consumer = Address::generate(&env);
        client.consume_payment(&String::from_str(&env, "tx_abc123"), &consumer);
        client.consume_payment(&String::from_str(&env, "tx_abc123"), &consumer);
    }
}
