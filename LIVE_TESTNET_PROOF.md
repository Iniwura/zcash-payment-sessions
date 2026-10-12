# Live Testnet Payment Proof

This record contains one authorized testnet payment and the compatibility findings that shaped the
adapter. It does not authorize or perform another payment.

## Primary result

- Session: `50fd77e4-34bd-4508-b651-578e14f121cb`
- Amount: `10,000` zatoshis (`0.0001 TAZ`)
- Exact memo: `zps-final-live-2026-10-11T23:00:00.000Z-6d8ff56e-49e7-45da-9189-3b2e33f14f50`
- Lifecycle: `AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID`
- Canonical txid: `81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc`
- WebZjs identity: `fc7c6c121b5608f91a7ac9f2fd73116527730cf6c1ca478bca34dece83aec981:sapling:0`
- Mined height: `4490144`
- Observation tip: `4490233`
- Confirmations: `90`

The canonical txid and WebZjs raw txid are two representations of the same transaction: the
canonical display reverses the raw transaction-ID bytes, while WebZjs exposes byte order.

## Compatibility findings

An earlier session had already expired when V6 memo hydration was added; it remained `EXPIRED` and
was never revived. The pinned WebZjs parser returned `Unknown transaction format` for that V6
transaction. The isolated browser-compatible current-consensus WASM hydrator recovered its memo
only after exact txid, height, output index, recipient, and value checks. Malformed, stale,
mismatched, empty, or undecryptable observations remain no-match results.

## Final authorized live payment

The final proof used one newly created session and one previously authorized testnet payment.
The sender used the existing Sapling note in the existing sender account; no additional faucet
request, sender account, or transaction was created.

### Session and ZIP-321 request

- Session: `50fd77e4-34bd-4508-b651-578e14f121cb`
- Created: `2026-10-11T22:22:28.239Z`
- Expiry: `2026-10-12T02:22:28.239Z`
- Initial status: `AWAITING_PAYMENT`
- Recipient: `ztestsapling1ujye35tjf62yahf02rxu0yskq9exkv7jp0kkrpn2mn3nq708ua6dh4xh64n5zz9agzg7que7fal`
- Amount: `10,000` zatoshis (`0.0001 TAZ`)
- Memo: `zps-final-live-2026-10-11T23:00:00.000Z-6d8ff56e-49e7-45da-9189-3b2e33f14f50`
- ZIP-321 URI:
  `zcash:ztestsapling1ujye35tjf62yahf02rxu0yskq9exkv7jp0kkrpn2mn3nq708ua6dh4xh64n5zz9agzg7que7fal?amount=0.0001&memo=enBzLWZpbmFsLWxpdmUtMjAyNi0xMC0xMVQyMzowMDowMC4wMDBaLTZkOGZmNTZlLTQ5ZTctNDVkYS05MTg5LTNiMmUzM2YxNGY1MA`

The URI was generated and parsed by the public SDK backed by the actual pinned WebZjs
`webzjs-requests` WASM package. The parsed request had exactly one payment with the recorded
recipient, amount, and memo.

### Sender construction and network evidence

- Funding input: Sapling note `3c9eb6f3a73e09f0221182e983a28537a03ef896ced9ea81e566bc894a2b4ce4:0`
- Funding value: `9,975,000` zatoshis
- Consensus branch: Nu7 (`0x77190AD9`)
- Fee: `10,000` zatoshis
- Change: Sapling, `9,955,000` zatoshis
- Transparent inputs/outputs: none
- Broadcast: accepted by canonical testnet
- Canonical transaction ID: `81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc`
- WebZjs raw transaction ID: `fc7c6c121b5608f91a7ac9f2fd73116527730cf6c1ca478bca34dece83aec981`
- Mined height: `4490144`
- Observation tip: `4490233`
- Confirmations at observation: `90`
- Stable WebZjs payment identity: `fc7c6c121b5608f91a7ac9f2fd73116527730cf6c1ca478bca34dece83aec981:sapling:0`
- Pool/output/value: Sapling output `0`, `10,000` zatoshis

The current-consensus browser WASM hydrator returned the exact transaction ID, Sapling output
index, value, and final session memo for this output.

### Public SDK lifecycle and restart proof

The public SDK refresh path produced these states, in order:

```text
AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID
```

Every transition was produced by `refresh()` using `get_received_payments(account_id)`; `PAID`
was not manually forced. The WebZjs wallet synced from tip `4485841` to `4490233`, persisted to
`471554` bytes, closed, reloaded from the persisted database, and synced again at `4490233`.
The reloaded session was already `PAID`; repeated refresh returned `EXACT` without a second
credit. The consumed-payment ledger contained the stable payment identity and mapped it to the
original session. A second session with the same amount and memo remained `AWAITING_PAYMENT` and
returned `ALREADY_CONSUMED` for that same payment.

During live verification, the generated WebZjs binding returned received-payment `value` as a
safe JavaScript number at runtime despite its `bigint` declaration. The adapter now normalizes
safe numeric zatoshi values to `bigint` before WASM hydration and matching; unsafe or malformed
values are ignored as incomplete observations. A regression test covers this actual runtime
shape.
