# Agent-Native Architecture

VeilVault1 is designed from the ground up for AI agents, not human wallets.

## Know Your Agent (KYA)

Every agent that interacts with the vault must first be registered in the **Agent Registry** contract (`contracts/agent-registry`). This is the on-chain equivalent of KYC — but for autonomous software.

### Identity: W3C Decentralised Identifiers (DIDs)

Each agent has a DID of the form `did:stellar:G<address>`. The DID is linked to a **W3C Verifiable Credential (VC)** — a signed JSON-LD document stored on IPFS or Arweave. Only the SHA-256 hash of the VC is stored on-chain.

```
Register agent  →  agent-registry::register(agent, did, vc_hash, vc_uri)
Submit VC       →  agent-registry::submit_vc_update(agent, vc_hash, vc_uri)
Admin accepts   →  agent-registry::accept_vc(agent)          (+500 reputation)
```

### Reputation Scoring

Reputation is measured in basis points (0–10 000).

| Level     | Score range | Threshold to enter |
|-----------|-------------|-------------------|
| Unverified| 0–999       | default            |
| Verified  | 1000–3999   | accepted VC        |
| Trusted   | 4000–7999   | track record       |
| Elite     | 8000–10000  | sustained top perf |

**Score changes:**
- VC accepted: +500
- Per 1% return on position close: +10 (capped at +200 per close)
- 5-win streak bonus: +50
- Failed position: −200
- Admin slash: −N (max 2000 per slash)

### Vault Integration

The vault checks reputation on `add_agent` when `min_agent_level > 0`:

```rust
vault::set_agent_registry(registry_address)
vault::set_min_agent_level(2)   // require Trusted
vault::add_agent(agent_address) // only succeeds if agent is Trusted or Elite
```

After every `close_position`, the vault automatically calls `record_success` or `record_failure` on the registry.

---

## Multi-Agent Coordination

Agents can delegate sub-tasks to each other using `vault::delegate_operation`. Both the orchestrator and delegate must be authorized in the vault.

### Workflow pattern

```typescript
const workflow = multiAgentService.createWorkflow({
  vaultAddress: VAULT_ID,
  orchestratorAddress: ORCH_ADDR,
  agents: [
    { address: ANALYST_ADDR, role: AgentRole.Analyst, weight: 1 },
    { address: RISK_ADDR,    role: AgentRole.RiskManager, weight: 2 },
    { address: EXEC_ADDR,    role: AgentRole.Executor, weight: 1 },
  ],
  consensusThreshold: 75,  // 75% weighted approval required
});

// Orchestrator proposes an action
const { approved } = await multiAgentService.runConsensus(
  workflow.workflowId,
  { action: 'open_position', protocol: LENDING_ADDR, amount: '1000000' },
  agentVotes
);

if (approved) {
  // Emit on-chain delegation event
  const task = await multiAgentService.delegateOperation({
    orchestrator: ORCH_ADDR,
    delegate: EXEC_ADDR,
    payload: { action: 'open_position', ... },
    orchestratorSecret: ORCH_SECRET,
  });
}
```

### On-chain delegation event

`vault::delegate_operation` emits:
```
event: (symbol("delegate"), symbol("op"))
data:  (operation_id, orchestrator, delegate, metadata_bytes)
```

Off-chain listeners (backend `multi-agent.service.ts`) subscribe to this event and route tasks to the correct agent.
