> **Historical document — not current release guidance.** This file records an earlier 2026-10-28 checkpoint, including then-open defects, branch states, and submission assumptions. Some findings have since been fixed and some statuses are obsolete. For the current project, use [README](../../README.md), [reviewer guide](../REVIEWER_GUIDE.md), [threat model](../THREAT_MODEL.md), and [funded testnet evidence](../../LIVE_TESTNET_PROOF.md). Preserve this document for auditability; do not use it as a release gate.

# Zcash Payment Sessions — Grand Pre-Submission Audit

**Audit date:** 2026-10-28 (Africa/Lagos)

**Audited release:** `43d962086a977cf01c15fe7e60e09f43b789ea55`

**Repository:** <https://github.com/Iniwura/zcash-payment-sessions>

**Production:** <https://zcash-payment-sessions.vercel.app/>

## 1. Executive verdict

Zcash Payment Sessions is a credible, technically differentiated Zcash Core & Tooling
submission and is ready for an honest hackathon submission. It is not yet a highest-confidence
production payment-settlement SDK.

The project genuinely solves an important application-layer problem that ZIP-321 alone does not
solve: binding an intended shielded payment to an exact amount, memo, output identity, expiry,
confirmation policy, persistence record, and replay ledger. The implementation is real TypeScript
SDK code, not only a visual demo. The historical testnet proof and current browser-wallet smoke
provide meaningful evidence.

The strongest differentiator is the compatibility boundary around pinned WebZjs: compact wallet
observations remain the source of output identity and confirmation state, while a separately built,
current-consensus Sapling WASM module locally hydrates newer Sapling memos and rechecks transaction
ID, height, output index, recipient, and value before a memo can influence matching.

The main qualification is important: no newly funded payment has been observed through the current
production checkout. The historical proof is authentic evidence, but it is not a current production
settlement proof. The current reference checkout is also a view-only observer that requires a merchant
tab and manual refresh; it does not sign, broadcast, or autonomously monitor payments.

### Priority summary

| Priority | Finding | Submission impact |
|---|---|---|
| P0 | None found | No known critical correctness or security failure that makes the released demo unusable. |
| P1 | Hydration failures can be treated as reorgs; replacement recovery is blocked | Core correctness risk for real-world upstream failures. |
| P1 | Consumed-payment claim is not atomic across tabs/storage implementations | Replay-safety claim is single-context, not concurrency-safe. |
| P1 | Current production checkout has no newly funded end-to-end payment evidence | Must remain an explicit limitation; essential before claiming current live settlement. |
| P1 | `HANDOFF.md` contains obsolete branch, failure, and prize metadata | Can mislead an operator or submission reviewer. |
| P2 | Corrupt persistence throws; ambiguous state is not persisted; wallet state assumes one account | Robustness and reusable-SDK quality gaps. |
| P2 | No CSP and endpoint validation is permissive; legacy wallet DB cleanup is manual | Security hardening and operator-safety gaps. |
| P2 | One high-severity development-only Vite audit finding | Does not ship in the production artifact, but should be patched. |
| P2 | Accessibility and product-flow polish gaps remain | The visual result is strong, but not yet exceptional in every interaction. |
| P3 | CI action deprecation warnings and free-tier gateway limits | Operational maintenance, not a current release blocker. |

## 2. Original vision versus current implementation

### Original promise

The repository describes a reusable TypeScript SDK that turns a ZIP-321 request into a persistent,
replay-safe lifecycle:

```text
AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID
```

The intended merchant experience is: create a request, show a QR/URI, observe the receiving wallet,
match the exact shielded output, require confirmations, survive reloads, handle expiry/reorgs, and
prevent one payment from satisfying multiple sessions.

### What exists now

- A public `ZcashPaymentSessions` facade in `src/index.ts`.
- ZIP-321 creation and decoding backed by the locally built pinned
  `@chainsafe/webzjs-requests@0.1.0` WASM package, not a TypeScript ZIP-321 reimplementation.
- BigInt zatoshi persistence and exact amount/memo matching.
- Stable WebZjs output identity represented as `txid:pool:output-index`.
- Confirmation progression, expiry, ambiguity, reorg state, and consumed-payment ledger.
- A WebZjs browser wallet adapter for view-only testnet observation.
- Current-consensus Sapling memo hydration in isolated browser WASM.
- Optional local PBKDF2/AES-GCM encryption of a merchant UFVK profile; no spending key is accepted.
- A polished reference landing page and checkout with deterministic simulation and isolated real
  testnet mode.
- A public Render gRPC-Web transport proxy that exposes no wallet or signing service.
- A historical, reproducible testnet transaction proof.

### What remains incomplete

- The current public checkout has not completed a newly funded payment from merchant onboarding
  through current production observation.
- The browser does not sign, prove, or broadcast; the sender must use another wallet.
- There is no autonomous server-side watcher, webhook, durable merchant backend, or settlement
  callback.
- The merchant must keep the reference tab open and press refresh to observe the chain.
- Browser persistence is application-provided storage; the SDK does not provide a transactional or
  multi-tab ledger backend.
- Wallet account selection is not a durable first-class adapter concern after reload when a database
  contains multiple accounts.

### What was compromised or made more complex

- The pinned WebZjs parser is pre-current-consensus for the relevant transaction format. Three tracked
  compatibility patches and a separate librustzcash-based Sapling hydrator are required.
- Real browser mode requires COOP/COEP and therefore works on the isolated Vercel deployment but is
  gated on GitHub Pages.
- A free Render gateway adds a useful public testnet path but introduces cold starts, uptime,
  bandwidth, and trust/metadata limitations.
- The final checkout is substantially broader than the SDK: storefront cards, product tour,
  editorial marketing sections, and a simulated reviewer walkthrough are useful for judging but not
  part of the core payment-session product.

### Does it solve the original problem?

Yes, for a noncustodial application that already has a trustworthy WebZjs-compatible receiving
wallet and a storage implementation. It demonstrates the missing receipt/matching layer around
ZIP-321 and works against the historical shielded transaction path.

No, if the claim is a complete production payments platform. Signing, broadcast, unattended
monitoring, merchant-side credit callbacks, multi-tab atomicity, and a fresh current-production
settlement proof are outside the released scope.

## 3. Evidence and validation performed

### Repository and release identity

- Local checkout: `main`, clean before this audit, at
  `43d962086a977cf01c15fe7e60e09f43b789ea55`.
- PR #1 merged safely as `01a93e5d7c2e1028c21f74cb5e903049472b321a`:
  <https://github.com/Iniwura/zcash-payment-sessions/pull/1>
- Documentation follow-up PR #2 merged as the audited commit:
  <https://github.com/Iniwura/zcash-payment-sessions/pull/2>
- Generated Vercel artifact: `6f1850617773f0c6cc479016226fefb6be5602f`, commit message
  `build(vercel): 43d962086a977cf01c15fe7e60e09f43b789ea55`.

### Local reproducibility and tests

Commands run successfully on Node `24.18.0` / npm `12.0.1`:

```text
npm ci --ignore-scripts                         PASS
npm run verify:reproducibility                  PASS
npm test                                        PASS — 15 files, 77 tests
npm run typecheck                               PASS
npm run build                                   PASS
npm run test:consumer                           PASS
npm run demo:typecheck                          PASS
GITHUB_ACTIONS=false npm run demo:build        PASS
git diff --check                                PASS
```

Reproducibility verified:

- WebZjs commit: `a50df944c32243cb8da9f86e7d52cb65ac926439`.
- Generated packages: `@chainsafe/webzjs-keys@0.1.0`,
  `@chainsafe/webzjs-requests@0.1.0`, and `@chainsafe/webzjs-wallet@0.1.0`.
- The three tracked WebZjs patches are applied and the upstream checkout contains exactly the
  expected three modified source files.
- Main-project dependencies use ignored local file paths and the lockfile records those paths.

The clean install reported one high-severity npm audit result for development dependency
`vite@8.3.2`, affecting the `launch-editor`/Vite development path. `npm audit --omit=dev` reported
zero production vulnerabilities. This is not present in the shipped static runtime, but should be
fixed in a maintenance pass.

### GitHub Actions

Latest workflows for `8dfb5679f8ce25b539c63e2ec37d606dd0f855b2` both passed:

- [Merchant viewing-profile security smoke — run 40593540260](https://github.com/Iniwura/zcash-payment-sessions/actions/runs/40593540260)
- [Merchant onboarding and real testnet checkout — run 40593540828](https://github.com/Iniwura/zcash-payment-sessions/actions/runs/40593540828)

The final main release workflow also passed completely:

- [Deploy reference checkout — run 40599049917](https://github.com/Iniwura/zcash-payment-sessions/actions/runs/40599049917)
- Build job: success, including pinned WebZjs build, hydrator build, 77-test SDK suite,
  consumer/demo checks, simulation browser acceptance, real testnet browser wallet acceptance,
  Vercel artifact publication, and responsive screenshot stage.
- Pages deploy job: success.

The workflow emitted non-blocking warnings that several GitHub actions still target Node 20 and
that `ubuntu-latest` will migrate to Ubuntu 26.

### Live gateway and testnet observation

Current checks passed without any funding, signing, or broadcast:

```text
python3 gateway/verify-upstream.py
  Health HTTP: 200
  Upstream HTTP: 200, application/grpc-web+proto
  Production CORS: https://zcash-payment-sessions.vercel.app
  gRPC status: 0
  Real LightdInfo from Zcash testnet: PASS

python3 gateway/verify-historic-transaction.py
  HTTP 200, production CORS
  testnet height 4490144, raw transaction bytes 2378: PASS
```

The real-browser smoke evidence recorded during release validation showed:

- `UPSTREAM_OK chain=testnet` with an observed live tip of `4548902` at that test run.
- `WALLET_OK view_only=1 zip321=1 recipient=testnet`.
- `SYNC_OK real_browser_wallet=1, no_payment_sent=1`.
- `MERCHANT_UNLOCK_OK encrypted_profile=1 reloaded_wallet=1 new_session=1`.

This proves real view-only wallet initialization, ZIP-321 request creation, gateway sync, and
encrypted-profile reload. It does not prove a newly funded payment.

### Production and Pages browser checks

Anonymous browser checks were run against the deployed URLs at 1440×1000, 768×1024, and 390×844:

- Vercel landing and checkout: HTTP 200, no page errors, no horizontal overflow, correct title.
- Vercel checkout: `crossOriginIsolated=true`, default mode `Real testnet`, explicit view-only
  onboarding, no wallet key supplied.
- Vercel deterministic simulation: completed `PAID` and restored `PAID` after reload.
- GitHub Pages checkout: `crossOriginIsolated=false`, default mode `Demo simulation`, exact
  COOP/COEP limitation notice visible, simulation completed `PAID`, no overflow.
- Production COOP/COEP/CORP response headers:

```text
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

Screenshots were captured and manually inspected outside the repository at:

```text
/tmp/zps-grand-audit-screenshots/desktop.png
/tmp/zps-grand-audit-screenshots/tablet.png
/tmp/zps-grand-audit-screenshots/mobile.png
/tmp/zps-grand-audit-screenshots/checkout-desktop.png
/tmp/zps-grand-audit-screenshots/checkout-tablet.png
/tmp/zps-grand-audit-screenshots/checkout-mobile.png
```

The visual result is coherent and intentionally reference-driven: strong typographic hierarchy,
high-contrast state cards, an evidence section, clear simulation disclosure, and responsive layouts.
The checkout is long and technically dense, especially on mobile; this is acceptable for a judging
reference but not yet an ideal first-run merchant product.

## 4. Full SDK and backend audit

### Confirmed strengths

1. **Exact matching:** `src/monitor.ts:107-113` requires exact BigInt amount and exact memo and
   excludes expired/reorged observations.
2. **Stable identity:** `src/wallet.ts:50-93` joins hydrated evidence to WebZjs's
   `txid:pool:output-index`, rechecking txid, pool, output index, value, and non-empty memo.
3. **BigInt safety:** `src/wallet.ts:163-179` converts safe numeric WebZjs values to BigInt and
   ignores malformed/unsafe values.
4. **Confirmation policy:** `src/monitor.ts:206-223` only reaches `PAID` after the configured
   threshold and a mined observation.
5. **Expiry:** `src/session.ts:67-83` and `src/storage.ts:35-49` expire sessions on access and
   prevent late payments from reviving them.
6. **Historical restart proof:** `LIVE_TESTNET_PROOF.md:71-85` records persisted wallet/session
   reload, confirmation progression, duplicate refresh, and cross-session replay prevention.
7. **V6 compatibility:** `src/memo-hydration.ts:17-61` performs no transaction parsing in
   TypeScript and only accepts hydrator evidence after exact identity and value checks.
8. **ZIP-321 integration:** `src/zip321.ts:55-125` delegates URI generation/parsing to actual
   WebZjs request WASM; `src/sender.ts:19-63` parses one payment and forwards exact memo bytes to
   the additive WebZjs memo proposal method without signing or broadcasting.
9. **Mode separation:** `examples/checkout/src/main.ts:137-160` uses distinct simulation and
   testnet session namespaces, while wallet DB state is transient in browser memory.
10. **Secret boundary:** the public checkout accepts only a UFVK, clears the input after opening,
    encrypts the optional saved profile, and never accepts a seed or spending key. This is covered
    by the merchant profile smoke tests and `docs/THREAT_MODEL.md:24-32`.

### P1-01 — Hydration failure is misclassified as reorg; replacement recovery is blocked

**Problem:** `WebZjsPaymentSource.list()` catches every hydrator failure and returns the compact
payment without a memo (`src/wallet.ts:126-140`). If that output was already matched, the monitor
sees the same payment identity with a missing/mismatched memo and calls `handleReorg`
(`src/monitor.ts:171-185`). A transient gateway timeout, WASM failure, or incomplete raw transaction
fetch can therefore move a `CONFIRMING` or `PAID` session to `REORGED` even though no chain reorg
occurred.

The monitor also retains the old match after a reorg. If the original transaction is replaced by a
new valid transaction after a reorg, `src/monitor.ts:176-185` finds no old payment identity and
`handleReorg` leaves the session `REORGED`; the replacement is not considered.

**Independent reproduction:** an ephemeral script using the built `dist/` modules produced:

```text
hydration_failure_status= REORGED outcome= REORGED
replacement_after_reorg_status= REORGED outcome= NO_MATCH
```

**Impact:** false negative/false reorg state during the exact upstream failure mode the hydrator was
introduced to handle; a merchant can incorrectly see a paid session rolled back and then be unable
to recover with a replacement payment.

**Root cause:** incomplete observation and chain reorg are represented by the same absence/mismatch
path; no tri-state observation result distinguishes `UPSTREAM_UNAVAILABLE`, `INCOMPLETE_MEMO`, and
`REORGED`.

**Proposed solution:** preserve the last-known match on hydration/upstream errors and surface a
retryable observation error. Only mark `REORGED` after a trusted wallet observation explicitly marks
the stable output reorged or after a chain-consistency rule confirms disappearance. On confirmed
reorg, clear/retire the old match in a versioned way and allow a new exact payment to claim the
session.

**Solution risk/effort:** medium; requires an observation-result API change and new tests for
hydration timeout, missing raw bytes, explicit reorg, replacement payment, and restart. **Essential
before claiming production-grade reorg safety; not required to submit the current honest demo.**

### P1-02 — Consumed-payment claiming is not atomic across tabs or storage implementations

**Problem:** `PaymentMonitor.claim()` performs `getItem` followed by `setItem`
(`src/monitor.ts:301-315`). Two tabs, workers, or monitor instances can observe the same payment
for different sessions, both read an empty ledger, and both write their own session ID. The existing
test (`tests/monitor.test.ts:100-118`) is sequential and cannot exercise this race.

**Impact:** the advertised one-output/one-session guarantee is only reliable in a single synchronous
context. A merchant with two tabs or a custom storage adapter can double-claim the same output.

**Root cause:** the `KeyValueStorage` interface has no compare-and-set, lock, transaction, or
single-writer contract.

**Proposed solution:** document the single-context guarantee immediately, then add an atomic claim
interface or a server/database-backed ledger. For browser-only operation, use a Web Locks-based
single writer with a carefully specified fallback; do not treat localStorage writes as CAS.

**Solution risk/effort:** medium/high because it changes the storage contract and deployment model.
**Important before a production crediting integration; not a blocker for the single-tab reference
demo.**

### P1-03 — Current production settlement is not freshly proven

**Problem:** the only authentic payment is the historical transaction documented in
`LIVE_TESTNET_PROOF.md:29-85`. The current README and submission briefing correctly state that a
newly funded payment through the current public checkout has not been verified
(`README.md:222`, `SUBMISSION_READY.md:23-26`).

**Impact:** a judge can verify request generation and a historical lifecycle, but cannot infer that
the current merchant-profile onboarding, deployed Vercel artifact, current gateway, current wallet
database, memo hydrator, and current refresh path have all settled a new payment together.

**Recommendation:** if the submission requires current live settlement evidence, authorize one
dedicated testnet proof with a fresh session/memo, funded sender, exact URI inspection, signed
broadcast, recipient sync, and public SDK refresh through `PAID`. Do not use simulation or the old
proof as a substitute. Without that authorization, retain the current explicit limitation.

**Essential before claiming a current live payment; not required to submit if disclosed exactly as
currently documented.**

### P1-04 — Operational handoff is materially stale

**Problem:** `HANDOFF.md` is explicitly a snapshot, but still instructs operators to start from an
obsolete feature branch and reports an old failed browser run as the current blocker
(`HANDOFF.md:22-34`, `45-68`). It also carries the old `$15,000` planning assumption
(`HANDOFF.md:7-20`) while the current official public event page displays a `$100,000` total pool
across five tracks.

**Impact:** a fresh operator can work from the wrong branch, believe a fixed failure is active, or
submit incorrect prize/deadline metadata.

**Recommendation:** update or archive the handoff after this audit, record the final commit and CI
run, and require signed-in portal verification for the track-specific prize and fields.

**Effort:** low. **Essential before handing the repository to another operator; not a product-code
blocker.**

## 5. Zcash protocol and wallet findings

### Confirmed protocol boundary

- WebZjs is pinned and reproducibly built from the exact upstream commit; generated package
  declarations expose `TransactionRequest`, `PaymentRequest`, `get_received_payments`,
  `get_transaction`, and the additive memo proposal method.
- The code does not claim that the pinned WebZjs parser understands every current transaction
  format. `docs/THREAT_MODEL.md:41-50` correctly describes the current-consensus hydrator as an
  explicit compatibility boundary.
- Hydration requires mined status, matching raw transaction height, a valid 32-byte txid, matching
  pool/output/value, and non-empty memo. This is a strong fail-closed design.
- The gateway is transport-only, fixes the upstream hostname/TLS SAN, exposes only the intended
  RPC prefix and health path, and rejects an `https://evil.example` CORS preflight with HTTP 404.
- The current upstream and historical transaction retrieval checks passed at audit time.

### P2-01 — Wallet state reports too little on summary failure

`WebZjsBrowserWallet.refreshState()` catches `get_wallet_summary()` failures and returns silently
(`src/browser-wallet.ts:250-283`). `sync()` can then mark the wallet `synced` after a successful
`wallet.sync()` even if the summary refresh failed, leaving stale or undefined chain-tip state.

**Impact:** UI/operator confidence can be higher than the actual observable wallet state during an
upstream failure.

**Recommendation:** distinguish synchronization success from summary-read success, preserve the
error in `BrowserWalletState`, and do not report `synced` until both are successful.

### P2-02 — Reloaded wallet account selection assumes the first account

After `WebWallet` restoration, `refreshState()` assigns `accountId` from the first account balance
(`src/browser-wallet.ts:264-273`). The adapter does not persist or accept a selected account ID as
part of the database restore contract. The reference checkout uses one account, but a reusable
consumer with multiple accounts can monitor the wrong account after reload.

**Recommendation:** persist selected account metadata separately or require an explicit account ID
when constructing the adapter; verify that the account exists after restore.

### P2-03 — Endpoint and network validation rely heavily on caller discipline

`WebZjsBrowserWallet` validates only that the endpoint is non-empty and the network is `main` or
`test` (`src/browser-wallet.ts:321-335`). The merchant profile checks `https://` but allows any
HTTPS host (`examples/checkout/src/merchant-profile.ts:40-50`). The reference UI documents the
trust boundary, and a dishonest server is explicitly out of scope in `docs/THREAT_MODEL.md:52-57`,
but the adapter does not enforce HTTPS, testnet chain identity, or an allowlist.

**Impact:** a consumer can accidentally point a test wallet at an unsafe or wrong endpoint; a
malicious endpoint can censor observations or provide misleading wallet metadata. It cannot by
itself create a valid shielded memo proof without valid chain/decryption evidence, but it can deny
service and leak transaction-interest metadata.

**Recommendation:** require HTTPS by default, make endpoint trust explicit, verify `GetLightdInfo`
chain identity before account use, and document that endpoint allowlisting is the application’s
responsibility.

### P2-04 — Legacy plaintext wallet database cleanup is manual

Current code keeps the WebZjs serialized database in a module-level volatile map
(`examples/checkout/src/main.ts:151-160`), which is a good privacy improvement. However, the README
acknowledges that older deployments may have `wallet:testnet:db` in localStorage and tells users to
remove it manually (`README.md:240-244`). There is no migration or cleanup path.

**Impact:** a returning user can believe the current profile protection covers all browser history
when an older plaintext database remains in storage.

**Recommendation:** add a one-time, clearly disclosed deletion/migration step, with no silent data
loss and no automatic copying of the old plaintext DB into a new protected store.

## 6. Security audit

### Proven protections

- UFVK input is cleared after wallet-open attempts, including failure
  (`examples/checkout/src/main.ts:262-265`).
- The optional merchant profile uses random salt/IV, PBKDF2-SHA256 with 310,000 iterations, and
  AES-256-GCM with authenticated additional data (`examples/checkout/src/merchant-profile.ts:31-90`).
- Wrong passphrases and tampering are tested in `tests/merchant-profile-smoke.test.mjs:19-31`.
- Session persistence does not contain the runtime UFVK; the hydration tests explicitly check this
  (`tests/memo-hydration.test.ts:216-228`).
- No private key, seed, mnemonic, or spending flow is exposed by the reference checkout.
- Textual user/session data is primarily rendered with `textContent` or input `.value`. The product
  tour’s `innerHTML` uses static source-controlled strings, not user input.
- Vercel has COOP/COEP/CORP headers; GitHub Pages deliberately gates the real wallet.
- Gateway CORS allows the production origin and local development origins; an unrelated origin did
  not receive a successful CORS preflight.

### P2-05 — No Content-Security-Policy hardening

The deployed response has the required isolation headers but no explicit CSP, and the repository
does not define one in `vercel.json` or the static app. The current code has no demonstrated XSS
path, but CSP would reduce the impact of a future dependency or DOM mistake.

**Recommendation:** add a tested CSP compatible with the same-origin WASM/worker assets, then verify
that WebZjs and the hydrator still initialize under it. Do not add a speculative CSP without testing
WASM, workers, and the QR renderer.

### P2-06 — Dev dependency vulnerability

`npm audit --omit=dev` returned zero vulnerabilities. Full `npm audit` reported one high-severity
direct development dependency finding for `vite@8.3.2`, covering launch-editor command handling and
Vite development-server issues in the published advisory range:

<https://github.com/advisories/GHSA-587h-7wmj-h5pm>

It is not included in the production static runtime, but a maintainer/developer running the dev
server is exposed. Upgrade Vite and regenerate the lockfile in a separate maintenance change.

## 7. Frontend functional and visual audit

### Verified flows

| Flow | Result | Evidence |
|---|---|---|
| Landing page loads | PASS | Vercel HTTP 200, desktop/tablet/mobile screenshots, no page errors. |
| Checkout route loads | PASS | Vercel HTTP 200, no page errors, no overflow. |
| Isolated production mode | PASS | `crossOriginIsolated=true`, Real testnet default, wallet setup required. |
| Public Pages mode | PASS | `crossOriginIsolated=false`, deterministic simulation default, exact limitation notice. |
| Simulation request/QR | PASS | Production and CI browser acceptance. |
| Simulation lifecycle | PASS | `AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID`. |
| Simulation reload | PASS | Production browser reload restored PAID. |
| Simulation ambiguity/reorg/expiry | PASS | SDK/UI tests and CI browser acceptance. |
| Real wallet onboarding | PASS | Ephemeral UFVK smoke; no secret printed or sent. |
| Real ZIP-321 request | PASS | Browser smoke generated a testnet request through public SDK/WebZjs. |
| Real synchronization | PASS | Browser smoke and current gateway verification. |
| Newly funded current production payment | NOT VERIFIED | Explicitly documented; no funds were sent in this audit. |

### Visual assessment

The visual system is substantially above a generic scaffold: the landing page has a strong typographic
idea, deliberate black/cream/yellow palette, evidence-led sections, responsive cards, and a clear
checkout composition. The checkout’s evidence trail and mode disclosure are especially effective for
a technical judge.

Observed quality tradeoffs:

- The checkout is a very long page. On mobile, the storefront, onboarding, request panel, timeline,
  and evidence trail are all stacked; this is readable but demanding.
- The Real testnet onboarding asks for endpoint, UFVK, birthday, and optional passphrase before a
  first request. That is honest and necessary, but not a low-friction merchant first-run.
- The real checkout is primarily a technical operator console, not a customer-facing payment page.
  The customer-facing artifact is the URI/QR, while the merchant must understand UFVKs and birthdays.
- A duplicate `<title>` appears in `examples/checkout/checkout.html:8-13`, and the standalone
  checkout route has no obvious `h1`; these are accessibility/HTML-quality issues rather than visual
  breakages.
- `ProductTour` uses a modal-like dialog but has no focus trap or explicit focus restoration
  (`examples/checkout/src/product-tour.ts:90-112`). Keyboard users can tab behind the overlay.

### P2-07 — Accessibility interaction polish is incomplete

The source has skip links, labels, live status regions, reduced-motion handling, and responsive
controls, but the tour lacks focus management and the checkout heading structure is weaker than the
landing page. These gaps reduce confidence for a polished reusable reference implementation.

**Recommendation:** add an `h1` to the standalone checkout, remove the duplicate title, implement
dialog focus capture/restore and Escape semantics consistently, and run an automated accessibility
scan on the deployed routes.

## 8. Actual end-to-end verification matrix

| Stage | Classification | Evidence / limitation |
|---|---|---|
| Merchant onboarding | Implemented and independently verified | Real browser smoke opened a view-only testnet WebZjs wallet. |
| Encrypted merchant reload | Implemented and independently verified | 4/4 merchant smoke tests plus live browser unlock/reload smoke. |
| Session creation | Implemented and independently verified | Public facade and WebZjs request WASM tests. |
| ZIP-321 URI | Implemented and independently verified | Actual `webzjs-requests@0.1.0` WASM generation/parsing. |
| QR rendering | Implemented and independently verified | QR tests and production browser screenshot/interaction. |
| Exact amount/memo matching | Implemented and independently verified | Unit/facade/memo hydration tests; historical proof. |
| Current WebZjs sync | Implemented and independently verified | Real gateway and browser sync smoke; no payment. |
| V6/current-consensus memo hydration | Implemented and historically verified | Historical transaction and compatibility proof; no fresh current payment. |
| Confirmation progression | Implemented and historically verified | Historical proof and simulation; `PAID` was not manually forced there. |
| Expiry | Implemented and simulation/unit verified | No new live late-payment test performed. |
| Reorg | Implemented but partially verified | Same-identity reorg path tested; replacement and transient hydration failure are P1 gaps. |
| Persistence/reload | Implemented and verified for valid state | Corrupt local persistence throws; multi-tab atomicity is unproven. |
| Replay prevention | Implemented and sequentially verified | Cross-session sequential replay passes; cross-tab atomicity is unproven. |
| Customer signing/broadcast | Missing by design | Sender adapter only proposes a memo-preserving transfer; it never signs/broadcasts. |
| Autonomous monitoring | Missing by design | Merchant tab/manual refresh required. |
| Fresh production settlement | Unverified | Requires explicit authorization and a dedicated funded testnet sender. |

## 9. Competition and judging audit

The official public ZECATHON page currently states that this is a Zcash privacy hackathon with five
tracks, a `$100,000` total prize pool, a 30-day build period, sealed submissions, and submissions due
**October 28, 2026 at 23:59 UTC**. The detailed tracks, rules, judges, and submission form are behind
sign-in on the official site:

<https://thezecathon.com/>

The repository’s `$15,000` Core & Tooling planning assumption in `HANDOFF.md` could not be confirmed
from the public no-sign-in page. Confirm the track-specific amount, required fields, video/deck
requirements, and eligibility in the authenticated portal before submission. Do not rely on the
planning number.

### Judge-facing strengths

- It addresses a real gap between payment request standards and merchant receipt verification.
- It has a useful reusable public SDK surface rather than only a bespoke checkout.
- It demonstrates exact memo binding, output identity, persistence, replay protection, ambiguity, and
  reorg handling in a way a judge can interact with quickly.
- It tackles a real Zcash ecosystem compatibility issue: current transaction/memo decoding behind a
  pinned WebZjs browser wallet.
- The project is unusually honest about view-only limits, historical evidence, simulation, and the
  lack of a fresh funded payment.

### Judge-facing weaknesses

- The value proposition can be mistaken for a polished checkout site unless the demo leads with the
  SDK and the request-versus-receipt problem.
- The lack of a current funded production settlement leaves the most important integration path
  partially verified.
- A judge cannot see autonomous merchant crediting, signing, broadcast, or server monitoring.
- The public gateway is free-tier infrastructure and a third-party trust/availability dependency.
- The repository contains no pitch deck or demo video artifact. `SUBMISSION_READY.md` correctly
  instructs the operator to capture a video if the portal requests it, but the portal requirements
  remain unconfirmed until sign-in.
- The stale `HANDOFF.md` weakens reproducibility confidence even though the README and submission
  briefing are substantially more accurate.

The project should be presented as a **noncustodial payment-observation and exact matching SDK**,
not as a wallet, payment processor, or complete merchant backend.

## 10. Ranked remediation backlog

### Before making a production-grade claim

1. **P1-01:** Separate transient/incomplete hydration errors from explicit reorgs and support a
   replacement payment after a confirmed reorg.
2. **P1-02:** Define and implement atomic consumed-payment claims for the intended deployment model,
   or narrow the public replay-safety claim to a single storage writer.
3. **P2-01/P2-02:** Make wallet summary failure visible and restore an explicit account selection.
4. **P2-04:** Provide safe migration/deletion guidance for legacy plaintext wallet DBs.
5. **P2-05/P2-06/P2-07:** CSP, Vite upgrade, and accessibility hardening.

### Before submission

1. Update/archive `HANDOFF.md` with the audited commit, final CI run, current production URLs, and
   current limitations.
2. Sign in to the official ZECATHON portal and verify the Core & Tooling track, exact prize,
   deadline, eligibility, and required submission fields.
3. Prepare a short judge-facing video or capture if required; show the SDK facade, simulation
   lifecycle, historical proof, and real view-only request/sync without implying a new payment.
4. Submit only the verified commit and URLs; save the portal confirmation.
5. If explicit authorization is later granted, perform one fresh, dedicated testnet payment proof
   and add it as a separate dated evidence record. Do not overwrite the historical proof.

### After submission / product roadmap

- Add server-side or durable merchant settlement callbacks and autonomous monitoring.
- Add a documented sender-wallet integration contract without custody of spending keys.
- Add multi-tab/multi-process concurrency tests and a durable ledger adapter.
- Add current-consensus-native WebZjs support when upstream is ready, reducing the compatibility
  patch/hydrator boundary.

## 11. Final recommendation

Submit only with accurate scope language. The current release is a strong Core & Tooling submission
because the SDK, ZIP-321/WebZjs integration, historical proof, persistence, replay protection, and
real view-only synchronization are all materially demonstrated. Do not state that the current public
checkout has completed a newly funded payment, that the SDK signs/broadcasts, or that it monitors in
the background.

No new transaction, faucet request, paid service, or secret-handling action was performed during this
audit. No product code was changed. The only intended local change is this audit report.

At the end of the audit, the repository was clean except for the newly created uncommitted
`GRAND_AUDIT.md` report.
