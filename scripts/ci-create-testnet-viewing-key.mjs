import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, readFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveTestnetUfVk } from "./derive-testnet-ufvk.mjs";

const destination = process.env.ZPS_TEST_KEY_PATH;
if (!destination || !destination.startsWith("/tmp/")) {
  throw new Error("ZPS_TEST_KEY_PATH must be an ephemeral /tmp path");
}
const dir = await mkdtemp(join(tmpdir(), "zps-ci-seed-"));
const seedFile = join(dir, "seed.bin");
try {
  const seed = randomBytes(32);
  await writeFile(seedFile, seed, { mode: 0o600 });
  seed.fill(0);
  const ufvk = await deriveTestnetUfVk(seedFile);
  await writeFile(destination, ufvk, { mode: 0o600 });
  if (!(await readFile(destination, "utf8")).startsWith("uview")) {
    throw new Error("Generated unexpected viewing key format");
  }
  console.log("Generated ephemeral view-only TESTNET identity for CI (not printed)");
} finally {
  await unlink(seedFile).catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
