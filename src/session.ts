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

export function createPaymentSession(
  input: CreatePaymentSessionInput
): PaymentSession {
  return {
    id: crypto.randomUUID(),
    amountZatoshis: input.amountZatoshis,
    memo: input.memo,
    status: "AWAITING_PAYMENT"
  };
}
