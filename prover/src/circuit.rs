use ark_bls12_381::Fr;
use ark_ff::PrimeField;
use ark_r1cs_std::{
    alloc::AllocVar,
    boolean::Boolean,
    eq::EqGadget,
    fields::fp::FpVar,
    uint8::UInt8,
    ToBitsGadget,
    ToBytesGadget,
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_crypto_primitives::crh::sha256::constraints::Sha256Gadget;

use crate::mimc::{compute_round_constants, mimc5_hash_gadget, mimc5_hash, ROUNDS};

pub const TREE_DEPTH: usize = 20;

/// Convert SHA-256 output bytes → Fr element, matching the on-chain `to_fr`:
///   - Zero byte[0] (MSB) so the 256-bit value is ≤ 2^248 < field modulus.
///   - Interpret remaining 248 bits as big-endian → Fr.
///
/// Accepts a slice of at least 32 `UInt8` gadgets; only bytes[1..32] are used.
fn to_fr_gadget(bytes: &[UInt8<Fr>]) -> Result<FpVar<Fr>, SynthesisError> {
    // Collect bits for bytes[1..] in big-endian order (MSB first).
    // Byte[0] is skipped — equivalent to zeroing the MSB.
    let mut be_bits: Vec<Boolean<Fr>> = Vec::with_capacity(248);
    for byte in bytes[1..32.min(bytes.len())].iter() {
        be_bits.extend(byte.to_bits_be()?);
    }
    // Reverse to little-endian: le_bits[0] = LSB of the 248-bit value.
    be_bits.reverse();
    Boolean::le_bits_to_fp_var(&be_bits)
}

/// Convert a raw 32-byte array → Fr, matching the on-chain `to_fr`.
pub fn to_fr_native(bytes: &[u8; 32]) -> Fr {
    let mut arr = *bytes;
    arr[0] = 0x00;
    Fr::from_be_bytes_mod_order(&arr)
}

/// Compute the Merkle root of a 20-deep MiMC-5 tree given a leaf
/// and its sibling path. `path_indices[i]` = true means the current
/// node is the RIGHT child at level i (sibling is on the left).
///
/// Path elements are canonical Fr bytes stored by the contract (no byte[0]
/// zeroing needed — the contract stores pure Fr values from fr_add).
pub fn compute_merkle_root(
    leaf: Fr,
    path_elements: &[[u8; 32]; TREE_DEPTH],
    path_indices: &[bool; TREE_DEPTH],
    consts: &[Fr; ROUNDS],
) -> Fr {
    let mut current = leaf;
    for level in 0..TREE_DEPTH {
        // Use from_be_bytes_mod_order so intermediate hash values (canonical Fr
        // bytes, < FR_MOD) are interpreted as-is, matching the contract's pure
        // Fr arithmetic.  Only the leaf uses to_fr_native (byte[0] zeroing) to
        // match the circuit's to_fr_gadget on the SHA-256 commitment.
        let sibling = Fr::from_be_bytes_mod_order(&path_elements[level]);
        let (left, right) = if path_indices[level] {
            (sibling, current)  // current is right child
        } else {
            (current, sibling)  // current is left child
        };
        current = mimc5_hash(left, right, consts);
    }
    current
}

//  Withdraw Circuit 

/// Groth16 R1CS circuit for privacy pool withdrawal.
///
/// Private inputs:
///   - `secret`        — 32-byte deposit secret
///   - `nullifier`     — 32-byte nullifier
///   - `path_elements` — 20 sibling hashes on the Merkle path
///   - `path_indices`  — which side each sibling is on (true = current is right)
///
/// Public inputs (5, matching `attest_performance` assertion):
///   1. `root`             — Merkle root the depositor committed to
///   2. `nullifier_hash`   — SHA-256(nullifier) as Fr, posted on-chain to prevent double-spend
///   3. `recipient`        — withdrawal target address as Fr
///   4. `denomination`     — fixed pool denomination as Fr
///   5. `protocol_version` — Fr(1)
///
/// Circuit proves:
///   - SHA-256(secret ‖ nullifier) is a leaf in the Merkle tree with the given root
///   - SHA-256(nullifier) equals the public nullifier_hash
pub struct WithdrawCircuit {
    // private
    pub secret:        Option<[u8; 32]>,
    pub nullifier:     Option<[u8; 32]>,
    pub path_elements: Option<[[u8; 32]; TREE_DEPTH]>,
    pub path_indices:  Option<[bool; TREE_DEPTH]>,
    // public
    pub root:             Option<Fr>,
    pub nullifier_hash:   Option<Fr>,
    pub recipient:        Option<Fr>,
    pub denomination:     Option<Fr>,
    pub protocol_version: Option<Fr>,
}

impl ConstraintSynthesizer<Fr> for WithdrawCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        use SynthesisError::AssignmentMissing;

        //  Public inputs (allocated first → IC indices 1..5) 
        let root_pub = FpVar::new_input(cs.clone(), || {
            self.root.ok_or(AssignmentMissing)
        })?;
        let null_hash_pub = FpVar::new_input(cs.clone(), || {
            self.nullifier_hash.ok_or(AssignmentMissing)
        })?;
        let _recipient_pub = FpVar::new_input(cs.clone(), || {
            self.recipient.ok_or(AssignmentMissing)
        })?;
        let _denomination_pub = FpVar::new_input(cs.clone(), || {
            self.denomination.ok_or(AssignmentMissing)
        })?;
        let _protocol_ver_pub = FpVar::new_input(cs.clone(), || {
            self.protocol_version.ok_or(AssignmentMissing)
        })?;

        //  Private witness: secret (32 bytes) 
        let secret_bytes: Vec<UInt8<Fr>> = (0..32_usize)
            .map(|i| {
                UInt8::new_witness(cs.clone(), || {
                    self.secret.map(|s| s[i]).ok_or(AssignmentMissing)
                })
            })
            .collect::<Result<_, _>>()?;

        //  Private witness: nullifier (32 bytes) 
        let nullifier_bytes: Vec<UInt8<Fr>> = (0..32_usize)
            .map(|i| {
                UInt8::new_witness(cs.clone(), || {
                    self.nullifier.map(|n| n[i]).ok_or(AssignmentMissing)
                })
            })
            .collect::<Result<_, _>>()?;

        //  Commitment = SHA-256(secret ‖ nullifier)
        let mut preimage = secret_bytes.clone();
        preimage.extend_from_slice(&nullifier_bytes);
        // Sha256Gadget::digest returns DigestVar<Fr>; convert to [UInt8<Fr>] via ToBytesGadget.
        let commitment_bytes = Sha256Gadget::<Fr>::digest(&preimage)?.to_bytes()?;

        // leaf Fr = to_fr(commitment_bytes)
        let leaf = to_fr_gadget(&commitment_bytes)?;

        //  Nullifier hash = SHA-256(nullifier)
        let null_hash_bytes = Sha256Gadget::<Fr>::digest(&nullifier_bytes)?.to_bytes()?;
        let null_hash_computed = to_fr_gadget(&null_hash_bytes)?;

        // Enforce: computed nullifier_hash == public nullifier_hash
        null_hash_computed.enforce_equal(&null_hash_pub)?;

        //  Merkle path verification 
        let consts = compute_round_constants();
        let mut current = leaf;

        for level in 0..TREE_DEPTH {
            let sibling_val = self
                .path_elements
                .map(|p| Fr::from_be_bytes_mod_order(&p[level]))
                .unwrap_or(Fr::from(0u64));

            let sibling = FpVar::new_witness(cs.clone(), || Ok(sibling_val))?;

            let is_right = Boolean::new_witness(cs.clone(), || {
                self.path_indices
                    .map(|p| p[level])
                    .ok_or(AssignmentMissing)
            })?;

            // is_right = true  → current is right child, sibling is left
            // is_right = false → current is left child,  sibling is right
            let left  = is_right.select(&sibling,  &current)?;
            let right = is_right.select(&current,  &sibling)?;

            current = mimc5_hash_gadget(&left, &right, &consts)?;
        }

        // Enforce: computed Merkle root == public root
        current.enforce_equal(&root_pub)?;

        Ok(())
    }
}
