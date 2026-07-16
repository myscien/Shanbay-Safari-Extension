#!/usr/bin/env bash
# One-command Safari rebuild:
#   1) Sync extension sources → Safari Resources
#   2) xcodebuild Debug
#   3) Open ShanbayHelper.app (registers the extension with Safari)
#
# Usage:
#   ./scripts/rebuild-safari.sh
#   ./scripts/rebuild-safari.sh --open-xcode   # also open the Xcode project
#
# Prerequisites: Xcode + signing Team already set once (see SAFARI.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFARI_ROOT="${SAFARI_ROOT:-$ROOT/../chrome-shanbay-v2-safari}"
XCODE_PROJ="$SAFARI_ROOT/ShanbayHelper/ShanbayHelper.xcodeproj"
DERIVED="$SAFARI_ROOT/DerivedData"
SCHEME="ShanbayHelper"
CONFIG="Debug"

OPEN_XCODE=0
for arg in "$@"; do
  case "$arg" in
    --open-xcode|-x) OPEN_XCODE=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
  esac
done

if [[ ! -d "$XCODE_PROJ" ]]; then
  echo "error: Safari Xcode project not found:"
  echo "  $XCODE_PROJ"
  echo "Run: ./scripts/convert-to-safari.sh first"
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode from the Mac App Store."
  exit 1
fi

echo "==> [1/3] Sync resources"
"$ROOT/scripts/prepare-safari-resources.sh"

echo
echo "==> [2/3] xcodebuild ($CONFIG / $SCHEME)"
# Local DerivedData keeps the .app path stable and easy to open.
xcodebuild \
  -project "$XCODE_PROJ" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -derivedDataPath "$DERIVED" \
  -quiet \
  build

APP="$DERIVED/Build/Products/$CONFIG/ShanbayHelper.app"
if [[ ! -d "$APP" ]]; then
  # Fallback search if Xcode layout differs
  APP="$(find "$DERIVED" -name 'ShanbayHelper.app' -type d 2>/dev/null | head -1 || true)"
fi

if [[ -z "${APP:-}" || ! -d "$APP" ]]; then
  echo "error: build finished but ShanbayHelper.app was not found under:"
  echo "  $DERIVED"
  echo "Open Xcode and check Signing (Team) on both targets, then retry."
  if [[ "$OPEN_XCODE" -eq 1 ]] || true; then
    open "$XCODE_PROJ"
  fi
  exit 1
fi

echo
echo "==> [3/3] Launch app"
echo "    $APP"
open "$APP"

if [[ "$OPEN_XCODE" -eq 1 ]]; then
  open "$XCODE_PROJ"
fi

echo
echo "============================================================"
echo " Safari rebuild complete"
echo "============================================================"
echo " App: $APP"
echo
echo " If the extension is missing or disabled:"
echo "   Safari → Settings → Extensions → enable ShanbayHelper"
echo "   Allow access to the sites you use for lookup"
echo
echo " Next code change:"
echo "   ./scripts/rebuild-safari.sh"
echo "============================================================"
