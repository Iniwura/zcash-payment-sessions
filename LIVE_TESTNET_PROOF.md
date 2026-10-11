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
