#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
WEBZJS_REPOSITORY="https://github.com/ChainSafe/WebZjs.git"
WEBZJS_COMMIT="a50df944c32243cb8da9f86e7d52cb65ac926439"
WEBZJS_DIR="${WEBZJS_DIR:-$ROOT_DIR/.deps/WebZjs}"
PATCH_FILE="$ROOT_DIR/patches/webzjs-wallet-received-payments.patch"
RUST_TOOLCHAIN="nightly-2025-01-07"

fail() {
  echo "bootstrap-webzjs: $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing '$1'. Install it according to README.md, then rerun npm run bootstrap:webzjs."
}

require_command git
require_command node
require_command npm
require_command just
require_command wasm-pack
require_command clang
require_command rustup
require_command cargo

[[ -f "$PATCH_FILE" ]] || fail "missing patch artifact: $PATCH_FILE"

echo "bootstrap-webzjs: node $(node --version), npm $(npm --version)"
echo "bootstrap-webzjs: clang $(clang --version | head -n 1)"
echo "bootstrap-webzjs: just $(just --version); wasm-pack $(wasm-pack --version)"

if ! rustup toolchain list | grep -q "^$RUST_TOOLCHAIN"; then
  fail "missing Rust toolchain $RUST_TOOLCHAIN. Run: rustup toolchain install $RUST_TOOLCHAIN"
fi

if ! rustup target list --installed --toolchain "$RUST_TOOLCHAIN" |
  grep -qx "wasm32-unknown-unknown"; then
  fail "missing wasm target. Run: rustup target add wasm32-unknown-unknown --toolchain $RUST_TOOLCHAIN"
fi

if ! rustup component list --installed --toolchain "$RUST_TOOLCHAIN" |
  grep -q "^rust-src"; then
  fail "missing rust-src. Run: rustup component add rust-src --toolchain $RUST_TOOLCHAIN"
fi

mkdir -p "$(dirname -- "$WEBZJS_DIR")"

if [[ ! -e "$WEBZJS_DIR" ]]; then
  echo "bootstrap-webzjs: cloning $WEBZJS_REPOSITORY at $WEBZJS_COMMIT"
  git clone --no-checkout "$WEBZJS_REPOSITORY" "$WEBZJS_DIR"
fi

[[ -d "$WEBZJS_DIR/.git" ]] ||
  fail "$WEBZJS_DIR exists but is not a Git checkout"

REMOTE_URL="$(git -C "$WEBZJS_DIR" remote get-url origin 2>/dev/null || true)"
[[ "$REMOTE_URL" == "$WEBZJS_REPOSITORY" ]] ||
  fail "WebZjs origin mismatch: expected $WEBZJS_REPOSITORY, got ${REMOTE_URL:-<none>}"

CURRENT_HEAD="$(git -C "$WEBZJS_DIR" rev-parse HEAD 2>/dev/null || true)"
NEEDS_CHECKOUT=0
if [[ "$CURRENT_HEAD" != "$WEBZJS_COMMIT" ]]; then
  [[ -z "$(git -C "$WEBZJS_DIR" status --porcelain --untracked-files=all)" ]] ||
    fail "WebZjs has local changes before checkout; resolve them manually: $WEBZJS_DIR"
  git -C "$WEBZJS_DIR" fetch --no-tags origin "$WEBZJS_COMMIT"
  NEEDS_CHECKOUT=1
elif [[ ! -f "$WEBZJS_DIR/crates/webzjs-wallet/src/bindgen/wallet.rs" ]]; then
  NEEDS_CHECKOUT=1
fi

if [[ "$NEEDS_CHECKOUT" -eq 1 ]]; then
  git -C "$WEBZJS_DIR" checkout --detach "$WEBZJS_COMMIT"
fi

[[ "$(git -C "$WEBZJS_DIR" rev-parse HEAD)" == "$WEBZJS_COMMIT" ]] ||
  fail "WebZjs HEAD verification failed"

if git -C "$WEBZJS_DIR" apply --unidiff-zero --reverse --check "$PATCH_FILE" >/dev/null 2>&1; then
  echo "bootstrap-webzjs: source patch already applied"
elif git -C "$WEBZJS_DIR" apply --unidiff-zero --check "$PATCH_FILE" >/dev/null 2>&1; then
  git -C "$WEBZJS_DIR" apply --unidiff-zero "$PATCH_FILE"
  echo "bootstrap-webzjs: source patch applied"
else
  fail "source patch does not apply cleanly to WebZjs $WEBZJS_COMMIT"
fi

mapfile -t PATCHED_FILES < <(git -C "$WEBZJS_DIR" diff --name-only)
[[ "${#PATCHED_FILES[@]}" -eq 2 ]] ||
  fail "WebZjs contains unexpected modified files"
[[ "${PATCHED_FILES[0]}" == "crates/webzjs-wallet/src/bindgen/transaction_history.rs" ]] ||
  fail "unexpected first WebZjs modified file: ${PATCHED_FILES[0]}"
[[ "${PATCHED_FILES[1]}" == "crates/webzjs-wallet/src/bindgen/wallet.rs" ]] ||
  fail "unexpected second WebZjs modified file: ${PATCHED_FILES[1]}"

echo "bootstrap-webzjs: building keys"
(cd "$WEBZJS_DIR" && just build-keys)
echo "bootstrap-webzjs: building requests"
(cd "$WEBZJS_DIR" && just build-requests)
echo "bootstrap-webzjs: building wallet"
(cd "$WEBZJS_DIR" && just build-wallet)

node - "$WEBZJS_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const webzjsDir = process.argv[2];
const expected = [
  ["packages/webzjs-keys/package.json", "@chainsafe/webzjs-keys"],
  ["packages/webzjs-requests/package.json", "@chainsafe/webzjs-requests"],
  ["packages/webzjs-wallet/package.json", "@chainsafe/webzjs-wallet"]
];

for (const [relative, name] of expected) {
  const packagePath = path.join(webzjsDir, relative);
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (packageJson.name !== name || packageJson.version !== "0.1.0") {
    throw new Error(
      relative + " must be " + name + "@0.1.0; got " +
        packageJson.name + "@" + packageJson.version
    );
  }
}
NODE

echo "bootstrap-webzjs: installing main-project dependencies"
(cd "$ROOT_DIR" && npm ci)
echo "bootstrap-webzjs: verifying reproducibility"
(cd "$ROOT_DIR" && npm run verify:reproducibility)
echo "bootstrap-webzjs: complete"
