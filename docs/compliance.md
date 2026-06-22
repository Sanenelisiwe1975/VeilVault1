# Compliance Posture

This document describes VeilVault1's current technical design choices that
bear on regulatory questions, and what is deliberately out of scope today.
**It is not legal advice.** Real legal counsel, licensed per-jurisdiction, is
required before any mainnet launch that touches real user funds.

## Summary

VeilVault1 is designed to be **non-custodial by default**: at every layer,
funds are held by a Soroban smart contract governed by transparent,
on-chain logic — never by a company-controlled wallet or off-chain ledger.
The platform itself never takes possession of fiat currency. Where the
product does involve pooled funds (stokvels) or cross-border value transfer
(remittances), the design is structured to minimize — though not eliminate —
the activities that typically trigger money-transmitter and custodial
regulation.

## Privacy Pool

- Deposits are locked in the `privacy-pool` contract under a commitment the
  depositor alone knows the preimage of. No admin, operator, or VeilVault1
  entity can move a depositor's funds — withdrawal requires a valid Groth16
  proof of the original deposit.
- The platform does not see, store, or have access to the link between a
  deposit and its later withdrawal. There is nothing to subpoena from
  VeilVault1's infrastructure that would deanonymize a user; the privacy
  guarantee is cryptographic, not contractual.
- Selective-disclosure ZK identity (`docs/zk-attestations.md`) is available
  as **opt-in** tooling so a user can prove a predicate (age, jurisdiction,
  non-sanctioned status) to a partner anchor or regulator without revealing
  underlying data — this exists to make the pool *compatible* with
  compliance requirements a partner may have, not to impose them unilaterally.

## Stokvel (Pooled Group Savings)

- Member contributions are held by the `stokvel-vault` contract, not by
  VeilVault1 or any single group administrator. Fund movement requires
  M-of-N member approval via the on-chain proposal flow
  (`propose` → `approve` → `execute_proposal`) — see `docs/emerging-markets.md`.
  No committee member can disappear with the pool, which is the core failure
  mode of informal off-chain stokvels that this product replaces.
- VeilVault1 does not act as trustee, fund manager, or custodian of stokvel
  assets — the smart contract is the custodian, and its logic is public and
  auditable. This is the central fact that should inform any jurisdiction's
  classification of the product (e.g., distinguishing it from a collective
  investment scheme or deposit-taking institution).
- Each stokvel groups's threshold, membership, and contribution terms are
  configured by the group itself at creation — VeilVault1 does not set or
  approve group terms.

## Payments & Remittances

- Cross-border transfers settle as native Stellar payments or path payments
  between Stellar accounts. VeilVault1's backend constructs and relays
  transactions but never holds the transferred funds — value moves directly
  between the sender's and recipient's Stellar accounts.
- Fiat on/off-ramp (converting local currency to/from a Stellar asset) is
  intentionally **not** built into VeilVault1's own infrastructure. That
  function belongs to regulated anchors (e.g., MoneyGram Access, Yellow Card)
  who already hold the relevant money-transmitter licenses in each corridor's
  jurisdiction. Migrating the current ad-hoc remittance flow to SEP-24/SEP-6
  (see the SEP-10 adoption already in `backend/src/api/routes/auth.routes.ts`)
  is the planned path to formalize this boundary — VeilVault1 orchestrates,
  licensed anchors custody and convert fiat.

## Know Your Agent (KYA) / Identity

- The agent-registry's reputation and VC system is a **reputation and
  attribute-proof layer**, not a KYC system VeilVault1 operates. It does not
  collect or store personal documents; it stores a hash and a URI pointing
  to a verifiable credential issued by a third party, plus on-chain behavior
  metrics (PnL, execution count).
- Where a partner anchor or jurisdiction requires KYC/AML for a specific
  flow, the selective-disclosure attribute system is built to let a user
  satisfy that requirement (e.g., "claim_attribute: not_sanctioned") without
  VeilVault1 itself becoming the KYC provider or data controller.

## Admin Key / Operational Risk

- Punitive actions against a specific agent (`ban`, `unban`, `slash`,
  `accept_vc`) require `admin_threshold` distinct admin approvals, not a
  single key — see `docs/security.md`. This reduces the operational/key-custody
  risk that a single compromised operator key could be used to censor or
  punish a user unilaterally.
- The current testnet deployment is intentionally configured with a small
  N (e.g., 2-of-3) for demo purposes. A mainnet deployment should use a
  larger N with admin keys held by independent parties (e.g., a recognized
  multisig custody provider, or governance token holders), per
  `ALLOW_SOLO_ADMIN` guard in `scripts/deploy-mainnet.sh`.

## What VeilVault1 Is Not

- Not a bank or deposit-taking institution — no fractional reserve, no
  off-chain ledger of user balances.
- Not a money services business / VASP with custody of fiat — fiat
  conversion is deferred to licensed third-party anchors.
- Not the KYC/AML provider for any flow — credential issuance and identity
  verification are performed by third parties; VeilVault1 stores only
  hashes/attestation references.
- Not the fund manager or trustee for any stokvel — the smart contract is
  the custodian; VeilVault1 operates the interface and infrastructure.

## Before Mainnet / Before Handling Real User Funds

- [ ] Jurisdiction-specific legal review for each target market (South Africa,
      Nigeria, Kenya, Ghana — see `docs/emerging-markets.md`) covering
      collective-investment-scheme and money-transmission classification
- [ ] Formal terms of service clarifying non-custodial status and risk disclosure
- [ ] SEP-24/SEP-6 anchor integration to move remittance fiat conversion to
      licensed third parties (currently raw Stellar payments only)
- [ ] Mainnet admin multisig with independently-held keys (see `docs/security.md`
      audit checklist)
- [ ] Privacy pool sanctions/AML screening posture decision — e.g., whether to
      require a non-sanctioned attribute proof before large withdrawals
