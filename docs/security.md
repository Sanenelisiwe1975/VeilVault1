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
- Sign-in (`/api/auth/passkey/login/*`) verifies the assertion off-chain only, to issue a session JWT — it never touches the chain, so the low-S concern above doesn't apply to login. It does apply to the add-backup-passkey flow below, which submits a real transaction.
- A wallet can register up to `MAX_SIGNERS` (5) passkeys via `add_signer`, each identified by index in `WebAuthnSignature::signer_index` (the contract can't "try every key" — `secp256r1_verify` traps on mismatch instead of returning a bool). `add_signer` / `remove_signer` both require `current_contract_address().require_auth()` — i.e. a valid WebAuthn assertion from an *already-registered* signer — so only someone who already controls the wallet can add or remove a key. `remove_signer` always leaves at least one signer.
- `add_signer` is exposed as "add backup passkey" via `/api/passkey/signers/*` (`backend/src/services/passkey.service.ts`, `backend/src/api/routes/passkey-signer.routes.ts`). These routes require an authenticated session and read the wallet address from `req.walletAddress` (set by `apiKeyAuth` from the validated session token) rather than trusting a client-supplied address — a caller can only ever add a backup signer to their own wallet. The backend builds the `SorobanAuthorizationEntry` manually (`StellarClient.prepareAuthorizedInvocation` / `submitAuthorizedInvocation`), since the SDK's own `authorizeEntry` helpers hard-code Ed25519 verification and can't produce the contract's custom `WebAuthnSignature` credential shape. Validated end to end against live testnet (`backend/scripts/validate-passkey-tx-auth.ts`).
- A real gotcha hit during that validation: the first Soroban simulation (before a signature exists) only *records* that an auth entry is needed rather than executing `__check_auth`, so its instruction-budget estimate doesn't account for the real cost of `secp256r1_verify` — submitting with that budget fails with `scecExceededLimit`. `submitAuthorizedInvocation` re-simulates once the entry's signature is filled in and uses that estimate instead.
- Another real bug hit during that same validation: `nativeToScVal`'s symbol-keyed map encoding for `WebAuthnSignature` left `signer_index`'s value type unspecified, so it was auto-inferred as `u64` instead of the contract's `u32` field — the contract's struct deserializer trapped (`VM call trapped: UnreachableCodeReached`) on the mismatch with no clean error surfaced. Any future struct-typed ScVal built this way needs every scalar field's type explicit, not just the map keys' `'symbol'` tag.

### Passkey Registry (`contracts/passkey-registry`)

Durable on-chain index from `sha256(credential_id) -> { wallet, public_key_cose, signer_index, counter }`, replacing what used to be in-memory backend state for this mapping.

- `register` / `update_counter` are admin-only (`admin.require_auth()`, admin set once at `initialize` and never re-derived from caller input — a caller-supplied "deployer" parameter here would let anyone register an arbitrary mapping by authorizing as their own address).
- `resolve` is public. This is intentionally non-authoritative: a wrong or malicious registry entry can only cause sign-in to generate WebAuthn options for the wrong wallet, which then simply fails to verify (the assertion won't match that wallet's real registered signers). It cannot grant any actual signing authority — that lives entirely in the `smart-wallet` instance itself.

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
- [ ] Independent review of `StellarClient.prepareAuthorizedInvocation` / `submitAuthorizedInvocation` and the DER-decode + low-S normalization in `backend/src/utils/ecdsa.ts` — these now authorize real transactions (`add_signer`), validated against testnet but not yet externally reviewed
- [ ] Extend passkey-wallet transaction authorization beyond `add_signer` to general contract invocations (payments/deposits) if passkey wallets are to be used for more than sign-in + recovery
