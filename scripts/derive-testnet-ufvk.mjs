import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
export const defaultWebzjsKeysDirectory = resolve(
  repositoryRoot,
  ".deps/WebZjs/packages/webzjs-keys"
);

export function validateSeed(seed) {
  if (seed.length !== 32) {
    throw new Error(`seed must be exactly 32 bytes; got ${seed.length}`);
  }
}

export async function deriveTestnetUfVk(
  seedPath,
  packageDirectory = defaultWebzjsKeysDirectory
) {
  const seed = readFileSync(seedPath);
  let seedForWasm;
  let wasm;

  try {
    validateSeed(seed);
    const moduleUrl = pathToFileURL(
      resolve(packageDirectory, "webzjs_keys.js")
    ).href;
    const { initSync, UnifiedSpendingKey } = await import(moduleUrl);
    wasm = readFileSync(resolve(packageDirectory, "webzjs_keys_bg.wasm"));
    initSync({ module: wasm });

    seedForWasm = Uint8Array.from(seed);
    const spendingKey = new UnifiedSpendingKey("test", seedForWasm, 0);
    try {
      const viewingKey = spendingKey.to_unified_full_viewing_key();
      try {
        const ufvk = viewingKey.encode("test");
        if (!ufvk.startsWith("uview")) {
          throw new Error("derived key is not a testnet UFVK");
        }
        return ufvk;
      } finally {
        viewingKey.free();
      }
    } finally {
      spendingKey.free();
    }
  } finally {
    seed.fill(0);
    seedForWasm?.fill(0);
    wasm?.fill(0);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) {
    throw new Error(
      "usage: node scripts/derive-testnet-ufvk.mjs <seed-file> [webzjs-keys-directory]"
    );
  }

  const ufvk = await deriveTestnetUfVk(args[0], args[1]);
  process.stdout.write(`UFVK: ${ufvk}\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`derive-testnet-ufvk: ${message}\n`);
    process.exitCode = 1;
  });
}
