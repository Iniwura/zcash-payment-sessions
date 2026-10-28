> **Historical document — not current release guidance.** This file records an earlier 2026-10-28 checkpoint, including then-open defects, branch states, and submission assumptions. Some findings have since been fixed and some statuses are obsolete. For the current project, use [README](../../README.md), [reviewer guide](../REVIEWER_GUIDE.md), [threat model](../THREAT_MODEL.md), and [funded testnet evidence](../../LIVE_TESTNET_PROOF.md). Preserve this document for auditability; do not use it as a release gate.

# Zcash Payment Sessions — Current Handoff

**Updated:** 2026-10-28 (Africa/Lagos)

This document is an operational snapshot. Re-check CI, deployment headers, gateway health, and the
authenticated ZECATHON portal before making time-sensitive release or submission claims.

## Source of truth

- Repository: https://github.com/Iniwura/zcash-payment-sessions
- Stable audited baseline: `43d962086a977cf01c15fe7e60e09f43b789ea55`
- Remediation branch: `remediation-critical-correctness`
- Historical live proof: `LIVE_TESTNET_PROOF.md`
- Production landing: https://zcash-payment-sessions.vercel.app/
- Production checkout: https://zcash-payment-sessions.vercel.app/checkout
- GitHub Pages fallback: https://iniwura.github.io/zcash-payment-sessions/
- Public testnet gateway: https://zps-testnet-gateway.onrender.com/

Do not use the obsolete feature-branch SHAs or old localhost gateway values that were present in
the previous handoff. Generated `vercel-static` output is deployment infrastructure and must not be
hand-edited.

## Product boundary

ZPS is a noncustodial application-layer matcher around ZIP-321 and WebZjs observations. It creates
payment requests, persists sessions, matches exact amount/memo/output identity, tracks confirmations,
expires safely, represents explicit reorgs, and prevents replay. It does not accept spending keys,
sign, broadcast, monitor off-browser, or provide a merchant backend.

The pinned WebZjs request and wallet packages remain reproducibly built from commit
`a50df944c32243cb8da9f86e7d52cb65ac926439`. The current-consensus Sapling memo hydrator remains an
isolated compatibility boundary; it does not make the pinned parser current-consensus native.

## Remediation status

The critical correctness remediation changes:

- classify RPC, hydration, missing-metadata, invalid, and conflicting observations separately from
  explicit `REORGED` wallet evidence;
- preserve a confirmed session through transient or incomplete observations;
- recover a reorged session with a valid replacement while retaining the old consumed ledger entry;
- deduplicate identical observations and fail closed on conflicting observations;
- require an atomic `claimItem(key, owner)` storage capability before crediting a payment;
- use same-origin Web Locks in the reference checkout for cross-tab claims;
- validate persisted session/match records and recover corrupted records without throwing;
- require HTTPS lightwalletd endpoints except localhost development, persist selected account ids,
  and surface wallet-summary failures instead of reporting a false sync;
- add a practical CSP, Vite security patch, focus trapping/restoration for the product tour, a
  checkout heading, and corrected document metadata.

Plain `localStorage` remains able to store session metadata, but it is not a transactional payment
ledger. The SDK returns `CONCURRENCY_UNSUPPORTED` when a storage adapter lacks `claimItem`. A
multi-device or server settlement system still requires a shared transactional database.

## Evidence and limitations

The historical payment remains the only authenticated on-chain settlement proof:

- txid: `81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc`
- amount: 10,000 zatoshis
- mined height: `4490144`
- recorded observation: 90 confirmations and public SDK `PAID`

Do not claim that the current public checkout has completed a newly funded payment. No funds or
transactions should be sent without explicit authorization. The public browser reference remains
view-only and requires manual refresh; deterministic simulation is not chain evidence.

The official public ZECATHON page has displayed five tracks and a `$100,000` total prize pool. The
track-specific prize, eligibility, and submission fields must be confirmed in the authenticated
portal; the old `$15,000` planning assumption is not authoritative.

## Required validation before release

Run from the remediation branch:

```sh
npm ci --ignore-scripts
npm audit --json
npm audit --omit=dev --json
npm test
npm run typecheck
npm run build
npm run test:consumer
npm run verify:reproducibility
npm run demo:typecheck
npm run demo:build
python3 gateway/verify-upstream.py
python3 gateway/verify-historic-transaction.py
git diff --check
```

Then run the browser simulation, merchant unlock/reload, real testnet view-only synchronization,
and desktop/mobile checks against a built artifact. Do not merge, deploy, or submit until the
critical adversarial tests and full regression evidence are green. Re-check the deployed production
artifact after any release deployment, including COOP/COEP/CSP headers and the simulation flow.

## Security boundary

Never print or persist seeds, mnemonics, spending keys, or raw private material. UFVKs are sensitive
viewing material and must not enter URLs, logs, commits, or the gateway. The gateway is a transport
proxy, not a trust oracle. Applications should allowlist and verify their endpoint and use a shared
transactional ledger when crediting across devices.

## Release record

- Release-candidate commits: `8b7f789` (`fix(core): harden payment observation recovery`),
  `aa0c9f7` (`docs: record remediation release candidate evidence`), `1cc44c6`
  (`test: normalize remediation fixture`), `29f185f` (`docs: include final remediation commit
  record`), `7de0c16` (`ci: run remediation checks on pull requests`), `7df4ddd`
  (`fix(vercel): skip unbuildable source previews`), `86d1ba1` (`test: cover claim adapter
  failure`), and `bbd7ea3` (`docs: record final CI release gate`).
- Local validation: 16 test files / 96 tests, typecheck, SDK build, consumer smoke,
  reproducibility, demo typecheck/build, dependency audit, gateway checks, simulation browser
  acceptance, responsive checks, and read-only real testnet browser synchronization all passed on
  2026-10-28. The real testnet smoke observed canonical tip `4549174` and did not send funds.
- CI: PR #3 workflows passed on final head `bbd7ea3`: run 16 for merchant onboarding and real
  testnet checkout, run 18 for real testnet checkout integration, and run 17 for merchant-profile
  security smoke. The Vercel check passed by intentionally skipping the non-`vercel-static`
  preview; no production deployment was performed.
- Deployment: not performed. Stable `main` and the historical proof remain unchanged.
- Merge/submission: not performed; requires review and CI from the branch first.
- Remaining release limitations: a newly funded public-checkout payment is not newly verified;
  cross-device settlement requires a shared transactional ledger; arbitrary HTTPS endpoints remain
  transport inputs rather than trust oracles.
