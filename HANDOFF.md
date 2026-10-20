# Zcash Payment Sessions — Build Handoff

**Updated:** 2026-10-20  
**Purpose:** Give a fresh model/developer enough verified context to finish the project safely, validate it, deploy the correct build, and prepare the competition submission.  
**Read this first.** This is an operational handoff, not proof that every service is still live. Re-check current GitHub Actions, Vercel, Render, and the official challenge rules before making release claims.

## 1. Mission and finish line

Build and submit **Zcash Payment Sessions (ZPS)** for the **ZECATHON Core & Tooling** track. The project is a TypeScript SDK plus a browser reference checkout that turns ZIP-321 payment requests into exact, persistent, replay-safe payment sessions.

Planning context from the current project: the target prize opportunity is understood as **$15,000**, with a deadline understood as **2026-10-28**. Verify the official challenge page and submission form for the current rules, exact deadline/time zone, required artifacts, and category eligibility. Do not assume these details are unchanged.

The final product must have all of these:

1. The SDK's matching, persistence, expiry, confirmation, reorg, and replay protections remain correct and tested.
2. A reviewer can understand the problem and product quickly, inspect the source, and run the browser demo.
3. Real testnet mode uses a verified browser-compatible testnet endpoint and a view-only wallet. It must never imply that a simulated payment is an on-chain payment.
4. The public production site is actually built from the validated source branch, has the required cross-origin isolation headers, and is browser-tested after deployment.
5. README, reviewer guide, threat model, historical proof, demo/video, and submission form agree with what the product actually does.
6. No new payment, spending key, paid infrastructure, or destructive Git action is performed without explicit authorization.

## 2. Repository and source-of-truth branches

Repository: https://github.com/Iniwura/zcash-payment-sessions

| Branch | Last observed commit | Role |
|---|---|---|
| **feat/live-testnet-checkout** | **b97dee28dd6aa7815eae056e7f851e97f0ed8690** | **Active working branch / current source of truth for the live-testnet checkout.** Its parent **a8654771920117bbc7f395bbca2fe3d090981784** merged gateway files into this feature branch. |
| **main** | **820db80809c28203d66cc19a18fcd0e8ac3c2775** | GitHub default branch when last checked. It predates the active live-testnet work; do not assume it contains the current feature or deploys it. |
| **feat/free-testnet-gateway** | **ceaec6dbcc8770bf969785dd4e82e254f91f31f7** | Separate branch used by the Render gateway configuration. The Render Blueprint in render.yaml names this branch. |
| **audit/production-browser-20261014** | **8978a4862761dbe2dcfff0f0c3774da478ba90f0** | Temporary production-browser audit branch. Use it as a reference for re-auditing production; do not merge it wholesale without reviewing its diff. |
| **vercel-static** | **4edd469f38fdf3a30d7b01ce126d303e16a4fbfd** | Generated static output pushed by the deployment workflow. **Do not hand-edit this branch**; it is a build artifact. |

These SHAs are a snapshot from the last repository inspection, not immutable instructions. Before editing, inspect the actual refs and local working tree. Do not overwrite uncommitted work. Start from **feat/live-testnet-checkout**, not main, unless a fresh comparison proves the branch layout has changed.

Useful links:
- Active feature branch: https://github.com/Iniwura/zcash-payment-sessions/tree/feat/live-testnet-checkout
- Main branch: https://github.com/Iniwura/zcash-payment-sessions/tree/main
- Gateway branch: https://github.com/Iniwura/zcash-payment-sessions/tree/feat/free-testnet-gateway
- Live-testnet verification workflow: https://github.com/Iniwura/zcash-payment-sessions/actions/workflows/verify-live-testnet-checkout.yml
- Main deployment workflow: https://github.com/Iniwura/zcash-payment-sessions/actions/workflows/deploy-demo.yml

## 3. Current verified status — important

### Latest live-testnet integration run

Latest observed feature-branch run at handoff time:

https://github.com/Iniwura/zcash-payment-sessions/actions/runs/38736701643

It ran on **b97dee28dd6aa7815eae056e7f851e97f0ed8690** on **2026-10-15** and finished **FAILURE**, but the failure was late in browser acceptance, not in the SDK tests or real-wallet smoke.

**Passed in that run:**
- WebZjs bootstrap and current-consensus Sapling memo-hydrator WASM build.
- SDK typecheck, TypeScript build, full Vitest suite, consumer smoke test, and checkout typecheck.
- Testnet-enabled checkout build with the memo-hydrator JS/WASM artifacts.
- Real testnet browser wallet smoke test, using an ephemeral view-only testnet identity and sending no funds.
- The smoke log reported **UPSTREAM_OK chain=testnet height=4504869**, **WALLET_OK view_only=1 zip321=1 recipient=testnet**, and **SYNC_OK real_browser_wallet=1, no_payment_sent=1**.

**Current known blocker:**
- The separate **Browser acceptance (simulation regression)** step failed in **scripts/browser-checkout-smoke.py**.
- Playwright expected the **#session-badge** to become **PAID** after clicking **#guide-run**, but after its timeout the actual text was **READY**.
- This is the next engineering task. Reproduce it, inspect the mode/runtime/session state and browser logs around the guided flow, then fix the underlying race or behavior. Asynchronous simulation-mode initialization is one possibility to investigate, but the CI trace alone does **not** prove the root cause.
- Do **not** weaken the PAID assertion or make the browser test pass by bypassing the SDK-backed lifecycle. The guide must really create a session and drive the public SDK simulation through the expected states.

An earlier run failed the **NO FUNDS TRANSFERRED** disclosure assertion. Commit **b97dee...** explicitly addressed that wording, and the later run got through the unit/interface-contract tests, so it is **not the latest known blocker**.

There has been no later successful feature-branch verification observed in this handoff snapshot. Re-check Actions now before assuming this status remains current.

### Production is not yet proven to match the feature branch

Production URL: https://zcash-payment-sessions.vercel.app/  
Fallback GitHub Pages demo: https://iniwura.github.io/zcash-payment-sessions/

A temporary production browser audit passed on 2026-10-14:
https://github.com/Iniwura/zcash-payment-sessions/actions/runs/38613851465

It observed HTTP 200, **crossOriginIsolated === true**, no browser/network errors, and basic checkout acceptance at 1440px and 390px. However, the audit also printed that the public site's default testnet endpoint was **http://127.0.0.1:18080**. That localhost default is unusable for an ordinary public visitor. The current feature branch's **examples/checkout/src/testnet-config.ts** instead defaults to:

**https://zps-testnet-gateway.onrender.com**

Therefore, **do not claim the current real-testnet checkout is deployed until the actual production page has been re-tested**. The production audit was from an older build. The main deployment workflow only triggers on main; pushing to feat/live-testnet-checkout runs the feature verification workflow but does not itself prove that Vercel or GitHub Pages received that build.

### Public Render gateway

- Expected URL: https://zps-testnet-gateway.onrender.com/
- Health endpoint: https://zps-testnet-gateway.onrender.com/healthz
- GET /healthz returns “gateway process online (does not prove upstream health).” This only proves Envoy is responding; it is **not** evidence that Zcash testnet RPC works.
- The latest observed browser integration run did verify a real GetLightdInfo RPC through the gateway and observed a testnet chain tip at height **4504869** on 2026-10-15. This is historical verification, not a guarantee of current upstream availability.
- Run **python3 gateway/verify-upstream.py** again before release. It checks /healthz, a gRPC-Web GetLightdInfo response, CORS for the production origin, and that the response identifies testnet.
- **render.yaml** specifies the **feat/free-testnet-gateway** branch, Dockerfile **gateway/Dockerfile**, Free plan, **/healthz**, and **autoDeployTrigger: 'off'**. Confirm the actual Render dashboard settings and manually deploy if required. Do not upgrade to a paid plan without authorization.
- **gateway/README.md** contains stale statements saying the gateway is not deployed/validated and describing the old localhost default. After checking the live service, update those docs so they clearly distinguish process health, upstream RPC verification, free-tier availability, and the limits of the service.

## 4. Product behavior and invariants — do not regress

The project is not a wallet and does not custody, sign, or broadcast payments. It is an application-layer payment matcher around ZIP-321 and WebZjs observations.

Core lifecycle:

```text
AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID
```

Required invariants:

- Match an unambiguous payment to the exact expected amount **and** memo.
- Use the stable payment identity **txid:pool:output-index**.
- A payment must not satisfy two sessions or be credited twice after refresh/reload. The consumed-payment ledger must persist.
- PAID requires the configured confirmation threshold; the checkout currently configures two confirmations.
- Expired sessions never revive due to a late payment.
- Ambiguous exact candidates fail closed; do not select one arbitrarily or credit it.
- A reorg must be represented as REORGED; never silently preserve a stale confirmation/credit.
- Missing V6 Sapling memo data can be hydrated by the opt-in browser-compatible current-consensus WASM module. Treat hydrated data as evidence only after checking transaction ID, height, output index, recipient, and value. Missing, malformed, stale, undecryptable, or mismatched evidence must remain no-match.
- Simulation and real testnet use separate storage namespaces. Never restore a simulated payment into the real wallet/session store.
- Real mode accepts only a testnet view-only UFVK plus an explicit account birthday height. No seed phrase, mnemonic, spending key, or private key is accepted. Viewing material is sensitive too: never print it, commit it, put it in URLs, or send it to the gateway. The input is cleared after wallet opening attempts, including failures.
- Simulation must be unmistakably labelled and must never be presented as an on-chain transaction.
- The testnet sender/proof tools are not a reason to send another payment. The existing historical transaction is enough evidence unless the user explicitly authorizes another payment.

## 5. Architecture and important files

### SDK

- **src/index.ts** — public facade and exported SDK surface.
- **src/session.ts** — payment session creation/state.
- **src/monitor.ts** — exact matching, confirmation progression, replay and reorg behavior.
- **src/storage.ts / src/persistence.ts** — session state and consumed-payment persistence.
- **src/browser-wallet.ts / src/wallet.ts** — WebZjs browser-wallet adapter and received-payment observations.
- **src/zip321.ts** — ZIP-321 URI generation/parsing integration.
- **src/memo-hydration.ts** and **wasm/sapling-memo-hydrator/** — current-consensus Sapling memo hydration boundary.
- **src/sender.ts** — ZIP-321 sender adapter; sending is not part of the public browser payment-monitor flow.
- **tests/** — SDK, wallet, storage, monitor, interface contract, and browser-related tests.
- **patches/** — tracked compatibility patches against the pinned WebZjs source.

### Reference checkout / frontend

- **examples/checkout/index.html** — single-page editorial product site and checkout structure.
- **examples/checkout/src/main.ts** — browser runtime, mode selection, real wallet setup, session controls, guided simulation, rendering.
- **examples/checkout/src/controller.ts** — UI controller around the public SDK facade.
- **examples/checkout/src/reviewer-session.ts** — harmless sample session for the guided simulation.
- **examples/checkout/src/simulated-wallet.ts** — test-only simulation adapter.
- **examples/checkout/src/testnet-config.ts** — default public gRPC-Web endpoint and birthday parsing.
- **examples/checkout/src/testnet-hydrator.ts** — loads the real current-consensus memo hydrator.
- **examples/checkout/src/runtime-capabilities.ts** — gates real mode based on browser cross-origin isolation.
- **examples/checkout/src/style.css** — visual system and responsive/motion treatments.
- **tests/interface-contract.test.ts** — checks that HTML control IDs, navigation sections, scenarios, evidence, safety disclosure, responsive breakpoints, reduced motion, and skip link remain present. Fix the app or update the test with a reasoned contract change; do not remove it to hide a regression.

### Deployment / infrastructure

- **.github/workflows/verify-live-testnet-checkout.yml** — feature-branch integration build/test and browser acceptance.
- **.github/workflows/deploy-demo.yml** — main-branch build, GitHub Pages deployment, and generated vercel-static branch.
- **vercel.json** — COOP/COEP/CORP headers needed for browser WASM/thread isolation.
- **gateway/Dockerfile**, **gateway/envoy.yaml**, **gateway/verify-upstream.py** — testnet-only Envoy gRPC-Web proxy.
- **render.yaml** — Render service blueprint. Check the actual service dashboard before relying on blueprint values.

## 6. Historical on-chain proof — cite accurately

**LIVE_TESTNET_PROOF.md** is the authoritative record of the already-authorized historical testnet payment. It records:

- Session: **50fd77e4-34bd-4508-b651-578e14f121cb**
- Amount: **10,000 zatoshis** (0.0001 TAZ)
- Canonical transaction ID: **81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc**
- Mined height: **4490144**
- Observation tip at the recorded verification: **4490233** (90 confirmations at that time)
- Lifecycle reached PAID through the public SDK's refresh path; reload/persistence and duplicate-credit/replay checks were recorded.

Read the full file before editing or presenting this proof. It is **historical evidence**, not a live dashboard, current chain tip, or guarantee that the gateway is available now. Do not claim a new transaction occurred. Do not repeat the payment or request more faucet funds.

Other essential docs:
- **docs/THREAT_MODEL.md** — security assumptions, privacy boundary, and known limitations.
- **docs/REVIEWER_GUIDE.md** — reviewer walkthrough. Review it against the current UI: it still begins with simulation, while the isolated Vercel experience is intended to default to Real testnet.
- **README.md** — install/build commands, public SDK usage, architecture, links, testnet setup, and limitations.

## 7. Reproducible development setup and commands

Use Node **24.18.0** for parity with the GitHub Actions workflow. The project builds pinned local WebZjs packages; do not replace them with unpinned published packages or assume **.deps/WebZjs** already exists.

Required native/Rust tools used by CI:
- clang
- just 1.58.0
- wasm-pack 0.13.1
- Rust nightly **nightly-2025-01-07**, with rust-src and wasm32-unknown-unknown, for the pinned WebZjs build
- Rust stable **1.89.0** with wasm32-unknown-unknown for the current-consensus hydrator

From a clean clone, follow the repository README and run the pinned bootstrap first:

```bash
npm run bootstrap:webzjs
bash scripts/build-sapling-memo-hydrator.sh

npm run typecheck
npm run build
npm test
npm run test:consumer
npm run demo:typecheck
GITHUB_ACTIONS=false npm run demo:build
```

**npm run bootstrap:webzjs** prepares the pinned local WebZjs checkout, applies the tracked compatibility patches, builds the required packages, and installs the local runtime dependencies. Generated WASM/build output is disposable and intentionally not committed. If setup fails, read the exact error and follow README.md; do not change pinned dependencies just to make setup quicker.

Useful additional checks:

```bash
npm run verify:reproducibility
python3 gateway/verify-upstream.py
```

The browser acceptance script **scripts/browser-checkout-smoke.py** uses a system Chrome/Chromium binary and the preview server at **127.0.0.1:4173**. In CI, Playwright 1.55.0 is installed in an isolated Python virtual environment. The live-wallet smoke script **scripts/browser-live-testnet-smoke.py** uses **127.0.0.1:5173**, an ephemeral /tmp view-only UFVK created by **scripts/ci-create-testnet-viewing-key.mjs**, and the public Render endpoint. It is designed to send no funds. Prefer running the existing workflow for a reproducible end-to-end check instead of manually creating key material.

## 8. Ordered execution plan — finish the build in this order

### P0 — Fix the one failing acceptance test

1. Checkout/inspect **feat/live-testnet-checkout**; verify there are no user changes to overwrite.
2. Open the latest run **38736701643** and read the complete job log.
3. Reproduce **scripts/browser-checkout-smoke.py** locally or in CI. Add temporary diagnostic logging/screenshots if needed for **#mode-badge**, **#guide-status**, **#session-badge**, **#error-message**, page errors, and the state immediately before/after the **#guide-run** click.
4. Determine why the guided simulation ends at READY rather than PAID. Inspect the interaction between asynchronous mode selection, **createSimulationRuntime()**, **prepareReviewerSession()**, **runGuidedCheckout()**, **createSession()**, **runScenario()**, and rendering. The test should wait for actual readiness where appropriate, but only after verifying whether the application or test has the race.
5. Fix the underlying cause. Keep the acceptance guarantees: generated ZIP-321 request/QR, guided PAID, confirmation count, persistence after reload, REORGED behavior, ambiguity fail-closed behavior, and no uncaught browser errors.
6. Re-run the full feature workflow until it is green. Do not mark P0 complete based only on local unit tests.

### P1 — Re-verify the real testnet gateway and browser mode

1. Run **python3 gateway/verify-upstream.py**. Do not substitute /healthz for the RPC test.
2. Check the real testnet browser smoke from the workflow: ephemeral view-only wallet only, explicit birthday, real browser crossOriginIsolated === true, ZIP-321 URI generation, wallet sync/refresh, cleared UFVK input, no funds sent.
3. Investigate any upstream/gateway errors before UI changes. Render Free may sleep or be limited; distinguish cold-start behavior from a broken gateway.
4. Confirm the production origin is allowed by CORS and the proxy only exposes the intended CompactTxStreamer routes. Do not turn it into a generic arbitrary-target proxy.

### P2 — Clean up docs and product truth

1. Update **gateway/README.md** after verifying current Render status; remove stale “not deployed” and localhost-default claims if no longer true. Be explicit that /healthz is process-only and that the free gateway has no uptime guarantee.
2. Update **docs/REVIEWER_GUIDE.md** to match the current flow: Real testnet first on an isolated production deployment; simulation for safe deterministic edge-case walkthroughs; historical proof as separate recorded evidence.
3. Review **README.md**, **LIVE_TESTNET_PROOF.md**, **docs/THREAT_MODEL.md**, and UI disclosure text for consistency. State what is tested, what is historical, and what is experimental.
4. Keep the **NO FUNDS TRANSFERRED** disclosure visible in the simulation controls and the UI-contract test green.

### P3 — Visual and interaction quality review

The user's quality bar is a premium, design-led, competition-ready experience. The reference is https://mobius.framer.website/ as a **quality benchmark**, not a template to copy.

The active feature branch already contains an original editorial direction: warm paper background, near-black typography, restrained acid-yellow accent, custom layered payment-request artwork, precise grid/type hierarchy, and a real interactive checkout. Do not throw this away or replace it with a generic crypto dashboard. Inspect actual screenshots before changing the design.

Review the production/preview at **1440×900, 1024px, 768px, 390×844, and 375px**. Check:
- no horizontal overflow, clipped controls, unreadable type, broken QR, overlapping nav, or huge dead zones;
- the hero explains the product quickly and the CTA leads to a working interaction;
- the live proof is clearly marked historical, with the transaction ID and proof file link;
- Real testnet vs Developer simulation is unmistakable at every relevant state;
- visible loading/error/empty/success states, keyboard focus, skip link, semantic labels, and reduced-motion support;
- real checkout, simulation controls, reset, expiry, refresh, reload, reorg, ambiguity, and duplicate/replay demonstrations actually work;
- browser console and network are clean, and the public endpoint is not localhost.

Use real browser screenshots and inspect them at full size. A successful build or a screenshot artifact alone is not a visual approval. Keep motion purposeful and restrained; respect prefers-reduced-motion. Preserve the safety and accessibility contract while polishing visuals.

### P4 — Release and production verification

1. First get the active feature branch workflow green and review the full diff.
2. Compare **feat/live-testnet-checkout** against **main**. The deploy workflow **.github/workflows/deploy-demo.yml** triggers on main, not the feature branch. Merge through the repository's normal safe process only after checks pass; do not force-push or overwrite branches.
3. Watch the main deployment workflow to completion. It builds/tests, publishes GitHub Pages, and pushes compiled files to **vercel-static**.
4. Verify the actual Vercel project configuration and deployment source. The project has had a separate/static-artifact workflow; do not assume a successful GitHub Actions run means Vercel deployed the same commit. Redeploy through the supported configuration if necessary, without changing secrets or billing.
5. Check the production page itself:
   - HTTP 200.
   - crossOriginIsolated === true.
   - COOP same-origin and COEP require-corp headers present.
   - Real testnet is selected by default when isolation is available.
   - The default endpoint is exactly **https://zps-testnet-gateway.onrender.com**, not 127.0.0.1 or localhost.
   - Browser wallet smoke opens/syncs against current testnet without a payment; simulation still works and is clearly labelled.
   - No console/page errors, no 5xx responses, no mobile horizontal overflow.
6. Re-run the production browser audit after deployment and inspect the desktop/mobile screenshots. The previous audit is useful history, not current proof.
7. Verify the Render dashboard's deployed commit/config separately. Its Blueprint says auto-deploy is off. Re-run the upstream RPC check after deployment and after any relevant configuration change.
8. If production does not match the validated source, stop and fix the deployment path before claiming completion.

### P5 — Competition/submission readiness

Before submitting:
- Re-open the official ZECATHON challenge page and submission form. Confirm current rules, deadline/time zone, Core & Tooling eligibility, required repo/demo/video/social links, and any restrictions.
- Ensure the public repo's default branch includes the validated source, not just the handoff or an older build. Make the README's quick start reproducible from a clean clone.
- Provide a reviewer-friendly live link, source link, architecture, test commands, historical proof, threat model, and a short walkthrough that reflects the actual UI.
- Confirm the demo video and any required social post exist and link to the final build. Do not invent or reuse a link from another project.
- Make submission claims conservative and verifiable. Do not describe simulation as real payment, historical proof as a new transaction, /healthz as upstream health, or the Render Free gateway as high-availability infrastructure.
- Do a final clean-clone test, final green Actions check, production smoke test, and link check before the deadline.

## 9. Security and operational non-negotiables

- Never request, accept, log, commit, or transmit a seed phrase, mnemonic, spending key, private key, or real-funds credential.
- Never print or commit the view-only UFVK used by a real wallet. Even a UFVK is privacy-sensitive.
- Do not send a new testnet payment, request more faucet funds, or run sender/proof tools that broadcast without explicit user authorization.
- Do not use real mainnet addresses or mainnet endpoints in the demo. Keep this testnet-only.
- Do not expose arbitrary upstream URLs through the public Envoy gateway.
- Do not silence failing assertions, remove regression tests, disable type checking, or bypass the SDK to create a fake PAID state.
- Do not deploy an unverified feature branch to production just because the deadline is near.
- Do not buy a paid Render plan or add paid services without authorization.
- Preserve the historical evidence and explain limitations honestly.

## 10. Quick reference links

- Repository: https://github.com/Iniwura/zcash-payment-sessions
- Active branch: https://github.com/Iniwura/zcash-payment-sessions/tree/feat/live-testnet-checkout
- Production site: https://zcash-payment-sessions.vercel.app/
- GitHub Pages fallback: https://iniwura.github.io/zcash-payment-sessions/
- Render gateway: https://zps-testnet-gateway.onrender.com/
- Gateway health endpoint (process only): https://zps-testnet-gateway.onrender.com/healthz
- Latest observed live-testnet CI run (failed simulation acceptance): https://github.com/Iniwura/zcash-payment-sessions/actions/runs/38736701643
- Earlier production browser audit (passed basic checks but found localhost endpoint): https://github.com/Iniwura/zcash-payment-sessions/actions/runs/38613851465
- Historical on-chain proof: https://github.com/Iniwura/zcash-payment-sessions/blob/feat/live-testnet-checkout/LIVE_TESTNET_PROOF.md
- Threat model: https://github.com/Iniwura/zcash-payment-sessions/blob/feat/live-testnet-checkout/docs/THREAT_MODEL.md
- Reviewer guide: https://github.com/Iniwura/zcash-payment-sessions/blob/feat/live-testnet-checkout/docs/REVIEWER_GUIDE.md
- Design benchmark: https://mobius.framer.website/

**The next model's first task is P0: diagnose and fix the failing simulation browser acceptance, then rerun the complete integration workflow. Do not start with a visual rewrite or a production deploy.**
