import {
  mergeHydratedReceivedPayment,
  type HydratedReceivedPaymentEvidence,
  type WebZjsPaymentHydrator,
  type WebZjsRawTransactionFetcher,
  type WebZjsReceivedPayment
} from "./wallet.js";

export interface SaplingMemoHydratorModule {
  hydrate_sapling_payment(
    rawTransaction: Uint8Array,
    minedHeight: number,
    recipientUfvk: string,
    expectedTxid: string,
    expectedOutputIndex: number,
    expectedValue: bigint
  ): unknown;
}

export interface SaplingMemoHydratorOptions
  extends WebZjsRawTransactionFetcher {
  module: SaplingMemoHydratorModule;
  recipientUfvk: string;
}

/**
 * Creates the opt-in current-consensus Sapling memo hydrator.
 *
 * WebZjs supplies the compact output identity and amount. The isolated WASM module parses and
 * decrypts the complete transaction; this adapter only returns evidence for the same output.
 */
export function createSaplingMemoHydrator(
  options: SaplingMemoHydratorOptions
): WebZjsPaymentHydrator {
  return async (
    payment: WebZjsReceivedPayment
  ): Promise<HydratedReceivedPaymentEvidence | undefined> => {
    const identity = parsePaymentIdentity(payment);
    if (
      identity === undefined ||
      payment.pool !== "sapling" ||
      payment.memo !== undefined ||
      payment.block_height === undefined ||
      (payment.status !== 0 && payment.status !== "Mined")
    ) {
      return undefined;
    }

    const raw = await options.get_transaction(hexToBytes(payment.txid));
    if (raw.height !== payment.block_height) {
      return undefined;
    }

    const result = await options.module.hydrate_sapling_payment(
      raw.data,
      raw.height,
      options.recipientUfvk,
      payment.txid,
      identity.outputIndex,
      payment.value
    );

    const evidence = normalizeHydratedPayment(result);
    if (evidence === undefined) {
      return undefined;
    }

    return mergeHydratedReceivedPayment(payment, evidence) === undefined
      ? undefined
      : evidence;
  };
}

function parsePaymentIdentity(
  payment: WebZjsReceivedPayment
): { outputIndex: number } | undefined {
  const separator = payment.payment_id.lastIndexOf(":");
  const poolSeparator = payment.payment_id.lastIndexOf(":", separator - 1);
  if (separator <= 0 || poolSeparator <= 0) {
    return undefined;
  }

  const txid = payment.payment_id.slice(0, poolSeparator);
  const pool = payment.payment_id.slice(poolSeparator + 1, separator);
  const outputIndex = Number(payment.payment_id.slice(separator + 1));
  if (
    txid !== payment.txid ||
    pool !== payment.pool ||
    !Number.isSafeInteger(outputIndex) ||
    outputIndex < 0
  ) {
    return undefined;
  }

  return { outputIndex };
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("WebZjs transaction id must be 32-byte hexadecimal");
  }

  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function normalizeHydratedPayment(
  result: unknown
): HydratedReceivedPaymentEvidence | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }

  const candidate = result as Record<string, unknown>;
  if (
    typeof candidate.txid !== "string" ||
    typeof candidate.pool !== "string" ||
    typeof candidate.output_index !== "number" ||
    typeof candidate.memo !== "string"
  ) {
    return undefined;
  }

  let value: bigint;
  try {
    value = typeof candidate.value === "bigint"
      ? candidate.value
      : BigInt(candidate.value as number | string);
  } catch {
    return undefined;
  }

  return {
    txid: candidate.txid,
    pool: candidate.pool,
    outputIndex: candidate.output_index,
    value,
    memo: candidate.memo
  };
}
