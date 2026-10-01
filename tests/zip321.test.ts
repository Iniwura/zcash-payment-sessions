import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createZip321Uri,
  decodeZip321Uri,
  initializeZip321
} from "../src/zip321.js";

const SHIELDED_ADDRESS =
  "u1mcxxpa0wyyd3qpkl8rftsa6n7tkh9lv8u8j3zpd9f6qz37dqwur38w6tfl5rpv7m8g8mlca7nyn7qxr5qtjemjqehcttwpupz3fk76q8ft82yh4scnyxrxf2jgywgr5f9ttzh8ah8ljpmr8jzzypm2gdkcfxyh4ad93c889qv3l4pa748945c372ku7kdglu388zsjvrg9dskr0v9zj";

describe("ZIP-321 adapter", () => {
  it("encodes and decodes a payment through WebZjs", async () => {
    const wasm = new Uint8Array(
      await readFile(
        new URL(
          "../node_modules/@chainsafe/webzjs-requests/webzjs_requests_bg.wasm",
          import.meta.url
        )
      )
    );
    await initializeZip321(wasm);

    const uri = await createZip321Uri({
      recipientAddress: SHIELDED_ADDRESS,
      amountZatoshis: 100_000_000n,
      memo: "order-1842",
      label: "Order 1842",
      message: "Thank you for your purchase",
      otherParams: [["invoice", "1842"]]
    });

    const decoded = await decodeZip321Uri(uri);

    expect(decoded.totalZatoshis).toBe(100_000_000n);
    expect(decoded.payments).toEqual([
      {
        recipientAddress: SHIELDED_ADDRESS,
        amountZatoshis: 100_000_000n,
        memo: "order-1842",
        label: "Order 1842",
        message: "Thank you for your purchase",
        otherParams: [["invoice", "1842"]]
      }
    ]);
  });
});
