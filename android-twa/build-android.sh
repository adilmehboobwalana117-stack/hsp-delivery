#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  HSP delivery — Android .AAB (Play Console) & .APK Builder"
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: Node.js (npx) is required. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi

echo ""
echo "[1/3] Generating Android Gradle project from twa-manifest.json..."
npx --yes @bubblewrap/cli update --skipVersionUpgrade

echo ""
echo "[2/3] Building signed Android App Bundle (.aab) and APK (.apk)..."
npx --yes @bubblewrap/cli build

echo ""
echo "[3/3] Build complete! Your Play Console files are ready:"
ls -lh app-release-bundle.aab app-release-signed.apk 2>/dev/null || true

echo ""
echo "Next Steps:"
echo "  1. Upload app-release-bundle.aab to Google Play Console -> Production / Internal testing."
echo "  2. Test app-release-signed.apk directly on any Android phone."
echo "  3. Copy your App Signing SHA-256 from Play Console into public/.well-known/assetlinks.json."
