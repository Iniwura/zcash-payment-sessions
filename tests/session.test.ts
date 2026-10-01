import { describe, expect, it } from "vitest";
import { createPaymentSession } from "../src/session.js";

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
});
