import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import config from "../examples/checkout/vite.config.js";

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")
) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };

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

  it("allows WebZjs sync eval under the checkout CSP", () => {
    const csp = vercelConfig.headers
      .flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'");
  });
});
