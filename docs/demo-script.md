# VeilVault — Demo Video Script (~3 minutes)

**Before recording:**
- Open https://veil-vault1.vercel.app two minutes early (the backend needs about 50 seconds to wake up).
- Record in an **incognito window** so sign-up starts fresh.
- Have your **phone ready** — if your computer doesn't have a fingerprint reader, you'll see a QR code instead. Scan it and approve with your phone's fingerprint. This looks great on camera.
- After signing up, **wait about 15 seconds** on the setup step before depositing, so your starter funds have time to arrive.

---

## Scene 1 — The problem (0:00–0:25)
**Screen:** Landing page, slow scroll.

> "In South Africa, millions of people save through stokvels — group savings circles — and most have never touched crypto. Not because they don't want their money to grow, but because seed phrases, gas fees, and wallet addresses are terrifying.
>
> This is VeilVault: a private, easy-to-use savings app — built so that someone's grandmother can use it, without ever needing to know what a blockchain is."

## Scene 2 — Sign-up with a fingerprint (0:25–1:00)
**Screen:** Click *Launch App* → choose *Individual* → type your name → tap *Continue with fingerprint or face* → do the fingerprint / phone-QR ceremony.

> "There's no password and no seed phrase to write down. Your fingerprint becomes your key.
>
> Behind the scenes, VeilVault is setting up a secure account for you that only your fingerprint can unlock. It takes about twenty seconds, once, ever."

*(While the "Creating your account… ~30 seconds" message shows, let it breathe — this is the moment to say:)*

> "Nobody else holds a key to my money. Not even VeilVault."

## Scene 3 — Money in, plain language (1:00–1:40)
**Screen:** Vault step — pick a name, choose *Balanced*. Point at the plain-language line ("If your balance ever drops 20%, everything stops automatically"). Then the deposit step — show the Rand equivalent under the amount, deposit 10 XLM with a fingerprint tap.

> "Everything is written in plain language, and every amount shows in Rand. When I choose 'Balanced', that's not just a label — it sets a real safety limit that's locked in and can't be changed later. If my balance ever drops too far, everything stops automatically. Not even the VeilVault team can override that.
>
> Now I deposit — one fingerprint tap. This money is really moving, right now, into a shared savings pool that earns yield for everyone in it."

## Scene 4 — The dashboard (1:40–2:15)
**Screen:** Dashboard — greeting with your name, "Total savings" in Rand with the "your money is working" pill, quick actions, safety controls card, coming-soon cards.

> "My money is now working for me, and I see it the way I actually think about it — in Rand. One tap takes me to safety controls, group savings, or investment strategies.
>
> The same savings pool also powers group stokvels, where everyone's contributions keep earning right up until payout day — something traditional stokvels can't do."

**Screen:** Click *Safety* — show the Security page with the on-chain guardrails and the "Verify this contract" Stellar Expert links.

> "And you don't have to just trust us. Every safety limit is public and checkable — anyone can look it up and confirm it for themselves, right from this page."

## Scene 5 — What's under the hood + what's next (2:15–2:50)
**Screen:** Quick cut to the GitHub README — architecture diagram, deployed-contracts table, Planned Features section.

> "Under the hood, VeilVault runs on the Stellar network, using a set of independent building blocks: one that holds and grows savings, one that keeps transactions private, one that tracks trust for AI agents, and one that runs group stokvels.
>
> What's next: easy ways to add and withdraw Rand — card, bank transfer, mobile money — and a chat assistant that manages your savings for you, using the same safety rules. Both are already designed, clearly labeled 'coming soon' in the app, never faked."

## Scene 6 — Close (2:50–3:00)
**Screen:** Back to the dashboard, resting on "Total savings".

> "Grow your money. Keep it private. No passwords, no jargon — built on Stellar. This is VeilVault."

---

**Backup plan:** if the live site misbehaves during recording (slow start, network hiccup), the identical journey runs on localhost:5173 with `npm run dev` in `backend/` and `frontend/` — same accounts, same network.
