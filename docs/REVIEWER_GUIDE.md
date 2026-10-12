# Reviewer guide

This is a three-minute walkthrough for the reference checkout.

## 0:00 — The problem

ZIP-321 describes what a wallet should pay. It does not give a merchant an exact, persistent
payment lifecycle. Zcash Payment Sessions adds that layer.

## 0:20 — Create a request

Open the public reference checkout in **Demo simulation** mode. Enter an amount and a correlation
memo, then select **Create payment session**. The page shows the amount, recipient, expiry, QR,
and generated ZIP-321 URI. The simulation is explicitly labeled and never broadcasts.

## 0:50 — Exact binding

The matcher binds a session to the exact amount and memo. Once observed, it records the stable
payment identity: `txid + pool + output index`.

## 1:15 — State machine

Use the simulation controls in order:

```text
AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID
```

The same controls also demonstrate ambiguity, reorg, and expiry. The public SDK, not a UI-only
state switch, produces each transition.

## 1:40 — Live evidence

Open [LIVE_TESTNET_PROOF.md](../LIVE_TESTNET_PROOF.md). It records the authorized testnet session,
ZIP-321 request, exact memo hydration, canonical and WebZjs transaction IDs, mined height,
confirmations, and the final `PAID` result.

## 2:00 — Reload and replay safety

The live proof reloads the serialized wallet and session, repeats refresh idempotently, verifies the
consumed-payment ledger, and shows that the same payment cannot satisfy a second session.

## 2:30 — Integration surface

The public entry point is `ZcashPaymentSessions.create(...)`. Applications provide storage, a
recipient address, and a WebZjs-compatible wallet adapter. `createSession(...)` returns a ZIP-321
URI; `refresh(sessionId)` returns the persisted session and observation outcome.

## 2:50 — Close

This is reusable browser infrastructure for exact, replay-safe Zcash payment correlation. Read the
[threat model](THREAT_MODEL.md) for the memo-hydration and public-endpoint limitations.
