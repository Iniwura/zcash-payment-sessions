import { describe, expect, it } from "vitest";
import {
  WebZjsPaymentSource,
  type WebZjsReceivedPaymentResponse
} from "../src/wallet.js";

describe("WebZjs wallet payment adapter", () => {
  it("normalizes exact output observations from get_received_payments", async () => {
    const response: WebZjsReceivedPaymentResponse = {
      payments: [
        {
          payment_id: "tx-1842:orchard:0",
          txid: "tx-1842",
          value: 25_000_000n,
          memo: "order-1842",
          block_height: 2_000_000,
          confirmations: 3,
          status: 0,
          pool: "orchard"
        }
      ]
    };
    const wallet = {
      get_received_payments: async () => response
    };

    const source = new WebZjsPaymentSource(wallet, 0);

    await expect(source.list()).resolves.toEqual([
      {
        paymentId: "tx-1842:orchard:0",
        txid: "tx-1842",
        amountZatoshis: 25_000_000n,
        memo: "order-1842",
        blockHeight: 2_000_000,
        confirmations: 3,
        status: "MINED",
        pool: "orchard"
      }
    ]);
  });

  it("rejects unknown WebZjs payment status values", async () => {
    const wallet = {
      get_received_payments: async () => ({
        payments: [
          {
            payment_id: "tx-1842:orchard:0",
            txid: "tx-1842",
            value: 25_000_000n,
            memo: "order-1842",
            block_height: undefined,
            confirmations: 0,
            status: 99,
            pool: "orchard"
          }
        ]
      })
    };

    const source = new WebZjsPaymentSource(wallet, 0);

    await expect(source.list()).rejects.toThrow(
      "Unknown WebZjs received payment status"
    );
  });

  it("releases the generated WebZjs response after mapping", async () => {
    let freed = false;
    const wallet = {
      get_received_payments: async () => ({
        payments: [],
        free: () => {
          freed = true;
        }
      })
    };

    await new WebZjsPaymentSource(wallet, 0).list();

    expect(freed).toBe(true);
  });
});
