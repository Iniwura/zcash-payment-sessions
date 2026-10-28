export type PaymentSessionStatus =
  | "AWAITING_PAYMENT"
  | "DETECTED"
  | "CONFIRMING"
  | "PAID"
  | "EXPIRED"
  | "REORGED"
  | "AMBIGUOUS";

export const DEFAULT_SESSION_TTL_MS = 20 * 60 * 1000;

export interface CreatePaymentSessionInput {
  amountZatoshis: bigint;
  memo: string;
  expiresInMs?: number;
}

export interface PaymentSession {
  id: string;
  amountZatoshis: bigint;
  memo: string;
  status: PaymentSessionStatus;
  createdAtMs: number;
  expiresAtMs: number;
}

const ALLOWED_TRANSITIONS: Record<
  PaymentSessionStatus,
  readonly PaymentSessionStatus[]
> = {
  AWAITING_PAYMENT: ["DETECTED", "EXPIRED"],
  DETECTED: ["CONFIRMING", "AMBIGUOUS", "EXPIRED"],
  CONFIRMING: ["PAID", "REORGED", "EXPIRED"],
  PAID: ["REORGED"],
  EXPIRED: [],
  REORGED: ["DETECTED", "CONFIRMING", "EXPIRED"],
  AMBIGUOUS: ["EXPIRED"]
};

export function createPaymentSession(
  input: CreatePaymentSessionInput
): PaymentSession {
  if (input.amountZatoshis <= 0n) {
    throw new Error("Payment amount must be greater than zero");
  }

  const expiresInMs =
    input.expiresInMs ?? DEFAULT_SESSION_TTL_MS;

  if (!Number.isSafeInteger(expiresInMs) || expiresInMs <= 0) {
    throw new Error("Payment session expiry must be greater than zero");
  }

  const createdAtMs = Date.now();

  return {
    id: crypto.randomUUID(),
    amountZatoshis: input.amountZatoshis,
    memo: input.memo,
    status: "AWAITING_PAYMENT",
    createdAtMs,
    expiresAtMs: createdAtMs + expiresInMs
  };
}

export function transitionPaymentSession(
  session: PaymentSession,
  nextStatus: PaymentSessionStatus
): PaymentSession {
  if (!ALLOWED_TRANSITIONS[session.status].includes(nextStatus)) {
    throw new Error(
      `Invalid payment session transition: ${session.status} -> ${nextStatus}`
    );
  }

  return {
    ...session,
    status: nextStatus
  };
}

export function expirePaymentSession(
  session: PaymentSession,
  nowMs: number = Date.now()
): PaymentSession {
  if (nowMs < session.expiresAtMs) {
    return session;
  }

  if (!ALLOWED_TRANSITIONS[session.status].includes("EXPIRED")) {
    return session;
  }

  return transitionPaymentSession(session, "EXPIRED");
}
