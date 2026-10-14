# ZPS free testnet browser gateway (experimental)

**Not yet deployed or validated against Zcash testnet.**

This directory packages official Envoy gRPC-Web translation to bridge the browser
wallet's gRPC-Web calls to the community-maintained `testnet.zec.rocks:443`
CompactTxStreamer gRPC server. This is a **transport proxy**, not a wallet, node,
payment matcher, signing service or payment watcher. It does not take a seed,
spending key, or viewing key.

It deliberately exposes only
`/cash.z.wallet.sdk.rpc.CompactTxStreamer/*` and `/healthz` to the internet.
It fixes the upstream hostname, verifies its TLS certificate, and permits CORS
only from the production site and listed local development origins. The
`/healthz` response checks only the Envoy process, **not** testnet reachability.

## Free host

A root `render.yaml` describes one Render Free Docker web service. Render may
sleep after 15 minutes idle, may take ~1 minute to wake, has monthly usage
limits, and can suspend traffic-heavy free services. It cannot be represented
as production-grade availability. If Render asks for a paid plan, do not accept
it without the user's authorization.

To deploy: connect the Render app to ChatGPT, or connect the GitHub repository
from Render's Blueprint screen, choose this branch `feat/free-testnet-gateway`
and **Free** service plan, then inspect the resulting settings before enabling.
Do not enter wallet material as environment variables.

## Acceptance criteria after deployment

1. `GET https://<real-host>/healthz` returns HTTP 200.
2. A browser-origin `OPTIONS` preflight succeeds only for the canonical
   `https://zcash-payment-sessions.vercel.app` origin.
3. A real gRPC-Web `GetLightdInfo` call returns chain `test` and a plausible
   current block height. HTTP 200 from `/healthz` **does not** prove this.
4. Rejects unrelated URLs, upstream redirects, and mainnet use.
5. A browser wallet with **dedicated throwaway testnet viewing material**
   imports, synchronizes, and persists, then the real current-consensus memo
   hydrator is integrated and tested on the documented real-chain fixture.
6. An actual testnet transfer demonstrates correct memo, exact amount,
   confirmations and replay prevention with on-chain evidence.

Until all tests pass, leave the existing public site untouched and keep the
real testnet option described as experimental, not ready.

## Notes

- The existing WebZjs browser wallet currently requires an explicit testnet
  UFVK and birthday, and the app's default endpoint is localhost.
- It also currently lacks the opt-in current-consensus Sapling memo hydrator
  on the browser integration path. A working gateway alone will **not**
  solve that missing-memo problem.
- Wallet viewing material should remain client-side. A public RPC operator
  can observe IPs and requested chain ranges, and full transaction requests
  can reveal interest in a particular transaction.
- A shared public gateway can be abused or hit rate/traffic limits; a public
  URL is not evidence of a hardened production service.
- Root Vercel deployment, normal GitHub Actions and main SDK are unchanged.

References:
- Render Free plan: https://render.com/docs/free
- Envoy gRPC-Web: https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/grpc_web_filter.html
- Zcash community endpoints: https://forum.zcashcommunity.com/t/current-ways-to-connect-to-grpc-in-the-zcash-stack-lwd-zaino-zebrad-zakura-ztreamer/57539
