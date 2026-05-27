# Emerging Markets: Stokvels & African Corridors

## Stokvels / Chamas

A **stokvel** is a traditional African rotating savings and credit association (ROSCA). Members pool contributions periodically and distribute proceeds by group vote. VeilVault1 brings stokvels on-chain with transparent governance and AI-managed yield.

### Stokvel Vault Contract

Located at `contracts/stokvel-vault`. Key parameters:

| Field                     | Description                                  |
|---------------------------|----------------------------------------------|
| `threshold`               | M — minimum approvals to execute a proposal  |
| `max_members`             | N — maximum group size                        |
| `contribution_amount`     | Fixed periodic contribution (in asset units)  |
| `contribution_interval_secs` | How often contributions are expected       |
| `yield_vault`             | Optional VeilVault address for passive yield  |

### Lifecycle

```
Admin initializes stokvel (M-of-N, contribution params)
  ↓
Admin adds members (up to max_members)
  ↓
Members contribute (tracks share_bps proportionally)
  ↓
Any member proposes a distribution
  ↓  proposer auto-approves
M members approve
  ↓
Any member executes the approved proposal → funds transferred
```

### Share Calculation

Every `contribute()` call recomputes each member's `share_bps`:
```
share_bps[member] = member.total_contributed / group.total_contributed * 10000
```

This ensures late joiners and early leavers are treated fairly. When the group distributes, each member receives `amount * share_bps / 10000`.

### Yield Amplification

The stokvel can wire itself to a VeilVault:
```
stokvel::set_yield_vault(vault_address)
```

Idle pooled funds are deposited into the vault, earning AI-managed yield on top of the base contributions. Withdrawals pull from the vault before distributing to members.

---

## Remittance Corridors

VeilVault1's `RWAOptimizerService` includes pre-seeded African remittance corridors that agents can use to optimize cross-border payments.

| Corridor | Fee (bps) | Settlement |
|----------|-----------|-----------|
| ZAR → USDC | 50 (0.5%) | ~30s on Stellar |
| NGN → USDC | 75 (0.75%) | ~30s on Stellar |
| KES → USDC | 50 (0.5%) | ~30s on Stellar |
| GHS → USDC | 60 (0.6%) | ~30s on Stellar |

All corridors use Stellar's built-in DEX path payments, enabling instant settlement at a fraction of traditional wire transfer cost (typically 3–8%).

### How an agent uses remittance

1. Agent calls `GET /api/multi-agent/…` to receive task from orchestrator
2. Orchestrator specifies source currency and target address
3. Agent queries `rwaOptimizerService.getRemittanceRoute(corridorId)`
4. Agent constructs a Stellar `pathPayment` operation via the SDK
5. Recipient receives USDC (or native currency via DEX swap) in seconds

---

## Real World Assets (RWA)

The `StrategyMarketplace` supports two RWA categories:

- **RWA (category 4)** — invoices, trade finance, commodities, carbon credits
- **Remittance (category 5)** — cross-border payment optimisation

RWA strategies registered in the marketplace earn execution fees every time an agent runs them, incentivizing developers in emerging markets to build and publish Africa-focused strategies.

### Example: Invoice Discounting

An SME in Lagos uploads a verified invoice to Arweave. A strategy developer publishes an "invoice discounting" strategy on the marketplace. A VeilVault agent:

1. Executes the strategy (pays 50 USDC fee to developer)
2. Vault provides working capital to the SME at e.g. 8% annualised
3. Invoice matures → repayment → vault earns yield → depositors share

ZK attestations (see `docs/zk-attestations.md`) prove the yield was earned without revealing the SME's identity or invoice details.
