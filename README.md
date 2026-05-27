# VeilVault1

**Private and programmable yield platform for AI agents on Stellar.**

VeilVault1 enables users and autonomous AI agents to safely deploy capital across Stellar-based DeFi protocols, run confidential yield strategies using Fully Homomorphic Encryption, enforce on-chain risk guardrails, make machine-to-machine payments via the x402 protocol, and transact privately through a MiMC-5 Merkle-based privacy pool.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                           VeilVault1                                 │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐   │
│  │  TypeScript  │   │   Backend    │   │  Soroban Contracts     │   │
│  │    SDK       │──▶│   (Node.js)  │──▶│  (Rust / WASM)        │   │
│  └──────────────┘   └──────┬───────┘   └────────────────────────┘   │
│                            │                                         │
│                    ┌───────▼──────────────────────────────────┐      │
│                    │  Integrations                            │      │
│                    │  ┌──────────┐  ┌──────────┐  ┌────────┐ │      │
│                    │  │ Stellar  │  │   Ika    │  │  FHE   │ │      │
│                    │  │  Client  │  │ dWallet  │  │ (TFHE) │ │      │
│                    └──┴──────────┴──┴──────────┴──┴────────┴─┘      │
└──────────────────────────────────────────────────────────────────────┘

Stellar Testnet
  ├── vault                  ERC4626-style shares, guardrails, agent management
  ├── x402-verifier          Payment attestation + replay protection
  ├── dwallet-verifier       Ika dWallet ed25519 signature verification
  ├── agent-registry         KYA reputation system (levels 0–3)
  ├── strategy-marketplace   On-chain strategy listings + fee routing
  ├── stokvel-vault          Community savings pool (rotating payout)
  ├── zk-attestation         Groth16 / BLS12-381 credential proofs
  └── privacy-pool           MiMC-5 Merkle mixer (shielded deposits/withdrawals)
```

---

## Deployed Contracts — Stellar Testnet

| Contract | Address |
|---|---|
| Vault | `CA5UAF7NF2GJMAJPPZMUYSQIDSAR7V53CYGNHULQS3UCHWKD5LW7KXQW` |
| x402 Verifier | `CATRAJKXFDKULWQ2V47LFOBEQFXUPKAF7S73UNMZ4H2YTLIZEKEIBK5N` |
| dWallet Verifier | `CDO5BCWNNRK3BOKKLEUKSK4B4PA656725UFNCBA5SJCXO75GNFPIZQGG` |
| Agent Registry | `CBND24UI7RBAYCXLZM5RH42EVXQLBG6XR3Y4ONA673YBTQQEBPZ6S2TA` |
| Strategy Marketplace | `CB25FJV362DOLINALRMLOQMJEMDV3UF4D3ZIVTBUBKEQWZWWZONDAKPW` |
| Stokvel Vault | `CAFXKDFFS2LFGG2V3EMYOMXPOB5HZWF367CY42Z4WWKA2ZQPKM7TPODM` |
| ZK Attestation | `CBLYCZWDBYB6JQ4BAZSPUTCR77423VXE4QZOI5ZVZO6XQQ5YEVNPOR7A` |
| Privacy Pool (10 USDC) | `CABRBWIB4Z53YKUDKSG6MWJBE75XSMB2JWUDIEDXKVG2YTOVOC4TJXYA` |

Asset: USDC testnet SAC — `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`

---

## Core Components

### 1. Soroban Smart Contracts (`/contracts`)

#### `vault`
Main ERC4626-style vault. Tracks user shares and total assets, enforces on-chain guardrails, and mediates agent positions.

**Guardrails** (enforced on-chain, cannot be bypassed):
- `max_drawdown_bps` — max single-tx withdrawal as % of vault
- `daily_spending_cap` — max cumulative daily agent outflow
- `time_lock_seconds` — min delay between deposit and withdrawal
- `whitelisted_protocols` — approved DeFi protocol addresses
- `max_position_size_bps` — max single position size
- `emergency_stop` — global circuit breaker

**Agent management**: agents must be authorized by the admin and, if `min_agent_level > 0`, must hold sufficient reputation in the agent-registry. Agents open and close yield positions; PnL is recorded back to the registry on close.

**Multi-agent delegation**: `delegate_operation(orchestrator, delegate, operation_id, metadata)` lets one agent hand off a sub-task to another authorized agent, emitting an event for off-chain orchestration.

#### `agent-registry` (KYA — Know Your Agent)
On-chain reputation system with four levels (0 = unregistered, 1 = basic, 2 = verified, 3 = elite). Agents register profiles, accumulate reputation via `record_success` / `record_failure` calls from authorized vaults, and can attach selective-disclosure ZK attribute proofs (age ≥ 18, not sanctioned, jurisdiction).

#### `strategy-marketplace`
Lists yield strategies on-chain with fee routing. Strategy providers earn `provider_fee_bps`; the platform earns `platform_fee_bps`. Fee settlement happens when positions are closed.

#### `stokvel-vault`
Community savings pool modelled on traditional South African stokvels. Members contribute equal periodic amounts; each cycle one member receives the pot via a deterministic rotating selector. Admin controls membership and cycle start.

#### `zk-attestation`
Registers ZK verification circuits (Groth16 over BLS12-381) and verifies proofs on-chain. Used by the agent-registry for attribute attestations (e.g. "agent's KYC score ≥ 700" without revealing the score).

#### `privacy-pool`
Fixed-denomination shielded mixer (10 USDC per note). Deposits insert a SHA-256 commitment leaf into a depth-20 Merkle tree. Internal tree hashing uses **MiMC-5 Feistel over BLS12-381 Fr** (110 rounds, ZK-native field), yielding ~6,600 R1CS constraints for a full withdrawal proof vs ~27,000 for SHA-256 per call. Withdrawals consume a nullifier to prevent double-spends.

#### `x402-verifier` / `dwallet-verifier`
Payment attestation and dWallet signature verification contracts used by the vault and backend middleware.

---

### 2. Backend Service (`/backend`)

Express.js/TypeScript server. All endpoints require `Authorization: Bearer <api-key>` except `/health`.

**Services:**
- Stellar RPC client, Ika dWallet API, TFHE FHE key management
- Vault monitoring (periodic health snapshots, anomaly detection)
- Agent registry, strategy marketplace, stokvel, ZK attestation services
- Multi-agent orchestration engine
- RWA (Real-World Asset) optimizer — invoice, carbon credit, remittance corridors

**Run:**
```bash
cd backend && npm run dev
```

---

### 3. TypeScript SDK (`/sdk`)

```typescript
import {
  VaultClient,
  StrategyClient,
  AgentHelper,
  AgentRegistryClient,
  MarketplaceClient,
  StokvelClient,
  AttestationClient,
  MultiAgentClient,
  PrivacyPoolClient,
  RWAClient,
} from '@veilVault1/sdk';
```

---

## Quick Start

### Prerequisites
- Rust + `wasm32-unknown-unknown` target
- Node.js ≥ 20
- [Stellar CLI v26+](https://developers.stellar.org/docs/tools/cli)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/VeilVault1.git
cd VeilVault1
cp .env.example .env          # fill in ADMIN_SECRET_KEY, etc.
```

### 2. Deploy to Testnet

```bash
bash scripts/deploy-testnet.sh
# Contract IDs written to .env automatically
```

### 3. Start the Backend

```bash
cd backend && npm install && npm run dev
```

### 4. Use the SDK

```typescript
import { VaultClient, StrategyClient, AgentHelper, StrategyType } from '@veilVault1/sdk';

const config = {
  apiUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
  network: 'testnet' as const,
};

// Deposit
const vault = new VaultClient(config);
const { sharesReceived } = await vault.deposit(myPublicKey, 100_000_000n, mySecretKey);

// Execute a strategy
const strategies = new StrategyClient(config);
const fheKeys = await strategies.generateFHEKeys();
const position = await strategies.execute({
  strategyId: 'stellar-usdc-lending',
  vaultContractId: process.env.VAULT_CONTRACT_ID!,
  amount: 50_000_000n,
  agentAddress: agentPublicKey,
  agentSecretKey,
  options: { encryptParams: true, strategyParams: { targetAllocation: 5000, keyId: fheKeys.keyId } },
});

// x402 payment verification
const agent = new AgentHelper(config);
const proof = await agent.verifyPayment({ txHash, expectedTo, expectedAmount, expectedAsset });

// Privacy Pool — shielded deposit
const pool = new PrivacyPoolClient(config);
const { commitment, nullifier } = await pool.deposit(myPublicKey, mySecretKey);

// Privacy Pool — shielded withdrawal (requires ZK proof)
await pool.withdraw({ nullifier, root: currentRoot, proof: groth16Proof, recipient });
```

---

## API Reference

### Vault
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vault/info` | Vault state, share price |
| `GET` | `/api/vault/balance/:address` | Share balance |
| `POST` | `/api/vault/deposit` | Deposit assets, receive shares |
| `POST` | `/api/vault/withdraw` | Burn shares, receive assets |
| `POST` | `/api/vault/agents` | Authorize agent (admin) |
| `DELETE` | `/api/vault/agents/:address` | Remove agent (admin) |
| `POST` | `/api/vault/emergency-stop` | Emergency stop (admin) |
| `GET` | `/api/vault/metrics` | Monitoring snapshots |

### Strategies
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/strategies` | List strategies |
| `GET` | `/api/strategies/:id` | Strategy details |
| `POST` | `/api/strategies/execute` | Open position |
| `POST` | `/api/strategies/close` | Close position |
| `POST` | `/api/strategies/fhe/keys` | Generate FHE key pair |

### Payments (x402)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/verify` | Verify Stellar payment, attest on-chain |
| `GET` | `/api/payments/status/:paymentId` | Payment status |
| `POST` | `/api/payments/request` | Generate payment request |

### Agents / dWallets
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/agents/dwallet` | Create dWallet |
| `GET` | `/api/agents/dwallet` | List dWallets |
| `GET` | `/api/agents/dwallet/:id` | dWallet info |
| `POST` | `/api/agents/dwallet/sign` | Sign with dWallet |
| `DELETE` | `/api/agents/dwallet/:id` | Revoke dWallet |

### Agent Registry (KYA)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/agent-registry/register` | Register agent profile |
| `GET` | `/api/agent-registry/:address` | Get profile + reputation level |
| `GET` | `/api/agent-registry` | List agents |
| `POST` | `/api/agent-registry/:address/suspend` | Suspend agent (admin) |

### Strategy Marketplace
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/marketplace/strategies` | List marketplace strategies |
| `GET` | `/api/marketplace/strategies/:id` | Strategy details + stats |
| `POST` | `/api/marketplace/strategies` | List new strategy |
| `POST` | `/api/marketplace/strategies/:id/execute` | Execute marketplace strategy |

### Stokvel
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/stokvel/create` | Create stokvel group |
| `GET` | `/api/stokvel/:id` | Group state |
| `POST` | `/api/stokvel/:id/contribute` | Make contribution |
| `POST` | `/api/stokvel/:id/payout` | Trigger cycle payout |

### ZK Attestation
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/attestation/register-circuit` | Register verification circuit |
| `POST` | `/api/attestation/verify` | Verify Groth16 proof on-chain |
| `GET` | `/api/attestation/circuits` | List registered circuits |

### Multi-Agent Orchestration
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/multi-agent/delegate` | Delegate operation to sub-agent |
| `POST` | `/api/multi-agent/coordinate` | Coordinate multi-agent strategy |
| `GET` | `/api/multi-agent/operations` | Active delegated operations |

### Privacy Pool
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/privacy-pool/state` | Pool state (root, note count) |
| `POST` | `/api/privacy-pool/deposit` | Shielded deposit (generates commitment) |
| `POST` | `/api/privacy-pool/withdraw` | Shielded withdrawal (requires ZK proof) |
| `GET` | `/api/privacy-pool/nullifier/:hash` | Check if nullifier is spent |

### RWA Optimizer
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/rwa/assets` | List tokenized real-world assets |
| `GET` | `/api/rwa/assets/:id` | RWA asset details |
| `POST` | `/api/rwa/assets` | Register RWA asset |
| `GET` | `/api/rwa/routes` | Remittance corridor routes |
| `POST` | `/api/rwa/optimize` | Optimize RWA allocation |

---

## Key Protocols

### x402 Payment Protocol
1. Agent A requests premium service → receives `402 Payment Required`
2. Agent A makes Stellar payment to service wallet
3. `POST /api/payments/verify` — backend verifies on Horizon and attests on-chain
4. Agent A includes `X-Payment-Id: <txHash>` in subsequent requests
5. Middleware verifies attestation is recorded on the `x402-verifier` contract

### FHE (Fully Homomorphic Encryption)
Strategy parameters are encrypted with [TFHE-rs](https://github.com/zama-ai/tfhe-rs) before being stored in position metadata on-chain. This enables confidential strategies without preventing auditability via proofs.

### Ika dWallet Integration
[Ika dWallets](https://www.ika.xyz) are MPC wallets that never expose a private key and can sign for multiple chains. Vault agents use dWallets so no single party holds agent signing keys.

### Privacy Pool (MiMC-5 Mixer)
Fixed denomination (10 USDC) shielded transfers via Merkle commitments. The tree uses **MiMC-5 Feistel** over the BLS12-381 scalar field — the same field used by Groth16 proofs — so withdrawal ZK circuits are ~10× smaller than SHA-256-based designs.

### KYA (Know Your Agent)
Agent reputation is computed on-chain from actual position PnL. Level thresholds:
- Level 0: unregistered
- Level 1 (score ≥ 200): basic — authorized for standard positions
- Level 2 (score ≥ 500): verified — can execute larger allocations
- Level 3 (score ≥ 800): elite — whitelisted for high-trust vaults

Agents can attach ZK attribute proofs for regulatory compliance without revealing underlying data.

---

## Security

1. **Never commit `.env`** — contains secret keys
2. **FHE private keys** (`fhe-keys/*.priv`) are mode 0600 — never expose them
3. **Admin secret key** controls contract management — use a hardware wallet for mainnet
4. **Oracle secret key** attests payments — compromise allows payment fraud; rotate regularly
5. **Guardrails** are enforced entirely on-chain and cannot be bypassed by agents
6. **Emergency stop** halts all agent operations instantly via a single admin transaction
7. **Contract upgrades** are admin-gated via `upgrade(new_wasm_hash)`
8. **Agent reputation** is immutable on-chain; vault admins can set minimum reputation levels

---

## Development

```bash
# Contract tests (requires testutils feature)
cd contracts && cargo test --features testutils

# Backend dev server
cd backend && npm run dev

# Backend type check
cd backend && npm run typecheck

# SDK build
cd sdk && npm run build

# Docker
docker compose up -d
```

---

## License

MIT — see [LICENSE](LICENSE)
