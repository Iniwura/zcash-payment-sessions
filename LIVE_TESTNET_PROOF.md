# Live Testnet Payment Proof

This record documents the historical hydration of the one authorized live payment. It does not
authorize or perform another payment.

## Existing session

- Session: `080727b1-0a07-43a3-a615-deb4471ef89c`
- Recipient: the persisted session's Sapling recipient
- Amount: `10,000` zatoshis (`0.0001 TAZ`)
- Memo: `zps-live-sapling-2026-10-10T09:19:09.452Z-298a227d-6efb-420f-8171-21f4f368f480`
- Created: `2026-10-10T09:19:09.454Z`
- Expiry: `2026-10-10T12:19:09.454Z`
- Final SDK state: `EXPIRED`

The session was already expired when full-transaction hydration was added. It was not revived and
was not marked paid.

## Transaction evidence

- Canonical transaction ID: `3c9eb6f3a73e09f0221182e983a28537a03ef896ced9ea81e566bc894a2b4ce4`
- WebZjs raw transaction ID: `e44c2b4a89bc66e581ead9ce96f83ea03785a283e9821122f0093ea7f3b69e3c`
- Mined height: `4484801`
- Raw transaction size: `2142` bytes
- Transaction version: `V6`
- Version group ID: `0xd884b698`
- Consensus branch: Nu7 (`0x77190AD9`)
- Sapling outputs: `2`
- Matching output: Sapling index `1`, value `10,000` zatoshis

The raw transaction was fetched through the pinned WebZjs `get_transaction` binding from the
verified local gRPC-Web proxy and its transaction ID and height were checked before decryption.

## Parser and hydration result

The pinned WebZjs ChainSafe librustzcash-nu61 parser cannot parse this V6 transaction and returns
`Unknown transaction format`. This is Case B, so the wallet package was not upgraded and its
parser was not used for memo recovery.

Instead, a browser-compatible WASM module built from current-consensus librustzcash revision
`3c76c2d822446a68b67cd25692aaf92b4f6cb98c` fetched and decrypted the complete transaction. It
returned the exact stable evidence:

```json
{
  "txid": "e44c2b4a89bc66e581ead9ce96f83ea03785a283e9821122f0093ea7f3b69e3c",
  "pool": "sapling",
  "output_index": 1,
  "value": 10000,
  "memo": "zps-live-sapling-2026-10-10T09:19:09.452Z-298a227d-6efb-420f-8171-21f4f368f480"
}
```

The public SDK then refreshed the existing persisted wallet/session twice. Both results were
`EXPIRED` / `NO_MATCH`; no new session, broadcast, or payment credit was created.

The adapter attaches a memo only after matching WebZjs `txid:pool:output-index` identity and value.
Malformed bytes, wrong output identity/value, wrong recipient, stale height, empty memo, and
decryption failure remain no-match observations. The recipient UFVK is runtime-only and is not
stored in session state.

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
