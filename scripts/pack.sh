#!/usr/bin/env bash
# Build a Chrome Web Store zip into dist/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
cd "$ROOT"

mkdir -p "$DIST"

VERSION="$(node -p "JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version")"
OUT="$DIST/HeaderControl-${VERSION}.zip"

rm -f "$OUT"
zip -r "$OUT" \
  manifest.json \
  background.js \
  README.md \
  icons \
  lib \
  options \
  popup \
  -x "*.DS_Store"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
