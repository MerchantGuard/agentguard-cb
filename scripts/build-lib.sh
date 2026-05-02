#!/usr/bin/env bash
#
# build-lib.sh — produce the npm-published artifacts in dist/
#
# Steps:
#   1. tsup compiles src/ + lib/ → dist/*.{js,cjs,js.map,cjs.map}
#   2. tsc -p tsconfig.build.json emits .d.ts (preserves src/lib structure)
#   3. flatten dist/src/*.d.ts → dist/*.d.ts so paths line up with package.json exports
#   4. preserve dist/lib/ so flat .d.ts files can re-export from lib/* relative paths
#
# Idempotent. Safe to re-run. Wipes dist/ first.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "[build-lib] cleaning dist/"
rm -rf dist

echo "[build-lib] tsup (esm + cjs)"
npx tsup

echo "[build-lib] tsc (declarations)"
npx tsc -p tsconfig.build.json

echo "[build-lib] flatten dist/src/*.d.ts"
if [ -d dist/src ]; then
  mv dist/src/*.d.ts dist/ 2>/dev/null || true
  mv dist/src/*.d.ts.map dist/ 2>/dev/null || true
  rmdir dist/src 2>/dev/null || true
fi

echo "[build-lib] artifacts:"
ls -1 dist/ | head -20
echo "[build-lib] done"
