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

export type PaymentObservationIssueKind =
  | "UPSTREAM_UNAVAILABLE"
  | "HYDRATION_UNAVAILABLE"
  | "INCOMPLETE_METADATA"
  | "INVALID_OBSERVATION"
  | "CONFLICTING_OBSERVATIONS"
  | "CLAIM_UNAVAILABLE";

export interface PaymentObservationIssue {
  kind: PaymentObservationIssueKind;
  paymentId?: string;
}

export interface PaymentObservationBatch {
  payments: readonly ObservedPayment[];
  issues?: readonly PaymentObservationIssue[] | undefined;
}

export type PaymentObservationInput =
  | readonly ObservedPayment[]
  | PaymentObservationBatch;

export type PaymentMatchOutcome =
  | "NO_MATCH"
  | "EXACT"
  | "AMBIGUOUS"
  | "ALREADY_CONSUMED"
  | "REORGED"
  | "TEMPORARILY_UNAVAILABLE"
  | "INCOMPLETE"
  | "MISMATCH"
  | "CONFLICTING"
  | "CONCURRENCY_UNSUPPORTED";

export interface PaymentObservationResult {
  outcome: PaymentMatchOutcome;
  payment?: ObservedPayment;
  candidates?: readonly ObservedPayment[];
  consumedBySessionId?: string;
  issues?: readonly PaymentObservationIssue[] | undefined;
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

  async observe(
    sessionId: string,
    input: PaymentObservationInput
  ): Promise<PaymentObservationResult> {
    const loaded = this.sessions.load(sessionId);

    if (loaded === null || loaded.status === "EXPIRED") {
      return { outcome: "NO_MATCH" };
    }

    const session = expirePaymentSession(loaded, this.now());

    if (session.status === "EXPIRED") {
      this.sessions.save(session);
      return { outcome: "NO_MATCH" };
    }

    const { observations, issues } = prepareObservations(input);
    const existing = this.loadMatch(session.id);

    if (existing !== null) {
      return this.updateExistingMatch(
        session,
        existing,
        observations,
        issues
      );
    }

    if (session.status === "PAID" || session.status === "AMBIGUOUS") {
      return { outcome: "NO_MATCH", issues: issuesIfPresent(issues) };
    }

    const matching = observations.filter(
      (candidate) =>
        candidate.status !== "EXPIRED" &&
        candidate.status !== "REORGED" &&
        candidate.amountZatoshis === session.amountZatoshis &&
        candidate.memo === session.memo
    );

    const available = await this.availableForSession(
      matching,
      session.id
    );

    if (available.length > 1) {
      return {
        outcome: "AMBIGUOUS",
        candidates: available,
        issues: issuesIfPresent(issues)
      };
    }

    if (available.length === 0) {
      const consumed = matching.find((candidate) =>
        this.loadConsumed(candidate.paymentId) !== null
      );
      const consumedBySessionId =
        consumed === undefined
          ? undefined
          : this.loadConsumed(consumed.paymentId);

      if (consumedBySessionId !== null && consumedBySessionId !== undefined) {
        return {
          outcome: "ALREADY_CONSUMED",
          ...(consumed === undefined ? {} : { payment: consumed }),
          consumedBySessionId,
          issues: issuesIfPresent(issues)
        };
      }

      return matching.length === 0
        ? issueOutcome(issues)
        : { outcome: "NO_MATCH", issues: issuesIfPresent(issues) };
    }

    const candidate = available[0]!;
    const claim = await this.claim(candidate.paymentId, session.id);

    if (claim === "unsupported") {
      return {
        outcome: "CONCURRENCY_UNSUPPORTED",
        payment: candidate,
        issues: [{ kind: "CLAIM_UNAVAILABLE" }]
      };
    }

    if (claim === "unavailable") {
      return {
        outcome: "TEMPORARILY_UNAVAILABLE",
        payment: candidate,
        issues: [{ kind: "CLAIM_UNAVAILABLE" }]
      };
    }

    if (typeof claim === "string" && claim !== session.id) {
      return {
        outcome: "ALREADY_CONSUMED",
        payment: candidate,
        consumedBySessionId: claim
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

  private async updateExistingMatch(
    session: NonNullable<ReturnType<PaymentSessionStore["load"]>>,
    existing: PersistedPaymentMatch,
    observations: readonly ObservedPayment[],
    issues: readonly PaymentObservationIssue[]
  ): Promise<PaymentObservationResult> {
    const conflicting = issueForPayment(
      issues,
      existing.paymentId,
      "CONFLICTING_OBSERVATIONS"
    );
    if (conflicting !== undefined) {
      return {
        outcome: "CONFLICTING",
        issues: [conflicting]
      };
    }

    const candidate = observations.find(
      (payment) => payment.paymentId === existing.paymentId
    );

    if (candidate === undefined) {
      if (session.status === "REORGED") {
        return this.recoverAfterReorg(session, observations, issues);
      }

      return issueOutcome(issues, "INCOMPLETE");
    }

    if (
      candidate.amountZatoshis !== BigInt(existing.amountZatoshis) ||
      candidate.memo !== existing.memo
    ) {
      const issue = issueForPayment(issues, candidate.paymentId);
      if (issue !== undefined) {
        return issueOutcome([issue]);
      }

      return {
        outcome: "MISMATCH",
        payment: candidate
      };
    }

    if (candidate.status === "REORGED") {
      if (session.status !== "CONFIRMING" && session.status !== "PAID") {
        return { outcome: "REORGED", payment: candidate };
      }

      const reorged = this.markReorged(session, candidate);
      const recovery = await this.recoverAfterReorg(
        reorged,
        observations,
        issues
      );
      return recovery.outcome === "NO_MATCH"
        ? { outcome: "REORGED", payment: candidate }
        : recovery;
    }

    if (candidate.status === "EXPIRED") {
      return { outcome: "MISMATCH", payment: candidate };
    }

    this.saveMatch(session, candidate);

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

  private markReorged(
    session: NonNullable<ReturnType<PaymentSessionStore["load"]>>,
    payment: ObservedPayment
  ): NonNullable<ReturnType<PaymentSessionStore["load"]>> {
    if (session.status !== "CONFIRMING" && session.status !== "PAID") {
      return session;
    }

    const reorged = transitionPaymentSession(session, "REORGED");
    this.saveMatch(reorged, payment);
    this.sessions.save(reorged);
    return reorged;
  }

  private async recoverAfterReorg(
    session: NonNullable<ReturnType<PaymentSessionStore["load"]>>,
    observations: readonly ObservedPayment[],
    issues: readonly PaymentObservationIssue[]
  ): Promise<PaymentObservationResult> {
    const matching = observations.filter(
      (candidate) =>
        candidate.status !== "EXPIRED" &&
        candidate.status !== "REORGED" &&
        candidate.amountZatoshis === session.amountZatoshis &&
        candidate.memo === session.memo
    );
    const available = await this.availableForSession(
      matching,
      session.id
    );

    if (available.length > 1) {
      return {
        outcome: "AMBIGUOUS",
        candidates: available,
        issues: issuesIfPresent(issues)
      };
    }

    if (available.length === 0) {
      return issueOutcome(issues);
    }

    const candidate = available[0]!;
    const claim = await this.claim(candidate.paymentId, session.id);

    if (claim === "unsupported") {
      return {
        outcome: "CONCURRENCY_UNSUPPORTED",
        payment: candidate,
        issues: [{ kind: "CLAIM_UNAVAILABLE" }]
      };
    }

    if (claim === "unavailable") {
      return {
        outcome: "TEMPORARILY_UNAVAILABLE",
        payment: candidate,
        issues: [{ kind: "CLAIM_UNAVAILABLE" }]
      };
    }

    if (typeof claim === "string" && claim !== session.id) {
      return {
        outcome: "ALREADY_CONSUMED",
        payment: candidate,
        consumedBySessionId: claim
      };
    }

    this.saveMatch(session, candidate);
    const detected = transitionPaymentSession(session, "DETECTED");
    this.sessions.save(detected);
    return { outcome: "EXACT", payment: candidate };
  }

  private async availableForSession(
    matching: readonly ObservedPayment[],
    sessionId: string
  ): Promise<ObservedPayment[]> {
    const available: ObservedPayment[] = [];

    for (const candidate of matching) {
      const consumed = this.loadConsumed(candidate.paymentId);
      if (consumed === null || consumed === sessionId) {
        available.push(candidate);
      }
    }

    return available;
  }

  private matchKey(sessionId: string): string {
    return MATCH_PREFIX + sessionId;
  }

  private consumedKey(paymentId: string): string {
    return CONSUMED_PREFIX + paymentId;
  }

  private loadMatch(sessionId: string): PersistedPaymentMatch | null {
    const key = this.matchKey(sessionId);
    const encoded = this.storage.getItem(key);

    if (encoded === null) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(encoded);
      if (!isPersistedPaymentMatch(parsed)) {
        throw new Error("Invalid persisted payment match");
      }
      return parsed;
    } catch {
      this.storage.removeItem(key);
      return null;
    }
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

  private async claim(
    paymentId: string,
    sessionId: string
  ): Promise<string | null | "unsupported" | "unavailable"> {
    if (this.storage.claimItem === undefined) {
      return "unsupported";
    }

    try {
      return await this.storage.claimItem(
        this.consumedKey(paymentId),
        sessionId
      );
    } catch {
      return "unavailable";
    }
  }
}

function prepareObservations(
  input: PaymentObservationInput
): {
  observations: readonly ObservedPayment[];
  issues: readonly PaymentObservationIssue[];
} {
  const source: PaymentObservationBatch = Array.isArray(input)
    ? { payments: input, issues: [] }
    : input as PaymentObservationBatch;
  const byId = new Map<string, ObservedPayment>();
  const conflicting = new Set<string>();

  for (const payment of source.payments) {
    const existing = byId.get(payment.paymentId);
    if (existing === undefined) {
      byId.set(payment.paymentId, payment);
      continue;
    }

    if (!sameObservation(existing, payment)) {
      conflicting.add(payment.paymentId);
    }
  }

  const issues = [
    ...(source.issues ?? []),
    ...[...conflicting].map((paymentId) => ({
      kind: "CONFLICTING_OBSERVATIONS" as const,
      paymentId
    }))
  ];

  return {
    observations: [...byId]
      .filter(([paymentId]) => !conflicting.has(paymentId))
      .map(([, payment]) => payment),
    issues
  };
}

function sameObservation(
  first: ObservedPayment,
  second: ObservedPayment
): boolean {
  return (
    first.txid === second.txid &&
    first.amountZatoshis === second.amountZatoshis &&
    first.memo === second.memo &&
    first.blockHeight === second.blockHeight &&
    first.confirmations === second.confirmations &&
    first.status === second.status &&
    first.pool === second.pool
  );
}

function issueForPayment(
  issues: readonly PaymentObservationIssue[],
  paymentId: string,
  kind?: PaymentObservationIssueKind
): PaymentObservationIssue | undefined {
  return issues.find(
    (issue) =>
      (issue.paymentId === undefined || issue.paymentId === paymentId) &&
      (kind === undefined || issue.kind === kind)
  );
}

function issueOutcome(
  issues: readonly PaymentObservationIssue[],
  fallback: "INCOMPLETE" | "NO_MATCH" = "NO_MATCH"
): PaymentObservationResult {
  if (issues.length === 0) {
    return { outcome: fallback };
  }

  if (issues.some((issue) => issue.kind === "CONFLICTING_OBSERVATIONS")) {
    return { outcome: "CONFLICTING", issues };
  }

  if (
    issues.some(
      (issue) =>
        issue.kind === "UPSTREAM_UNAVAILABLE" ||
        issue.kind === "HYDRATION_UNAVAILABLE" ||
        issue.kind === "CLAIM_UNAVAILABLE"
    )
  ) {
    return { outcome: "TEMPORARILY_UNAVAILABLE", issues };
  }

  if (
    issues.some(
      (issue) =>
        issue.kind === "INCOMPLETE_METADATA" ||
        issue.kind === "INVALID_OBSERVATION"
    )
  ) {
    return { outcome: "INCOMPLETE", issues };
  }

  return { outcome: fallback, issues };
}

function issuesIfPresent(
  issues: readonly PaymentObservationIssue[]
): readonly PaymentObservationIssue[] | undefined {
  return issues.length === 0 ? undefined : issues;
}

function isPersistedPaymentMatch(
  value: unknown
): value is PersistedPaymentMatch {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const match = value as Partial<PersistedPaymentMatch>;
  return (
    match.version === 1 &&
    typeof match.sessionId === "string" &&
    match.sessionId.length > 0 &&
    typeof match.paymentId === "string" &&
    match.paymentId.length > 0 &&
    typeof match.amountZatoshis === "string" &&
    /^\d+$/.test(match.amountZatoshis) &&
    BigInt(match.amountZatoshis) > 0n &&
    typeof match.memo === "string" &&
    Number.isSafeInteger(match.confirmations) &&
    typeof match.confirmations === "number" &&
    match.confirmations >= 0 &&
    (match.status === "MINED" ||
      match.status === "PENDING" ||
      match.status === "EXPIRED" ||
      match.status === "REORGED")
  );
}
