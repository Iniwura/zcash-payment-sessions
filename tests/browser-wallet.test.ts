import { describe, expect, it } from "vitest";
import {
  WebZjsBrowserWallet,
  WebZjsBrowserWalletError
} from "../src/browser-wallet.js";
import type { KeyValueStorage } from "../src/storage.js";

const storage: KeyValueStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
};

describe("WebZjs browser wallet adapter", () => {
  it("requires a browser-compatible lightwalletd endpoint", async () => {
    await expect(
      WebZjsBrowserWallet.open({
        network: "test",
        lightwalletdUrl: " ",
        storage
      })
    ).rejects.toMatchObject<WebZjsBrowserWalletError>({
      code: "INVALID_OPTIONS"
    });
  });

  it("rejects unknown WebZjs network values before loading WASM", async () => {
    await expect(
      WebZjsBrowserWallet.open({
        network: "testnet" as "test",
        lightwalletdUrl: "https://example.invalid/grpc-web",
        storage
      })
    ).rejects.toMatchObject<WebZjsBrowserWalletError>({
      code: "INVALID_OPTIONS"
    });
  });
});
