# Security Model

## Smart Contract Security

### Vault (`contracts/vault`)

| Threat | Mitigation |
|--------|-----------|
| Unauthorized withdrawals | `from.require_auth()` on every deposit/withdraw |
| Agent impersonation | `storage::is_authorized_agent()` checked before any position operation |
| Re-entrancy (cross-contract) | Soroban's deterministic execution model prevents classic re-entrancy; state updates happen before external token calls where possible |
| Drawdown attacks | `guardrails::check_withdrawal` enforces `max_drawdown_bps` per transaction |
| Daily drain | Temporary storage tracks cumulative outflow per unix-day; `daily_spending_cap` enforced |
| Flash loan / sandwich | `time_lock_seconds` prevents same-block deposit+withdraw |
| Admin key compromise | `emergency_stop` pauses all agent operations; contracts are upgradeable to fix exploits |
| Position size blowup | `max_position_size_bps` caps any single position relative to total AUM |

### Agent Registry (`contracts/agent-registry`)

- Only the agent's own address can register or update its VC
- VC acceptance requires admin signature (off-chain KYA review)
- Slash/ban require admin — reputation cannot be inflated by the agent itself
- `reputation_updaters` whitelist restricts who can call `record_success/failure`

### Strategy Marketplace (`contracts/strategy-marketplace`)

- Execution fees are pulled atomically in the same transaction as the execution record — no fee escrow vulnerability
- Platform fee capped at 20% by contract constant `MAX_PLATFORM_FEE_BPS`
- Audit status is immutable once set (only admin can mark audited, never un-audit)

### Stokvel Vault (`contracts/stokvel-vault`)

- Threshold multisig: requires M-of-N member approvals before any fund movement
- Proposals expire after `PROPOSAL_EXPIRY_SECS` (default 7 days) to prevent stale approvals accumulating
- One vote per member per proposal — double-voting panics
- Proposer auto-approves — counts toward threshold
- `emergency_stop` requires M-of-N approval same as any other proposal

### ZK Attestation (`contracts/zk-attestation`)

- Verifying keys are admin-only (prevents fraudulent circuits)
- Proofs are verified on-chain before any attestation record is created
- `attest_performance` requires prover `require_auth()` — prover cannot be impersonated
- Paused flag allows emergency halt of proof verification

---

## Backend Security

### API Authentication

All routes under `/api` require a valid API key in the `x-api-key` header. The key is compared against the SHA-256 hash stored in `API_KEY_HASH`.

Requests without a valid key receive `401 Unauthorized`.

### Rate Limiting

Global rate limit: 120 requests per minute per IP (configurable). Heavy operations (ZK proof submission) should be rate-limited more aggressively in production.

### Secrets

- `ADMIN_SECRET_KEY` and `ORACLE_SECRET_KEY` are loaded from environment variables, never hardcoded
- FHE private keys are stored in `fhe-keys/` (excluded from version control via `.gitignore`)
- dWallet signing keys are stored in Ika's MPC network — VeilVault never holds them

### Input Validation

All API endpoints validate requests with `zod` schemas before reaching service or contract layers. Malformed inputs are rejected at the HTTP boundary.

---

## Cryptographic Assumptions

| Component | Assumption |
|-----------|-----------|
| Groth16 proofs | Soundness of the Groth16 SNARK under the generic group model with a trusted setup |
| BLS12-381 pairings | Hardness of the BLS12-381 DLEQ and pairing assumptions |
| ed25519 (dWallet) | Hardness of the discrete log on Curve25519 |
| TFHE-rs (FHE) | LWE / RLWE hardness assumptions |
| SHA-256 (VC hashing) | Collision resistance of SHA-256 |

## Audit Checklist

Before mainnet deployment:
- [ ] Professional audit of `vault`, `agent-registry`, `stokvel-vault`
- [ ] Formal verification of share math (overflow-checked arithmetic)
- [ ] Trusted setup ceremony for Groth16 circuits (or switch to Plonk/STARK)
- [ ] Penetration test of backend API (rate limits, auth bypass, SSRF)
- [ ] Fuzzing of all contract entry points
- [ ] Review of all `contractimport!` cross-contract calls
