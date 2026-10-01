import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = resolve(
  root,
  ".deps/WebZjs/packages/webzjs-wallet"
);
const target = resolve(
  root,
  "examples/checkout/public/webzjs-wallet"
);

const requiredFiles = [
  "webzjs_wallet.js",
  "webzjs_wallet_bg.wasm",
  "snippets"
];

try {
  await stat(source);
  for (const file of requiredFiles) {
    await stat(resolve(source, file));
  }
} catch {
  throw new Error(
    "Missing generated WebZjs wallet package. Run npm run bootstrap:webzjs first."
  );
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(resolve(source, "webzjs_wallet.js"), resolve(target, "webzjs_wallet.js"));
await cp(
  resolve(source, "webzjs_wallet_bg.wasm"),
  resolve(target, "webzjs_wallet_bg.wasm")
);
await cp(resolve(source, "snippets"), resolve(target, "snippets"), {
  recursive: true
});

console.log("demo WebZjs wallet assets prepared from .deps/WebZjs");
