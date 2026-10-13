import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const html = await readFile(new URL("../examples/checkout/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../examples/checkout/src/main.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../examples/checkout/src/style.css", import.meta.url), "utf8");

describe("editorial checkout interface contract", () => {
  it("preserves every HTML control required by the checkout runtime exactly once", () => {
    const required = [...js.matchAll(/required<[^>]+>\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(required.length).toBeGreaterThan(25);
    for (const id of required) {
      expect(html.match(new RegExp('id="' + id + '"', "g"))?.length).toBe(1);
    }
  });

  it("keeps navigation and all editorial sections reachable", () => {
    for (const section of ["top", "system", "evidence", "checkout", "developer"]) {
      expect(html).toContain('id="' + section + '"');
    }
    for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
      expect(html).toContain('id="' + anchor + '"');
    }
  });

  it("keeps the simulation controls wired to the actual adapter scenarios", () => {
    for (const scenario of ["exact", "confirming", "paid", "ambiguous", "reorg", "expire"]) {
      expect(html).toContain('data-scenario="' + scenario + '"');
      expect(js).toContain('case "' + scenario + '"');
    }
    expect(html).toContain("Simulated data");
  });

  it("keeps verifiable evidence and safe disclosure visible", () => {
    expect(html).toContain("81c9ae83cede34ca8b47cac1f60c7327651173fdf2c97a1af908561b126c7cfc");
    expect(html).toContain("HISTORICAL TESTNET PAYMENT");
    expect(html).toContain("LIVE_TESTNET_PROOF.md");
    expect(html).toContain("NO FUNDS TRANSFERRED");
  });

  it("provides responsive and reduced-motion treatments", () => {
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain('class="skip-link"');
  });
});
