# Threat model

Zcash Payment Sessions is an application-layer matcher around ZIP-321 and WebZjs wallet
observations. It does not custody funds or replace wallet cryptography.

## Protected against

The session monitor requires one unambiguous observation whose amount and memo exactly equal the
session. Its stable payment identity is `txid:pool:output-index`.

- A wrong amount satisfying a session
- A wrong memo satisfying a session
- One payment satisfying two sessions
- One session being credited twice after repeated refreshes
- An expired session being resurrected by a late payment
- Ambiguous exact candidates being treated as a payment
- Malformed or incomplete full-transaction bytes being treated as evidence
- Transient RPC, transport, or memo-hydration failures being treated as reorgs
- A replacement exact payment being ignored after an explicitly observed reorg
- Mismatched txid, pool, output index, recipient, or value during memo hydration
- Losing the consumed-payment ledger across browser reloads

`PAID` is reached only after the configured confirmation threshold. Only an explicit wallet reorg
observation moves a session back to `REORGED`; missing outputs, stale snapshots, missing memos, and
hydration/RPC failures preserve the last trusted state and return retryable or incomplete evidence.
A valid replacement can then recover the session without releasing the old payment's consumed
ledger entry.

Payment claims require an atomic `claimItem` storage operation. The reference browser checkout
uses same-origin Web Locks to serialize claims across tabs. The SDK refuses to credit a payment
when the storage adapter does not provide that capability. Web Locks and browser storage do not
provide cross-device or durable server transaction guarantees; a shared transactional database is
required for those deployment models.

## Privacy boundary

- The payment memo is carried inside a shielded output on-chain.
- The SDK does not store or accept spending keys, seeds, mnemonics, or private keys.
- Recipient viewing material is supplied at runtime and is not stored in payment-session state.
- Full-transaction hydration performs trial decryption locally in the current-consensus WASM
  module after the transaction bytes are fetched.
- Session and consumed-payment metadata are application state and may include the correlation memo
  and payment identity; applications should choose storage appropriate to their privacy needs.

## Important transport limitation

Fetching a specific full transaction from a public lightwalletd endpoint can reveal interest in that
transaction to the server. The current reference setup therefore supports a browser-compatible
self-hosted or trusted gRPC-Web proxy. For higher privacy, use trusted/self-hosted lightwalletd or
Zaino infrastructure and consider a privacy-preserving future transport.

## Consensus compatibility

The pinned WebZjs package is pre-current-consensus for transaction parsing. Its compact wallet
observations remain the source of payment identity, value, status, and confirmations. When a V6
Sapling memo is absent, the isolated current-consensus WASM hydrator fetches and decrypts the full
transaction, then verifies transaction ID, height, output index, recipient, and value before
returning memo evidence.

This is not yet an Ironwood-native WebZjs implementation. The hydrator is an explicit compatibility
boundary, not a claim that the pinned upstream parser understands every current transaction format.

## Out of scope

The project does not protect a user from a compromised wallet, compromised browser, malicious
storage implementation, a dishonest lightwalletd server returning fabricated data, or endpoint
metadata leakage. HTTPS endpoint validation reduces accidental transport misuse but does not make
an arbitrary lightwalletd proxy trustworthy; applications should allowlist and verify their
configured chain endpoint. Wallet signing and broadcasting remain outside the browser
payment-session monitor.
