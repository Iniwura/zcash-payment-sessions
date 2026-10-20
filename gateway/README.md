# ZPS free testnet browser gateway (experimental)

**Deployed and validated against Zcash testnet.**

This directory packages official Envoy gRPC-Web translation to bridge the browser
wallet's gRPC-Web calls to the community-maintained `testnet.zec.rocks:443`
CompactTxStreamer gRPC server. This is a **transport proxy**, not a wallet, node,
payment matcher, signing service or payment watcher. It does not accept or process a seed,
spending key, or private key.

It deliberately exposes only
`/cash.z.wallet.sdk.rpc.CompactTxStreamer/*` and `/healthz` to the internet.
It fixes the upstream hostname, verifies its TLS certificate, and permits CORS
only from the canonical production site (`https://zcash-payment-sessions.vercel.app`)
and listed local development origins.

## Operational endpoints

- **Gateway URL:** `https://zps-testnet-gateway.onrender.com/`
- **Health check:** `https://zps-testnet-gateway.onrender.com/healthz`
- **Upstream target:** `testnet.zec.rocks:443` (TLS gRPC)

> [!NOTE]
> The `/healthz` HTTP 200 response proves only that the Envoy proxy process is alive.
> It does **not** prove upstream testnet reachability. Full upstream RPC health must be
> verified via `python3 gateway/verify-upstream.py`.

## Free host characteristics

The gateway is hosted on a Render Free Docker web service described in `render.yaml`.
Reviewers and integrators should note:
- Render Free instances spin down after 15 minutes of inactivity and take ~30–60 seconds to cold-start.
- It operates with free-tier bandwidth and connection limits; it is not high-availability enterprise infrastructure.
- In the reference checkout, `https://zps-testnet-gateway.onrender.com` is configured as the default testnet endpoint. Users can override this field with their own private gRPC-Web proxy if desired.

## Verification scripts

Before release, the gateway was verified with two automated scripts:

1. **`python3 gateway/verify-upstream.py`**:
   - Sends a raw gRPC-Web `GetLightdInfo` frame to the gateway.
   - Confirms HTTP 200, CORS header for the production origin, and decodes the protobuf response.
   - Verifies that `chain_name` starts with `test` and tip height is > 4,400,000.

2. **`python3 gateway/verify-historic-transaction.py`**:
   - Queries `GetTransaction` for canonical testnet transaction `81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc` at height 4,490,144.
   - Verifies that raw transaction bytes (2,378 bytes) are retrieved intact through the proxy.

## Architecture notes

- The browser checkout pairs this transport proxy with the local, browser-compatible **current-consensus Sapling memo hydrator WASM** (`wasm/sapling-memo-hydrator`), solving the V6 compact transaction decoding limitation without altering upstream WebZjs packages.
- Viewing material (UFVK) remains client-side in browser memory only. The proxy never inspects, logs, or stores viewing keys.
