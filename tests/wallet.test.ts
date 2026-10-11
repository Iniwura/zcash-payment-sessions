import { describe, expect, it } from "vitest";
import {
  mergeHydratedReceivedPayment,
  WebZjsPaymentSource,
  type WebZjsReceivedPaymentResponse
} from "../src/wallet.js";

describe("WebZjs wallet payment adapter", () => {
  it("requires matching full-transaction identity and value before attaching a memo", () => {
    const compact = {
      payment_id: "tx-1842:sapling:1",
      txid: "tx-1842",
      value: 10_000n,
      memo: undefined,
      block_height: 2_000_001,
      confirmations: 3,
      status: 0,
      pool: "sapling"
    } as const;

    expect(
      mergeHydratedReceivedPayment(compact, {
        txid: "tx-1842",
        pool: "sapling",
        outputIndex: 1,
        value: 10_000n,
        memo: "order-1842"
      })
    ).toMatchObject({
      payment_id: "tx-1842:sapling:1",
      memo: "order-1842"
    });

    expect(
      mergeHydratedReceivedPayment(compact, {
        txid: "tx-1842",
        pool: "sapling",
        outputIndex: 0,
        value: 10_000n,
        memo: "order-1842"
      })
    ).toBeUndefined();

    expect(
      mergeHydratedReceivedPayment(compact, {
        txid: "tx-1842",
        pool: "sapling",
        outputIndex: 1,
        value: 10_001n,
        memo: "order-1842"
      })
    ).toBeUndefined();
  });

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

  it("normalizes the actual generated WebZjs string payment status", async () => {
    const response: WebZjsReceivedPaymentResponse = {
      payments: [
        {
          payment_id: "tx-1842:sapling:0",
          txid: "tx-1842",
          value: 10_000n,
          memo: "live-proof",
          block_height: 2_000_001,
          confirmations: 1,
          status: "Mined" as unknown as number,
          pool: "sapling"
        }
      ]
    };
    const wallet = {
      get_received_payments: async () => response
    };

    await expect(new WebZjsPaymentSource(wallet, 0).list()).resolves.toEqual([
      {
        paymentId: "tx-1842:sapling:0",
        txid: "tx-1842",
        amountZatoshis: 10_000n,
        memo: "live-proof",
        blockHeight: 2_000_001,
        confirmations: 1,
        status: "MINED",
        pool: "sapling"
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
