import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const landingHtml = await readFile(new URL("../examples/checkout/index.html", import.meta.url), "utf8");
const checkoutHtml = await readFile(new URL("../examples/checkout/checkout.html", import.meta.url), "utf8");
const js = await readFile(new URL("../examples/checkout/src/main.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../examples/checkout/src/style.css", import.meta.url), "utf8");
const tour = await readFile(new URL("../examples/checkout/src/product-tour.ts", import.meta.url), "utf8");
const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");

describe("editorial checkout interface contract", () => {
  it("preserves every HTML control required by the checkout runtime exactly once in checkout.html", () => {
    const required = [...js.matchAll(/required<[^>]+>\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(required.length).toBeGreaterThan(25);
    for (const id of required) {
      expect(checkoutHtml.match(new RegExp('id="' + id + '"', "g"))?.length).toBe(1);
    }
  });

  it("keeps navigation and all editorial sections reachable on the landing page", () => {
    for (const section of ["top", "system", "evidence", "developer"]) {
      expect(landingHtml).toContain('id="' + section + '"');
    }
    for (const [, anchor] of landingHtml.matchAll(/href="#([^"]+)"/g)) {
      expect(landingHtml).toContain('id="' + anchor + '"');
    }
    expect(landingHtml).toContain('href="./checkout.html"');
  });

  it("keeps the simulation controls wired to the actual adapter scenarios in checkout.html", () => {
    for (const scenario of ["exact", "confirming", "paid", "ambiguous", "reorg", "expire"]) {
      expect(checkoutHtml).toContain('data-scenario="' + scenario + '"');
      expect(js).toContain('case "' + scenario + '"');
    }
    expect(checkoutHtml).toContain("simulated wallet adapter");
  });

  it("keeps verifiable evidence and safe disclosure visible across pages", () => {
    expect(landingHtml).toContain("81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc");
    expect(landingHtml).toContain("HISTORICAL TESTNET PAYMENT");
    expect(landingHtml).toContain("LIVE_TESTNET_PROOF.md");
    expect(checkoutHtml).toContain("NO FUNDS TRANSFERRED");
  });

  it("provides responsive and reduced-motion treatments", () => {
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(landingHtml).toContain('class="skip-link"');
    expect(checkoutHtml).toContain('class="skip-link"');
  });

  it("keeps document structure, CSP, and tour focus safety explicit", () => {
    expect(landingHtml.match(/<title>/g)?.length).toBe(1);
    expect(checkoutHtml.match(/<title>/g)?.length).toBe(1);
    expect(checkoutHtml).toContain("<h1 class=\"sr-only\">");
    expect(vercel).toContain("Content-Security-Policy");
    expect(vercel).toContain("connect-src 'self' https:");
    expect(vercel).toContain("worker-src 'self' blob:");
    expect(tour).toContain("this.trapFocus(e)");
    expect(tour).toContain("previouslyFocused");
  });
});
