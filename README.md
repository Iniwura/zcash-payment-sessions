# Zcash Payment Sessions

Zcash Payment Sessions provides durable application-level payment sessions backed by ZIP-321
request generation and exact received-output observation from WebZjs.

## Reproducible WebZjs setup

The repository does not depend on a sibling checkout or on published WebZjs packages. The
bootstrap script creates an ignored `.deps/WebZjs` checkout at the exact pinned commit, applies
the tracked compatibility patch, builds only `webzjs-requests` and `webzjs-wallet`, verifies the
generated package names and versions, and installs the local packages with `npm ci`.

Prerequisites:

- Node.js `22.12.0` or newer (the current Vitest release requires Node 22.12+, 24.x, or 26.x)
- npm
- Git
- `clang`
- `just`
- `wasm-pack`
- `rustup` and `cargo`
- Rust nightly `nightly-2025-01-07` with `wasm32-unknown-unknown` and `rust-src`

The script never changes the global Rust default and never invokes `sudo`. If a prerequisite is
missing, it stops with the exact local installation command to run.

From a clean clone:

```sh
npm run bootstrap:webzjs
```

The source patch is [patches/webzjs-wallet-received-payments.patch](patches/webzjs-wallet-received-payments.patch).
It adds the exact received-output API needed by the payment matcher while leaving the pinned
WebZjs checkout untracked and disposable. Generated WASM artifacts are intentionally not
committed.

To verify the checkout without rebuilding it:

```sh
npm run verify:reproducibility
```

## Development

```sh
npm test
npm run typecheck
npm run build
npm run test:consumer
```

The package facade is emitted to `dist/` and is exposed through the package `exports` map. The
consumer smoke test imports the built package by name, matching third-party consumption rather
than importing source internals.
