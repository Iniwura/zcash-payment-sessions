import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const webzjs = resolve(
  process.env.WEBZJS_DIR ?? resolve(root, ".deps/WebZjs")
);
const expectedCommit =
  "a50df944c32243cb8da9f86e7d52cb65ac926439";
const patches = [
  resolve(root, "patches/webzjs-wallet-received-payments.patch"),
  resolve(root, "patches/webzjs-wallet-memo-transfer.patch"),
  resolve(root, "patches/webzjs-wallet-raw-transaction.patch")
];

function fail(message) {
  console.error("verify-reproducibility: " + message);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: webzjs,
    encoding: "utf8"
  }).trim();
}

if (!existsSync(webzjs)) {
  fail("missing WebZjs checkout: " + webzjs);
}

if (git("rev-parse", "HEAD") !== expectedCommit) {
  fail("WebZjs HEAD is not " + expectedCommit);
}

for (const patch of patches) {
  try {
    execFileSync(
      "git",
      ["apply", "--unidiff-zero", "--reverse", "--check", patch],
      {
        cwd: webzjs,
        stdio: "ignore"
      }
    );
  } catch {
    fail("a stored WebZjs patch is not applied cleanly: " + patch);
  }
}

const changedFiles = git("diff", "--name-only")
  .split(String.fromCharCode(10))
  .filter(Boolean);
const expectedChangedFiles = [
  "crates/webzjs-wallet/src/bindgen/transaction_history.rs",
  "crates/webzjs-wallet/src/bindgen/wallet.rs",
  "crates/webzjs-wallet/src/wallet.rs"
];
if (changedFiles.join(String.fromCharCode(10)) !==
    expectedChangedFiles.join(String.fromCharCode(10))) {
  fail("unexpected WebZjs source changes: " + changedFiles.join(", "));
}

const packages = [
  ["packages/webzjs-keys", "@chainsafe/webzjs-keys"],
  ["packages/webzjs-requests", "@chainsafe/webzjs-requests"],
  ["packages/webzjs-wallet", "@chainsafe/webzjs-wallet"]
];

for (const [relative, expectedName] of packages) {
  const packagePath = resolve(webzjs, relative, "package.json");
  if (!existsSync(packagePath)) {
    fail("missing generated package: " + packagePath);
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (packageJson.name !== expectedName || packageJson.version !== "0.1.0") {
    fail(
      relative + " must be " + expectedName + "@0.1.0; got " +
        packageJson.name + "@" + packageJson.version
    );
  }
}

const walletDeclaration = readFileSync(
  resolve(webzjs, "packages/webzjs-wallet/webzjs_wallet.d.ts"),
  "utf8"
);
if (!walletDeclaration.includes("propose_transfer_with_memo") ||
    !walletDeclaration.includes("get_transaction(txid")) {
  fail("generated wallet declaration is missing the required memo/raw transaction methods");
}

const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
);
const lockfile = readFileSync(resolve(root, "package-lock.json"), "utf8");
for (const dependency of [
  "@chainsafe/webzjs-requests",
  "@chainsafe/webzjs-wallet"
]) {
  const spec = packageJson.dependencies?.[dependency];
  const expectedSpec =
    dependency.endsWith("requests")
      ? "file:.deps/WebZjs/packages/webzjs-requests"
      : "file:.deps/WebZjs/packages/webzjs-wallet";
  if (spec !== expectedSpec || !lockfile.includes(expectedSpec)) {
    fail(dependency + " is not pinned to " + expectedSpec);
  }
}

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "-z"],
  { cwd: root }
)
  .toString()
  .split(String.fromCharCode(0))
  .filter(Boolean);

for (const file of trackedFiles) {
  const contents = readFileSync(resolve(root, file));
  const localPathFragment = ["/home", "ini/"].join("/");
  if (contents.includes(Buffer.from(localPathFragment))) {
    fail("absolute local path leaked into " + file);
  }
}

console.log(
  "reproducibility verified: WebZjs " + expectedCommit +
    ", patches applied, keys/requests/wallet packages at 0.1.0"
);
