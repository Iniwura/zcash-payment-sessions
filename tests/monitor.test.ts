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

  claimItem(key: string, owner: string): string | null {
    const existing = this.values.get(key);
    if (existing !== undefined) return existing;
    this.values.set(key, owner);
    return null;
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
  it("detects an exact amount and memo match", async () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = await monitor.observe(session.id, [payment()]);

    expect(result.outcome).toBe("EXACT");
    expect(sessions.load(session.id)?.status).toBe("DETECTED");
  });

  it("does not satisfy a session with the wrong amount", async () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = await monitor.observe(session.id, [
      payment({ amountZatoshis: 24_999_999n })
    ]);

    expect(result.outcome).toBe("NO_MATCH");
    expect(sessions.load(session.id)?.status).toBe("AWAITING_PAYMENT");
  });

  it("does not satisfy a session with the wrong memo token", async () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = await monitor.observe(session.id, [
      payment({ memo: "order-1843" })
    ]);

    expect(result.outcome).toBe("NO_MATCH");
    expect(sessions.load(session.id)?.status).toBe("AWAITING_PAYMENT");
  });

  it("does not let one payment satisfy two sessions", async () => {
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

    expect((await monitor.observe(first.id, [payment()])).outcome).toBe("EXACT");
    expect((await monitor.observe(second.id, [payment()])).outcome).toBe(
      "ALREADY_CONSUMED"
    );
    expect(sessions.load(second.id)?.status).toBe("AWAITING_PAYMENT");
  });

  it("returns AMBIGUOUS for multiple exact output candidates", async () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    const result = await monitor.observe(session.id, [
      payment({ paymentId: "tx-a:orchard:0", txid: "tx-a" }),
      payment({ paymentId: "tx-b:orchard:1", txid: "tx-b" })
    ]);

    expect(result.outcome).toBe("AMBIGUOUS");
    expect(sessions.load(session.id)?.status).toBe("AWAITING_PAYMENT");
  });
});

describe("PaymentMonitor confirmation lifecycle", () => {
  it("advances DETECTED to CONFIRMING and then PAID", async () => {
    const { sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    await monitor.observe(session.id, [payment({ confirmations: 0 })]);
    expect(sessions.load(session.id)?.status).toBe("DETECTED");

    await monitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);
    expect(sessions.load(session.id)?.status).toBe("CONFIRMING");

    await monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);
    expect(sessions.load(session.id)?.status).toBe("PAID");
  });

  it("repeated confirmation polling is idempotent after PAID", async () => {
    const { sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    await monitor.observe(session.id, [payment()]);
    await monitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);
    await monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);

    const repeated = await monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);

    expect(repeated.outcome).toBe("EXACT");
    expect(sessions.load(session.id)?.status).toBe("PAID");
  });

  it("marks a confirmed payment REORGED when it loses mined status", async () => {
    const { sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);

    await monitor.observe(session.id, [payment()]);
    await monitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);
    await monitor.observe(session.id, [
      payment({ confirmations: 2, status: "MINED" })
    ]);

    const reorged = await monitor.observe(session.id, [
      payment({ confirmations: 0, status: "REORGED" })
    ]);

    expect(reorged.outcome).toBe("REORGED");
    expect(sessions.load(session.id)?.status).toBe("REORGED");
  });

  it("keeps the consumed payment and confirmation state across recreation", async () => {
    const { storage, sessions, monitor } = setup(2);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });
    sessions.save(session);
    await monitor.observe(session.id, [payment()]);

    const recreatedSessions = new PaymentSessionStore(storage);
    const recreatedMonitor = new PaymentMonitor(
      recreatedSessions,
      storage,
      { requiredConfirmations: 2 }
    );

    await recreatedMonitor.observe(session.id, [
      payment({ confirmations: 1, status: "MINED" })
    ]);

    expect(recreatedSessions.load(session.id)?.status).toBe("CONFIRMING");
  });

  it("does not revive an expired session when a late payment appears", async () => {
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

    expect((await monitor.observe(session.id, [payment()])).outcome).toBe("NO_MATCH");
    expect(expiredSessions.load(session.id)?.status).toBe("EXPIRED");
  });
});
