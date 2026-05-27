# VeilVault1

**Private and programmable yield platform for AI agents on Stellar.**

VeilVault1 enables users and autonomous AI agents to safely deploy capital across Stellar-based DeFi protocols, run confidential yield strategies using Fully Homomorphic Encryption, enforce on-chain risk guardrails, and make machine-to-machine payments via the x402 protocol.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VeilVault1                               │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │  TypeScript  │   │   Backend    │   │  Soroban         │    │
│  │    SDK       │──▶│   (Node.js)  │──▶│  Contracts       │    │
│  └──────────────┘   └──────┬───────┘   │  (Rust/WASM)     │    │
│                            │           └──────────────────┘    │
│                    ┌───────▼───────┐                            │
│                    │  Integrations │                            │
│                    │  ┌──────────┐ │                            │
│                    │  │  Stellar │ │  ◀── RPC / Horizon         │
│                    │  │  Client  │ │                            │
│                    │  ├──────────┤ │                            │
│                    │  │   Ika    │ │  ◀── dWallet MPC API       │
│                    │  │ dWallet  │ │                            │
│                    │  ├──────────┤ │                            │
│                    │  │   FHE    │ │  ◀── TFHE-rs (Zama)        │
│                    │  │ (TFHE)   │ │                            │
│                    │  └──────────┘ │                            │
│                    └───────────────┘                            │
└─────────────────────────────────────────────────────────────────┘

Stellar Testnet / Mainnet
  ├── Vault Contract          (ERC4626-style shares + guardrails)
  ├── x402 Verifier Contract  (payment attestation + replay protection)
  └── dWallet Verifier Contract (ed25519 signature verification)
```

## Core Components

### 1. Soroban Smart Contracts (`/contracts`)

| Contract | Description |
|---|---|
| `vault` | Main vault — deposits, withdrawals, positions, guardrails, upgrades |
| `x402-verifier` | Records and validates Stellar payment proofs (anti-replay) |
| `dwallet-verifier` | Verifies Ika dWallet ed25519 signatures on-chain |

**Vault Guardrails** (enforced on-chain, cannot be bypassed):
- `max_drawdown_bps` — max single-tx withdrawal as % of vault
- `daily_spending_cap` — max daily agent outflow
- `time_lock_seconds` — min delay between deposit and withdrawal
- `whitelisted_protocols` — approved DeFi protocol addresses
- `max_position_size_bps` — max single position size
- `emergency_stop` — global circuit breaker

### 2. Backend Service (`/backend`)

Express.js/TypeScript server providing:
- **Vault API** — deposit, withdraw, position management
- **x402 Payment API** — verify Stellar payments and attest on-chain
- **Agent API** — dWallet creation/management, strategy execution
- **Strategy Engine** — execute and close yield strategies
- **FHE Service** — encrypt/decrypt strategy parameters with TFHE
- **Monitoring** — periodic vault health checks and anomaly detection

### 3. TypeScript SDK (`/sdk`)

```typescript
import { VaultClient, StrategyClient, AgentHelper } from '@veilVault1/sdk';
```

- `VaultClient` — deposit, withdraw, get state
- `StrategyClient` — list/execute/close strategies, generate FHE keys
- `AgentHelper` — dWallet management, x402 payments, capability manifest

---

## Quick Start

### Prerequisites
- Rust + `wasm32-unknown-unknown` target
- Node.js >= 20
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli)

### 1. Setup

```bash
git clone https://github.com/your-org/VeilVault1.git
cd VeilVault1
chmod +x scripts/*.sh
./scripts/setup.sh
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — add your Stellar admin secret key, Ika API key, etc.
```

### 3. Deploy to Testnet

```bash
./scripts/deploy-testnet.sh
# Contract IDs are written back to .env automatically
```

### 4. Start the Backend

```bash
cd backend
npm run dev
```

### 5. Use the SDK

```typescript
import { VaultClient, StrategyClient, AgentHelper, StrategyType } from '@veilVault1/sdk';

const config = {
  apiUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
  network: 'testnet' as const,
};

// Deposit
const vault = new VaultClient(config);
const deposit = await vault.deposit(
  myPublicKey,
  100_000_000n,  // 10 USDC (7 decimals)
  mySecretKey,
);
console.log('Shares received:', deposit.sharesReceived);

// Execute a strategy
const strategies = new StrategyClient(config);

// Optional: generate FHE keys to encrypt strategy params
const fheKeys = await strategies.generateFHEKeys();

const position = await strategies.execute({
  strategyId: 'stellar-usdc-lending',
  vaultContractId: process.env.VAULT_CONTRACT_ID!,
  amount: 50_000_000n,
  agentAddress: agentPublicKey,
  agentSecretKey: agentSecretKey,
  options: {
    encryptParams: true,
    strategyParams: {
      targetAllocation: 5000,   // 50% of vault
      maxSlippage: 100,         // 1% slippage
      entryPriceThreshold: 1_000_000n,
      keyId: fheKeys.keyId,
    },
  },
});

// x402 Agent-to-Agent Payment
const agent = new AgentHelper(config);

// After making a Stellar payment, verify it
const proof = await agent.verifyPayment({
  txHash: stellarTxHash,
  expectedTo: SERVICE_WALLET_ADDRESS,
  expectedAmount: 1_000_000n,    // 0.1 USDC
  expectedAsset: USDC_SAC_ADDRESS,
  expectedMemo: 'strategy-access',
});

// Use paymentId in subsequent requests
console.log('Payment verified:', proof.paymentId);

// Create dWallets
const wallet = await agent.createDWallet({
  label: 'trading-bot-01',
  stellarAddress: myPublicKey,
});

const signature = await agent.signWithDWallet(wallet.dwalletId, '0xdeadbeef');
```

---

## API Reference

### Authentication

All API endpoints (except `/health`) require a `Bearer` token:
```
Authorization: Bearer <your-api-key>
```

### Endpoints

#### Vault
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vault/info` | Vault state (total assets, shares, share price) |
| `GET` | `/api/vault/balance/:address` | Share balance for an address |
| `POST` | `/api/vault/deposit` | Deposit assets, receive shares |
| `POST` | `/api/vault/withdraw` | Burn shares, receive assets |
| `POST` | `/api/vault/agents` | Authorize an agent (admin) |
| `DELETE` | `/api/vault/agents/:address` | Remove an agent (admin) |
| `POST` | `/api/vault/emergency-stop` | Emergency stop (admin) |
| `GET` | `/api/vault/metrics` | Monitoring snapshots |

#### Strategies
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/strategies` | List available strategies |
| `GET` | `/api/strategies/:id` | Get strategy details |
| `POST` | `/api/strategies/execute` | Execute a strategy (open position) |
| `POST` | `/api/strategies/close` | Close a position |
| `POST` | `/api/strategies/fhe/keys` | Generate FHE key pair |

#### Payments (x402)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/verify` | Verify a Stellar payment and attest on-chain |
| `GET` | `/api/payments/status/:paymentId` | Check payment status |
| `POST` | `/api/payments/request` | Generate a payment request |

#### Agents / dWallets
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/agents/dwallet` | Create an Ika dWallet |
| `GET` | `/api/agents/dwallet` | List dWallets |
| `GET` | `/api/agents/dwallet/:id` | Get dWallet info |
| `POST` | `/api/agents/dwallet/sign` | Sign a message with a dWallet |
| `DELETE` | `/api/agents/dwallet/:id` | Revoke a dWallet |

---

## x402 Payment Protocol

VeilVault1 implements the [x402 HTTP 402 payment protocol](https://x402.org) for agent-to-agent micropayments on Stellar.

**Flow:**
1. Agent A requests a premium service → receives `402 Payment Required` with payment details
2. Agent A makes a Stellar payment to the service wallet
3. Agent A calls `POST /api/payments/verify` with the tx hash
4. Backend verifies on Horizon and attests on the `x402-verifier` contract
5. Agent A includes `X-Payment-Id: <txHash>` in subsequent requests
6. Middleware verifies the payment is attested on-chain

---

## FHE (Fully Homomorphic Encryption)

Strategy parameters can be encrypted with [TFHE-rs](https://github.com/zama-ai/tfhe-rs) by Zama, allowing:
- **Confidential strategies**: Other parties cannot see the trading logic
- **Auditable execution**: Proofs of correct execution without revealing params
- **On-chain storage**: Encrypted params stored in position metadata

```typescript
// Generate keys (done once per agent/strategy)
const fheKeys = await strategies.generateFHEKeys();

// Execute with encrypted params
await strategies.execute({
  strategyId: 'my-strategy',
  ...
  options: {
    encryptParams: true,
    strategyParams: {
      targetAllocation: 5000,
      maxSlippage: 50,
      entryPriceThreshold: 1_000_000n,
      keyId: fheKeys.keyId,
    },
  },
});
```

---

## Ika dWallet Integration

[Ika dWallets](https://www.ika.xyz) are MPC (multi-party computation) wallets that:
- Never expose a private key
- Can sign for multiple chains (Stellar, EVM, etc.)
- Enable programmable signing policies

```typescript
// Create a dWallet for your agent
const wallet = await agent.createDWallet({
  label: 'yield-bot-01',
  stellarAddress: myPublicKey,
});

// Sign strategy intents before execution
const signature = await agent.signWithDWallet(
  wallet.dwalletId,
  strategyIntentHex,
);
```

---

## Security Considerations

1. **Never commit `.env`** — it contains secret keys
2. **FHE private keys** (`fhe-keys/*.priv`) are stored with mode 0600 — never expose them
3. **Admin secret key** is used for contract management — use a hardware wallet for mainnet
4. **Oracle secret key** attests payments — compromise allows payment fraud; rotate regularly
5. **Guardrails** are enforced on-chain and cannot be bypassed by agents
6. **Emergency stop** can halt all agent operations instantly
7. **Contract upgradeability** is admin-gated via `upgrade(new_wasm_hash)`

---

## Deployment

### Testnet
```bash
./scripts/deploy-testnet.sh
```

### Mainnet
```bash
./scripts/deploy-mainnet.sh
# Requires typing "deploy mainnet" to confirm
```

### Docker
```bash
cp .env.example .env  # fill in values
docker compose up -d
```

---

## Development

```bash
# Run contract tests
cd contracts && cargo test --features testutils

# Run backend in dev mode
cd backend && npm run dev

# Build SDK
cd sdk && npm run build

# Type check all TypeScript
cd backend && npm run typecheck
cd sdk && npm run build
```

---

## License

MIT — see [LICENSE](LICENSE)
