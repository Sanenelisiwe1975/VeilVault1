# VeilVault Roadmap

This roadmap is written for milestone-based funding (e.g. Stellar Community
Fund tranches) — each phase is a fundable, independently verifiable unit of
work, gated on the previous phase rather than calendar dates. Timeframes are
relative to when a phase's funding starts, not fixed dates.

## Phase 0 — Core protocol (done)

Everything below is built, unit-tested, and exercised on Stellar testnet
today:

- **`vault`** — shared yield engine (ERC4626-style shares, on-chain
  guardrails) consumed by individual deposits, the strategy marketplace, and
  stokvel.
- **`privacy-pool`** — MiMC-5 Merkle mixer for shielded deposits/withdrawals,
  with a Groth16/BLS12-381 prover and on-chain verifier (`zk-attestation`).
- **`agent-registry`** — KYA (Know Your Agent) reputation levels, M-of-N
  admin multisig.
- **`strategy-marketplace`**, **`stokvel-vault`** — two independent consumers
  of the vault engine.
- **`x402-verifier`** — machine-to-machine payment attestation + replay
  protection.
- **`dwallet-verifier`** — Ika dWallet (MPC) signature verification, for
  agents that need cross-chain signing.
- **`smart-wallet`** + **`passkey-registry`** — passkey-based account
  abstraction for human end-users: no seed phrase, biometric sign-in,
  on-chain multi-signer recovery (add/remove a backup passkey), and a
  *generic* passkey-authorized-transaction mechanism (any contract call, not
  just recovery) — all validated end to end against live testnet, not just
  unit tests.
- TypeScript SDK (`/sdk`) and React frontend (`/frontend`) covering all of
  the above.

## Phase 1 — Security hardening & mainnet readiness

Gated on funding; the work itself doesn't depend on anything else being
built first.

- [ ] Third-party audit of `smart-wallet`, `passkey-registry`, and the
  backend's Soroban-authorization-entry construction
  (`StellarClient.prepareAuthorizedInvocation` /
  `submitAuthorizedInvocation`) — these now authorize real transactions and
  haven't had independent review (see `docs/security.md`'s audit checklist).
- [ ] Trusted setup ceremony for the Groth16 circuits (or migrate to a
  ceremony-free scheme — Plonk/STARK) before privacy-pool handles real value.
- [ ] Wire passkey-wallet transaction authorization into the app's existing
  deposit/withdraw/vote flows (currently only `WalletSession.signTransaction`
  is called from those flows, which doesn't support passkey wallets yet —
  the mechanism exists, the call sites don't use it).
- [ ] Pin `SMART_WALLET_WASM_HASH` to an audited upload instead of the
  backend's first-registration auto-upload path.
- [ ] Mainnet deployment runbook + rollback plan, gated on the audit above.

**Exit criteria:** audit findings resolved, mainnet contracts deployed,
`docs/security.md` checklist fully checked off.

## Phase 2 — Agent integration & ecosystem

- [ ] Real pilot: at least one autonomous agent (not a human clicking the
  frontend) running an end-to-end flow — deposit, strategy execution,
  withdrawal — through the SDK against mainnet or a long-lived testnet.
- [ ] SDK documentation site + quickstart for third-party agent developers.
- [ ] Partner integration(s) — an existing agent framework or African
  fintech/remittance partner using VeilVault as a settlement/yield layer.
- [ ] Public, recorded demo of the full human-facing flow (passkey
  register → recover → private deposit/withdraw) for non-technical
  reviewers.

**Exit criteria:** at least one third party (agent or partner) transacting
against VeilVault without VeilVault's own team operating it for them.

## Phase 3 — Sustainability

- [ ] Defined fee/revenue model (e.g. marketplace/strategy fees, vault
  performance fees) — VeilVault does not currently have a token; this phase
  decides whether one is needed or whether protocol fees alone sustain
  development.
- [ ] Governance plan for guardrail parameters and treasury, if applicable.

---

Status key: a phase starts once the previous phase's exit criteria are met
and funding for it is secured. Phase 0 is complete as of this document.
