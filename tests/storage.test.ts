import { describe, expect, it } from "vitest";
import { createPaymentSession } from "../src/session.js";
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

describe("PaymentSessionStore", () => {
  it("restores a saved session across store instances", () => {
    const storage = new MemoryStorage();

    const firstStore = new PaymentSessionStore(storage);
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });

    firstStore.save(session);

    const reloadedStore = new PaymentSessionStore(storage);
    expect(reloadedStore.load(session.id)).toEqual(session);
  });

  it("returns null for an unknown session", () => {
    const store = new PaymentSessionStore(new MemoryStorage());

    expect(store.load("missing-session")).toBeNull();
  });

  it("expires an overdue session when it is restored", () => {
    const storage = new MemoryStorage();

    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842",
      expiresInMs: 1_000
    });

    const writer = new PaymentSessionStore(storage);
    writer.save(session);

    const reader = new PaymentSessionStore(
      storage,
      () => session.expiresAtMs
    );

    const restored = reader.load(session.id);

    expect(restored?.status).toBe("EXPIRED");

    const restoredAgain = new PaymentSessionStore(storage).load(
      session.id
    );

    expect(restoredAgain?.status).toBe("EXPIRED");
  });

  it("removes a stored session", () => {
    const storage = new MemoryStorage();
    const store = new PaymentSessionStore(storage);

    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });

    store.save(session);
    store.remove(session.id);

    expect(store.load(session.id)).toBeNull();
  });

  it("quarantines a corrupted persisted session by returning null", () => {
    const storage = new MemoryStorage();
    const store = new PaymentSessionStore(storage);
    storage.setItem("zcash-payment-session:corrupt", "not-json");

    expect(store.load("corrupt")).toBeNull();
    expect(storage.getItem("zcash-payment-session:corrupt")).toBeNull();
  });
});
