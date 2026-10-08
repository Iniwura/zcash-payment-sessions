import type { InitInput } from "@chainsafe/webzjs-requests";
import { TransactionRequest } from "@chainsafe/webzjs-requests";
import { initializeZip321 } from "./zip321.js";

/** The additive local WebZjs wallet method that preserves a ZIP-321 memo. */
export interface WebZjsMemoSenderWallet<TProposal = unknown> {
  propose_transfer_with_memo(
    accountId: number,
    recipientAddress: string,
    amountZatoshis: bigint,
    memo: Uint8Array
  ): Promise<TProposal>;
}

/**
 * Parse one ZIP-321 payment with WebZjs and hand its exact bytes to the local
 * memo-aware WebZjs wallet method. No transaction is authorized or broadcast.
 */
export async function proposeZip321Transfer<TProposal>(
  wallet: WebZjsMemoSenderWallet<TProposal>,
  accountId: number,
  uri: string,
  wasmInput?: InitInput | Promise<InitInput>
): Promise<TProposal> {
  await initializeZip321(wasmInput);

  const request = TransactionRequest.from_uri(uri);
  try {
    const payments = request.payment_requests();
    try {
      if (payments.length !== 1) {
        throw new Error("ZIP-321 transfer must contain exactly one payment");
      }

      const payment = payments[0];
      if (payment === undefined) {
        throw new Error("ZIP-321 transfer did not contain a payment");
      }

      const amountZatoshis = payment.amount();
      if (amountZatoshis === undefined) {
        throw new Error("ZIP-321 payment must include an amount");
      }

      const memo = payment.memo();
      if (memo === undefined) {
        throw new Error("ZIP-321 payment must include a memo");
      }

      return await wallet.propose_transfer_with_memo(
        accountId,
        payment.recipient_address(),
        amountZatoshis,
        new Uint8Array(memo)
      );
    } finally {
      for (const payment of payments) {
        payment.free();
      }
    }
  } finally {
    request.free();
  }
}
