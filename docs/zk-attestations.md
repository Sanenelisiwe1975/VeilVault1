# ZK Attestations

VeilVault1 uses **Groth16 zero-knowledge proofs** to let vaults prove their performance without revealing strategy parameters. This is critical for confidential AI strategies that would lose their edge if disclosed.

## How It Works

The ZK Attestation contract (`contracts/zk-attestation`) stores verifying keys and attestation records on Soroban.

### Proof structure (Groth16)

```
VerifyingKey {
  alpha_g1_neg: Bytes<96>   // -α₁ (pre-negated for efficiency)
  beta_g2:      Bytes<192>  // β₂
  gamma_g2:     Bytes<192>  // γ₂
  delta_g2:     Bytes<192>  // δ₂
  ic:           Vec<Bytes>  // IC[0..n], one per public input + 1
}

Proof {
  a: Bytes<96>   // G1
  b: Bytes<192>  // G2
  c: Bytes<96>   // G1
}
```

### Groth16 Verification Equation

```
e(A, B) · e(-α₁, β₂) · e(vk_x, γ₂) · e(C, δ₂) == 1_GT

where vk_x = IC[0] + Σ public_inputs[i] · IC[i+1]
```

This is implemented using Soroban's native BLS12-381 host functions:

```rust
// Compute vk_x via MSM (multi-scalar multiplication)
let vk_x = env.crypto().bls12_381().g1_msm(ic_points, public_scalars);

// 4-pairing check
env.crypto().bls12_381().multi_pairing_check(
  vec![A, alpha_g1_neg, vk_x, C],
  vec![B, beta_g2, gamma_g2, delta_g2],
)
```

### G1 Negation

BLS12-381 G1 negation is computed as `−P = (r−1) · P` where `r` is the curve order. This avoids Fp arithmetic and uses only the `g1_mul` host function.

```rust
const FR_NEG_ONE: [u8; 32] = [
  0x73, 0xed, 0xa7, 0x53, /* ... */ 0x00, 0x00, 0x00, 0x00,
];
```

The verifying key stores `alpha_g1_neg` (pre-negated off-chain), so the on-chain verifier only needs to execute the pairing check — no negation at runtime.

---

## Performance Circuit: Public Inputs

The `performance_v1` circuit attests vault returns with 5 public inputs:

| Index | Value                          |
|-------|-------------------------------|
| 0     | `vault_commitment`             |
| 1     | `strategy_commitment`          |
| 2     | `period_start` (as Fr)         |
| 3     | `period_end` (as Fr)           |
| 4     | `return_bps` (as Fr, signed)   |

The prover knows the actual strategy parameters (kept private as witnesses). The proof convinces on-chain verifiers that `return_bps` was legitimately achieved during the stated period for the stated vault.

---

## API

### Register a circuit verifying key (admin only)

```http
POST /api/attestations/register-circuit
{
  "circuitId": "<32-byte hex>",
  "circuitName": "performance_v1",
  "alphaG1Neg": "<192-char hex>",
  "betaG2": "<384-char hex>",
  "gammaG2": "<384-char hex>",
  "deltaG2": "<384-char hex>",
  "ic": ["<192-char hex>", "..."],
  "adminSecret": "..."
}
```

### Verify a proof (simulation — no state change)

```http
POST /api/attestations/verify
{
  "circuitId": "<32-byte hex>",
  "proof": { "a": "...", "b": "...", "c": "..." },
  "publicInputs": ["<64-char hex>", "..."]
}
→ { "valid": true }
```

### Submit a performance attestation

```http
POST /api/attestations/attest
{
  "circuitId": "...",
  "vault": "G...",
  "prover": "G...",
  "strategyCommitment": "<64-char hex>",
  "periodStart": 1700000000,
  "periodEnd":   1702592000,
  "returnBps": 185,
  "proof": { "a": "...", "b": "...", "c": "..." },
  "publicInputs": ["...", "...", "...", "...", "..."],
  "proverSecret": "..."
}
→ { "attestationId": "<64-char hex>" }
```

### Check validity

```http
GET /api/attestations/<id>/valid
→ { "valid": true }
```

---

## SDK Usage

```typescript
import { AttestationClient } from '@veilVault1/sdk';

const client = new AttestationClient({
  baseUrl: 'https://api.veilVault1.xyz',
  apiKey: 'your-api-key',
});

// Register a circuit once
await client.registerCircuit({ circuitId, circuitName, alphaG1Neg, betaG2, ... });

// Attest performance after every reporting period
const attestId = await client.attestPerformance({
  circuitId,
  vault: VAULT_ADDRESS,
  prover: MY_ADDRESS,
  strategyCommitment: COMMITMENT_HEX,
  periodStart: Math.floor(Date.now() / 1000) - 30 * 86400,
  periodEnd:   Math.floor(Date.now() / 1000),
  returnBps: 185,
  proof: { a: proofA, b: proofB, c: proofC },
  publicInputs: [pi0, pi1, pi2, pi3, pi4],
  proverSecret: MY_SECRET,
});

const isValid = await client.isValid(attestId);
// true — vault has on-chain proof of 1.85% return without revealing strategy
```
