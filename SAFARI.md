# Running 扇贝助手 on Safari

Yes — this project can run as a **Safari Web Extension**. The JavaScript is written against the same WebExtensions APIs Chrome uses (`chrome.*`). Safari on macOS supports most of them.

This document covers what was adapted, what you still need on your Mac, and how to install it.

## Is it possible?

| Goal | Possible? | Cost |
|------|-----------|------|
| Use on **your Mac Safari** (dev / personal) | Yes | Free (Apple ID + Xcode free) |
| Publish on **Mac App Store** for others | Yes | Apple Developer Program (~$99/year) |
| Install from Chrome Web Store into Safari | No | — |

## What we changed for Safari compatibility

Chrome-only pieces were reduced:

1. **Audio** — no longer depends on `chrome.offscreen` (Chrome-only). Pronunciation plays in the **content script** with `new Audio(url)` (works in Chrome and Safari).
2. **Settings storage** — `storage.sync` with **fallback to `storage.local`** when sync is empty or unavailable.
3. **Manifest** — removed the `offscreen` permission.
4. **Context menu** — stable menu id; removed invalid `location.hostname` checks in the service worker.
5. **Options URL** — popup opens options via `chrome.runtime.getURL('options.html')`.

Core features (lookup API, cookies login check, popover, context menu, alarms) use standard extension APIs that Safari generally supports.

## Prerequisites (your machine)

1. **macOS** with **Safari**
2. **Xcode** from the Mac App Store
3. Free **Apple ID** signed into Xcode (Settings → Accounts)
4. **Node.js** (for bundling the background service worker for Safari)

## Temporary vs permanent install

| Method | Survives Safari quit? | When to use |
|--------|----------------------|-------------|
| **Add Temporary Extension…** | **No** — gone every time Safari restarts | Quick debug only |
| **Xcode app (signed)** | **Yes** — stays in Extensions list | Daily use |

If you must re-add the extension after quitting Safari, you are on the temporary path. Use the permanent steps below.

## Permanent install (recommended)

### 1. Sign in to Xcode with your Apple ID (free is OK)

1. Open **Xcode**
2. **Xcode → Settings… → Accounts**
3. **+** → **Apple ID** → sign in  
   (no $99 needed for personal use on your Mac)

### 2. Open the Safari project

```bash
open /Users/ethan/Desktop/chrome-shanbay-v2-safari/ShanbayHelper/ShanbayHelper.xcodeproj
```

### 3. Set Team on **both** targets

In the left sidebar:

1. Click the blue **ShanbayHelper** project
2. Select target **ShanbayHelper** → **Signing & Capabilities**
   - **Team**: your name / Personal Team  
   - **Automatically manage signing**: ON  
3. Select target **ShanbayHelper Extension** → same **Team**

If Xcode complains about bundle ID, change both to unique IDs, e.g.:

- App: `com.YOURNAME.ShanbayHelper`
- Extension: `com.YOURNAME.ShanbayHelper.Extension`

(Extension id must start with the app id.)

Also update `ViewController.swift` if you change the extension bundle id:

```swift
let extensionBundleIdentifier = "com.YOURNAME.ShanbayHelper.Extension"
```

### 4. Sync latest JS + build

```bash
cd /Users/ethan/Desktop/chrome-shanbay-v2
./scripts/prepare-safari-resources.sh
```

In Xcode: **Product → Run (⌘R)**

### 5. Enable once in Safari

1. Safari → Settings → **Extensions**
2. Enable **ShanbayHelper** / 扇贝助手v2  
3. Allow **All Websites**
4. Developer → **Allow unsigned extensions** only if Safari still requires it for your cert

### 6. Keep the app installed

The extension lives inside the **ShanbayHelper.app** container. After a successful Run:

- Leave the app in place, or copy it to **Applications** from  
  `~/Library/Developer/Xcode/DerivedData/.../Build/Products/Debug/ShanbayHelper.app`
- You do **not** need Temporary Extension anymore
- Quitting Safari should **not** remove it

### Update code later (recommended: one command)

```bash
./scripts/rebuild-safari.sh
```

This syncs JS/CSS into the Safari project, runs `xcodebuild`, and opens `ShanbayHelper.app`.

Manual alternative:

```bash
./scripts/prepare-safari-resources.sh
# then ⌘R in Xcode again
```

### If the extension disappears again

- Re-run the app once from Xcode (⌘R)
- Confirm **Team** is still set (not “None”)
- Free “Personal Team” certs can expire; open Xcode → Accounts → manage certificates / rebuild

## Regenerate from scratch (optional)

```bash
./scripts/convert-to-safari.sh
```

Or manually:

```bash
xcrun safari-web-extension-converter /Users/ethan/Desktop/chrome-shanbay-v2 \
  --project-location /Users/ethan/Desktop/chrome-shanbay-v2-safari \
  --app-name "ShanbayHelper" \
  --bundle-identifier com.maicss.shanbayhelper \
  --macos-only \
  --copy-resources \
  --force

./scripts/prepare-safari-resources.sh
```

## Step 3 — Log into Shanbay in Safari

The extension reads the `auth_token` cookie for `shanbay.com`.

1. Open https://web.shanbay.com in **Safari** and log in.
2. Reload any page where you want double-click lookup.
3. Click the extension icon — login state should show learning buttons if the cookie is visible.

## Alternative: temporary extension (newer Safari)

Recent Safari versions can load an unpacked web extension for development:

1. Safari → Settings → Advanced → enable **Show features for web developers**
2. Safari → Settings → Developer → allow **unsigned extensions** if shown
3. Add / load the extension folder that contains `manifest.json`

Exact labels vary by macOS/Safari version. If temporary load fails, use the Xcode converter path above.

## Smoke-test checklist

After enabling:

- [ ] Popup opens when clicking the toolbar icon  
- [ ] Logged into shanbay.com in Safari → popup shows learning actions  
- [ ] Double-click an English word on a normal webpage → definition popover  
- [ ] Speaker icons play audio  
- [ ] Right-click selection → “Look up … in Shanbay”  
- [ ] Options page saves settings  

## Known Safari caveats

- **Cookies / privacy**: Safari Intelligent Tracking Prevention may affect third-party cookies. Login detection and API calls rely on being logged into Shanbay **in Safari** and on host permission for `*.shanbay.com`.
- **Website access**: If double-click does nothing, Safari may not have granted the extension access to that site.
- **Notifications / alarms**: Supported but may need notification permission on macOS.
- **iPhone / iPad**: Possible with a multi-platform Safari Web Extension target, but more work and App Store distribution; start with **macOS only**.
- **App Store**: Public install requires an Apple Developer membership and review.

## Keep Chrome working

These changes stay compatible with Chrome:

- Load unpacked from this same folder in `chrome://extensions`
- Audio uses the content script path on Chrome too (simpler than offscreen)

## If something fails

| Symptom | What to try |
|---------|-------------|
| Extension missing in Safari | Run container app once; check Settings → Extensions |
| No popover on double-click | Grant All Websites access; refresh page |
| “请登录” / API fail | Log into shanbay.com in Safari; check cookies permission |
| No audio | Check system autoplay / mute; open Web Inspector on the page |
| Converter not found | Install full Xcode (not only Command Line Tools), open Xcode once |

## Summary

- **Possible:** yes for personal macOS Safari use.  
- **How:** convert with `safari-web-extension-converter` → build in Xcode → enable in Safari → log into Shanbay.  
- **Pay:** not required for personal use; ~$99/year only if you publish on the App Store.
