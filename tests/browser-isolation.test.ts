import { describe, expect, it } from "vitest";
import config from "../examples/checkout/vite.config.js";

describe("checkout browser worker configuration", () => {
  it("serves the cross-origin isolation headers required by WebZjs workers", () => {
    expect(config.server?.headers).toMatchObject({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    });
    expect(config.preview?.headers).toMatchObject({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    });
  });

  it("rewrites the generated worker package-root import to WebZjs JavaScript", () => {
    expect(config.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "webzjs-wallet-package-root" })
      ])
    );
  });

  it("maps the dev adapter import to the prepared browser wallet asset", () => {
    expect(config.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "webzjs-wallet-browser-import" })
      ])
    );
  });
});
