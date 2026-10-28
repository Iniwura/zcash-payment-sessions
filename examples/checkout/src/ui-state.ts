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
  if (observation?.outcome === "TEMPORARILY_UNAVAILABLE") {
    return "Chain evidence is temporarily unavailable. No payment state was changed; refresh to retry.";
  }
  if (observation?.outcome === "INCOMPLETE") {
    return "Payment evidence is incomplete. No credit was applied; refresh after wallet metadata is available.";
  }
  if (observation?.outcome === "MISMATCH") {
    return "The observed output does not match the previously recorded payment evidence. No credit was applied.";
  }
  if (observation?.outcome === "CONFLICTING") {
    return "Conflicting observations were received. No credit was applied.";
  }
  if (observation?.outcome === "CONCURRENCY_UNSUPPORTED") {
    return "This storage adapter cannot make payment claims atomically. No credit was applied.";
  }
  return "";
}
