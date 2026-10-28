import { describe, expect, it } from "vitest";
import { PaymentMonitor, type ObservedPayment } from "../src/monitor.js";
import { createPaymentSession } from "../src/session.js";
import {
  PaymentSessionStore,
  type KeyValueStorage
} from "../src/storage.js";
import {
  WebZjsPaymentSource,
  type WebZjsReceivedPayment,
  type WebZjsWalletLike
} from "../src/wallet.js";

class AtomicMemoryStorage implements KeyValueStorage {
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

const observedPayment = (
  overrides: Partial<ObservedPayment> = {}
): ObservedPayment => ({
  paymentId: "old-tx:orchard:0",
  txid: "old-tx",
  amountZatoshis: 10_000n,
  memo: "order-1",
  confirmations: 2,
  status: "MINED",
  pool: "orchard",
  ...overrides
});

function setup() {
  const storage = new AtomicMemoryStorage();
  const sessions = new PaymentSessionStore(storage);
  const monitor = new PaymentMonitor(sessions, storage, {
    requiredConfirmations: 2
  });
  return { storage, sessions, monitor };
}

async function paidSession(
  monitor: PaymentMonitor,
  sessions: PaymentSessionStore
) {
  const session = createPaymentSession({
    amountZatoshis: 10_000n,
    memo: "order-1",
    expiresInMs: 60_000
  });
  sessions.save(session);
  await monitor.observe(session.id, [
    observedPayment({ confirmations: 0, status: "PENDING" })
  ]);
  await monitor.observe(session.id, [observedPayment({ confirmations: 1 })]);
  await monitor.observe(session.id, [observedPayment()]);
  return session;
}

describe("critical observation correctness", () => {
  it("does not classify a hydration outage as a reorg", async () => {
    const { sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);

    const result = await monitor.observe(session.id, {
      payments: [observedPayment({ memo: undefined })],
      issues: [{
        kind: "HYDRATION_UNAVAILABLE",
        paymentId: "old-tx:orchard:0"
      }]
    });

    expect(result.outcome).toBe("TEMPORARILY_UNAVAILABLE");
    expect(sessions.load(session.id)?.status).toBe("PAID");
  });

  it("does not classify a stale or incomplete observation as a reorg", async () => {
    const { sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);

    const result = await monitor.observe(session.id, {
      payments: [],
      issues: [{ kind: "INCOMPLETE_METADATA", paymentId: "old-tx:orchard:0" }]
    });

    expect(result.outcome).toBe("INCOMPLETE");
    expect(sessions.load(session.id)?.status).toBe("PAID");
  });

  it("recovers a reorged session with a replacement payment", async () => {
    const { sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);

    await monitor.observe(session.id, [
      observedPayment({ status: "REORGED", confirmations: 0 })
    ]);
    expect(sessions.load(session.id)?.status).toBe("REORGED");

    const replacement = observedPayment({
      paymentId: "replacement-tx:orchard:1",
      txid: "replacement-tx",
      confirmations: 0,
      status: "PENDING"
    });
    const result = await monitor.observe(session.id, [replacement]);

    expect(result.outcome).toBe("EXACT");
    expect(result.payment?.paymentId).toBe(replacement.paymentId);
    expect(sessions.load(session.id)?.status).toBe("DETECTED");
  });

  it("does not double-credit when the old payment reappears", async () => {
    const { sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);

    await monitor.observe(session.id, [
      observedPayment({ status: "REORGED", confirmations: 0 })
    ]);
    await monitor.observe(session.id, [observedPayment({ confirmations: 0 })]);

    const second = createPaymentSession({
      amountZatoshis: 10_000n,
      memo: "order-1"
    });
    sessions.save(second);

    const result = await monitor.observe(second.id, [observedPayment()]);
    expect(result.outcome).toBe("ALREADY_CONSUMED");
    expect(sessions.load(session.id)?.status).toBe("DETECTED");
  });

  it("recovers after reload when a replacement arrives", async () => {
    const { storage, sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);

    await monitor.observe(session.id, [
      observedPayment({ status: "REORGED", confirmations: 0 })
    ]);

    const reloadedMonitor = new PaymentMonitor(
      new PaymentSessionStore(storage),
      storage
    );
    const replacement = observedPayment({
      paymentId: "replacement-tx:orchard:1",
      txid: "replacement-tx",
      confirmations: 0,
      status: "PENDING"
    });

    expect(
      (await reloadedMonitor.observe(session.id, [replacement])).outcome
    ).toBe("EXACT");
    expect(new PaymentSessionStore(storage).load(session.id)?.status).toBe(
      "DETECTED"
    );
  });

  it("expires instead of reviving while a reorged session is recovering", async () => {
    const { storage, sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);
    await monitor.observe(session.id, [
      observedPayment({ status: "REORGED", confirmations: 0 })
    ]);

    const expiredSessions = new PaymentSessionStore(
      storage,
      () => session.expiresAtMs
    );
    const expiredMonitor = new PaymentMonitor(expiredSessions, storage, {
      now: () => session.expiresAtMs
    });

    expect(
      (await expiredMonitor.observe(session.id, [observedPayment()])).outcome
    ).toBe("NO_MATCH");
    expect(expiredSessions.load(session.id)?.status).toBe("EXPIRED");
  });

  it("deduplicates identical observations but rejects conflicting ones", async () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 10_000n,
      memo: "order-1"
    });
    sessions.save(session);

    const duplicate = observedPayment({ confirmations: 0, status: "PENDING" });
    expect(
      (await monitor.observe(session.id, [duplicate, { ...duplicate }])).outcome
    ).toBe("EXACT");

    const conflicting = await monitor.observe(session.id, [
      observedPayment({ confirmations: 0, status: "PENDING" }),
      observedPayment({ confirmations: 1, status: "MINED" })
    ]);
    expect(conflicting.outcome).toBe("CONFLICTING");
    expect(sessions.load(session.id)?.status).toBe("DETECTED");
  });

  it("preserves PAID across stale lower-confirmation observations", async () => {
    const { sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);

    const stale = await monitor.observe(session.id, [
      observedPayment({ confirmations: 0, status: "PENDING" })
    ]);

    expect(stale.outcome).toBe("EXACT");
    expect(sessions.load(session.id)?.status).toBe("PAID");
  });

  it("does not throw or invent a transition for a pending reorg", async () => {
    const { sessions, monitor } = setup();
    const session = createPaymentSession({
      amountZatoshis: 10_000n,
      memo: "order-1"
    });
    sessions.save(session);

    await monitor.observe(session.id, [
      observedPayment({ confirmations: 0, status: "PENDING" })
    ]);
    const result = await monitor.observe(session.id, [
      observedPayment({ confirmations: 0, status: "REORGED" })
    ]);

    expect(result.outcome).toBe("REORGED");
    expect(sessions.load(session.id)?.status).toBe("DETECTED");
  });

  it("fails closed for conflicting recovery candidates", async () => {
    const { sessions, monitor } = setup();
    const session = await paidSession(monitor, sessions);

    await monitor.observe(session.id, [
      observedPayment({ status: "REORGED", confirmations: 0 })
    ]);
    const result = await monitor.observe(session.id, [
      observedPayment({
        paymentId: "replacement-a:orchard:0",
        txid: "replacement-a",
        confirmations: 0,
        status: "PENDING"
      }),
      observedPayment({
        paymentId: "replacement-b:orchard:0",
        txid: "replacement-b",
        confirmations: 0,
        status: "PENDING"
      })
    ]);

    expect(result.outcome).toBe("AMBIGUOUS");
    expect(sessions.load(session.id)?.status).toBe("REORGED");
  });

  it("uses an atomic claim when competing sessions observe simultaneously", async () => {
    const storage = new AtomicMemoryStorage();
    const firstSessions = new PaymentSessionStore(storage);
    const secondSessions = new PaymentSessionStore(storage);
    const firstMonitor = new PaymentMonitor(firstSessions, storage);
    const secondMonitor = new PaymentMonitor(secondSessions, storage);
    const first = createPaymentSession({ amountZatoshis: 10_000n, memo: "order-1" });
    const second = createPaymentSession({ amountZatoshis: 10_000n, memo: "order-1" });
    firstSessions.save(first);
    secondSessions.save(second);

    const results = await Promise.all([
      firstMonitor.observe(first.id, [observedPayment({ confirmations: 0, status: "PENDING" })]),
      secondMonitor.observe(second.id, [observedPayment({ confirmations: 0, status: "PENDING" })])
    ]);

    expect(results.map((result) => result.outcome).sort()).toEqual([
      "ALREADY_CONSUMED",
      "EXACT"
    ]);
  });

  it("does not credit without an atomic claim capability", async () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); }
    };
    const sessions = new PaymentSessionStore(storage);
    const monitor = new PaymentMonitor(sessions, storage);
    const session = createPaymentSession({ amountZatoshis: 10_000n, memo: "order-1" });
    sessions.save(session);

    const result = await monitor.observe(session.id, [observedPayment({ confirmations: 0, status: "PENDING" })]);

    expect(result.outcome).toBe("CONCURRENCY_UNSUPPORTED");
    expect(sessions.load(session.id)?.status).toBe("AWAITING_PAYMENT");
  });
});

describe("hydration failure classification", () => {
  it("returns an explicit issue when memo hydration is temporarily unavailable", async () => {
    const wallet: WebZjsWalletLike = {
      get_received_payments: async () => ({
        payments: [{
          payment_id: "old-tx:sapling:0",
          txid: "old-tx",
          value: 10_000n,
          memo: undefined,
          block_height: 4_000_000,
          confirmations: 2,
          status: 0,
          pool: "sapling"
        } satisfies WebZjsReceivedPayment]
      })
    };
    const source = new WebZjsPaymentSource(
      wallet,
      0,
      async () => {
        throw new Error("temporary gateway failure");
      }
    );

    const result = await source.listDetailed();

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0]).not.toHaveProperty("memo");
    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: "HYDRATION_UNAVAILABLE",
        paymentId: "old-tx:sapling:0"
      })
    ]);
  });
});

