# Release evidence — October 28, 2026

This file records **specific checked results**, not a permanent promise of uptime or an assertion that a new public-checkout payment has been funded.

## Identified release

| Item | Evidence |
| --- | --- |
| Application and SDK code commit | [`e0ba36dd6382f5dc6f11feb84f142cc51f3ca38c`](https://github.com/Iniwura/zcash-payment-sessions/commit/e0ba36dd6382f5dc6f11feb84f142cc51f3ca38c) |
| Production artifact commit | `a5fea49a6caa5d2857e3cb05e4b2bfcbfcdd36b9` (`vercel-static`) |
| Vercel deployment | `dpl_E42CexKE6ghvjNk7NkiEDqg5itGG` — READY at verification |
| Public URL | https://zcash-payment-sessions.vercel.app/checkout |
| Final release workflow | [GitHub Actions 40749721405](https://github.com/Iniwura/zcash-payment-sessions/actions/runs/40749721405) — success |
| Real testnet integration | [GitHub Actions 40748724687](https://github.com/Iniwura/zcash-payment-sessions/actions/runs/40748724687) — success |
| Merchant onboarding integration | [GitHub Actions 40748724766](https://github.com/Iniwura/zcash-payment-sessions/actions/runs/40748724766) — success |
| Merchant-profile security and responsive audit | [GitHub Actions 40748724815](https://github.com/Iniwura/zcash-payment-sessions/actions/runs/40748724815) — success |
| Funded testnet proof | [Historical Zcash payment / 2026-10-11](../LIVE_TESTNET_PROOF.md) |

The public alias was checked after the last deployment and pointed to the READY artifact above. The current docs-only cleanup commit does not modify the running application; if a new static artifact is generated from a docs merge, it should not be confused with a new wallet or payment implementation.

## Scope of verification

**Proven through SDK and browser tests**

- Pinned WebZjs compilation and Sapling memo compatibility build.
- Public TypeScript facade, session persistence, exact amount/memo correlation, confirmation policy and consumed-output ledger.
- Adversarial cases including incomplete observations, explicit reorg evidence, duplicate outputs, expired sessions and claim concurrency.
- Browser view-only testnet wallet import, real ZIP-321 request generation, QR generation and gateway synchronization without spending.
- Locally encrypted returning-merchant profile after reload, with viewing key material not printed or embedded in the URL.
- Frontend layout and merchant onboarding browser checks.

**Historical funded proof**

One real testnet payment (10,000 zatoshis) was mined at height `4,490,144`, observed at 90 confirmations and led to `PAID` through the SDK. The same output could not credit a second session after restart. See [the evidence ledger](../LIVE_TESTNET_PROOF.md).

**Not established**

- A separate newly funded transaction passing end-to-end through the current public Vercel checkout.
- Background/headless merchant monitoring or mainnet service availability.
- Cross-device atomic settlement without a shared transactional database.
- Gateway 24/7 availability; the experimental free-tier proxy may cold-start.
- That a browser with interfering extensions can initialize the shared-memory worker pool.

## Re-check instructions

1. Confirm the [latest `main` commit](https://github.com/Iniwura/zcash-payment-sessions/commits/main/) and [CI history](https://github.com/Iniwura/zcash-payment-sessions/actions).
2. Confirm the production alias and static artifact source at Vercel.
3. Run the commands from [README: reproducible setup](../README.md#reproducible-setup).
4. In the reference checkout, compare **Developer simulation** and **Real testnet**. Treat generated QR and an unfunded synchronized request as requests, not settlement.
5. Inspect the [threat model](THREAT_MODEL.md) before production reuse.

This record is designed to be falsifiable. New evidence should be added with a concrete commit, run ID and observed result.
