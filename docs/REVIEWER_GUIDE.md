# Reviewer guide

This is a three-minute walkthrough for the reference checkout.

## 0:00 — The problem

ZIP-321 describes what a wallet should pay. It does not give a merchant an exact, persistent,
replay-safe payment lifecycle. Zcash Payment Sessions (ZPS) adds that missing stateful layer.

## 0:20 — Choose your evaluation path

The reference checkout provides two complementary modes:

### Path A: 30-second Developer Simulation (No wallet or funds required)
If you do not have a testnet UFVK or testnet coins, switch the mode toggle to **Developer simulation**:
1. Click **Run the guided simulation ↗** at the top.
2. The public SDK immediately generates a valid ZIP-321 request and renders the QR code.
3. The simulator steps through:
   ```text
   AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID
   ```
4. Verify reload safety: Refresh your browser tab ($F5$). The session stays **PAID** with exact confirmation count restored from persistent storage.
5. Explore edge cases: Expand **Explore edge cases** to test an on-chain **Reorg**, **Ambiguous match**, or **Duplicate credit prevention**.

### Path B: Real Zcash Testnet (View-only observation)
When opened in a cross-origin isolated environment (such as the Vercel production deployment), the checkout defaults to **Real testnet**:
1. The verified public gRPC-Web gateway (`https://zps-testnet-gateway.onrender.com`) is pre-filled.
2. Enter a testnet Unified Full Viewing Key (UFVK) and an account birthday height.
   *(Note: The checkout accepts only view-only keys; spending keys and seed phrases are strictly forbidden and never accepted).*
3. Click **Open view-only wallet ↗**. The browser initializes WebZjs in an isolated WASM worker thread and attaches the local current-consensus Sapling memo hydrator.
4. Create a payment request and observe live on-chain status changes as shielded transactions are broadcast and mined.

## 1:15 — Exact binding & replay protection

The payment monitor does not rely on transaction hashes alone. It binds to the composite identity:
```text
txid + pool + output_index
```
Once an output is credited, it is recorded in the **consumed-payment ledger**. The same output cannot satisfy two sessions or be credited twice.

## 1:45 — Verified on-chain proof

Open [LIVE_TESTNET_PROOF.md](../LIVE_TESTNET_PROOF.md) to inspect the recorded historical testnet payment:
- **Canonical transaction ID:** `81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc`
- **Output index / Pool:** Sapling output `0` (`10,000` zatoshis)
- **Mined height:** `4490144` (90 confirmations at recorded observation)
- **Exact memo recovered:** Local trial decryption via current-consensus WASM hydrator.

## 2:30 — Public SDK integration

The public surface is concise and modular:
```ts
import { ZcashPaymentSessions } from "zcash-payment-sessions";

const sdk = await ZcashPaymentSessions.create({
  storage: localStorage,
  recipientAddress: "ztestsapling1...",
  wallet: browserWallet,
  accountId: 1,
  requiredConfirmations: 2
});

const session = await sdk.createSession({
  amountZatoshis: 10_000n,
  memo: "order-123",
  expiresInMs: 2 * 60 * 60 * 1000
});

const result = await sdk.refresh(session.id);
```

## 2:50 — Security & boundaries

Read the [threat model](THREAT_MODEL.md) for full details on client-side isolation, UFVK handling, and public transport boundaries.
