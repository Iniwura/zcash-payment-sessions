import { describe, expect, it } from "vitest";
import {
  createPaymentSession,
  transitionPaymentSession
} from "../src/session.js";

describe("createPaymentSession", () => {
  it("creates a new session waiting for payment", () => {
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });

    expect(session.amountZatoshis).toBe(25_000_000n);
    expect(session.memo).toBe("order-1842");
    expect(session.status).toBe("AWAITING_PAYMENT");
    expect(session.id.length).toBeGreaterThan(0);
  });

  it("rejects a zero-value payment session", () => {
    expect(() =>
      createPaymentSession({
        amountZatoshis: 0n,
        memo: "order-zero"
      })
    ).toThrow("Payment amount must be greater than zero");
  });
});

describe("transitionPaymentSession", () => {
  it("moves a waiting session to detected", () => {
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });

    const updated = transitionPaymentSession(session, "DETECTED");

    expect(updated.status).toBe("DETECTED");
    expect(session.status).toBe("AWAITING_PAYMENT");
  });

  it("rejects skipping directly from waiting to paid", () => {
    const session = createPaymentSession({
      amountZatoshis: 25_000_000n,
      memo: "order-1842"
    });

    expect(() =>
      transitionPaymentSession(session, "PAID")
    ).toThrow("Invalid payment session transition");
  });
});
