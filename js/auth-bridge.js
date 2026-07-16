/**
 * Runs on shanbay.com pages. Harvests visible auth signals for the extension.
 * HttpOnly cookies are NOT visible here; those are handled via chrome.cookies / page fetch.
 */
(() => {
  const harvest = () => {
    const payload = {
      action: "authHarvest",
      href: location.href,
      cookie: document.cookie || "",
      localStorage: {},
      sessionStorage: {},
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /auth|token|user|session|jwt|login/i.test(k)) {
          payload.localStorage[k] = localStorage.getItem(k);
        }
      }
    } catch (_) {
      /* ignore */
    }
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && /auth|token|user|session|jwt|login/i.test(k)) {
          payload.sessionStorage[k] = sessionStorage.getItem(k);
        }
      }
    } catch (_) {
      /* ignore */
    }
    try {
      chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
    } catch (_) {
      /* ignore */
    }
  };

  harvest();
  setInterval(harvest, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") harvest();
  });
})();
