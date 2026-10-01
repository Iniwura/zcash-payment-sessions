export type PaymentSessionStatus =
  | "AWAITING_PAYMENT"
  | "DETECTED"
  | "CONFIRMING"
  | "PAID"
  | "EXPIRED"
  | "REORGED"
  | "AMBIGUOUS";

export interface CreatePaymentSessionInput {
  amountZatoshis: bigint;
  memo: string;
}

export interface PaymentSession {
  id: string;
  amountZatoshis: bigint;
  memo: string;
  status: PaymentSessionStatus;
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
  REORGED: ["DETECTED", "CONFIRMING"],
  AMBIGUOUS: []
};

export function createPaymentSession(
  input: CreatePaymentSessionInput
): PaymentSession {
  if (input.amountZatoshis <= 0n) {
    throw new Error("Payment amount must be greater than zero");
  }

  return {
    id: crypto.randomUUID(),
    amountZatoshis: input.amountZatoshis,
    memo: input.memo,
    status: "AWAITING_PAYMENT"
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
