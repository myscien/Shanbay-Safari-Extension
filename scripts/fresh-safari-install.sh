#!/usr/bin/env bash
# Wipe previous Safari extension installs and create a fresh signed build.
# Usage: ./scripts/fresh-safari-install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFARI_ROOT="${SAFARI_ROOT:-$ROOT/../chrome-shanbay-v2-safari}"
# New app name + bundle so Safari does not keep the old extension entry
APP_NAME="${APP_NAME:-ShanbayLookup}"
BUNDLE_ID="${BUNDLE_ID:-com.ethan.ShanbayLookup}"
TEAM_ID="${TEAM_ID:-U4PM3R5P68}"
DERIVED="$SAFARI_ROOT/DerivedData-fresh"

echo "============================================================"
echo " Fresh Safari install: $APP_NAME"
echo " Bundle: $BUNDLE_ID"
echo "============================================================"

# 1) Stop anything old
echo "==> [1/6] Quit old app / Safari helper processes"
pkill -x ShanbayHelper 2>/dev/null || true
pkill -x ShanbayLookup 2>/dev/null || true
pkill -f "ShanbayHelper.app" 2>/dev/null || true
pkill -f "ShanbayLookup.app" 2>/dev/null || true
sleep 0.5

# 2) Remove previous project + build products + plugin registrations
echo "==> [2/6] Remove previous Safari project and caches"
# Unregister plug-ins if present
if command -v pluginkit >/dev/null 2>&1; then
  pluginkit -mAvvv -p com.apple.Safari.web-extension 2>/dev/null \
    | /usr/bin/grep -E 'Path = .*Shanbay' \
    | /usr/bin/sed 's/.*Path = //' \
    | while read -r p; do
        echo "    forget: $p"
        pluginkit -r "$p" 2>/dev/null || true
      done || true
fi

rm -rf "$SAFARI_ROOT"
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/ShanbayHelper-"* 2>/dev/null || true
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/ShanbayLookup-"* 2>/dev/null || true
rm -rf "$HOME/Library/Containers/com.maicss.ShanbayHelper" 2>/dev/null || true
rm -rf "$HOME/Library/Containers/com.maicss.shanbayhelper.Extension" 2>/dev/null || true
rm -rf "$HOME/Library/Containers/com.ethan.ShanbayLookup" 2>/dev/null || true
rm -rf "$HOME/Library/Containers/com.ethan.ShanbayLookup.Extension" 2>/dev/null || true
rm -rf "$HOME/Library/WebKit/com.maicss.ShanbayHelper" 2>/dev/null || true
rm -rf "$HOME/Library/WebKit/com.ethan.ShanbayLookup" 2>/dev/null || true
rm -rf "$HOME/Applications/ShanbayHelper.app" 2>/dev/null || true
rm -rf "$HOME/Applications/ShanbayLookup.app" 2>/dev/null || true
rm -rf "/Applications/ShanbayHelper.app" 2>/dev/null || true
rm -rf "/Applications/ShanbayLookup.app" 2>/dev/null || true

# 3) Convert Chrome extension → new Safari Xcode project
echo "==> [3/6] Convert extension → Safari Xcode project"
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "error: safari-web-extension-converter not found (need full Xcode)."
  exit 1
fi

xcrun safari-web-extension-converter "$ROOT" \
  --project-location "$SAFARI_ROOT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

# Converter may nest as $SAFARI_ROOT/$APP_NAME/...
XCODE_PROJ="$(find "$SAFARI_ROOT" -name '*.xcodeproj' -type d | head -1 || true)"
if [[ -z "${XCODE_PROJ:-}" ]]; then
  echo "error: no .xcodeproj after converter"
  exit 1
fi
PROJ_DIR="$(dirname "$XCODE_PROJ")"
SCHEME="$(basename "$XCODE_PROJ" .xcodeproj)"
echo "    project: $XCODE_PROJ"
echo "    scheme:  $SCHEME"

# Resources path (…/Extension/Resources)
RES_DIR="$(find "$PROJ_DIR" -type d -path '*/Extension/Resources' | head -1 || true)"
if [[ -z "${RES_DIR:-}" ]]; then
  RES_DIR="$(find "$PROJ_DIR" -type d -name Resources | /usr/bin/grep -i extension | head -1 || true)"
fi
if [[ -z "${RES_DIR:-}" ]]; then
  echo "error: could not find Extension/Resources"
  find "$PROJ_DIR" -maxdepth 4 -type d
  exit 1
fi
echo "    resources: $RES_DIR"

# 4) Sync JS + Safari patches
echo "==> [4/6] Prepare Safari resources (bundle popup + background)"
"$ROOT/scripts/prepare-safari-resources.sh" "$RES_DIR"

# Force Team signing on both targets
PBXPROJ="$XCODE_PROJ/project.pbxproj"
if [[ -f "$PBXPROJ" ]]; then
  # Inject DEVELOPMENT_TEAM into every build configuration block if missing
  /usr/bin/python3 - "$PBXPROJ" "$TEAM_ID" <<'PY'
import re, sys
path, team = sys.argv[1], sys.argv[2]
text = open(path).read()
# Ensure Automatic signing + team
text2 = re.sub(
    r'(CODE_SIGN_STYLE = )[^;]+;',
    r'\1Automatic;',
    text,
)
if f'DEVELOPMENT_TEAM = {team};' not in text2:
    text2 = re.sub(
        r'(CODE_SIGN_STYLE = Automatic;)',
        rf'\1\n\t\t\t\tDEVELOPMENT_TEAM = {team};',
        text2,
    )
# Also add team near PRODUCT_BUNDLE_IDENTIFIER if still missing
if f'DEVELOPMENT_TEAM = {team};' not in text2:
    text2 = re.sub(
        r'(PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)',
        rf'\1\n\t\t\t\tDEVELOPMENT_TEAM = {team};',
        text2,
        count=8,
    )
open(path, 'w').write(text2)
print(f'    DEVELOPMENT_TEAM = {team}')
PY
fi

# Update ViewController extensionBundleIdentifier if present
VC="$(find "$PROJ_DIR" -name 'ViewController.swift' | head -1 || true)"
if [[ -n "${VC:-}" ]]; then
  EXT_ID="${BUNDLE_ID}.Extension"
  /usr/bin/sed -i '' \
    "s/let extensionBundleIdentifier = \".*\"/let extensionBundleIdentifier = \"${EXT_ID}\"/" \
    "$VC" || true
  echo "    extensionBundleIdentifier → $EXT_ID"
fi

# 5) Build
echo "==> [5/6] xcodebuild"
rm -rf "$DERIVED"
xcodebuild \
  -project "$XCODE_PROJ" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -derivedDataPath "$DERIVED" \
  -destination 'platform=macOS,arch=arm64' \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  build

APP="$(find "$DERIVED" -name "${SCHEME}.app" -type d | head -1 || true)"
if [[ -z "${APP:-}" ]]; then
  APP="$(find "$DERIVED" -name '*.app' -type d | head -1 || true)"
fi
if [[ -z "${APP:-}" || ! -d "$APP" ]]; then
  echo "error: build finished but .app not found under $DERIVED"
  exit 1
fi

# Verify popup content
POPUP="$(find "$APP" -path '*/Resources/popup.html' | head -1 || true)"
if [[ -n "${POPUP:-}" ]]; then
  if ! /usr/bin/grep -q 'word-input' "$POPUP"; then
    echo "error: built popup.html missing #word-input"
    exit 1
  fi
  if ! /usr/bin/grep -q 'popup-bundle.js\|sidepanel.mjs' "$POPUP"; then
    echo "warn: popup script tag unexpected"
  fi
  echo "    popup OK: $POPUP"
else
  echo "error: popup.html not packaged in app"
  exit 1
fi

# Install into ~/Applications for a stable path
mkdir -p "$HOME/Applications"
INSTALL="$HOME/Applications/${SCHEME}.app"
rm -rf "$INSTALL"
cp -R "$APP" "$INSTALL"
echo "    installed: $INSTALL"

# 6) Launch (registers extension with Safari)
echo "==> [6/6] Launch app to register extension"
open "$INSTALL"
sleep 1
# Also poke pluginkit
pluginkit -a "$INSTALL/Contents/PlugIns/"*.appex 2>/dev/null || true

echo
echo "============================================================"
echo " Fresh build ready"
echo "============================================================"
echo " App: $INSTALL"
echo
echo " NEXT STEPS (required once):"
echo "  1) Quit Safari completely (⌘Q) and reopen"
echo "  2) Safari → Settings → Extensions"
echo "  3) Disable/remove any old ShanbayHelper entries"
echo "  4) Enable  **${SCHEME}**  (or ShanbayLookup)"
echo "  5) Allow for All Websites"
echo "  6) Click the toolbar icon → you should see “Look up a word…”"
echo
echo " If the icon is missing: Safari toolbar right‑click → customize,"
echo " or enable the extension and reload the page."
echo "============================================================"
