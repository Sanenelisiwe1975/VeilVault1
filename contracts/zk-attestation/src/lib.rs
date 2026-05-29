#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    crypto::bls12_381::{Fr, G1Affine, G2Affine},
    vec, Address, Bytes, BytesN, Env, String, Vec,
};

// BLS12-381 curve order r minus 1, big-endian — used by offchain prover tooling
// to compute -P = (r-1)*P without Fp arithmetic.
// r   = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001
// r-1 = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000000
#[allow(dead_code)]
pub const FR_NEG_ONE: [u8; 32] = [
    0x73, 0xed, 0xa7, 0x53, 0x29, 0x9d, 0x7d, 0x48, 0x33, 0x39, 0xd8, 0x08, 0x09, 0xa1, 0xd8,
    0x05, 0x53, 0xbd, 0xa4, 0x02, 0xff, 0xfe, 0x5b, 0xfe, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00,
    0x00, 0x00,
];


#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    VerifyingKey(BytesN<32>),
    Attestation(BytesN<32>),
    AttestationCount,
    Paused,
}

/// Groth16 verifying key.  alpha_g1 is stored pre-negated to save gas at
/// verification time (caller computes -α₁ = (r-1)·α₁ off-chain).
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha_g1_neg: BytesN<96>,   // -α₁  (G1, 96 bytes)
    pub beta_g2: BytesN<192>,       //  β₂  (G2, 192 bytes)
    pub gamma_g2: BytesN<192>,      //  γ₂  (G2, 192 bytes)
    pub delta_g2: BytesN<192>,      //  δ₂  (G2, 192 bytes)
    pub ic: Vec<BytesN<96>>,        // IC[0..n] (G1, 96 bytes each)
    pub circuit_id: BytesN<32>,
    pub circuit_name: String,
}

/// Groth16 proof submitted by a prover.
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<96>,    // A (G1, 96 bytes)
    pub b: BytesN<192>,   // B (G2, 192 bytes)
    pub c: BytesN<96>,    // C (G1, 96 bytes)
}

/// On-chain record of a verified vault performance attestation.
/// The ZK proof binds return_bps to the vault and period without revealing
/// the underlying strategy parameters.
#[contracttype]
#[derive(Clone)]
pub struct PerformanceAttestation {
    pub attestation_id: BytesN<32>,
    pub circuit_id: BytesN<32>,
    pub vault: Address,
    pub prover: Address,
    pub strategy_commitment: BytesN<32>, // Pedersen(strategy_params)
    pub period_start: u64,
    pub period_end: u64,
    pub return_bps: i64,                 // e.g. 150 = 1.5%
    pub proof: Proof,
    pub public_inputs_hash: BytesN<32>,  // SHA-256 of the 5 public inputs
    pub verified: bool,
    pub timestamp: u64,
}


#[contract]
pub struct ZkAttestationContract;

#[contractimpl]
impl ZkAttestationContract {

    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::AttestationCount, &0u64);
        env.storage().instance().set(&DataKey::Paused, &false);
        Self::bump_instance(&env);
    }

    pub fn set_paused(env: Env, paused: bool) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &paused);
        Self::bump_instance(&env);
    }

    // Verifying Key

    /// Register (or overwrite) a Groth16 verifying key.
    /// `alpha_g1_neg` must be the negation of the trusted-setup α₁ point.
    pub fn register_circuit(
        env: Env,
        circuit_id: BytesN<32>,
        circuit_name: String,
        alpha_g1_neg: BytesN<96>,
        beta_g2: BytesN<192>,
        gamma_g2: BytesN<192>,
        delta_g2: BytesN<192>,
        ic: Vec<BytesN<96>>,
    ) {
        Self::require_admin(&env);
        assert!(ic.len() >= 1, "ic must have at least one point");

        let vk = VerifyingKey {
            alpha_g1_neg,
            beta_g2,
            gamma_g2,
            delta_g2,
            ic,
            circuit_id: circuit_id.clone(),
            circuit_name,
        };
        env.storage()
            .persistent()
            .set(&DataKey::VerifyingKey(circuit_id.clone()), &vk);
        Self::bump_persistent(&env, &DataKey::VerifyingKey(circuit_id.clone()));
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("circuit"), symbol_short!("reg")),
            circuit_id,
        );
    }

    pub fn get_circuit(env: Env, circuit_id: BytesN<32>) -> VerifyingKey {
        env.storage()
            .persistent()
            .get(&DataKey::VerifyingKey(circuit_id))
            .expect("circuit not found")
    }

    // Groth16 Proof Verification

    /// Verify a Groth16 proof onchain using Soroban's BLS12-381 host functions.
    ///
    /// Equation verified:
    ///   e(A, B) · e(−α₁, β₂) · e(vk_x, γ₂) · e(C, δ₂) == 1_GT
    ///
    /// where vk_x = IC[0] + Σ_i ( public_inputs[i] · IC[i+1] )
    ///
    /// `public_inputs` are big-endian 32-byte Fr scalars.
    /// Returns true iff the proof is valid.
    pub fn verify_proof(
        env: Env,
        circuit_id: BytesN<32>,
        proof: Proof,
        public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        Self::require_not_paused(&env);

        let vk: VerifyingKey = env
            .storage()
            .persistent()
            .get(&DataKey::VerifyingKey(circuit_id))
            .expect("circuit not found");

        // IC has one more element than public_inputs (IC[0] is the constant term)
        let expected = (vk.ic.len() as usize).saturating_sub(1);
        if public_inputs.len() as usize != expected {
            return false;
        }

        let bls = env.crypto().bls12_381();
        let ic0: G1Affine = G1Affine::from_bytes(vk.ic.get(0).expect("ic empty"));

        // vk_x = IC[0] + MSM(IC[1..], public_inputs)
        let vk_x: G1Affine = if public_inputs.len() > 0 {
            let mut pts: Vec<G1Affine> = Vec::new(&env);
            let mut scs: Vec<Fr> = Vec::new(&env);
            for i in 0..public_inputs.len() {
                pts.push_back(G1Affine::from_bytes(vk.ic.get(i + 1).expect("ic short")));
                scs.push_back(Fr::from_bytes(public_inputs.get(i).expect("scalar missing")));
            }
            let sum = bls.g1_msm(pts, scs);
            bls.g1_add(&ic0, &sum)
        } else {
            ic0
        };

        // 4-pairing check: e(A,B) · e(−α₁,β₂) · e(vk_x,γ₂) · e(C,δ₂) == 1
        let mut vp1: Vec<G1Affine> = Vec::new(&env);
        let mut vp2: Vec<G2Affine> = Vec::new(&env);
        vp1.push_back(G1Affine::from_bytes(proof.a));
        vp2.push_back(G2Affine::from_bytes(proof.b));
        vp1.push_back(G1Affine::from_bytes(vk.alpha_g1_neg));
        vp2.push_back(G2Affine::from_bytes(vk.beta_g2));
        vp1.push_back(vk_x);
        vp2.push_back(G2Affine::from_bytes(vk.gamma_g2));
        vp1.push_back(G1Affine::from_bytes(proof.c));
        vp2.push_back(G2Affine::from_bytes(vk.delta_g2));
        bls.pairing_check(vp1, vp2)
    }

    //  Performance Attestations

    /// Submit and verify a vault performance attestation.
    ///
    /// Public inputs layout (must match the registered circuit):
    ///   [0] vault_commitment     — Pedersen(vault_address)
    ///   [1] strategy_commitment  — Pedersen(strategy_params)
    ///   [2] period_start as Fr
    ///   [3] period_end   as Fr
    ///   [4] return_bps   as Fr  (two's-complement for negatives)
    pub fn attest_performance(
        env: Env,
        circuit_id: BytesN<32>,
        vault: Address,
        prover: Address,
        strategy_commitment: BytesN<32>,
        period_start: u64,
        period_end: u64,
        return_bps: i64,
        proof: Proof,
        public_inputs: Vec<BytesN<32>>,
    ) -> BytesN<32> {
        Self::require_not_paused(&env);
        prover.require_auth();

        assert!(period_end > period_start, "invalid period");
        assert_eq!(public_inputs.len(), 5, "expected 5 public inputs");

        let valid = Self::verify_proof(
            env.clone(),
            circuit_id.clone(),
            proof.clone(),
            public_inputs.clone(),
        );
        assert!(valid, "proof verification failed");

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::AttestationCount)
            .unwrap_or(0);
        let new_count = count + 1;

        // Attestation ID = SHA-256(circuit_id || period_start || period_end || count)
        let mut id_pre = Bytes::new(&env);
        id_pre.append(&circuit_id.clone().into());
        id_pre.append(&Bytes::from_array(&env, &period_start.to_be_bytes()));
        id_pre.append(&Bytes::from_array(&env, &period_end.to_be_bytes()));
        id_pre.append(&Bytes::from_array(&env, &new_count.to_be_bytes()));
        let attestation_id: BytesN<32> = env.crypto().sha256(&id_pre).into();

        // Compact hash of public inputs for storage
        let mut pi_bytes = Bytes::new(&env);
        for pi in public_inputs.iter() {
            let b: Bytes = pi.into();
            pi_bytes.append(&b);
        }
        let public_inputs_hash: BytesN<32> = env.crypto().sha256(&pi_bytes).into();

        let record = PerformanceAttestation {
            attestation_id: attestation_id.clone(),
            circuit_id,
            vault: vault.clone(),
            prover,
            strategy_commitment,
            period_start,
            period_end,
            return_bps,
            proof,
            public_inputs_hash,
            verified: true,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Attestation(attestation_id.clone()), &record);
        Self::bump_persistent(&env, &DataKey::Attestation(attestation_id.clone()));

        env.storage()
            .instance()
            .set(&DataKey::AttestationCount, &new_count);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("attest"), symbol_short!("perf")),
            (attestation_id.clone(), vault, return_bps),
        );

        attestation_id
    }

    pub fn get_attestation(env: Env, attestation_id: BytesN<32>) -> PerformanceAttestation {
        env.storage()
            .persistent()
            .get(&DataKey::Attestation(attestation_id))
            .expect("attestation not found")
    }

    pub fn get_attestation_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::AttestationCount)
            .unwrap_or(0)
    }

    pub fn is_valid(env: Env, attestation_id: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<DataKey, PerformanceAttestation>(&DataKey::Attestation(attestation_id))
            .map(|a| a.verified)
            .unwrap_or(false)
    }


    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
    }

    fn require_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        assert!(!paused, "contract is paused");
    }

    fn bump_instance(env: &Env) {
        env.storage().instance().extend_ttl(100_000, 1_000_000);
    }

    fn bump_persistent(env: &Env, key: &DataKey) {
        env.storage().persistent().extend_ttl(key, 50_000, 500_000);
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn dummy_g1(env: &Env) -> BytesN<96> {
        let mut arr = [0u8; 96];
        arr[0] = 0xc0;
        BytesN::from_array(env, &arr)
    }

    fn dummy_g2(env: &Env) -> BytesN<192> {
        let mut arr = [0u8; 192];
        arr[0] = 0xc0;
        BytesN::from_array(env, &arr)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        assert_eq!(client.get_attestation_count(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize() {
        let env = Env::default();
        let id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        client.initialize(&admin);
    }

    #[test]
    fn test_register_circuit() {
        let env = Env::default();
        let id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);

        let circuit_id = BytesN::from_array(&env, &[1u8; 32]);
        let name = String::from_str(&env, "performance_v1");
        let ic: Vec<BytesN<96>> = vec![&env, dummy_g1(&env), dummy_g1(&env), dummy_g1(&env)];

        client.register_circuit(
            &circuit_id,
            &name,
            &dummy_g1(&env),
            &dummy_g2(&env),
            &dummy_g2(&env),
            &dummy_g2(&env),
            &ic,
        );

        let vk = client.get_circuit(&circuit_id);
        assert_eq!(vk.circuit_id, circuit_id);
        assert_eq!(vk.ic.len(), 3);
    }

    #[test]
    fn test_is_valid_nonexistent() {
        let env = Env::default();
        let id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        assert!(!client.is_valid(&BytesN::from_array(&env, &[42u8; 32])));
    }

    #[test]
    fn test_set_paused() {
        let env = Env::default();
        let id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        client.set_paused(&true);
        client.set_paused(&false);
    }
}
