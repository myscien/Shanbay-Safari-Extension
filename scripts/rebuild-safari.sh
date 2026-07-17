#!/usr/bin/env bash
# One-command Safari rebuild for the current Xcode project (ShanbayLookup or ShanbayHelper).
#   1) Sync extension sources → Safari Resources
#   2) xcodebuild Debug
#   3) Install to ~/Applications and open the app
#
# Usage:
#   ./scripts/rebuild-safari.sh
#   ./scripts/rebuild-safari.sh --open-xcode
#
# Fresh install from scratch:
#   ./scripts/fresh-safari-install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFARI_ROOT="${SAFARI_ROOT:-$ROOT/../chrome-shanbay-v2-safari}"
CONFIG="Debug"
TEAM_ID="${TEAM_ID:-U4PM3R5P68}"

OPEN_XCODE=0
for arg in "$@"; do
  case "$arg" in
    --open-xcode|-x) OPEN_XCODE=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
  esac
done

# Prefer new ShanbayLookup project; fall back to legacy ShanbayHelper
XCODE_PROJ=""
for candidate in \
  "$SAFARI_ROOT/ShanbayLookup/ShanbayLookup.xcodeproj" \
  "$SAFARI_ROOT/ShanbayHelper/ShanbayHelper.xcodeproj"
do
  if [[ -d "$candidate" ]]; then
    XCODE_PROJ="$candidate"
    break
  fi
done

if [[ -z "${XCODE_PROJ:-}" ]]; then
  XCODE_PROJ="$(find "$SAFARI_ROOT" -name '*.xcodeproj' -type d 2>/dev/null | head -1 || true)"
fi

if [[ -z "${XCODE_PROJ:-}" || ! -d "$XCODE_PROJ" ]]; then
  echo "error: Safari Xcode project not found under:"
  echo "  $SAFARI_ROOT"
  echo "Run: ./scripts/fresh-safari-install.sh"
  exit 1
fi

SCHEME="$(basename "$XCODE_PROJ" .xcodeproj)"
PROJ_DIR="$(dirname "$XCODE_PROJ")"
DERIVED="$SAFARI_ROOT/DerivedData"

RES_DIR="$(find "$PROJ_DIR" -type d -path '*/Extension/Resources' 2>/dev/null | head -1 || true)"
if [[ -z "${RES_DIR:-}" ]]; then
  echo "error: Extension/Resources not found under $PROJ_DIR"
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode from the Mac App Store."
  exit 1
fi

echo "==> [1/3] Sync resources → $RES_DIR"
"$ROOT/scripts/prepare-safari-resources.sh" "$RES_DIR"

echo
echo "==> [2/3] xcodebuild ($CONFIG / $SCHEME)"
xcodebuild \
  -project "$XCODE_PROJ" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -derivedDataPath "$DERIVED" \
  -destination 'platform=macOS,arch=arm64' \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -quiet \
  build

APP="$(find "$DERIVED" -name "${SCHEME}.app" -type d 2>/dev/null | head -1 || true)"
if [[ -z "${APP:-}" || ! -d "$APP" ]]; then
  APP="$(find "$DERIVED" -name '*.app' -type d 2>/dev/null | head -1 || true)"
fi

if [[ -z "${APP:-}" || ! -d "$APP" ]]; then
  echo "error: build finished but .app was not found under:"
  echo "  $DERIVED"
  echo "Open Xcode and check Signing (Team), then retry."
  open "$XCODE_PROJ"
  exit 1
fi

# Verify lookup UI is packaged
POPUP="$(find "$APP" -path '*/Resources/popup.html' 2>/dev/null | head -1 || true)"
if [[ -n "${POPUP:-}" ]] && ! /usr/bin/grep -q 'word-input' "$POPUP"; then
  echo "error: packaged popup.html is missing the lookup input"
  exit 1
fi

mkdir -p "$HOME/Applications"
INSTALL="$HOME/Applications/${SCHEME}.app"
rm -rf "$INSTALL"
cp -R "$APP" "$INSTALL"

echo
echo "==> [3/3] Launch app"
echo "    $INSTALL"
open "$INSTALL"

if [[ "$OPEN_XCODE" -eq 1 ]]; then
  open "$XCODE_PROJ"
fi

echo
echo "============================================================"
echo " Safari rebuild complete — $SCHEME"
echo "============================================================"
echo " App: $INSTALL"
echo
echo " Safari → Settings → Extensions → enable **$SCHEME**"
echo " Click the toolbar icon → “Look up a word…”"
echo
echo " Next code change:  ./scripts/rebuild-safari.sh"
echo " From scratch:      ./scripts/fresh-safari-install.sh"
echo "============================================================"
