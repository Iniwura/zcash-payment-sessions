# Documentation index

Start with the [project README](../README.md). This directory keeps focused technical, judging and historical material rather than competing copies of the project overview.

| Document | Purpose |
| --- | --- |
| [Reviewer guide](REVIEWER_GUIDE.md) | Three-minute evaluation path: SDK, simulation, real testnet observation and historical proof |
| [Release evidence](RELEASE_EVIDENCE.md) | Specific validated commits, GitHub Actions results and the production artifact |
| [Threat model](THREAT_MODEL.md) | Exact payment safeguards, privacy boundaries and deployment limitations |
| [Historical funded testnet proof](../LIVE_TESTNET_PROOF.md) | Actual session, output, memo, confirmations, reload and replay evidence |
| [Gateway documentation](../gateway/README.md) | Free gRPC-Web proxy deployment, health checks and trust caveats |
| [SDK source](../src/) | The reusable TypeScript implementation |
| [Browser checkout source](../examples/checkout/) | Reference UX, real view-only wallet, payment requests and receipts |
| [Reproducibility scripts](../scripts/) | Pinned WebZjs setup, Rust/WASM build and integration checks |

## Historical archive

The files in [archive/](archive/) are **dated engineering records**, not current release instructions:

- [Pre-remediation grand audit](archive/GRAND_AUDIT.md)
- [Old operational handoff](archive/HANDOFF.md)
- [Earlier submission briefing](archive/SUBMISSION_READY.md)

They have been preserved for provenance. Their old branch, CI, security, and submission statements may no longer describe the merged production code. Always prefer the current README, live testnet proof, and latest Actions results.

## Repository conventions

- Product and SDK code are under `src/`; `examples/checkout/` is a reference client.
- Generated WebZjs and WASM dependencies are **not committed**; pinned bootstrap scripts reconstruct them.
- Never commit viewing keys, seeds, passphrases, full local wallet databases, or environment secrets.
- The `vercel-static` branch is generated deployment output, not a second source of truth. The public checkout alias is promoted only after verification.
- Release and evidence claims must distinguish **simulation**, **historical funded testnet settlement**, and **current public testnet synchronization**.
