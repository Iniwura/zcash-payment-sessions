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
  const persisted: unknown = JSON.parse(encoded);

  if (!isPersistedPaymentSession(persisted)) {
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

function isPersistedPaymentSession(
  value: unknown
): value is PersistedPaymentSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const persisted = value as Partial<PersistedPaymentSession>;
  const createdAtMs = persisted.createdAtMs;
  const expiresAtMs = persisted.expiresAtMs;
  if (
    typeof createdAtMs !== "number" ||
    typeof expiresAtMs !== "number" ||
    !Number.isSafeInteger(createdAtMs) ||
    !Number.isSafeInteger(expiresAtMs)
  ) {
    return false;
  }

  return (
    persisted.version === 1 &&
    typeof persisted.id === "string" &&
    persisted.id.length > 0 &&
    typeof persisted.amountZatoshis === "string" &&
    /^\d+$/.test(persisted.amountZatoshis) &&
    BigInt(persisted.amountZatoshis) > 0n &&
    typeof persisted.memo === "string" &&
    isPaymentSessionStatus(persisted.status) &&
    expiresAtMs > createdAtMs
  );
}

function isPaymentSessionStatus(
  value: unknown
): value is PaymentSessionStatus {
  return (
    value === "AWAITING_PAYMENT" ||
    value === "DETECTED" ||
    value === "CONFIRMING" ||
    value === "PAID" ||
    value === "EXPIRED" ||
    value === "REORGED" ||
    value === "AMBIGUOUS"
  );
}
