use ark_bls12_381::Fr;
use ark_ff::{Field, PrimeField};
use ark_r1cs_std::fields::{fp::FpVar, FieldVar};
use ark_relations::r1cs::SynthesisError;
use sha2::{Digest, Sha256};

pub const ROUNDS: usize = 110;

/// Derive MiMC-5 round constants matching the on-chain contract.
///
///   seed    = SHA-256("veilpool_mimc5_bls12381_rc_v1")
///   c[0]    = seed  with byte[0] = 0x00
///   c[i]    = SHA-256(c[i-1]) with byte[0] = 0x00
///
/// Zeroing byte[0] (the MSB in big-endian) ensures every constant is a
/// valid Fr element (< field modulus ≈ 2^255, so clearing the top 8 bits
/// guarantees it fits).
pub fn compute_round_constants() -> [Fr; ROUNDS] {
    let seed = Sha256::digest(b"veilpool_mimc5_bls12381_rc_v1");
    let mut buf: [u8; 32] = seed.into();
    buf[0] = 0x00;

    let mut out = [Fr::from(0u64); ROUNDS];
    out[0] = Fr::from_be_bytes_mod_order(&buf);
    for i in 1..ROUNDS {
        let h = Sha256::digest(&buf);
        buf = h.into();
        buf[0] = 0x00;
        out[i] = Fr::from_be_bytes_mod_order(&buf);
    }
    out
}

/// MiMC-5 Feistel hash — native Fr arithmetic (off-chain use).
///
/// Feistel round: (a, b) → (b, a + (b + c[i])^5)
/// Output: a + b (after all rounds).
pub fn mimc5_hash(left: Fr, right: Fr, consts: &[Fr; ROUNDS]) -> Fr {
    let (mut a, mut b) = (left, right);
    for &c in consts {
        let t = b + c;
        let t2 = t.square();
        let t4 = t2.square();
        let t5 = t4 * t;
        let new_b = a + t5;
        a = b;
        b = new_b;
    }
    a + b
}

/// MiMC-5 Feistel hash R1CS gadget — 3 constraints per round (330 total).
pub fn mimc5_hash_gadget(
    left: &FpVar<Fr>,
    right: &FpVar<Fr>,
    consts: &[Fr; ROUNDS],
) -> Result<FpVar<Fr>, SynthesisError> {
    let (mut a, mut b) = (left.clone(), right.clone());
    for &c in consts {
        let bc  = b.clone() + FpVar::Constant(c);  // b + c[i]
        let bc2 = bc.square()?;                     // (b+c)^2  — 1 constraint
        let bc4 = bc2.square()?;                    // (b+c)^4  — 1 constraint
        let bc5 = &bc4 * &bc;                       // (b+c)^5  — 1 constraint
        let new_b = a.clone() + bc5;                // a + (b+c)^5
        a = b;
        b = new_b;
    }
    Ok(a + b)
}
