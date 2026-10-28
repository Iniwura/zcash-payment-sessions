# ZPS — three-minute reviewer walkthrough

**Project:** [Zcash Payment Sessions](../README.md) · **Track:** ZECATHON Core & Tooling · **Deliverable:** TypeScript SDK with a browser reference checkout

**Judge the infrastructure first.** The checkout is an interactive illustration of the public SDK. It is not a hosted custodian, transaction sender, or newly funded live-settlement proof.

## The evaluation route

| Time | Action | What it demonstrates |
| --- | --- | --- |
| 0:00–0:20 | Read the [problem and feature matrix](../README.md#the-problem) | ZIP-321 requests need a separate stateful settlement layer |
| 0:20–1:10 | Open [the checkout](https://zcash-payment-sessions.vercel.app/checkout) and choose **Developer simulation** | Original ZIP-321 URI/QR, exact correlation, confirmed state and explicit simulation receipt |
| 1:10–1:40 | Expand **Explore edge cases**; test ambiguous, expired, duplicate and reorg outcomes | Fail-closed behavior and safety properties |
| 1:40–2:20 | Review [the historical funded testnet proof](../LIVE_TESTNET_PROOF.md) | A real on-chain output was matched, confirmed and protected from reuse |
| 2:20–3:00 | Inspect [the public SDK](../src/index.ts), [monitor](../src/monitor.ts), [atomic storage contract](../src/storage.ts) and [tests](../tests/) | Evidence of reusable implementation rather than UI-only functionality |

### Fast path: developer simulation

1. Open **[the reference checkout](https://zcash-payment-sessions.vercel.app/checkout)**.
2. Select **Developer simulation**. This is intentionally separate from the real testnet path.
3. Choose an example order or keep the prefilled amount and memo. Select **Run the guided simulation**.
4. Observe the *actual SDK states* `AWAITING_PAYMENT → DETECTED → CONFIRMING → PAID` from **synthetic wallet observations**. Inspect the rendered ZIP-321 payment URI, QR, session ID and clearly labeled *simulation* receipt.
5. Examine the exception states, duplicate consumption behavior and page-reload persistence.

**No money is sent in this path.** Synthetic `PAID` means the matcher accepted synthetic exact evidence; it is **not** an observed on-chain transaction.

### Real testnet path: view-only

On the cross-origin-isolated **Vercel** checkout:

1. Select **Real testnet**.
2. Obtain a dedicated Zcash testnet **Unified Full Viewing Key (UFVK)** from a compatible existing testnet wallet, together with its **wallet birthday block height**.
3. Enter those values under **Connect an existing testnet wallet**. The free gRPC-Web gateway is already configured under optional connection settings. Never supply a seed, mnemonic or spending key.
4. Optionally encrypt and locally save the viewing profile with a separate passphrase. Unlocking it in a returning browser session may require another scan.
5. Connect the wallet; once ready, create a session and inspect the real ZIP-321 URI/QR.
6. Use **Refresh payment status** to synchronize/view actual testnet observations. A funded **external sender** would be needed to demonstrate a new real checkout payment.

The available browser CI verifies opening a view-only wallet, creating a real request, testnet sync and encrypted merchant-profile reload. **No newly funded end-to-end payment has been proven on the current production checkout.** Avoid describing a generated QR or successful sync as `PAID`.

**Environmental requirement:** Real wallet mode needs COOP/COEP, `SharedArrayBuffer`, compatible WASM workers and browser isolation. The GitHub Pages mirror is a **simulation-only** fallback.

## The strongest independent settlement proof

Read [`LIVE_TESTNET_PROOF.md`](../LIVE_TESTNET_PROOF.md), which records a **funded October 11, 2026 testnet payment** independently of the simulation.

| Check | Recorded result |
| --- | --- |
| Canonical transaction ID | `81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc` |
| Block / Sapling output | `4,490,144` / output `0` |
| Exact amount | `10,000` zatoshis |
| Observed confirmation count | `90` |
| Matching memo | Recovered locally from full V6 transaction bytes using the isolated Rust/WASM Sapling hydrator |
| Verified lifecycle | `AWAITING_PAYMENT → DETECTED → CONFIRMING → PAID` |
| Reload / replay | Session remained `PAID` after restore; another session returned `ALREADY_CONSUMED` |

## What judges should inspect in code

- [`src/index.ts`](../src/index.ts) — compact public SDK, create/refresh/get session.
- [`src/monitor.ts`](../src/monitor.ts) — exact correlation, consumed ledger, confirmations, anomalies and reorg recovery.
- [`src/storage.ts`](../src/storage.ts) — optional atomic `claimItem` required for crediting. Without it the SDK returns `CONCURRENCY_UNSUPPORTED`.
- [`src/wallet.ts`](../src/wallet.ts) and [`src/browser-wallet.ts`](../src/browser-wallet.ts) — received output adapter and view-only browser wallet.
- [`src/memo-hydration.ts`](../src/memo-hydration.ts) and [`wasm/sapling-memo-hydrator`](../wasm/sapling-memo-hydrator/) — current-consensus Sapling memo compatibility with identity checks.
- [`tests/remediation.test.ts`](../tests/remediation.test.ts) and [`tests/monitor.test.ts`](../tests/monitor.test.ts) — adversarial and matching coverage.
- [`docs/THREAT_MODEL.md`](THREAT_MODEL.md) — verified protections, unverified assumptions and privacy trade-offs.

## Reproduce and verify

After the pinned WebZjs and Sapling dependencies are built (see [README setup](../README.md#reproducible-setup)):

```sh
npm run typecheck
npm test
npm run test:consumer
npm run verify:reproducibility
npm run demo:typecheck
npm run demo:build
```

Review the [GitHub Actions runs](https://github.com/Iniwura/zcash-payment-sessions/actions) for fresh browser and build checks on the evaluated commit. The [free gateway](../gateway/README.md) can cold-start, and the merchant must keep its view-only observer active for manual refresh. Cross-device settlement requires a shared atomic ledger, not browser local storage.

**Evaluation principle:** Treat correctness and evidence as the core of the submission. The UI makes the SDK inspectable, but simulation, historical on-chain settlement and live testnet **observation** are three different kinds of evidence.
