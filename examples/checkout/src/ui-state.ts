import type {
  PaymentObservationResult,
  PublicPaymentSession
} from "zcash-payment-sessions";

/**
 * Translate an SDK observation into user-facing safety feedback.
 * An AMBIGUOUS observation intentionally leaves the session AWAITING_PAYMENT,
 * so the warning must not depend on the session status alone.
 */
export function describeSessionException(
  status: PublicPaymentSession["status"] | undefined,
  observation: PaymentObservationResult | undefined
): string {
  if (observation?.outcome === "AMBIGUOUS" || status === "AMBIGUOUS") {
    return `Ambiguous: ${observation?.candidates?.length ?? 0} exact outputs found. No credit was applied.`;
  }

  if (status === "REORGED") {
    return "Reorg detected. The session is waiting for the payment to be observed again.";
  }
  if (status === "EXPIRED") {
    return "This session expired. Late payments are not matched.";
  }
  if (observation?.outcome === "ALREADY_CONSUMED") {
    return `Payment already consumed by ${observation.consumedBySessionId ?? "another session"}.`;
  }
  return "";
}
