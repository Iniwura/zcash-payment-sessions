import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const helper = resolve(root, "scripts/derive-testnet-ufvk.mjs");

function runHelper(seedPath: string): string {
  return execFileSync(process.execPath, [helper, seedPath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

describe("testnet UFVK helper", () => {
  it("refuses seed files that are not exactly 32 bytes", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "zcash-ufvk-test-"));
    const seedPath = resolve(directory, "invalid-seed.bin");
    writeFileSync(seedPath, Buffer.alloc(31, 0x42), { mode: 0o600 });

    try {
      expect(() => runHelper(seedPath)).toThrow(/exactly 32 bytes; got 31/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("derives a testnet UFVK from a non-secret 32-byte fixture", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "zcash-ufvk-test-"));
    const seedPath = resolve(directory, "fixture-seed.bin");
    writeFileSync(seedPath, Buffer.alloc(32, 0x42), { mode: 0o600 });

    try {
      const output = runHelper(seedPath).trim();
      expect(output).toMatch(/^UFVK: uview[a-z0-9]+$/);
      expect(output.split("\n")).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
