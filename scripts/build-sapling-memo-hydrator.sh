#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
OUTPUT_DIR="${SAPLING_MEMO_HYDRATOR_OUTPUT_DIR:-$ROOT_DIR/.deps/sapling-memo-hydrator}"

command -v wasm-pack >/dev/null 2>&1 || {
  echo "build-sapling-memo-hydrator: missing wasm-pack" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
RUSTUP_TOOLCHAIN=stable wasm-pack build \
  "$ROOT_DIR/wasm/sapling-memo-hydrator" \
  --target web \
  --release \
  --out-dir "$OUTPUT_DIR"
