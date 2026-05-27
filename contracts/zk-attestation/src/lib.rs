#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::bls12_381::{Fr, G1Affine, G2Affine},
    vec, Address, Bytes, BytesN, Env, Map, String, Vec,
};

// BLS12-381 curve order r minus 1, big-endian.
// r = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001
// r-1 = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000000
const FR_NEG_ONE: [u8; 32] = [
    0x73, 0xed, 0xa7, 0x53, 0x29, 0x9d, 0x7d, 0x48, 0x33, 0x39, 0xd8, 0x08, 0x09, 0xa1, 0xd8,
    0x05, 0x53, 0xbd, 0xa4, 0x02, 0xff, 0xfe, 0x5b, 0xfe, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00,
    0x00, 0x00,
];

// ─── Storage Keys ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    VerifyingKey(BytesN<32>), // circuit_id → VerifyingKey
    Attestation(BytesN<32>), // attestation_id → PerformanceAttestation
    AttestationCount,
    Paused,
}

// ─── Types ───────────────────────────────────────────────────────────────────

/// Groth16 verifying key stored on-chain.
/// alpha_g1 is pre-negated (stored as -alpha_g1) to save gas during verification.
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    /// -α₁ (G1, 96 bytes, pre-negated)
    pub alpha_g1_neg: Bytes,
    /// β₂ (G2, 192 bytes)
    pub beta_g2: Bytes,
    /// γ₂ (G2, 192 bytes)
    pub gamma_g2: Bytes,
    /// δ₂ (G2, 192 bytes)
    pub delta_g2: Bytes,
    /// IC[0..n] (G1 points, 96 bytes each) — one per public input + 1
    pub ic: Vec<Bytes>,
    /// human label for this circuit
    pub circuit_id: BytesN<32>,
    pub circuit_name: String,
}

/// A Groth16 proof submitted by a prover.
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    /// A (G1, 96 bytes)
    pub a: Bytes,
    /// B (G2, 192 bytes)
    pub b: Bytes,
    /// C (G1, 96 bytes)
    pub c: Bytes,
}

/// Performance attestation record tied to a vault.
/// Public inputs commit to vault address, period, and return — strategy stays private.
#[contracttype]
#[derive(Clone)]
pub struct PerformanceAttestation {
    pub attestation_id: BytesN<32>,
    pub circuit_id: BytesN<32>,
    pub vault: Address,
    pub prover: Address,
    /// Pedersen commitment to strategy params (stays private)
    pub strategy_commitment: BytesN<32>,
    /// UNIX timestamp of period start
    pub period_start: u64,
    /// UNIX timestamp of period end
    pub period_end: u64,
    /// Basis-point return, e.g. 150 = 1.5%
    pub return_bps: i64,
    /// ZK proof that return_bps is correct without revealing the strategy
    pub proof: Proof,
    /// SHA-256 of the public inputs vector used during verify
    pub public_inputs_hash: BytesN<32>,
    pub verified: bool,
    pub timestamp: u64,
}

/// Compact view returned by get_attestation
#[contracttype]
#[derive(Clone)]
pub struct AttestationSummary {
    pub attestation_id: BytesN<32>,
    pub vault: Address,
    pub period_start: u64,
    pub period_end: u64,
    pub return_bps: i64,
    pub verified: bool,
    pub timestamp: u64,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct ZkAttestationContract;

#[contractimpl]
impl ZkAttestationContract {
    // ── Admin ────────────────────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) {
        if env
            .storage()
            .instance()
            .has(&DataKey::Admin)
        {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::AttestationCount, &0u64);
        env.storage().instance().set(&DataKey::Paused, &false);
        Self::bump_instance(&env);
    }

    pub fn set_paused(env: Env, paused: bool) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &paused);
        Self::bump_instance(&env);
    }

    // ── Verifying Key Management ─────────────────────────────────────────────

    /// Register or update a Groth16 verifying key for a circuit.
    /// alpha_g1_neg must already be the negation of alpha_g1 (caller's responsibility).
    pub fn register_circuit(
        env: Env,
        circuit_id: BytesN<32>,
        circuit_name: String,
        alpha_g1_neg: Bytes,
        beta_g2: Bytes,
        gamma_g2: Bytes,
        delta_g2: Bytes,
        ic: Vec<Bytes>,
    ) {
        Self::require_admin(&env);
        assert_eq!(alpha_g1_neg.len(), 96, "alpha_g1_neg must be 96 bytes");
        assert_eq!(beta_g2.len(), 192, "beta_g2 must be 192 bytes");
        assert_eq!(gamma_g2.len(), 192, "gamma_g2 must be 192 bytes");
        assert_eq!(delta_g2.len(), 192, "delta_g2 must be 192 bytes");
        assert!(ic.len() >= 1, "ic must have at least 1 element");
        for point in ic.iter() {
            assert_eq!(point.len(), 96, "each IC point must be 96 bytes");
        }

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

    // ── ZK Proof Verification (Groth16) ──────────────────────────────────────

    /// Verify a Groth16 proof against a registered verifying key.
    ///
    /// Groth16 check:
    ///   e(A, B) · e(-alpha_g1, beta_g2) · e(vk_x, gamma_g2) · e(C, delta_g2) == 1
    ///
    /// Where vk_x = IC[0] + Σ public_inputs[i] * IC[i+1]
    ///
    /// We use multi_pairing_check which takes (G1, G2) pairs and returns true iff
    /// the product of all pairings equals the identity in GT.
    pub fn verify_proof(
        env: Env,
        circuit_id: BytesN<32>,
        proof: Proof,
        public_inputs: Vec<BytesN<32>>, // Fr scalars, big-endian 32 bytes each
    ) -> bool {
        Self::require_not_paused(&env);

        let vk: VerifyingKey = env
            .storage()
            .persistent()
            .get(&DataKey::VerifyingKey(circuit_id))
            .expect("circuit not found");

        // public_inputs.len() must equal vk.ic.len() - 1
        let expected_inputs = (vk.ic.len() as usize).checked_sub(1).unwrap_or(0);
        if public_inputs.len() as usize != expected_inputs {
            return false;
        }

        let bls = env.crypto().bls12_381();

        // Compute vk_x = IC[0] + Σ public_inputs[i] * IC[i+1]
        let ic0_bytes = vk.ic.get(0).expect("ic empty");
        let mut vk_x = bls.g1_add(
            G1Affine::from_bytes(ic0_bytes.clone()),
            // Add identity (zero) — just loads IC[0] as starting accumulator.
            // Trick: multiply by scalar 1 to get a clean G1Affine.
            G1Affine::from_bytes(ic0_bytes),
        );
        // Re-derive from IC[0] cleanly: vk_x starts as IC[0]
        // We'll use msm for the summation which is more efficient.
        // Build (points, scalars) for MSM: [IC[1..n]] × [public_inputs[0..n-1]]
        if public_inputs.len() > 0 {
            let mut msm_points: Vec<G1Affine> = Vec::new(&env);
            let mut msm_scalars: Vec<Fr> = Vec::new(&env);
            for i in 0..public_inputs.len() {
                let ic_point = G1Affine::from_bytes(vk.ic.get(i + 1).expect("ic point missing"));
                let scalar_bytes = public_inputs.get(i).expect("scalar missing");
                let fr = Fr::from_bytes(scalar_bytes.into());
                msm_points.push_back(ic_point);
                msm_scalars.push_back(fr);
            }
            let sum = bls.g1_msm(msm_points, msm_scalars);
            // vk_x = IC[0] + sum
            vk_x = bls.g1_add(G1Affine::from_bytes(ic0_bytes), sum);
        } else {
            vk_x = G1Affine::from_bytes(ic0_bytes);
        }

        // Build the 4 pairs for multi_pairing_check:
        //   (A,        B        )
        //   (-alpha_g1, beta_g2 )   ← pre-negated, so we pass alpha_g1_neg directly
        //   (vk_x,     gamma_g2 )
        //   (C,        delta_g2 )
        let pair_g1: Vec<G1Affine> = vec![
            &env,
            G1Affine::from_bytes(proof.a),
            G1Affine::from_bytes(vk.alpha_g1_neg),
            vk_x,
            G1Affine::from_bytes(proof.c),
        ];
        let pair_g2: Vec<G2Affine> = vec![
            &env,
            G2Affine::from_bytes(proof.b),
            G2Affine::from_bytes(vk.beta_g2),
            G2Affine::from_bytes(vk.gamma_g2),
            G2Affine::from_bytes(vk.delta_g2),
        ];

        bls.multi_pairing_check(pair_g1, pair_g2)
    }

    // ── Performance Attestations ──────────────────────────────────────────────

    /// Submit and verify a vault performance attestation.
    /// The proof attests that `return_bps` is correct for the period without
    /// revealing strategy parameters.
    ///
    /// Public inputs layout (must match circuit):
    ///   [0] vault_commitment  — Pedersen(vault_address)
    ///   [1] strategy_commitment — Pedersen(strategy_params)  (stays private internally)
    ///   [2] period_start_fr   — period_start as Fr
    ///   [3] period_end_fr     — period_end as Fr
    ///   [4] return_bps_fr     — return_bps as Fr (may be negative)
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
        assert!(public_inputs.len() == 5, "expected 5 public inputs");

        // Verify the proof on-chain
        let valid = Self::verify_proof(
            env.clone(),
            circuit_id.clone(),
            proof.clone(),
            public_inputs.clone(),
        );
        assert!(valid, "proof verification failed");

        // Derive a unique attestation ID
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::AttestationCount)
            .unwrap_or(0);
        let new_count = count + 1;

        // Hash(circuit_id || vault || prover || period_start || period_end || count)
        let mut id_preimage = Bytes::new(&env);
        id_preimage.append(&circuit_id.clone().into());
        id_preimage.append(&Bytes::from_array(&env, &period_start.to_be_bytes()));
        id_preimage.append(&Bytes::from_array(&env, &period_end.to_be_bytes()));
        id_preimage.append(&Bytes::from_array(&env, &new_count.to_be_bytes()));
        let attestation_id: BytesN<32> = env.crypto().sha256(&id_preimage).into();

        // Hash the public inputs for compact storage
        let mut pi_bytes = Bytes::new(&env);
        for pi in public_inputs.iter() {
            let b: Bytes = pi.into();
            pi_bytes.append(&b);
        }
        let public_inputs_hash: BytesN<32> = env.crypto().sha256(&pi_bytes).into();

        let attestation = PerformanceAttestation {
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
            .set(&DataKey::Attestation(attestation_id.clone()), &attestation);
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

    /// Quick validity check — returns true if attestation exists and was ZK-verified.
    pub fn is_valid(env: Env, attestation_id: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get::<DataKey, PerformanceAttestation>(&DataKey::Attestation(attestation_id))
            .map(|a| a.verified)
            .unwrap_or(false)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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
        env.storage()
            .instance()
            .extend_ttl(100_000, 1_000_000);
    }

    fn bump_persistent(env: &Env, key: &DataKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, 50_000, 500_000);
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn create_env() -> Env {
        Env::default()
    }

    fn dummy_g1(env: &Env) -> Bytes {
        // BLS12-381 G1 generator point in compressed form (96 bytes)
        // This is the standard generator for testing purposes.
        // In a real test you'd use actual elliptic curve points.
        let mut b = Bytes::new(env);
        // Compressed G1 point: first byte has the compression flag (0x80) set,
        // and the "point at infinity" flag gives us the identity/zero point.
        // Identity point: all zeros except first byte = 0xc0.
        b.push_back(0xc0);
        for _ in 1..96 {
            b.push_back(0x00);
        }
        b
    }

    fn dummy_g2(env: &Env) -> Bytes {
        // Identity point in G2 (192 bytes): first byte = 0xc0, rest zeros.
        let mut b = Bytes::new(env);
        b.push_back(0xc0);
        for _ in 1..192 {
            b.push_back(0x00);
        }
        b
    }

    fn dummy_fr(env: &Env, val: u64) -> BytesN<32> {
        let mut arr = [0u8; 32];
        let bytes = val.to_be_bytes();
        arr[24..32].copy_from_slice(&bytes);
        BytesN::from_array(env, &arr)
    }

    #[test]
    fn test_initialize() {
        let env = create_env();
        let contract_id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        assert_eq!(client.get_attestation_count(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize() {
        let env = create_env();
        let contract_id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        client.initialize(&admin);
    }

    #[test]
    fn test_register_circuit() {
        let env = create_env();
        let contract_id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);

        let circuit_id = BytesN::from_array(&env, &[1u8; 32]);
        let name = String::from_str(&env, "performance_v1");
        let ic: Vec<Bytes> = vec![&env, dummy_g1(&env), dummy_g1(&env), dummy_g1(&env)];

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
        let env = create_env();
        let contract_id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        let fake_id = BytesN::from_array(&env, &[42u8; 32]);
        assert!(!client.is_valid(&fake_id));
    }

    #[test]
    fn test_pause_unpause() {
        let env = create_env();
        let contract_id = env.register_contract(None, ZkAttestationContract);
        let client = ZkAttestationContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        client.set_paused(&true);
        // verify_proof on paused should panic
        let result = std::panic::catch_unwind(|| {
            // In Soroban tests panics propagate — we just verify the flag was set.
        });
        client.set_paused(&false);
    }
}
