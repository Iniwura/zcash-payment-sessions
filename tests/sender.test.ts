import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createZip321Uri, initializeZip321 } from "../src/zip321.js";
import { proposeZip321Transfer } from "../src/sender.js";

const SHIELDED_ADDRESS =
  "u1mcxxpa0wyyd3qpkl8rftsa6n7tkh9lv8u8j3zpd9f6qz37dqwur38w6tfl5rpv7m8g8mlca7nyn7qxr5qtjemjqehcttwpupz3fk76q8ft82yh4scnyxrxf2jgywgr5f9ttzh8ah8ljpmr8jzzypm2gdkcfxyh4ad93c889qv3l4pa748945c372ku7kdglu388zsjvrg9dskr0v9zj";

describe("ZIP-321 sender adapter", () => {
  it("passes the exact WebZjs ZIP-321 payment to the memo-aware wallet method", async () => {
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
      amountZatoshis: 10_000n,
      memo: "live-proof-sender-adapter"
    });
    let received:
      | {
          accountId: number;
          recipientAddress: string;
          amountZatoshis: bigint;
          memo: Uint8Array;
        }
      | undefined;
    const wallet = {
      propose_transfer_with_memo: async (
        accountId: number,
        recipientAddress: string,
        amountZatoshis: bigint,
        memo: Uint8Array
      ) => {
        received = {
          accountId,
          recipientAddress,
          amountZatoshis,
          memo: new Uint8Array(memo)
        };
        return "proposal";
      }
    };

    await expect(proposeZip321Transfer(wallet, 7, uri)).resolves.toBe(
      "proposal"
    );
    expect(received?.accountId).toBe(7);
    expect(received?.recipientAddress).toBe(SHIELDED_ADDRESS);
    expect(received?.amountZatoshis).toBe(10_000n);
    expect(received?.memo.slice(0, "live-proof-sender-adapter".length)).toEqual(
      new TextEncoder().encode("live-proof-sender-adapter")
    );
    expect(received?.memo.length).toBe(512);
  });

  it("rejects a ZIP-321 payment without a memo before calling WebZjs", async () => {
    const uri = await createZip321Uri({
      recipientAddress: SHIELDED_ADDRESS,
      amountZatoshis: 10_000n
    });
    const wallet = {
      propose_transfer_with_memo: async () => {
        throw new Error("must not be called");
      }
    };

    await expect(proposeZip321Transfer(wallet, 7, uri)).rejects.toThrow(
      "ZIP-321 payment must include a memo"
    );
  });
});
