#!/usr/bin/env bash
# Prepare resources, open Xcode project, and print permanent-install steps.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
XCODE_PROJ="$ROOT/../chrome-shanbay-v2-safari/ShanbayHelper/ShanbayHelper.xcodeproj"

if [[ ! -d "$XCODE_PROJ" ]]; then
  echo "error: Safari Xcode project not found at:"
  echo "  $XCODE_PROJ"
  echo "Run: ./scripts/convert-to-safari.sh first"
  exit 1
fi

echo "==> Syncing extension resources into Safari project…"
"$ROOT/scripts/prepare-safari-resources.sh"

echo
echo "==> Opening Xcode…"
open "$XCODE_PROJ"

echo
echo "============================================================"
echo " Permanent Safari install (so you don't re-add every quit)"
echo "============================================================"
echo
echo " Temporary Extension is wiped when Safari quits. That is normal."
echo " Use the signed Xcode app instead:"
echo
echo " 1) Xcode → Settings → Accounts → add your Apple ID (free OK)"
echo " 2) Select target 'ShanbayHelper' → Signing → Team = your name"
echo " 3) Select target 'ShanbayHelper Extension' → same Team"
echo " 4) Product → Run (⌘R)"
echo " 5) Safari → Settings → Extensions → enable ShanbayHelper"
echo " 6) Allow All Websites"
echo
echo " After that, you should NOT need 'Add Temporary Extension' again."
echo " Full notes: SAFARI.md"
echo "============================================================"
