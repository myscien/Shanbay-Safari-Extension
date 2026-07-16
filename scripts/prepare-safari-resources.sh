#!/usr/bin/env bash
# Sync Chrome extension sources into the Safari Xcode project Resources,
# bundle the background service worker (Safari lacks type:module SW),
# and patch the Safari manifest.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFARI_RES="${1:-$ROOT/../chrome-shanbay-v2-safari/ShanbayHelper/ShanbayHelper Extension/Resources}"

if [[ ! -d "$SAFARI_RES" ]]; then
  echo "error: Safari Resources not found at: $SAFARI_RES"
  echo "Run scripts/convert-to-safari.sh first."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "error: node/npx required to bundle background.js"
  exit 1
fi

echo "Syncing resources → $SAFARI_RES"

# Copy extension runtime files (not docs/scripts)
rsync -a --delete \
  --exclude '.git' \
  --exclude 'scripts' \
  --exclude 'SAFARI.md' \
  --exclude 'README.md' \
  --exclude '.DS_Store' \
  "$ROOT/" "$SAFARI_RES/"

# Safari does not support background.service_worker type:module — ship a classic IIFE bundle.
echo "Bundling background service worker for Safari..."
npx --yes esbuild "$ROOT/js/background.js" \
  --bundle \
  --format=iife \
  --outfile="$SAFARI_RES/js/background.js"

# Safari content scripts often fail on dynamic import() / ES modules — ship classic IIFE.
echo "Bundling content script for Safari..."
npx --yes esbuild "$ROOT/js/main.mjs" \
  --bundle \
  --format=iife \
  --outfile="$SAFARI_RES/js/content.js"

# Patch manifest for Safari
MANIFEST_PATH="$SAFARI_RES/manifest.json" node <<'NODE'
const fs = require('fs');
const path = process.env.MANIFEST_PATH;
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));

// Drop unsupported SW module type
if (manifest.background) {
  delete manifest.background.type;
}

// notifications / offscreen not supported on Safari
if (Array.isArray(manifest.permissions)) {
  manifest.permissions = manifest.permissions.filter(
    (p) => p !== 'notifications' && p !== 'offscreen'
  );
}

// Use bundled classic content script (not Chrome's module loader)
if (Array.isArray(manifest.content_scripts)) {
  for (const cs of manifest.content_scripts) {
    // Keep auth-bridge as plain classic script; bundle only the main lookup CS
    if (cs.js && cs.js.includes('js/content-loader.js')) {
      cs.js = ['js/content.js'];
    }
    if (cs.js && cs.js.includes('js/main.mjs')) {
      cs.js = ['js/content.js'];
    }
    cs.run_at = cs.run_at || 'document_idle';
  }
}

// Chrome-only field
delete manifest.minimum_chrome_version;

fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
console.log('Patched Safari manifest.json');
NODE

echo "Safari resources ready."
