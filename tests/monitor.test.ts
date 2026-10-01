import { describe, expect, it } from "vitest";
import { createPaymentSession } from "../src/session.js";
import {
  PaymentMonitor,
  type ObservedPayment
} from "../src/monitor.js";
import {
  PaymentSessionStore,
  type KeyValueStorage
} from "../src/storage.js";

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const payment = (
  overrides: Partial<ObservedPayment> = {}
): ObservedPayment => ({
  paymentId: "tx-1842:orchard:0",
  txid: "tx-1842",
  amountZatoshis: 25_000_000n,
  memo: "order-1842",
  confirmations: 0,
  status: "PENDING",
  pool: "orchard",
  ...overrides
});

function setup(requiredConfirmations = 2) {
  const storage = new MemoryStorage();
  const sessions = new PaymentSessionStore(storage);
  const monitor = new PaymentMonitor(
    sessions,
    storage,
    { requiredConfirmations }
  );

  return { storage, sessions, monitor };
}

describe("PaymentMonitor matching", () => {
  it("detects an exact amount and memo match", () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = monitor.observe(session.id, [payment()]);

    expect(result.outcome).toBe("EXACT");
    expect(sessions.load(session.id)?.status).toBe("DETECTED");
  });

  it("does not satisfy a session with the wrong amount", () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = monitor.observe(session.id, [
      payment({ amountZatoshis: 24_999_999n })
    ]);

    expect(result.outcome).toBe("NO_MATCH");
    expect(sessions.load(session.id)?.status).toBe("AWAITING_PAYMENT");
  });

  it("does not satisfy a session with the wrong memo token", () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = monitor.observe(session.id, [
      payment({ memo: "order-1843" })
    ]);

    expect(result.outcome).toBe("NO_MATCH");
    expect(sessions.load(session.id)?.status).toBe("AWAITING_PAYMENT");
  });

  it("does not let one payment satisfy two sessions", () => {
    const { sessions, monitor } = setup();
    const first = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    const second = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(first);
    sessions.save(second);

    expect(monitor.observe(first.id, [payment()]).outcome).toBe("EXACT");
    expect(monitor.observe(second.id, [payment()]).outcome).toBe(
      "ALREADY_CONSUMED"
    );
    expect(sessions.load(second.id)?.status).toBe("AWAITING_PAYMENT");
  });

  it("returns AMBIGUOUS for multiple exact output candidates", () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = monitor.observe(session.id, [
      payment({ paymentId: "tx-a:orchard:0", txid: "tx-a" }),
      payment({ paymentId: "tx-b:orchard:1", txid: "tx-b" })
    ]);

    expect(result.outcome).toBe("AMBIGUOUS");
    expect(sessions.load(session.id)?.status).toBe("AWAITING_PAYMENT");
  });
});

describe("PaymentMonitor confirmation lifecycle", () => {
  it("advances DETECTED to CONFIRMING and then PAID", () => {
    const { sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    monitor.observe(session.id, [payment({ confirmations: 0 })]);
    expect(sessions.load(session.id)?.status).toBe("DETECTED");

    monitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);
    expect(sessions.load(session.id)?.status).toBe("CONFIRMING");

    monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);
    expect(sessions.load(session.id)?.status).toBe("PAID");
  });

  it("repeated confirmation polling is idempotent after PAID", () => {
    const { sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    monitor.observe(session.id, [payment()]);
    monitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);
    monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);

    const repeated = monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);

    expect(repeated.outcome).toBe("EXACT");
    expect(sessions.load(session.id)?.status).toBe("PAID");
  });

  it("marks a confirmed payment REORGED when it loses mined status", () => {
    const { sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    monitor.observe(session.id, [payment()]);
    monitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);
    monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);

    const reorged = monitor.observe(session.id, [
      payment({ confirmations: 0, status: "REORGED" })
    ]);

    expect(reorged.outcome).toBe("REORGED");
    expect(sessions.load(session.id)?.status).toBe("REORGED");
  });

  it("keeps the consumed payment and confirmation state across recreation", () => {
    const { storage, sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);
    monitor.observe(session.id, [payment()]);

    const recreatedSessions = new PaymentSessionStore(storage);
    const recreatedMonitor = new PaymentMonitor(
      recreatedSessions,
      storage,
      { requiredConfirmations: 2 }
    );

    recreatedMonitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);

    expect(recreatedSessions.load(session.id)?.status).toBe("CONFIRMING");
  });

  it("does not revive an expired session when a late payment appears", () => {
    const { storage, sessions } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842",
      expiresInMs: 1_000
    });
    sessions.save(session);

    const expiredSessions = new PaymentSessionStore(
      storage,
      () => session.expiresAtMs
    );
    const monitor = new PaymentMonitor(expiredSessions, storage);

    expect(monitor.observe(session.id, [payment()]).outcome).toBe("NO_MATCH");
    expect(expiredSessions.load(session.id)?.status).toBe("EXPIRED");
  });
});
