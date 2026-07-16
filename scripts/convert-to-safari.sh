#!/usr/bin/env bash
# Convert this Chrome Web Extension into a Safari Web Extension Xcode project.
# Requires full Xcode (not only Command Line Tools).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/../chrome-shanbay-v2-safari}"
APP_NAME="${APP_NAME:-扇贝助手v2}"
BUNDLE_ID="${BUNDLE_ID:-com.example.shanbayhelper}"

if ! xcrun safari-web-extension-converter --help >/dev/null 2>&1; then
  echo "error: safari-web-extension-converter not found."
  echo "Install full Xcode from the Mac App Store, open it once, then retry."
  exit 1
fi

echo "Source:  $ROOT"
echo "Output:  $OUT_DIR"
echo "App:     $APP_NAME"
echo "Bundle:  $BUNDLE_ID"
echo

xcrun safari-web-extension-converter "$ROOT" \
  --project-location "$OUT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

# Bundle background SW + patch Safari-incompatible manifest keys
"$ROOT/scripts/prepare-safari-resources.sh" "$OUT_DIR/ShanbayHelper/ShanbayHelper Extension/Resources"

# Keep app/extension bundle IDs consistent (Xcode may capitalize the app id)
PBXPROJ="$OUT_DIR/ShanbayHelper/ShanbayHelper.xcodeproj/project.pbxproj"
if [[ -f "$PBXPROJ" ]]; then
  # Normalize extension id under the app id prefix used by the converter
  /usr/bin/sed -i '' 's/PRODUCT_BUNDLE_IDENTIFIER = com\.maicss\.shanbayhelper\.Extension;/PRODUCT_BUNDLE_IDENTIFIER = com.maicss.ShanbayHelper.Extension;/g' "$PBXPROJ" || true
fi

echo
echo "Done. Open the project:"
echo "  open \"$OUT_DIR/ShanbayHelper/ShanbayHelper.xcodeproj\""
echo "Then Product → Run (⌘R), and enable the extension in Safari → Settings → Extensions."
