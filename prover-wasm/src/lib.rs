//! Generates a VeilPool withdrawal proof entirely in-browser. Reuses the same
//! circuit/proof-encoding logic as the native CLI prover (prover/), via the
//! shared prover-core crate — only the entry point differs (no CLI, no fs;
//! the proving key is passed in as bytes, fetched + cached by the caller).

use ark_bls12_381::{Bls12_381, Fr};
use ark_ff::PrimeField;
use ark_groth16::{Groth16, ProvingKey};
use ark_serialize::CanonicalDeserialize;
use ark_snark::SNARK;
use rand::thread_rng;
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

use veilpool_prover_core::circuit::{compute_merkle_root, to_fr_native, WithdrawCircuit, TREE_DEPTH};
use veilpool_prover_core::mimc::compute_round_constants;
use veilpool_prover_core::serialize::withdrawal_payload_json;

fn parse_hex32(s: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(s.trim_start_matches("0x")).map_err(|e| e.to_string())?;
    bytes.try_into().map_err(|_| "expected 32 bytes".to_string())
}

fn parse_hex32_array(json: &str) -> Result<[[u8; 32]; TREE_DEPTH], String> {
    let v: Vec<String> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if v.len() != TREE_DEPTH {
        return Err(format!("expected {TREE_DEPTH} elements, got {}", v.len()));
    }
    let mut out = [[0u8; 32]; TREE_DEPTH];
    for (i, s) in v.iter().enumerate() {
        out[i] = parse_hex32(s)?;
    }
    Ok(out)
}

fn parse_bool_array(json: &str) -> Result<[bool; TREE_DEPTH], String> {
    let v: Vec<bool> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if v.len() != TREE_DEPTH {
        return Err(format!("expected {TREE_DEPTH} elements, got {}", v.len()));
    }
    let mut out = [false; TREE_DEPTH];
    out[..TREE_DEPTH].copy_from_slice(&v);
    Ok(out)
}

/// Generates a withdrawal proof entirely in-memory — secret/nullifier never
/// leave the caller (the browser). Mirrors prover/src/main.rs's cmd_prove,
/// minus file I/O: pk is passed in as bytes (fetched + cached by JS), and the
/// result is returned directly instead of written to stdout/a file.
#[wasm_bindgen]
pub fn prove(
    secret_hex: &str,
    nullifier_hex: &str,
    path_elements_json: &str,
    path_indices_json: &str,
    root_hex: &str,
    recipient_hex: &str,
    denomination: u64,
    pk_bytes: &[u8],
    circuit_id_hex: &str,
    pool_address: &str,
    prover_address: &str,
) -> Result<String, JsValue> {
    console_error_panic_hook::set_once();

    let secret = parse_hex32(secret_hex).map_err(|e| JsValue::from_str(&e))?;
    let nullifier = parse_hex32(nullifier_hex).map_err(|e| JsValue::from_str(&e))?;
    let path_elements = parse_hex32_array(path_elements_json).map_err(|e| JsValue::from_str(&e))?;
    let path_indices = parse_bool_array(path_indices_json).map_err(|e| JsValue::from_str(&e))?;
    let root_bytes = parse_hex32(root_hex).map_err(|e| JsValue::from_str(&e))?;
    let recipient_bytes = parse_hex32(recipient_hex).map_err(|e| JsValue::from_str(&e))?;
    let circuit_id = parse_hex32(circuit_id_hex).map_err(|e| JsValue::from_str(&e))?;

    let consts = compute_round_constants();
    let leaf_bytes = Sha256::digest([&secret[..], &nullifier[..]].concat());
    let leaf_arr: [u8; 32] = leaf_bytes.into();
    let leaf_fr = to_fr_native(&leaf_arr);

    let computed_root = compute_merkle_root(leaf_fr, &path_elements, &path_indices, &consts);
    let root_fr = Fr::from_be_bytes_mod_order(&root_bytes);
    if computed_root != root_fr {
        return Err(JsValue::from_str(
            "computed Merkle root does not match the provided root",
        ));
    }

    let null_hash_bytes: [u8; 32] = Sha256::digest(&nullifier).into();
    let nullifier_hash_fr = to_fr_native(&null_hash_bytes);
    let recipient_fr = to_fr_native(&recipient_bytes);
    let denomination_fr = Fr::from(denomination);
    let protocol_ver_fr = Fr::from(1u64);

    let circuit = WithdrawCircuit {
        secret: Some(secret),
        nullifier: Some(nullifier),
        path_elements: Some(path_elements),
        path_indices: Some(path_indices),
        root: Some(root_fr),
        nullifier_hash: Some(nullifier_hash_fr),
        recipient: Some(recipient_fr),
        denomination: Some(denomination_fr),
        protocol_version: Some(protocol_ver_fr),
    };

    let pk = ProvingKey::<Bls12_381>::deserialize_uncompressed(pk_bytes)
        .map_err(|e| JsValue::from_str(&format!("deserializing pk: {e:?}")))?;

    let mut rng = thread_rng();
    let proof = Groth16::<Bls12_381>::prove(&pk, circuit, &mut rng)
        .map_err(|e| JsValue::from_str(&format!("proving failed: {e:?}")))?;

    let public_inputs: [Fr; 5] = [
        root_fr,
        nullifier_hash_fr,
        recipient_fr,
        denomination_fr,
        protocol_ver_fr,
    ];

    let payload = withdrawal_payload_json(&proof, &public_inputs, &circuit_id, pool_address, prover_address);
    serde_json::to_string(&payload).map_err(|e| JsValue::from_str(&e.to_string()))
}
