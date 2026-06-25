# VeilVault

**Private and programmable yield platform for AI agents on Stellar.**

VeilVault enables users and autonomous AI agents to safely deploy capital across Stellar-based DeFi protocols, run confidential yield strategies using Fully Homomorphic Encryption, enforce on-chain risk guardrails, make machine-to-machine payments via the x402 protocol, and transact privately through a MiMC-5 Merkle-based privacy pool. Built for African users and emerging markets — mobile-first, low-fee, and privacy-native.

At the core is a single shared yield engine (`vault`) with on-chain guardrails. Three independent products draw on that same engine: **individual deposits** (any user, direct yield), the **strategy marketplace** (third-party strategies executing against vault capital), and **stokvel** (group savings with M-of-N payout approval). Stokvel is one consumer of the vault, not the platform itself.

See [ROADMAP.md](ROADMAP.md) for what's built today versus what's next (security audit, mainnet, agent pilots, sustainability).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              VeilVault                                  │
│                                                                          │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐  ┌────────────┐ │
│  │  Frontend   │   │   Backend    │   │     SDK      │  │   Prover   │ │
│  │  (React /   │──▶│  (Node.js /  │──▶│ (TypeScript) │  │   (Rust /  │ │
│  │   Vite)     │   │  Express)    │   │              │  │  Groth16)  │ │
│  └─────────────┘   └──────┬───────┘   └──────────────┘  └────────────┘ │
│                            │                                             │
│                    ┌───────▼──────────────────────────────────┐         │
│                    │  Soroban Contracts (Rust / WASM)          │         │
│                    │  vault · privacy-pool · zk-attestation    │         │
│                    │  agent-registry · stokvel · marketplace   │         │
│                    └──────────────────────────────────────────┘         │
│                            │                                             │
│                    ┌───────▼──────────────────────────────────┐         │
│                    │  Integrations                             │         │
│                    │  Stellar RPC · Ika dWallet · TFHE FHE    │         │
│                    └──────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘

Stellar Testnet
  ├── vault                  Shared yield engine — ERC4626-style shares, guardrails, agent management
  │     ├── strategy-marketplace   On-chain strategy listings + fee routing, executes against vault capital
  │     └── stokvel-vault          Group savings (rotating payout) — one consumer of the vault, via set_yield_vault
  ├── x402-verifier          Payment attestation + replay protection
  ├── dwallet-verifier       Ika dWallet ed25519 signature verification
  ├── agent-registry         KYA reputation system (levels 0–3), M-of-N admin multisig
  ├── zk-attestation         Groth16 / BLS12-381 proof verification
  └── privacy-pool           MiMC-5 Merkle mixer (shielded deposits/withdrawals)
```

---

## Deployed Contracts — Stellar Testnet

| Contract | Address |
|---|---|
| Vault | `CA5UAF7NF2GJMAJPPZMUYSQIDSAR7V53CYGNHULQS3UCHWKD5LW7KXQW` |
| x402 Verifier | `CATRAJKXFDKULWQ2V47LFOBEQFXUPKAF7S73UNMZ4H2YTLIZEKEIBK5N` |
| dWallet Verifier | `CDO5BCWNNRK3BOKKLEUKSK4B4PA656725UFNCBA5SJCXO75GNFPIZQGG` |
| Agent Registry | `CA2WDT4KGPFVZV4J67SJIHBABFLTFS6PB7OHK4ITL77AXMZQFJAHKLYR` |
| Strategy Marketplace | `CB25FJV362DOLINALRMLOQMJEMDV3UF4D3ZIVTBUBKEQWZWWZONDAKPW` |
| Stokvel Vault | `CAFXKDFFS2LFGG2V3EMYOMXPOB5HZWF367CY42Z4WWKA2ZQPKM7TPODM` |
| ZK Attestation | `CBLYCZWDBYB6JQ4BAZSPUTCR77423VXE4QZOI5ZVZO6XQQ5YEVNPOR7A` |
| Privacy Pool (10 XLM) | `CAE3XBP6E5DFLAEZXJNYQ2HMJWKRIXP44U2EE6E5VRGLLGCLS4PO24ZI` |

Asset: Native XLM — SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`
Withdraw circuit ID: `0101010101010101010101010101010101010101010101010101010101010101`

---

## Core Components

### 1. Frontend (`/frontend`)

React + Vite + TypeScript single-page application. Mobile-first design, Material Design 3 colour system, pure CSS-in-JS (no Tailwind or component library).

**Pages:**

| Page | Description |
|---|---|
| Landing | Marketing page with "Launch App" CTA |
| Onboarding | 5-step wizard: identity → vault → deposit → agent/stokvel → done |
| Portfolio | Live vault TVL, net worth, yield chart, active positions |
| Vaults | Browse and filter yield vaults; vault detail with deposit/withdraw |
| Stokvel | Group savings — create pool, contribute, vote on proposals |
| Identity | ZK identity profile, credential issuance, selective-disclosure proof generator |
| Privacy Pool | Shield / unshield 10 XLM; note management; withdrawal proof guide |
| Payments | Send/receive XLM or USDC; 6 African remittance corridors; recurring payments |
| Assets | Tokenized RWA — invoices, carbon credits, commodities; corridor rates; AI optimizer |
| Analytics | Private performance dashboard — portfolio chart, yield bars, allocation donut, privacy gauge |
| Strategy | AI agent strategy configuration with risk presets |
| Security | On-chain guardrail overview, MPC wallet status |
| Settings | Network, display preferences |

**Wallet session:** connect with Freighter/Lobstr or a raw Stellar secret key (held in memory only — never stored). Either path runs a [SEP-10](https://stellar.org/protocol/sep-10) challenge/response in the background to obtain a session token — see [Authentication](#authentication). A "Connect Wallet" pill lives in the top-right of every dashboard page.

**Run:**
```bash
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

Backend proxy: `/api/*` requests are forwarded to `http://localhost:3000`.

---

### 2. Backend Service (`/backend`)

Express.js/TypeScript server. All endpoints under `/api/*` require `Authorization: Bearer <token>` except `/health` and `/api/auth/*`. The token is either a SEP-10 session JWT or the static dev API key — see [Authentication](#authentication).

**Default dev key:** `veilpool-dev-key` (set `API_KEY_HASH` in `.env` to change)

**Services:**
- Stellar RPC client, Ika dWallet API, TFHE FHE key management
- Vault monitoring (periodic health snapshots, anomaly detection)
- Agent registry, strategy marketplace, stokvel, ZK attestation services
- Multi-agent orchestration engine
- RWA optimizer — invoice, carbon credit, remittance corridors
- Privacy pool — deposit/withdraw, Merkle path computation, nullifier tracking

**Run:**
```bash
cd backend && npm install && npm run dev
# → http://localhost:3000
```

---

### 3. Groth16 Prover (`/prover`)

Rust CLI that generates Groth16 withdrawal proofs for the privacy pool over BLS12-381. Requires a one-time trusted setup.

**Withdrawal flow:**

```bash
# 1. Trusted setup (one-time — generates pk.bin and vk.bin)
cd prover && cargo run --release -- setup --output-dir prover-keys

# 2. Register verifying key on the zk-attestation contract
cargo run --release -- format-vk \
  --vk prover-keys/vk.bin \
  --circuit-id 0101010101010101010101010101010101010101010101010101010101010101 \
  --circuit-name veilpool_withdraw_v1 > vk.json
# Then call register_circuit on ZK_VERIFIER_CONTRACT_ID with the vk.json values.

# 3. Compute a commitment before depositing
cargo run --release -- commitment \
  --secret <32-byte-hex> --nullifier <32-byte-hex>

# 4. After depositing, fetch the Merkle path and generate a withdrawal proof
# (get pe.json and pi.json from GET /api/privacy-pool/merkle-path/:leafIndex)
cargo run --release -- prove \
  --secret <hex> --nullifier <hex> \
  --path-elements-file pe.json --path-indices-file pi.json \
  --root <on-chain-root-hex> \
  --recipient <32-byte-hex> \
  --denomination 10000000 \
  --circuit-id 0101010101010101010101010101010101010101010101010101010101010101 \
  --pk prover-keys/pk.bin \
  --output proof.json

# 5. Submit proof to zk-attestation, then withdraw
# POST /api/attestations/attest  →  returns attestation_id
# POST /api/privacy-pool/withdraw  →  funds released
```

**Important — VK encoding:** `format-vk` automatically negates `alpha_g1`, `gamma_g2`, and `delta_g2` to match Soroban's `pairing_check` convention. Pass the raw arkworks output; do not pre-negate manually.

---

### 4. Soroban Smart Contracts (`/contracts`)

#### `vault`
ERC4626-style vault. Tracks user shares and total assets, enforces on-chain guardrails, and mediates agent positions.

**Guardrails** (enforced on-chain, cannot be bypassed):
- `max_drawdown_bps` — max single-tx loss as % of vault
- `daily_spending_cap` — max cumulative daily agent outflow
- `time_lock_seconds` — min delay between deposit and withdrawal
- `whitelisted_protocols` — approved DeFi protocol addresses
- `max_position_size_bps` — max single position size
- `emergency_stop` — global circuit breaker

#### `agent-registry` (KYA — Know Your Agent)
On-chain reputation system with four levels (0 = unregistered, 1 = basic, 2 = verified, 3 = elite). Agents register profiles with a DID and verifiable credential hash, accumulate reputation via `record_success` / `record_failure`, and can attach selective-disclosure ZK attribute proofs.

Punitive/identity actions against a specific agent — `ban`, `unban`, `slash`, `accept_vc` — require **M-of-N admin multisig** approval via `propose_admin_action` → `approve_admin_action` → `execute_admin_action`. No single admin key can unilaterally ban or slash an agent (verified live on testnet — see [docs/security.md](docs/security.md)).

#### `strategy-marketplace`
Lists yield strategies on-chain with fee routing. Strategy providers earn `provider_fee_bps`; the platform earns `platform_fee_bps`.

#### `stokvel-vault`
Community savings pool modelled on traditional African stokvels. Members contribute equal periodic amounts; payouts require multi-sig approval (configurable threshold). No single member can access funds without group consensus.

#### `zk-attestation`
Registers Groth16 verifying keys (BLS12-381) and verifies proofs on-chain using Soroban's native BLS12-381 host functions. Used for privacy pool withdrawals and KYA attribute proofs.

#### `privacy-pool`
Fixed-denomination shielded mixer (10 XLM per note). Deposits insert a SHA-256 commitment into a depth-20 MiMC-5 Merkle tree. Withdrawals consume a nullifier and require a Groth16 ZK proof. The tree uses pure BLS12-381 Fr arithmetic (no intermediate byte[0] zeroing) — compatible with the Rust circuit without trusted-setup regeneration.

#### `x402-verifier` / `dwallet-verifier`
Payment attestation and Ika dWallet signature verification contracts.

#### `smart-wallet`
Soroban custom account (`CustomAccountInterface`) for passkey-based account abstraction. Binds a deployed instance to one or more passkey secp256r1 public keys (a "signer" list, not just one); `__check_auth` verifies WebAuthn assertions natively on-chain instead of a classic Ed25519 signature, against whichever registered signer the assertion claims. `add_signer` / `remove_signer` let a user register a backup passkey — recovery if one device is lost — and require the wallet's own auth (an existing signer's WebAuthn assertion), so only someone who already controls the wallet can add or remove a key. See [Authentication](#authentication).

#### `passkey-registry`
Durable on-chain index from a hashed WebAuthn credential ID to the `smart-wallet` instance (and verification material) it belongs to. Exists so the backend doesn't need to remember that mapping in memory — a backend restart no longer strands existing passkey wallets. It's a lookup only, not an authority: a wrong or malicious entry can only point sign-in at the wrong wallet, since actual signing authority lives entirely in that wallet's own registered signers.

---

### 5. TypeScript SDK (`/sdk`)

```typescript
import {
  VaultClient, StrategyClient, AgentHelper,
  AgentRegistryClient, MarketplaceClient, StokvelClient,
  AttestationClient, MultiAgentClient, PrivacyPoolClient, RWAClient,
} from '@veilVault1/sdk';

const config = { apiUrl: 'http://localhost:3000', apiKey: 'veilpool-dev-key', network: 'testnet' };

// Deposit into the vault
const vault = new VaultClient(config);
const { sharesReceived } = await vault.deposit(myPublicKey, 100_000_000n, mySecretKey);

// Shield 10 XLM into the privacy pool
const pool = new PrivacyPoolClient(config);
const { commitment, nullifier, leafIndex } = await pool.deposit(mySecretKey, commitmentHex);

// Contribute to a stokvel
const stokvel = new StokvelClient(config);
await stokvel.contribute({ member: myPublicKey, memberSecret: mySecretKey });
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 20
- Rust + `wasm32-unknown-unknown` target (for contracts / prover)
- [Stellar CLI v26+](https://developers.stellar.org/docs/tools/cli)

### Run locally (existing testnet deployment)

```bash
# 1. Clone and configure
git clone https://github.com/your-org/VeilVault1.git
cd VeilVault1
cp .env.example .env          # contracts are already deployed — see addresses above

# 2. Start the backend
cd backend && npm install && npm run dev    # :3000

# 3. Start the frontend (new terminal)
cd frontend && npm install && npm run dev   # :5173

# 4. Open http://localhost:5173
#    Click "Launch App" → complete 5-step onboarding
#    Click "Connect Wallet" and enter your Stellar secret key (S...)
```

### Deploy contracts to a fresh testnet

```bash
bash scripts/deploy-testnet.sh
# Contract IDs are written back to .env automatically
```

---

## Authentication

VeilVault1 uses [SEP-10 Stellar Web Authentication](https://stellar.org/protocol/sep-10) for wallet-based sessions, alongside a static API key for quick local testing.

1. `GET /api/auth?account=G...` → returns a SEP-10 challenge transaction (`{ transaction, network_passphrase }`)
2. Client signs it with their Stellar keypair — secret key or Freighter/Lobstr — **without** submitting it to the network
3. `POST /api/auth { transaction: <signed envelope xdr> }` → returns `{ token }`, a session JWT
4. Pass `Authorization: Bearer <token>` on subsequent requests

Because the request/response shapes follow the SEP-10 spec, any standard Stellar wallet can authenticate against this backend, not just the VeilVault1 frontend — `frontend/public/.well-known/stellar.toml` advertises the `WEB_AUTH_ENDPOINT` and signing key. `GET /api/auth/me` returns the authenticated address; `POST /api/auth/logout` is a no-op since JWTs are stateless (the client just discards the token).

For local development, the static key below works on every endpoint without running the SEP-10 flow.

VeilVault1 deliberately has **two separate identity models**, one per audience, not one unfinished story:

- **Human end-users** authenticate with a Stellar keypair (secret key / Freighter / Lobstr) via SEP-10 above, or with a **passkey** (see below) — no seed phrase, biometric-backed, with on-chain recovery. This is the frontend's onboarding path.
- **AI agents** operating through the SDK (`/sdk`, see [TypeScript SDK](#5-typescript-sdk-sdk)) hold a classic Stellar keypair directly — appropriate for a non-interactive, headless process that can't tap a fingerprint sensor — and can additionally use **Ika dWallet** (MPC, see `dwallet-verifier`) for cross-chain signing needs. Passkey wallets are not yet wired into the agent SDK, and don't need to be: an autonomous agent has no biometric device to authorize a WebAuthn ceremony with.

### Account abstraction (passkey sign-in)

As an alternative to a Stellar keypair, users can sign in with a device passkey (Face ID, fingerprint, Windows Hello) — no secret key, no browser extension. Registering a passkey deploys a `smart-wallet` Soroban contract instance bound to the passkey's secp256r1 public key; that contract's address **is** the wallet address. The contract implements Soroban's native `CustomAccountInterface`, so `__check_auth` verifies a WebAuthn assertion (`authenticatorData` + `clientDataJSON` + signature) directly on-chain instead of an Ed25519 signature — see [contracts/smart-wallet](contracts/smart-wallet).

Want to see it run end to end against live testnet without setting up a browser/authenticator? `cd backend && npx ts-node scripts/demo-passkey-wallet.ts` starts the real backend in-process and walks through register → add a backup passkey (recovery) → remove a signer via the generic transaction endpoint — all real Soroban transactions, all through the production HTTP API.

1. `POST /api/auth/passkey/register/options { userName }` → WebAuthn registration options
2. Browser calls `navigator.credentials.create()` (via `@simplewebauthn/browser`)
3. `POST /api/auth/passkey/register/verify { sessionId, response }` → deploys + initializes the wallet contract, registers the credential in [contracts/passkey-registry](contracts/passkey-registry), returns `{ walletAddress, token }`
4. Returning users: `POST /api/auth/passkey/login/options {}` (no address needed — the browser offers every discoverable passkey for this origin) → `POST /api/auth/passkey/login/verify` → the backend resolves which wallet via passkey-registry and returns a fresh `{ token }`, no transaction involved

**Recovery (add backup passkey):** a wallet isn't limited to one passkey. `POST /api/passkey/signers/add/options` (authenticated — the wallet is read from the caller's own session, not the request body) starts registering a new backup passkey; `POST /api/passkey/signers/add/register-verify` verifies it and returns a second WebAuthn challenge — this one *is* the exact hash of the on-chain `add_signer` authorization, so signing it with an **existing** passkey on the same wallet is what authorizes adding the new one; `POST /api/passkey/signers/add/authorize` submits that on-chain and registers the new credential in passkey-registry. This is a real Soroban transaction: the backend builds the `SorobanAuthorizationEntry` manually (the SDK's own auth helpers only support classic Ed25519 accounts), DER-decodes and low-S-normalizes the browser's raw ECDSA signature (Soroban's `secp256r1_verify` rejects non-canonical signatures), and re-simulates after the signature is attached so the resource budget reflects the real cost of running `__check_auth` rather than the cheaper "recording" estimate from before a signature existed. Verified end to end against live testnet via `backend/scripts/validate-passkey-tx-auth.ts`. Adding or removing a signer requires the wallet's own on-chain auth (an existing signer's WebAuthn assertion), so only someone who already controls the wallet can do it.

**General transaction authorization:** `POST /api/passkey/tx/prepare { contractId, method, args }` (authenticated — `authAddress` is always the caller's own wallet from the session, never client-supplied) simulates *any* contract call requiring that wallet's auth and returns a WebAuthn challenge; `POST /api/passkey/tx/submit { sessionId, response }` submits it once an existing passkey signs that challenge. `args` are typed (`u32` / `u64` / `i128` / `bytes` / `address` / `string` / `symbol` / `bool` — see `backend/src/utils/scval-args.ts`), built into ScVals server-side rather than trusting client-supplied XDR. On the frontend, `WalletSession.invokeAsPasskeyWallet(contractId, method, args)` drives the whole WebAuthn ceremony. This isn't a separate mechanism from add-backup-passkey — `add_signer`'s own routes are themselves now thin wrappers around the same `startPasskeyTransaction` / `finishPasskeyTransaction` core in `passkey.service.ts`, proven generic by also driving `remove_signer` (a different method, different arg type) through it end to end against live testnet.

**Scope note:** sign-in, the on-chain multi-signer primitive, and authorizing arbitrary passkey-wallet transactions (not just `add_signer`) are all implemented, tested, and validated against live testnet. `WalletSession.signTransaction` (the classic pre-built-XDR signing path used by secret-key/Freighter wallets) still throws for `walletType === "passkey"` — that's intentional, not a gap: passkey wallets have no Ed25519 keypair, so there's no equivalent of "sign this XDR and hand back a signed XDR." Other app flows (privacy-pool deposits, stokvel votes, etc.) that currently build a classic transaction and call `signTransaction` would need a passkey-specific branch calling `invokeAsPasskeyWallet` instead to support passkey wallets — that integration work, not the underlying authorization mechanism, is what's left.

## API Reference

All requests require: `Authorization: Bearer veilpool-dev-key` (or a SEP-10 session token — see [Authentication](#authentication))

### Vault
| Method | Path | Body / Params | Description |
|---|---|---|---|
| `GET` | `/api/vault/info` | — | Total assets, shares, share price |
| `GET` | `/api/vault/balance/:address` | — | User share balance |
| `POST` | `/api/vault/deposit` | `{ fromPublicKey, amount, signerSecretKey }` | Deposit XLM, receive shares |
| `POST` | `/api/vault/withdraw` | `{ fromPublicKey, shares, signerSecretKey }` | Burn shares, receive XLM |
| `GET` | `/api/vault/metrics` | — | Monitoring snapshots |

### Agent Registry (KYA)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/registry/register` | Register agent profile + DID |
| `GET` | `/api/registry/:address` | Profile + reputation level |
| `GET` | `/api/registry/:address/level?min=N` | Check minimum level |
| `POST` | `/api/registry/vc-update` | Submit updated verifiable credential |
| `POST` | `/api/registry/admin/propose` | `{ proposer, action, target, amount?, proposerSecret }` — propose ban/unban/slash/accept-vc (action 0–3) |
| `POST` | `/api/registry/admin/approve` | `{ approver, proposalId, approverSecret }` — approve a pending proposal |
| `POST` | `/api/registry/admin/execute` | `{ executor, proposalId, executorSecret }` — execute once threshold is met |
| `GET` | `/api/registry/admin/proposal/:id` | Proposal status, approvals, target |
| `GET` | `/api/registry/admin/config` | Admin set + multisig threshold |

### Strategies
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/strategies` | List available strategies |
| `GET` | `/api/strategies/:id` | Strategy details |
| `POST` | `/api/strategies/execute` | Open a position |
| `POST` | `/api/strategies/close` | Close a position |
| `POST` | `/api/strategies/fhe/keys` | Generate FHE key pair |

### Stokvel
| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/stokvel/config` | — | Pool configuration + stats |
| `GET` | `/api/stokvel/member/:address` | — | Member info |
| `GET` | `/api/stokvel/proposal/:id` | — | Proposal details |
| `POST` | `/api/stokvel/init` | `{ admin, name, asset, threshold, maxMembers, contributionAmount, contributionIntervalSecs, adminSecret }` | Initialise stokvel |
| `POST` | `/api/stokvel/add-member` | `{ admin, member, adminSecret }` | Add member |
| `POST` | `/api/stokvel/contribute` | `{ member, memberSecret }` | Make contribution |
| `POST` | `/api/stokvel/propose` | `{ proposer, recipient, amount, proposerSecret }` | Propose distribution |
| `POST` | `/api/stokvel/vote` | `{ voter, proposalId, approve, voterSecret }` | Vote on proposal |
| `POST` | `/api/stokvel/execute-proposal` | `{ executor, proposalId, executorSecret }` | Execute approved proposal |

### ZK Attestation
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/attestations/register-circuit` | Register Groth16 verifying key |
| `POST` | `/api/attestations/attest` | Submit proof, receive attestation ID |
| `POST` | `/api/attestations/verify` | Verify proof on-chain (read-only) |
| `GET` | `/api/attestations/:id` | Get attestation record |
| `GET` | `/api/attestations/:id/valid` | Check if attestation is valid |

### Privacy Pool
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/privacy-pool/state` | Pool state (root, denomination, deposit count) |
| `GET` | `/api/privacy-pool/tree` | Merkle tree state (next_index, depth, root) |
| `GET` | `/api/privacy-pool/root` | Current Merkle root as hex |
| `POST` | `/api/privacy-pool/commitment` | Compute commitment from secret + nullifier |
| `POST` | `/api/privacy-pool/deposit` | `{ depositorSecret, commitment }` — deposit on-chain |
| `GET` | `/api/privacy-pool/merkle-path/:leafIndex` | Merkle sibling path for generating ZK proof |
| `POST` | `/api/privacy-pool/withdraw` | `{ recipientSecret, root, nullifierHash, attestationId }` |
| `GET` | `/api/privacy-pool/nullifier/:hash` | Check if nullifier is spent |

### Payments (x402)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/verify` | Verify Stellar payment, attest on-chain |
| `GET` | `/api/payments/status/:paymentId` | Payment status |
| `POST` | `/api/payments/request` | Generate payment request |

### RWA Optimizer
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/rwa/assets` | List tokenised RWA assets |
| `GET` | `/api/rwa/assets/:id` | Asset details |
| `POST` | `/api/rwa/assets` | Register new RWA asset |
| `GET` | `/api/rwa/routes` | Active remittance corridors |
| `POST` | `/api/rwa/optimize` | AI allocation recommendations |

---

## Key Protocols

### Privacy Pool (MiMC-5 Mixer)
Fixed denomination (10 XLM) shielded transfers. The Merkle tree uses **MiMC-5 Feistel** over BLS12-381 Fr — same field as Groth16 — giving ~6,600 R1CS constraints per withdrawal proof vs ~27,000 for SHA-256.

Round constants are derived as: `c[0] = SHA-256(seed) with byte[0]=0`, then `c[i] = SHA-256(c[i-1]) with byte[0]=0`. Leaves have their MSB zeroed once on insertion; all subsequent arithmetic is pure Fr.

Withdrawal: generate proof with the Rust prover → submit to `zk-attestation.attest_performance` → call `privacy_pool.withdraw(attestation_id)`.

### x402 Payment Protocol
1. Agent A requests a resource → receives `402 Payment Required`
2. Agent A makes a Stellar payment to the service address
3. `POST /api/payments/verify` verifies on Horizon and attests on-chain
4. Agent A passes `X-Payment-Id: <txHash>` in subsequent requests
5. Middleware verifies the attestation on the `x402-verifier` contract

### FHE (Fully Homomorphic Encryption)
Strategy parameters are encrypted with [TFHE-rs](https://github.com/zama-ai/tfhe-rs) before being stored on-chain. The AI agent executes the strategy against the ciphertext; only the key-holder can decrypt the P&L report.

### KYA (Know Your Agent)
Reputation levels computed from on-chain position PnL:
- Level 0 — unregistered
- Level 1 (score ≥ 200) — basic, authorized for standard positions
- Level 2 (score ≥ 500) — verified, larger allocations
- Level 3 (score ≥ 800) — elite, high-trust vaults

Agents attach ZK attribute proofs (age, jurisdiction, sanctions status) via `zk-attestation` without revealing underlying data.

### Stokvel (Group Savings)
Smart-contract stokvel: funds held in the `stokvel-vault` contract, not by any individual. Payouts require M-of-N member approval. Idle funds earn yield via the connected vault. Members contribute via `POST /api/stokvel/contribute`; a distribution requires a proposal + voting round.

---

## Security

1. **Never commit `.env`** — contains admin and oracle secret keys
2. **FHE private keys** (`fhe-keys/*.priv`) are mode 0600 — never expose them
3. **Frontend secret key** — held in memory only during the browser session; cleared on tab close or "Disconnect"
4. **Vault admin secret key** — controls vault contract management (guardrails, agent allowlist); use a hardware wallet for mainnet
5. **Agent-registry admin actions** (ban/unban/slash/accept-vc) require M-of-N admin multisig — no single admin key can act alone; see `docs/security.md` and `docs/compliance.md`
6. **Guardrails** are enforced entirely on-chain; AI agents cannot bypass them
7. **Emergency stop** halts all vault agent operations with a single admin transaction
8. **Deposit notes** (privacy pool) — never stored on any server; losing them locks funds permanently
9. **Session tokens** (SEP-10 JWTs) expire after 24h and are verified with `JWT_SECRET` — rotate it to invalidate all sessions

---

## Development

```bash
# Contract tests (all contracts)
cd contracts && cargo test

# Build a specific contract WASM
cd contracts && cargo build --release --target wasm32-unknown-unknown -p privacy-pool

# Backend dev server with hot-reload
cd backend && npm run dev

# Backend type check
cd backend && npm run typecheck

# Frontend dev server
cd frontend && npm run dev

# Frontend type check
cd frontend && npm run build   # also runs tsc

# SDK build
cd sdk && npm run build

# Prover — trusted setup (one-time, ~2 min)
cd prover && cargo run --release -- setup --output-dir prover-keys

# Prover — generate withdrawal proof
cd prover && cargo run --release -- prove \
  --secret <hex> --nullifier <hex> \
  --path-elements-file pe.json --path-indices-file pi.json \
  --root <hex> --recipient <hex> --denomination 10000000 \
  --circuit-id 0101010101010101010101010101010101010101010101010101010101010101 \
  --pk prover-keys/pk.bin --output proof.json

# Docker (backend only)
docker compose up -d
```

---

## License

MIT — see [LICENSE](LICENSE)
