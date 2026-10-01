import {
  expirePaymentSession,
  transitionPaymentSession
} from "./session.js";
import type { KeyValueStorage } from "./storage.js";
import { PaymentSessionStore } from "./storage.js";

export type ObservedPaymentStatus =
  | "MINED"
  | "PENDING"
  | "EXPIRED"
  | "REORGED";

export interface ObservedPayment {
  paymentId: string;
  txid: string;
  amountZatoshis: bigint;
  memo?: string;
  blockHeight?: number;
  confirmations: number;
  status: ObservedPaymentStatus;
  pool: string;
}

export type PaymentMatchOutcome =
  | "NO_MATCH"
  | "EXACT"
  | "AMBIGUOUS"
  | "ALREADY_CONSUMED"
  | "REORGED";

export interface PaymentObservationResult {
  outcome: PaymentMatchOutcome;
  payment?: ObservedPayment;
  candidates?: readonly ObservedPayment[];
  consumedBySessionId?: string;
}

interface PersistedPaymentMatch {
  version: 1;
  sessionId: string;
  paymentId: string;
  amountZatoshis: string;
  memo: string;
  confirmations: number;
  status: ObservedPaymentStatus;
}

const MATCH_PREFIX = "zcash-payment-match:";
const CONSUMED_PREFIX = "zcash-payment-consumed:";

export interface PaymentMonitorOptions {
  requiredConfirmations?: number;
  now?: () => number;
}

export class PaymentMonitor {
  private readonly requiredConfirmations: number;
  private readonly now: () => number;

  constructor(
    private readonly sessions: PaymentSessionStore,
    private readonly storage: KeyValueStorage,
    options: PaymentMonitorOptions = {}
  ) {
    this.requiredConfirmations = options.requiredConfirmations ?? 2;
    this.now = options.now ?? Date.now;

    if (
      !Number.isSafeInteger(this.requiredConfirmations) ||
      this.requiredConfirmations <= 0
    ) {
      throw new Error("Required confirmations must be greater than zero");
    }
  }

  observe(
    sessionId: string,
    observations: readonly ObservedPayment[]
  ): PaymentObservationResult {
    const loaded = this.sessions.load(sessionId);

    if (loaded === null || loaded.status === "EXPIRED") {
      return { outcome: "NO_MATCH" };
    }

    const session = expirePaymentSession(loaded, this.now());

    if (session.status === "EXPIRED") {
      this.sessions.save(session);
      return { outcome: "NO_MATCH" };
    }

    const existing = this.loadMatch(session.id);

    if (existing !== null) {
      return this.updateExistingMatch(session, existing, observations);
    }

    if (
      session.status === "PAID" ||
      session.status === "AMBIGUOUS"
    ) {
      return { outcome: "NO_MATCH" };
    }

    const matching = observations.filter(
      (candidate) =>
        candidate.status !== "EXPIRED" &&
        candidate.status !== "REORGED" &&
        candidate.amountZatoshis === session.amountZatoshis &&
        candidate.memo === session.memo
    );

    const available = matching.filter((candidate) => {
      const consumed = this.loadConsumed(candidate.paymentId);
      return consumed === null || consumed === session.id;
    });

    if (available.length > 1) {
      return { outcome: "AMBIGUOUS", candidates: available };
    }

    if (available.length === 0) {
      const consumed = matching[0];
      const consumedBySessionId =
        consumed === undefined
          ? undefined
          : this.loadConsumed(consumed.paymentId);

      if (consumedBySessionId !== null && consumedBySessionId !== undefined) {
        return {
          outcome: "ALREADY_CONSUMED",
          payment: consumed!,
          consumedBySessionId
        };
      }

      return { outcome: "NO_MATCH" };
    }

    const candidate = available[0]!;
    const consumedBySessionId = this.claim(
      candidate.paymentId,
      session.id
    );

    if (
      consumedBySessionId !== null &&
      consumedBySessionId !== session.id
    ) {
      return {
        outcome: "ALREADY_CONSUMED",
        payment: candidate,
        consumedBySessionId
      };
    }

    this.saveMatch(session, candidate);

    const detected =
      session.status === "AWAITING_PAYMENT" ||
      session.status === "REORGED"
        ? transitionPaymentSession(session, "DETECTED")
        : session;
    this.sessions.save(detected);

    return { outcome: "EXACT", payment: candidate };
  }

  private updateExistingMatch(
    session: ReturnType<PaymentSessionStore["load"]> & object,
    existing: PersistedPaymentMatch,
    observations: readonly ObservedPayment[]
  ): PaymentObservationResult {
    const candidate = observations.find(
      (payment) => payment.paymentId === existing.paymentId
    );

    if (
      candidate === undefined ||
      candidate.amountZatoshis !== BigInt(existing.amountZatoshis) ||
      candidate.memo !== existing.memo
    ) {
      return this.handleReorg(session, existing);
    }

    this.saveMatch(session, candidate);

    if (
      candidate.status === "REORGED" ||
      candidate.status === "EXPIRED"
    ) {
      return this.handleReorg(session, existing, candidate);
    }

    if (session.status === "REORGED") {
      const detected = transitionPaymentSession(
        session,
        "DETECTED"
      );
      this.sessions.save(detected);
      return { outcome: "EXACT", payment: candidate };
    }

    let next = session;

    if (
      session.status === "DETECTED" &&
      candidate.status === "MINED" &&
      candidate.confirmations > 0
    ) {
      next = transitionPaymentSession(session, "CONFIRMING");
    } else if (
      session.status === "CONFIRMING" &&
      candidate.status === "MINED" &&
      candidate.confirmations >= this.requiredConfirmations
    ) {
      next = transitionPaymentSession(session, "PAID");
    }

    this.sessions.save(next);
    return { outcome: "EXACT", payment: candidate };
  }

  private handleReorg(
    session: NonNullable<ReturnType<PaymentSessionStore["load"]>>,
    existing: PersistedPaymentMatch,
    payment?: ObservedPayment
  ): PaymentObservationResult {
    if (
      session.status === "CONFIRMING" ||
      session.status === "PAID"
    ) {
      const reorged = transitionPaymentSession(session, "REORGED");
      this.saveMatch(
        reorged,
        payment ?? {
          paymentId: existing.paymentId,
          txid: existing.paymentId.split(":")[0] ?? existing.paymentId,
          amountZatoshis: BigInt(existing.amountZatoshis),
          memo: existing.memo,
          confirmations: 0,
          status: "REORGED",
          pool: "unknown"
        }
      );
      this.sessions.save(reorged);
      return payment === undefined
        ? { outcome: "REORGED" }
        : { outcome: "REORGED", payment };
    }

    return payment === undefined
      ? { outcome: "NO_MATCH" }
      : { outcome: "NO_MATCH", payment };
  }

  private matchKey(sessionId: string): string {
    return MATCH_PREFIX + sessionId;
  }

  private consumedKey(paymentId: string): string {
    return CONSUMED_PREFIX + paymentId;
  }

  private loadMatch(sessionId: string): PersistedPaymentMatch | null {
    const encoded = this.storage.getItem(this.matchKey(sessionId));

    if (encoded === null) {
      return null;
    }

    return JSON.parse(encoded) as PersistedPaymentMatch;
  }

  private saveMatch(
    session: NonNullable<ReturnType<PaymentSessionStore["load"]>>,
    payment: ObservedPayment
  ): void {
    const persisted: PersistedPaymentMatch = {
      version: 1,
      sessionId: session.id,
      paymentId: payment.paymentId,
      amountZatoshis: payment.amountZatoshis.toString(),
      memo: payment.memo ?? "",
      confirmations: payment.confirmations,
      status: payment.status
    };

    this.storage.setItem(
      this.matchKey(session.id),
      JSON.stringify(persisted)
    );
  }

  private loadConsumed(paymentId: string): string | null {
    return this.storage.getItem(this.consumedKey(paymentId));
  }

  private claim(
    paymentId: string,
    sessionId: string
  ): string | null {
    const consumedBySessionId = this.loadConsumed(paymentId);

    if (consumedBySessionId === null) {
      this.storage.setItem(
        this.consumedKey(paymentId),
        sessionId
      );
      return null;
    }

    return consumedBySessionId;
  }
}
