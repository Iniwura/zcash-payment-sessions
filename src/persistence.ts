import type {
  PaymentSession,
  PaymentSessionStatus
} from "./session.js";

interface PersistedPaymentSession {
  version: 1;
  id: string;
  amountZatoshis: string;
  memo: string;
  status: PaymentSessionStatus;
  createdAtMs: number;
  expiresAtMs: number;
}

export function serializePaymentSession(
  session: PaymentSession
): string {
  const persisted: PersistedPaymentSession = {
    version: 1,
    id: session.id,
    amountZatoshis: session.amountZatoshis.toString(),
    memo: session.memo,
    status: session.status,
    createdAtMs: session.createdAtMs,
    expiresAtMs: session.expiresAtMs
  };

  return JSON.stringify(persisted);
}

export function deserializePaymentSession(
  encoded: string
): PaymentSession {
  const persisted = JSON.parse(encoded) as PersistedPaymentSession;

  if (persisted.version !== 1) {
    throw new Error("Unsupported payment session version");
  }

  return {
    id: persisted.id,
    amountZatoshis: BigInt(persisted.amountZatoshis),
    memo: persisted.memo,
    status: persisted.status,
    createdAtMs: persisted.createdAtMs,
    expiresAtMs: persisted.expiresAtMs
  };
}
