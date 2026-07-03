# VeilVault — Demo Video Script (~3 minutes)

**Before recording:**
- Open https://veil-vault1.vercel.app two minutes early (wakes the Render backend — free tier cold-starts ~50s).
- Record in an **incognito window** so onboarding starts fresh.
- Have your **phone ready** — if your computer has no fingerprint reader, the passkey prompt shows a QR code you scan and approve with your phone's fingerprint. This actually demos well.
- After sign-up, **stay on the vault/risk step ~15 seconds** before depositing, so the starter XLM has landed.

---

## Scene 1 — The problem (0:00–0:25)
**Screen:** Landing page, slow scroll.

> "In South Africa, millions of people save through stokvels — group savings circles — and most have never touched crypto. Not because they don't want their money to grow, but because seed phrases, gas fees, and wallet addresses are terrifying.
>
> This is VeilVault: a private, programmable savings platform on Stellar, built so that someone's grandmother can use it — without knowing what a blockchain is."

## Scene 2 — Sign-up with a fingerprint (0:25–1:00)
**Screen:** Click *Launch App* → choose *Individual* → type your name → tap *Continue with fingerprint or face* → do the fingerprint / phone-QR ceremony.

> "There's no password and no seed phrase. Your fingerprint becomes your key.
>
> Behind this screen, VeilVault is deploying a real smart-wallet contract on Stellar — a custom account whose on-chain authorization is your passkey's signature. It takes about twenty seconds, once, ever."

*(While the "Creating your account… ~30 seconds" message shows, let it breathe — this is the moment to say:)*

> "No custodian holds a key for me. There is no key to hold."

## Scene 3 — Money in, plain language (1:00–1:40)
**Screen:** Vault step — pick a name, choose *Balanced*. Point at the plain-language line ("If your balance ever drops 20%, everything stops automatically"). Then the deposit step — show the Rand equivalent under the amount, deposit 10 XLM with a fingerprint tap.

> "Everything is in plain language, and everything shows in Rand. When I choose 'Balanced', that's not a marketing label — it writes real risk limits into the vault contract. If my balance ever drops past the limit, everything stops. Not even the VeilVault team can override that.
>
> Now I deposit — one fingerprint tap. This is a real transaction, settling on Stellar right now, into a shared yield vault."

## Scene 4 — The dashboard (1:40–2:15)
**Screen:** Dashboard — greeting with your name, "Total savings" in Rand with the "your money is working" pill, quick actions, safety controls card, coming-soon cards.

> "My money is now working, and I can see it the way I think about it — in Rand. One tap takes me to safety controls, group savings, or strategies.
>
> The same engine serves three products: individual savers like me, a strategy marketplace where third parties run yield strategies inside my guardrails, and stokvels — where pooled funds keep earning until payout day, a first for stokvels."

**Screen:** Click *Safety* — show the Security page with the on-chain guardrails and the "Verify this contract" Stellar Expert links.

> "And nothing here asks for trust. Every limit is enforced by the contract itself — anyone can verify it on-chain, right from this page."

## Scene 5 — What's under the hood + what's next (2:15–2:50)
**Screen:** Quick cut to the GitHub README — architecture diagram, deployed-contracts table, Planned Features section.

> "Under the hood: eight Soroban contracts live on testnet — the vault, a passkey registry, a zero-knowledge privacy pool, an agent registry with machine-to-machine x402 payments, and the stokvel engine.
>
> Next: Rand on-ramps through SEP-24 anchors — card, EFT, mobile money — and a conversational assistant that manages your savings through the same guardrails. Both are designed, honestly labeled 'coming soon' in the app, never mocked."

## Scene 6 — Close (2:50–3:00)
**Screen:** Back to the dashboard, resting on "Total savings".

> "Grow your money. Keep it private. No passwords, no jargon — powered by Stellar. This is VeilVault."

---

**Backup plan:** if the live site misbehaves during recording (cold start, testnet hiccup), the identical journey runs on localhost:5173 with `npm run dev` in `backend/` and `frontend/` — same contracts, same chain.
