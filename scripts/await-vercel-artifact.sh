#!/usr/bin/env bash
# Vercel starts a deployment on a source push, often before GitHub Actions
# has finished building pinned native WebZjs assets. Wait for the exact SHA.
# Never silently publish a previous commit's artifact.
set -euo pipefail
expected="${VERCEL_GIT_COMMIT_SHA:?Vercel source commit SHA is required}"
ref="${VERCEL_GIT_COMMIT_REF:-main}"
repository="https://github.com/Iniwura/zcash-payment-sessions.git"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
for attempt in $(seq 1 100); do
  rm -rf "$stage/artifact"
  if git clone --quiet --depth 1 --single-branch --branch vercel-static "$repository" "$stage/artifact"; then
    artifact_message="$(git -C "$stage/artifact" log -1 --format=%s)"
    if [[ "$artifact_message" == "build(vercel): $expected" ]] || [[ "$ref" == "vercel-static" ]]; then
      if [[ ! -s "$stage/artifact/index.html" ]]; then
        echo "Compiled artifact is missing index.html" >&2
        exit 1
      fi
      rm -rf dist-demo
      mkdir -p dist-demo
      cp -a "$stage/artifact/." dist-demo/
      rm -rf dist-demo/.git
      echo "Validated compiled root-path Vercel artifact for $expected"
      exit 0
    fi
  fi
  # Skip stale production pushes instead of waiting on cancelled builds.
  if [[ "$ref" == "main" ]]; then
    newest="$(git ls-remote "$repository" refs/heads/main | awk '{print $1}')"
    if [[ -n "$newest" && "$newest" != "$expected" ]]; then
      echo "Superseded commit $expected; main now points to $newest" >&2
      exit 1
    fi
  fi
  echo "Waiting for CI-built WebZjs artifact for $expected ($attempt/100)"
  sleep 12
done
echo "Timed out awaiting verified WebZjs artifact for $expected" >&2
exit 1
