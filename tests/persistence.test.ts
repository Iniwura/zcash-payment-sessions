import { describe, expect, it, vi } from "vitest";
import {
  createPaymentSession,
  expirePaymentSession
} from "../src/session.js";
import {
  deserializePaymentSession,
  serializePaymentSession
} from "../src/persistence.js";

describe("payment session expiry", () => {
  it("records when the session was created and when it expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));

    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842",
      expiresInMs: 20 * 60 * 1000
    });

    expect(session.createdAtMs).toBe(Date.now());
    expect(session.expiresAtMs).toBe(Date.now() + 20 * 60 * 1000);

    vi.useRealTimers();
  });

  it("expires a waiting session after its deadline", () => {
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842",
      expiresInMs: 1_000
    });

    const expired = expirePaymentSession(
      session,
      session.expiresAtMs
    );

    expect(expired.status).toBe("EXPIRED");
  });
});

describe("payment session persistence", () => {
  it("round-trips a session without losing bigint values", () => {
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842",
      expiresInMs: 20 * 60 * 1000
    });

    const encoded = serializePaymentSession(session);
    const restored = deserializePaymentSession(encoded);

    expect(restored).toEqual(session);
    expect(typeof restored.amountZatoshis).toBe("bigint");
  });
});
