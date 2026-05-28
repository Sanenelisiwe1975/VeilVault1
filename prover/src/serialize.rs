use ark_bls12_381::{Bls12_381, Fq, G1Affine, G2Affine};
use ark_ff::{BigInteger, PrimeField};
use ark_groth16::{Proof, VerifyingKey};
use serde_json::{json, Value};
use std::ops::Neg;

// ─── Field / curve point → bytes ─────────────────────────────────────────────

/// Fq (381-bit base field) → 48-byte big-endian.
pub fn fq_to_be48(fq: &Fq) -> [u8; 48] {
    let le = fq.into_bigint().to_bytes_le();   // always 48 bytes for BigInt<6>
    let mut be = [0u8; 48];
    for (i, &b) in le.iter().enumerate() {
        be[47 - i] = b;
    }
    be
}

/// Fr (255-bit scalar field) → 32-byte big-endian.
pub fn fr_to_be32(fr: &ark_bls12_381::Fr) -> [u8; 32] {
    let le = fr.into_bigint().to_bytes_le();   // always 32 bytes for BigInt<4>
    let mut be = [0u8; 32];
    for (i, &b) in le.iter().enumerate() {
        be[31 - i] = b;
    }
    be
}

/// G1 affine point → 96-byte uncompressed Soroban encoding: x(48 BE) ‖ y(48 BE).
pub fn g1_to_bytes(g1: &G1Affine) -> [u8; 96] {
    let mut out = [0u8; 96];
    out[..48].copy_from_slice(&fq_to_be48(&g1.x));
    out[48..].copy_from_slice(&fq_to_be48(&g1.y));
    out
}

/// G2 affine point → 192-byte uncompressed Soroban encoding (IETF standard):
///   x.c1(48 BE) ‖ x.c0(48 BE) ‖ y.c1(48 BE) ‖ y.c0(48 BE)
pub fn g2_to_bytes(g2: &G2Affine) -> [u8; 192] {
    let mut out = [0u8; 192];
    out[0..48].copy_from_slice(&fq_to_be48(&g2.x.c1));
    out[48..96].copy_from_slice(&fq_to_be48(&g2.x.c0));
    out[96..144].copy_from_slice(&fq_to_be48(&g2.y.c1));
    out[144..192].copy_from_slice(&fq_to_be48(&g2.y.c0));
    out
}

// ─── JSON builders ────────────────────────────────────────────────────────────

/// Serialize a Groth16 proof to the Soroban hex format used by `attest_performance`.
pub fn proof_to_json(proof: &Proof<Bls12_381>) -> Value {
    json!({
        "a": hex::encode(g1_to_bytes(&proof.a)),
        "b": hex::encode(g2_to_bytes(&proof.b)),
        "c": hex::encode(g1_to_bytes(&proof.c)),
    })
}

/// Serialize the verifying key to the JSON needed for `register_circuit`.
///
/// `alpha_g1_neg` is stored pre-negated in the contract to save one negation
/// per verification.  We negate here so callers pass the raw setup output.
pub fn vk_to_register_circuit_json(
    vk: &VerifyingKey<Bls12_381>,
    circuit_id: &[u8; 32],
    circuit_name: &str,
) -> Value {
    let alpha_neg: G1Affine = vk.alpha_g1.neg();

    let ic_hex: Vec<String> = vk
        .gamma_abc_g1
        .iter()
        .map(|pt| hex::encode(g1_to_bytes(pt)))
        .collect();

    json!({
        "circuit_id":    hex::encode(circuit_id),
        "circuit_name":  circuit_name,
        "alpha_g1_neg":  hex::encode(g1_to_bytes(&alpha_neg)),
        "beta_g2":       hex::encode(g2_to_bytes(&vk.beta_g2)),
        "gamma_g2":      hex::encode(g2_to_bytes(&vk.gamma_g2)),
        "delta_g2":      hex::encode(g2_to_bytes(&vk.delta_g2)),
        "ic":            ic_hex,
    })
}

/// Build the full withdrawal payload JSON:
///   - proof + public inputs in hex
///   - a ready-to-paste `stellar contract invoke` call
pub fn withdrawal_payload_json(
    proof: &Proof<Bls12_381>,
    public_inputs: &[ark_bls12_381::Fr; 5],
    circuit_id: &[u8; 32],
    pool_address: &str,
    prover_address: &str,
) -> Value {
    let pi_hex: Vec<String> = public_inputs
        .iter()
        .map(|fr| hex::encode(fr_to_be32(fr)))
        .collect();

    let proof_json = proof_to_json(proof);
    let circuit_id_hex = hex::encode(circuit_id);

    // pi[1] = nullifier_hash — reused as strategy_commitment metadata
    let null_hash_hex = pi_hex[1].clone();

    json!({
        "circuit_id": circuit_id_hex,
        "proof": proof_json,
        "public_inputs": pi_hex,
        "attest_performance_args": {
            "note": "Call register_circuit first, then attest_performance, then withdraw",
            "circuit_id": circuit_id_hex,
            "vault":  pool_address,
            "prover": prover_address,
            "strategy_commitment": null_hash_hex,
            "period_start": 0,
            "period_end":   1,
            "return_bps":   0,
            "proof": proof_json,
            "public_inputs": pi_hex,
        },
        "stellar_cli_snippet": format!(
            "stellar contract invoke --id $ZK_VERIFIER_CONTRACT_ID -- \
attest_performance \
--circuit_id '{circuit_id_hex}' \
--vault '{pool_address}' \
--prover '{prover_address}' \
--strategy_commitment '{null_hash_hex}' \
--period_start 0 --period_end 1 --return_bps 0 \
--proof '{{\"a\":\"{a}\",\"b\":\"{b}\",\"c\":\"{c}\"}}' \
--public_inputs '[{pi_list}]'",
            circuit_id_hex = circuit_id_hex,
            pool_address   = pool_address,
            prover_address = prover_address,
            null_hash_hex  = null_hash_hex,
            a              = proof_json["a"].as_str().unwrap(),
            b              = proof_json["b"].as_str().unwrap(),
            c              = proof_json["c"].as_str().unwrap(),
            pi_list        = pi_hex.iter().map(|h| format!("\"{h}\"")).collect::<Vec<_>>().join(","),
        ),
    })
}
