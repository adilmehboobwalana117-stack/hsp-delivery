#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  HSP delivery — Android .AAB (Play Console) & .APK Builder"
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 18+ is required. Install from https://nodejs.org"
  exit 1
fi

node ./run-bubblewrap.mjs
