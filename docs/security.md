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
- Ban, unban, slash, and VC acceptance go through an M-of-N admin proposal flow (`propose_admin_action` → `approve_admin_action` → `execute_admin_action`) — no single admin key can unilaterally ban or slash an agent; `admin_threshold` distinct admin signatures are required
- Reputation cannot be inflated by the agent itself
- `reputation_updaters` whitelist restricts who can call `record_success/failure`
- Lower-risk, one-time configuration (`add_reputation_updater`, `set_zk_verifier`, `register_attribute_type`) remains callable by any single admin, since these configure the system rather than act against a specific agent

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

### Smart Wallet (`contracts/smart-wallet`)

Soroban `CustomAccountInterface` implementation for passkey-based account abstraction.

- `initialize(deployer, public_key)` requires `deployer.require_auth()`. Without this, anyone watching the network could race the legitimate deployer's follow-up call after `createCustomContract` and bind the wallet to their own public key before it does — the auth check closes that front-running window.
- `__check_auth` rejects assertions missing the WebAuthn User Present flag, assertions whose `clientDataJSON` isn't `"type":"webauthn.get"`, and assertions whose embedded `challenge` doesn't match the `signature_payload` Soroban actually presented (anti-replay/anti-substitution) — all checked before the signature itself is verified.
- Signature verification uses Soroban's native `secp256r1_verify`, which **traps on invalid input**, including non-low-S signatures. Browser-issued ECDSA signatures aren't guaranteed to be low-S, so any code relaying a WebAuthn signature into this contract must DER-decode and low-S-normalize it first (see the doc comment on `WebAuthnSignature` in `contracts/smart-wallet/src/lib.rs`).
- Sign-in (`/api/auth/passkey/login/*`) verifies the assertion off-chain only, to issue a session JWT — it never touches the chain, so the low-S concern above doesn't apply to login. It only applies once passkey wallets can authorize real transactions (not yet implemented).

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
- [ ] Pin `SMART_WALLET_WASM_HASH` to an already-audited upload rather than relying on the backend's first-registration auto-upload path
- [ ] Implement and security-review DER-decode + low-S normalization before passkey wallets can authorize real transactions (currently sign-in only)
