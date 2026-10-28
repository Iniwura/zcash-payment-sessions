> **Historical document — not current release guidance.** This file records an earlier 2026-10-28 checkpoint, including then-open defects, branch states, and submission assumptions. Some findings have since been fixed and some statuses are obsolete. For the current project, use [README](../../README.md), [reviewer guide](../REVIEWER_GUIDE.md), [threat model](../THREAT_MODEL.md), and [funded testnet evidence](../../LIVE_TESTNET_PROOF.md). Preserve this document for auditability; do not use it as a release gate.

# ZECATHON | Submission briefing
**Project:** Zcash Payment Sessions (ZPS)
**Track:** Core & Tooling
**Official deadline:** October 28, 2026, 23:59 UTC
**Repository:** https://github.com/Iniwura/zcash-payment-sessions
**Landing page:** https://zcash-payment-sessions.vercel.app/
**Live checkout:** https://zcash-payment-sessions.vercel.app/checkout
**Verified historical payment:** LIVE_TESTNET_PROOF.md
**Reviewer guide:** docs/REVIEWER_GUIDE.md

## Project pitch
A ZIP-321 payment request tells a Zcash wallet where to send funds, but does not tell a merchant whether the intended shielded payment actually arrived. Zcash Payment Sessions is a TypeScript SDK that binds a request to a persistent payment lifecycle, matching exact amount and memo, tracking confirmations and reorgs, and preventing an output from being credited twice. The noncustodial reference checkout uses view-only Zcash testnet observations with browser WebZjs and a Sapling memo hydrator. The sender signs in their own wallet; the SDK never holds a spending key.

## Technical differentiators
- ZIP-321 URI and QR generated through pinned WebZjs requests WASM.
- Exact-match payment observation with `txid:pool:output-index` identity.
- Persistent sessions and consumed-payment ledger, across reloads.
- Fail-closed expiry, ambiguity, reorg and replay handling.
- Explicit separation of retryable/incomplete wallet evidence from genuine reorgs, with replacement
  recovery after a confirmed reorg.
- Atomic consumed-payment claims through a storage adapter capability; the reference browser uses
  same-origin Web Locks and refuses to credit with plain `localStorage`.
- V6-compatible Sapling memo hydration isolated in browser WASM.
- Browser-only view-only merchant wallet with an optional locally passphrase-encrypted viewing profile, validated by security and reload smoke tests.
- Documented on-chain testnet transaction, original SDK transitions and proof.

## Verified versus not verified
**Verified:** The October 11 testnet transfer and SDK `AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID` transition, persistence and duplicate-credit protection are recorded in LIVE_TESTNET_PROOF.md. Main-branch CI completed 77 tests and live-browser smoke, including real testnet wallet initialization, live gateway sync and ZIP-321 request creation. Production browser acceptance passed on desktop and mobile.

**Not verified:** A newly funded shielded payment completing in the current public browser checkout; customer-facing wallet signing; autonomous off-browser server monitoring; cross-device settlement without a shared transactional ledger; production security of third-party wallet integrations. Simulation scenarios never move funds. The historical proof document is not a live payment feed.

## Three-minute walkthrough outline
0:00-0:25: Problem with payment requests versus verified receipts.
0:25-0:50: Core TypeScript SDK and matching/persistence.
0:50-1:20: Merchant wallet setup and create testnet payment request (viewing-only key; never expose the key).
1:20-1:50: Real network sync and visible pending state (no fabricated live payment).
1:50-2:20: Open LIVE_TESTNET_PROOF.md showing the historical broadcast, exact amount/memo, 90 recorded confirmations and PAID.
2:20-2:45: Show test-only simulation of duplicate, ambiguity and reorg, clearly labelled simulated.
2:45-3:00: Why reusable private Zcash payment confirmation tooling matters.

## Submission checklist
- Confirm official portal-required fields after signing in.
- Include repo, Vercel site, checkout and historical proof.
- Capture a real browser walkthrough video if the portal allows/requires one.
- Verify production commit matches the submitted commit and cross-origin isolation headers.
- Submit by 23:59 UTC, Oct 28.
- Save portal confirmation.

Do not claim a new live transfer, launch a send transaction, print viewing keys or store spending keys just to demonstrate the product.
