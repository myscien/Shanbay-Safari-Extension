/**
 * Classic content-script bootstrap for Chrome.
 * Dynamically imports the ES module main.mjs (static imports of const.mjs).
 * Safari uses a pre-bundled IIFE (js/content.js) instead — see prepare-safari-resources.sh.
 */
(async () => {
  try {
    await import(chrome.runtime.getURL("js/main.mjs"));
  } catch (err) {
    // Always log hard load failures (content script cannot import shared debugLogger yet)
    console.error("[扇贝助手] failed to load content module:", err);
  }
})();
