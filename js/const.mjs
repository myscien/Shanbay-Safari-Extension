/**
 * @author maicss
 * @file some licences file
 * @copyright 2017-2020 maicss
 * */

/** 检测是否是开发模式，用来控制日志的输出
 * @type {boolean}
 * */
const devMode = !("update_url" in chrome.runtime.getManifest());

/** 解析每日需要复习单词接口返回的加密字符串。从源码里扒出来的  */
const decodeDailyTaskResponse = (encryptedString) => {
  const re_btou = new RegExp( ["[À-ß][-¿]", "[à-ï][-¿]{2}", "[ð-÷][-¿]{3}"].join("|"), "g" );
  const fromCharCode = String.fromCharCode;
  const cb_btou = function (t) {
    switch (t.length) {
      case 4:
        const e =
          (((7 & t.charCodeAt(0)) << 18) |
            ((63 & t.charCodeAt(1)) << 12) |
            ((63 & t.charCodeAt(2)) << 6) |
            (63 & t.charCodeAt(3))) -
          65536;
        return (
          fromCharCode(55296 + (e >>> 10)) + fromCharCode(56320 + (1023 & e))
        );
      case 3:
        return fromCharCode(
          ((15 & t.charCodeAt(0)) << 12) |
            ((63 & t.charCodeAt(1)) << 6) |
            (63 & t.charCodeAt(2))
        );
      default:
        return fromCharCode(
          ((31 & t.charCodeAt(0)) << 6) | (63 & t.charCodeAt(1))
        );
    }
  };
  const btou = (t) => t.replace(re_btou, cb_btou);
  const _decode = (t) => btou(atob(t));
  const checkVersionI = (string) => {
    const e = string.charCodeAt();
    return 65 <= e ? e - 65 : e - 65 + 41;
  };
  const checkVersion = (string) =>
    ((32 * checkVersionI(string[0]) + checkVersionI(string[1])) *
      checkVersionI(string[2]) +
      checkVersionI(string[3])) %
      32 <=
    1;
  const decode = (string) =>
    _decode(
      String(string)
        .replace(/[-_]/g, function (t) {
          return "-" == t ? "+" : "/";
        })
        .replace(/[^A-Za-z0-9\+\/]/g, "")
    );

  class f {
    _char = ".";
    _children = {};

    getChar() {
      return this._char;
    }

    getChildren() {
      return this._children;
    }

    setChar(t) {
      this._char = t;
    }
    setChildren(t, e) {
      this._children[t] = e;
    }
  }

  class m {
    static get(t) {
      return t >>> 0;
    }

    static xor(t, e) {
      return this.get(this.get(t) ^ this.get(e));
    }

    static and(t, e) {
      return this.get(this.get(t) & this.get(e));
    }

    static mul(t, e) {
      const r = ((4294901760 & t) >>> 0) * e;
      const n = (65535 & t) * e;
      return this.get((r >>> 0) + (n >>> 0));
    }

    static or(t, e) {
      return this.get(this.get(t) | this.get(e));
    }

    static not(t) {
      return this.get(~this.get(t));
    }

    static shiftLeft(t, e) {
      return this.get(this.get(t) << e);
    }

    static shiftRight(t, e) {
      return this.get(t) >>> e;
    }
    static mod(t, e) {
      return this.get(this.get(t) % e);
    }
  }

  class n {
    static loop(number, handler) {
      return "v"
        .repeat(number)
        .split("")
        .map((index, val) => handler(val));
    }
  }

  class o {
    _status = [];
    _mat1 = 0;
    _mat2 = 0;
    _tmat = 0;

    seed(e) {
      n.loop(4, (t) => {
        e.length > t
          ? (this._status[t] = m.get(e.charAt(t).charCodeAt()))
          : (this._status[t] = m.get(110));
      }),
        (this._mat1 = this._status[1]),
        (this._mat2 = this._status[2]),
        (this._tmat = this._status[3]),
        this._init();
    }

    _next_state() {
      let e = this._status[3];
      let t = m.xor(
        m.and(this._status[0], 2147483647),
        m.xor(this._status[1], this._status[2])
      );
      (t = m.xor(t, m.shiftLeft(t, 1))),
        (e = m.xor(e, m.xor(m.shiftRight(e, 1), t))),
        (this._status[0] = this._status[1]),
        (this._status[1] = this._status[2]),
        (this._status[2] = m.xor(t, m.shiftLeft(e, 10))),
        (this._status[3] = e),
        (this._status[1] = m.xor(
          this._status[1],
          m.and(-m.and(e, 1), this._mat1)
        )),
        (this._status[2] = m.xor(
          this._status[2],
          m.and(-m.and(e, 1), this._mat2)
        ));
    }

    generate(t) {
      this._next_state();
      let e,
        r = void 0;
      return (
        (r = this._status[3]),
        (e = m.xor(this._status[0], m.shiftRight(this._status[2], 8))),
        (r = m.xor(r, e)),
        (r = m.xor(m.and(-m.and(e, 1), this._tmat), r)) % t
      );
    }

    _init() {
      n.loop(7, (t) => {
        this._status[(t + 1) & 3] = m.xor(
          this._status[(t + 1) & 3],
          t +
            1 +
            m.mul(
              1812433253,
              m.xor(this._status[3 & t], m.shiftRight(this._status[3 & t], 30))
            )
        );
      }),
        0 == (2147483647 & this._status[0]) &&
          0 === this._status[1] &&
          0 === this._status[2] &&
          0 === this._status[3] &&
          ((this._status[0] = 66),
          (this._status[1] = 65),
          (this._status[2] = 89),
          (this._status[3] = 83)),
        n.loop(8, this._next_state.bind(this));
    }
  }

  class a {
    s = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    c = [1, 2, 2, 2, 2, 2];

    constructor() {
      this._random = new o()
      this._sign = ""
      this._inter = {}
      this._head = new f()
    }
    init(string) {
      this._random.seed(string)
      this._sign = string
      n.loop(64, (t) => {
        this._addSymbol(
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[
            t
          ],
          this.c[parseInt((t + 1) / 11)]
        );
      })
      this._inter["="] = "="
    }

    _addSymbol(t, e) {
      var r = this, head = this._head,  o = "";
      return (
        n.loop(e, (t) => {
          for (let e = this.s[r._random.generate(32)]; e in head.getChildren() && "." !== head.getChildren()[e].getChar();)
            e = r.s[r._random.generate(32)];
          (o += e),
            e in head.getChildren() || head.setChildren(e, new f()),
            (head = head.getChildren()[e]);
        }),
        head.setChar(t), (this._inter[t] = o)
      );
    }

    decode(t) {
      for (let e = "", r = 4; r < t.length; )
        if ("=" !== t[r]) {
          for (let n = this._head; t[r] in n.getChildren(); )
            (n = n.getChildren()[t[r]]), r++;
          e += n.getChar();
        } else (e += "="), r++;
      return e;
    }
  }
  if (checkVersion(encryptedString)) {
    const e = new a();
    e.init(encryptedString.substr(0, 4));
    const r = e.decode(encryptedString);
    return decode(r)
  } else {
    debugLogger('error', 'Daily task check version failed', encryptedString)
    return {total: 0}
  }
};

/**
 * 开发模式的log打印
 * @function debugLogger
 * @param {string} 属于console的任何log的等级
 * @param {*} msg log信息
 * @summary 如果是任何情况下都要打印的信息，就用console，如果只是调试的信息，就用debugLogger
 * */
export const debugLogger = (level, ...msg) => {
  if (devMode) console[level](...msg);
};

/** Settings storage key shared across background / content / options */
export const SETTINGS_KEY = "__shanbayExtensionSettings";

/**
 * Prefer storage.sync (Chrome), fall back to storage.local (Safari / restricted environments).
 * @returns {chrome.storage.StorageArea}
 */
export const getSettingsStorageArea = () => {
  try {
    if (chrome.storage && chrome.storage.sync) return chrome.storage.sync;
  } catch (_) {
    /* ignore */
  }
  return chrome.storage.local;
};

/**
 * Read extension settings from sync, then local if empty/unavailable.
 * @param {(result: object) => void} callback
 */
export const getExtensionSettings = (callback) => {
  const finish = (result) => callback(result || {});
  const localGet = () => {
    chrome.storage.local.get(SETTINGS_KEY, (localResult) => {
      finish(localResult || {});
    });
  };
  try {
    if (!chrome.storage.sync) {
      localGet();
      return;
    }
    chrome.storage.sync.get(SETTINGS_KEY, (result) => {
      if (chrome.runtime.lastError) {
        debugLogger("warn", "storage.sync.get failed, use local", chrome.runtime.lastError);
        localGet();
        return;
      }
      if (result && Object.keys(result).length) {
        finish(result);
      } else {
        localGet();
      }
    });
  } catch (e) {
    debugLogger("warn", "getExtensionSettings error", e);
    localGet();
  }
};

/**
 * Persist settings to local always, and sync when available (Chrome).
 * @param {Array|object} settings
 * @param {(error?: chrome.runtime.LastError) => void} [callback]
 */
export const setExtensionSettings = (settings, callback) => {
  const data = { [SETTINGS_KEY]: settings };
  chrome.storage.local.set(data, () => {
    const localError = chrome.runtime.lastError;
    if (chrome.storage.sync) {
      chrome.storage.sync.set(data, () => {
        if (typeof callback === "function") {
          callback(chrome.runtime.lastError || localError);
        }
      });
    } else if (typeof callback === "function") {
      callback(localError);
    }
  });
};

/** Reuse one Audio element to avoid Safari autoplay / instance issues */
let sharedAudio = null;
/** Resume under user gesture so later plays are allowed (Safari) */
let sharedAudioCtx = null;

const unlockAudioForSafari = () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!sharedAudioCtx) sharedAudioCtx = new AC();
      if (sharedAudioCtx.state === "suspended") {
        sharedAudioCtx.resume().catch((e) =>
          debugLogger("warn", "AudioContext.resume failed", e)
        );
      }
    }
  } catch (e) {
    debugLogger("warn", "unlockAudioForSafari failed", e);
  }
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    sharedAudio.addEventListener("error", () => {
      debugLogger("error", "Audio element error", sharedAudio.error);
    });
  }
};

const playFromSrc = (src) => {
  unlockAudioForSafari();
  try {
    sharedAudio.pause();
  } catch (_) {
    /* ignore */
  }
  sharedAudio.src = src;
  sharedAudio.volume = 1;
  let p;
  try {
    p = sharedAudio.play();
  } catch (err) {
    return Promise.reject(err);
  }
  if (p && typeof p.catch === "function") {
    return p.catch((err) => {
      debugLogger("warn", "playFromSrc rejected", err && err.name, err);
      throw err;
    });
  }
  return Promise.resolve();
};

/**
 * Decode data URL and play via Web Audio (Safari-friendly after unlock).
 * @param {string} dataUrl
 */
const playWithWebAudio = async (dataUrl) => {
  unlockAudioForSafari();
  if (!sharedAudioCtx) throw new Error("no AudioContext");
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  const decoded = await sharedAudioCtx.decodeAudioData(buf.slice(0));
  const source = sharedAudioCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(sharedAudioCtx.destination);
  source.start(0);
};

/**
 * Play remote pronunciation audio.
 * Safari often blocks cross-origin Audio(url) (CORS / media CDN). Fall back to
 * fetching bytes in the extension background and playing a blob/data URL.
 * Must call from a click handler so we can unlock audio under user gesture.
 * @param {string} url
 */
export const playAudio = (url) => {
  if (!url) return;

  // Critical for Safari: unlock audio graph synchronously inside the click
  unlockAudioForSafari();

  const tryDirect = () => playFromSrc(url);

  const tryViaBackground = () =>
    new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: "fetchAudio", url }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!res || !res.dataUrl) {
            reject(new Error((res && res.error) || "no audio data"));
            return;
          }
          playFromSrc(res.dataUrl)
            .then(resolve)
            .catch(() =>
              playWithWebAudio(res.dataUrl).then(resolve).catch(reject)
            );
        });
      } catch (e) {
        reject(e);
      }
    });

  tryDirect().catch((e) => {
    debugLogger("warn", "direct remote play failed", e);
  });

  tryViaBackground().catch((err2) => {
    debugLogger("error", "playAudio failed", err2);
  });
};

/**
 * chrome 通知处理方法, 传入的参数就是chrome notifications的参数
 * @function notify
 * @param {object} opt - chrome notifications 的参数
 * @param {string} opt.title=Shanbay Helper - notifications title
 * @param {string} [opt.message=Time to review your Shanbay words] - notifications message
 * @param {string} [opt.url=https://www.shanbay.com/] - notifications url, notifications可以点击跳转
 * */
export const notify = (opt = {title: 'Shanbay Helper', message: 'Time to review your Shanbay words', url: 'https://www.shanbay.com/'}) => {
  // chrome.notifications is not available in Safari Web Extensions
  if (!chrome.notifications || !chrome.notifications.create) {
    debugLogger("warn", "notifications API unavailable; badge-only reminder", opt.message);
    return;
  }
  const options = {
    type: "basic",
    title: opt.title,
    message: opt.message,
    iconUrl: "../images/icon_48.png",
  };
  let noteID = Math.random().toString(36);
  chrome.notifications.create(noteID, options);
  chrome.notifications.onClicked.addListener(function (notifyID) {
    debugLogger("log", `notification [${notifyID}] was clicked`);
    chrome.notifications.clear(notifyID);
    if (noteID === notifyID) {
      chrome.tabs.create({
        url: opt.url,
      });
    }
  });
};

/**
 * Collect all Shanbay-related cookies the extension can see.
 * Safari often stores them under web.shanbay.com host-only, so apiv3 fetch
 * with credentials:include does not attach them automatically.
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
export const getShanbayCookies = async () => {
  if (!chrome.cookies || !chrome.cookies.getAll) return [];

  const queries = [
    { domain: "shanbay.com" },
    { domain: ".shanbay.com" },
    { url: "https://web.shanbay.com/" },
    { url: "https://www.shanbay.com/" },
    { url: "https://apiv3.shanbay.com/" },
    { name: "auth_token" },
  ];

  const byKey = new Map();
  for (const q of queries) {
    const list = await new Promise((resolve) => {
      try {
        chrome.cookies.getAll(q, (cookies) => {
          if (chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          resolve(cookies || []);
        });
      } catch (_) {
        resolve([]);
      }
    });
    for (const c of list) {
      if (!c || !c.name) continue;
      byKey.set(`${c.domain}|${c.name}|${c.path}`, c);
    }
  }
  return Array.from(byKey.values());
};

/**
 * Best-effort: copy auth cookies onto apiv3 so credentials:include can send them (Safari).
 */
const ensureApiv3AuthCookies = async (cookies) => {
  if (!chrome.cookies || !chrome.cookies.set) return;
  const auth = cookies.find((c) => c.name === "auth_token") || cookies[0];
  if (!auth || !auth.value) return;

  const targets = [
    "https://apiv3.shanbay.com/",
    "https://web.shanbay.com/",
    "https://www.shanbay.com/",
  ];

  await Promise.all(
    targets.map(
      (url) =>
        new Promise((resolve) => {
          try {
            chrome.cookies.set(
              {
                url,
                name: "auth_token",
                value: auth.value,
                path: "/",
                secure: true,
                // Do not set domain host-only so it applies to this host
                expirationDate:
                  auth.expirationDate || Math.floor(Date.now() / 1000) + 86400 * 30,
              },
              () => resolve()
            );
          } catch (_) {
            resolve();
          }
        })
    )
  );
};

/** Race a promise against a timeout rejection. */
export const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject({ status: 504, msg: message || `Timed out (${ms}ms)` }), ms);
    }),
  ]);

/**
 * Wait until a tab finishes loading (or timeout).
 * @param {number} tabId
 * @param {number} [timeoutMs]
 */
const waitTabComplete = (tabId, timeoutMs = 6000) =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        chrome.tabs.onUpdated.removeListener(onUpdated);
      } catch (_) {
        /* ignore */
      }
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    try {
      chrome.tabs.onUpdated.addListener(onUpdated);
    } catch (_) {
      finish();
      return;
    }
    try {
      chrome.tabs.get(tabId, (tab) => {
        if (tab && tab.status === "complete") finish();
      });
    } catch (_) {
      /* ignore */
    }
    setTimeout(finish, timeoutMs);
  });

/**
 * Find an existing Shanbay tab, or open one (short wait).
 * @returns {Promise<{ tabId: number, created: boolean }>}
 */
const getOrOpenShanbayTab = async () => {
  const existing = await new Promise((resolve) => {
    try {
      chrome.tabs.query(
        { url: ["*://*.shanbay.com/*", "*://shanbay.com/*"] },
        (tabs) => resolve(tabs || [])
      );
    } catch (_) {
      resolve([]);
    }
  });
  if (existing.length) {
    return { tabId: existing[0].id, created: false };
  }
  const tab = await new Promise((resolve, reject) => {
    try {
      chrome.tabs.create(
        { url: "https://web.shanbay.com/wordsweb/", active: false },
        (t) => {
          if (chrome.runtime.lastError || !t) {
            reject(
              new Error(
                chrome.runtime.lastError?.message || "Could not open Shanbay page"
              )
            );
            return;
          }
          resolve(t);
        }
      );
    } catch (e) {
      reject(e);
    }
  });
  await waitTabComplete(tab.id, 6000);
  await new Promise((r) => setTimeout(r, 800));
  return { tabId: tab.id, created: true };
};

/**
 * Run a request inside a Shanbay tab.
 * Uses synchronous XHR so Safari executeScript does not hang on async fetch.
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
const fetchInShanbayPage = async (url, options = {}) => {
  if (!chrome.scripting || !chrome.scripting.executeScript) {
    throw new Error("scripting API unavailable");
  }
  const { tabId } = await getOrOpenShanbayTab();
  const method = options.method || "GET";
  const body = options.body || null;
  const headerObj = {};
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => {
        headerObj[k] = v;
      });
    } else {
      Object.assign(headerObj, options.headers);
    }
  }

  // SYNC function — Safari often does not await async results from executeScript
  const injectFn = (fetchUrl, fetchMethod, fetchBody, fetchHeaders) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(fetchMethod || "GET", fetchUrl, false);
      xhr.withCredentials = true;
      if (fetchHeaders) {
        Object.keys(fetchHeaders).forEach((k) => {
          try {
            xhr.setRequestHeader(k, fetchHeaders[k]);
          } catch (_) {
            /* ignore forbidden headers */
          }
        });
      }
      xhr.send(fetchBody || null);
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch (_) {
        data = { msg: xhr.responseText || "" };
      }
      return {
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data,
      };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        data: { msg: e && e.message ? e.message : String(e) },
      };
    }
  };

  const runInject = (useMainWorld) =>
    chrome.scripting.executeScript({
      target: { tabId },
      ...(useMainWorld ? { world: "MAIN" } : {}),
      func: injectFn,
      args: [url, method, body, headerObj],
    });

  let results;
  try {
    results = await withTimeout(
      runInject(true),
      8000,
      "Shanbay page request timed out"
    );
  } catch (mainWorldErr) {
    debugLogger("warn", "MAIN world inject failed, try isolated", mainWorldErr);
    results = await withTimeout(
      runInject(false),
      8000,
      "Shanbay page request timed out"
    );
  }

  const result = results && results[0] && results[0].result;
  if (!result) {
    throw new Error("No response from Shanbay page (open web.shanbay.com and sign in)");
  }
  return result;
};

const isAuthErrorBody = (status, body) => {
  const msg = (body && (body.msg || body.message)) || "";
  return (
    status === 401 ||
    status === 403 ||
    (status === 404 && /登录|login|过期|auth/i.test(msg)) ||
    /登录信息过期|未登录|请登录/i.test(msg)
  );
};

/**
 * 基于fetch的网络请求方法的封装，只有两种数据的返回，buffer和json，因为这个应用里面只用到了这两种
 * @function request
 * @see [use fetch API]{@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch}
 * @param {string} url - request url
 * @param {object} [options] - fetch options
 * @param {string} [options.type='buffer'] - whether need return buffer
 * @return Promise
 * */
export const request = async (url, options = {}) => {
  const { type, headers: inputHeaders, ...rest } = options;
  const headers = new Headers(inputHeaders || {});
  const isShanbayApi =
    typeof url === "string" && url.includes("shanbay.com");

  // --- Path A: direct extension fetch (works on Chrome) ---
  let cookies = [];
  try {
    if (isShanbayApi) {
      cookies = await getShanbayCookies();
      if (cookies.length) {
        await ensureApiv3AuthCookies(cookies);
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        if (cookieHeader && !headers.has("Cookie")) {
          try {
            headers.set("Cookie", cookieHeader);
          } catch (_) {
            /* forbidden */
          }
        }
        const auth = cookies.find((c) => c.name === "auth_token");
        if (auth && auth.value && !headers.has("Authorization")) {
          headers.set("Authorization", auth.value);
        }
        debugLogger(
          "info",
          "request with cookies",
          cookies.map((c) => `${c.name}@${c.domain}`),
          url
        );
      } else {
        debugLogger("warn", "no shanbay cookies for direct fetch", url);
      }
    }
  } catch (e) {
    debugLogger("warn", "cookie attach failed", e);
  }

  // Audio buffers: always direct fetch (no JSON auth path needed as much)
  if (type === "buffer") {
    const res = await fetch(url, {
      ...rest,
      headers,
      credentials: "include",
      mode: "cors",
    });
    if (res.ok) return res.arrayBuffer();
    return Promise.reject({ status: res.status, msg: "Audio failed to load" });
  }

  let directBody = null;
  let directStatus = 0;
  let directOk = false;
  try {
    const res = await fetch(url, {
      ...rest,
      headers,
      credentials: "include",
      mode: "cors",
    });
    directStatus = res.status;
    directOk = res.ok;
    try {
      directBody = await res.json();
    } catch (_) {
      directBody = { msg: res.statusText || "Request failed" };
    }
    if (directOk) return directBody;
  } catch (e) {
    debugLogger("warn", "direct fetch failed", e);
    directBody = { msg: e && e.message ? e.message : "Request failed" };
  }

  // --- Path B (Safari): fetch inside a real Shanbay tab page context ---
  if (isShanbayApi && (!directOk || isAuthErrorBody(directStatus, directBody))) {
    debugLogger("info", "falling back to Shanbay-tab page fetch", url);
    try {
      const pageHeaders = {};
      if (
        rest.method === "POST" ||
        (options.method || "").toUpperCase() === "POST"
      ) {
        pageHeaders["Content-Type"] =
          headers.get("Content-Type") || "application/json";
      }
      const pageResult = await withTimeout(
        fetchInShanbayPage(url, {
          method: options.method || rest.method || "GET",
          body: options.body || rest.body || null,
          headers: pageHeaders,
        }),
        12000,
        "Lookup timed out. Open web.shanbay.com, sign in, then try again."
      );
      if (pageResult.ok) {
        return pageResult.data;
      }
      const msg =
        (pageResult.data && (pageResult.data.msg || pageResult.data.message)) ||
        "Session expired";
      const status = isAuthErrorBody(pageResult.status, pageResult.data)
        ? 401
        : pageResult.status || 401;
      return Promise.reject({
        status,
        ...(pageResult.data || {}),
        msg:
          status === 401
            ? "Session expired: open web.shanbay.com in this browser, sign in again, keep that tab open, then look up again."
            : msg,
      });
    } catch (e) {
      debugLogger("error", "page fetch failed", e);
      const msg =
        (e && e.msg) ||
        (e && e.message) ||
        String(e) ||
        "Could not use Shanbay session";
      return Promise.reject({
        status: (e && e.status) || 401,
        msg:
          /超时|timeout/i.test(msg)
            ? msg
            : "Could not use Shanbay session: open https://web.shanbay.com, sign in, keep the tab open, then try again. Details: " +
              msg,
      });
    }
  }

  const msg = (directBody && (directBody.msg || directBody.message)) || "Request failed";
  const status =
    isAuthErrorBody(directStatus, directBody) ? 401 : directStatus || 500;
  return Promise.reject({ status, ...(directBody || {}), msg });
};

/**
 * 扇贝API
 * @constant
 * @readonly
 * @enum {object}
 * */
const shanbayAPI = {
  /** 查询单词*/
  lookUp: {
    method: "GET",
    url: "https://apiv3.shanbay.com/abc/words/senses?vocabulary_content={word}",
    params: ["word"],
  },
  wordCheck: {
    method: "GET",
    url: "https://apiv3.shanbay.com/wordscollection/words_check?vocab_ids={id}",
    params: ["id"],
  },
  wordExample: {
    method: "GET",
    url: "https://apiv3.shanbay.com/abc/words/vocabularies/{id}/examples",
    params: ["id"],
  },
  /** 添加生词和标记已添加生词已忘记 */
  addOrForget: {
    method: "POST",
    url: "https://apiv3.shanbay.com/news/words",
    params: {"vocab_id":"","business_id":2,"paragraph_id":"1","sentence_id":"A1","source_content":"","article_id":"ca","source_name":"","summary":""}
  },
  // 今日需要复习
  dailyReview: {
    method: "GET",
    url: "https://apiv3.shanbay.com/wordscollection/learning/words/today_learning_items?page=1&type_of=REVIEW&ipp=10",
  },
};

/**
 * 扩展设置的名称、名称的说明、取值范围的数组
 * @namespace {Array} extensionSpecification
 * @property {string} * - 各种名称
 * @property {string} desc - 名称的说明
 * @property {Array} enum - 取值范围
 * */
const extensionSpecification = [
  {clickLookup: true, desc: "Double-click lookup",  enum: [true, false], type: "radio"},
  {contextLookup: true, desc: "Context-menu lookup", enum: [true, false], type: "radio"},
  {addBook: false, desc: "Auto-add to vocabulary book", enum: [true, false], type: "radio"},
  {alarm: true, desc: "Study reminder", enum: [true, false], type: "radio"},
  {reminderContent: 'Time to review your Shanbay words', desc: 'Reminder text', type: 'text'},
  {autoRead: "false", desc: "Auto pronunciation", enum: ["en", "us", "false"], type: "select"},
  {paraphrase: "bilingual", desc: "Default definitions", enum: ["Chinese", "English", "bilingual"], type: "select"},
  {exampleSentence: true, desc: "Show example-sentence button", enum: [true, false], type: "radio"},
  { ignoreSites: [], desc: "Blocked sites", type: "textarea" },
];
// 默认屏蔽的网站
export const defaultIgnoreSites = ["shanbay.com", "hjenglish.com", "codepen.io", "jsfiddle.net", "jsbin.com", "codesandbox.io", "github1s.com"];
/**
 * 由extensionSpecification去除描述和取值范围之后生成的真正能使用的数组
 * a array of {settingName: value}
 * @type {Array}
 * @see extensionSpecification
 * */
export const storageSettingArray = extensionSpecification.map((setting) => {
  delete setting.enum;
  delete setting.desc;
  return setting;
});

/**
 * 由storageSettingArray数组生成的map
 * @type {Object}
 * */
export let storageSettingMap = {};
storageSettingArray.forEach((item) => {
  Object.assign(storageSettingMap, item);
});

/**
 * Promise wrapper for chrome.cookies callbacks (Safari is picky about cookie access).
 * @param {(cb: Function) => void} fn
 * @returns {Promise<any>}
 */
const cookiesCall = (fn) =>
  new Promise((resolve) => {
    try {
      fn((result) => {
        if (chrome.runtime.lastError) {
          debugLogger("warn", "cookies API error", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(result);
      });
    } catch (e) {
      debugLogger("warn", "cookies API threw", e);
      resolve(null);
    }
  });

/**
 * Read Shanbay login token / session for popup UI.
 * Safari often fails the simple Chrome cookie query, so try several strategies
 * and fall back to an authenticated API probe.
 * @returns {Promise<string>} non-empty if logged in
 */
export const getAuthToken = async () => {
  // Prefer real auth_token cookie (needed for API)
  const all = await getShanbayCookies();
  if (all.length) {
    debugLogger(
      "info",
      "shanbay cookies found",
      all.map((c) => `${c.name}@${c.domain}`)
    );
    const auth = all.find((c) => c.name === "auth_token");
    if (auth && auth.value) {
      await ensureApiv3AuthCookies(all);
      return auth.value;
    }
    const likely = all.find((c) =>
      /auth|token|session|jwt|sid/i.test(c.name || "")
    );
    if (likely && likely.value) {
      await ensureApiv3AuthCookies(all);
      return likely.value;
    }
  }

  // Cookie stores (Safari can use non-default stores)
  if (chrome.cookies && chrome.cookies.getAllCookieStores) {
    const stores = await cookiesCall((cb) => chrome.cookies.getAllCookieStores(cb));
    if (Array.isArray(stores)) {
      for (const store of stores) {
        const cookies = await cookiesCall((cb) =>
          chrome.cookies.getAll(
            { storeId: store.id, domain: "shanbay.com", name: "auth_token" },
            cb
          )
        );
        if (cookies && cookies[0] && cookies[0].value) {
          return cookies[0].value;
        }
      }
    }
  }

  // Last resort: do not treat unauthenticated API errors as logged-in
  return "";
};

/**
 * Structured login state for popup / diagnostics.
 * @returns {Promise<{ loggedIn: boolean, status: 'logged_in'|'logged_out'|'error', message: string }>}
 */
export const getAuthStatus = async () => {
  try {
    const token = await getAuthToken();
    if (token && String(token).length) {
      return {
        loggedIn: true,
        status: "logged_in",
        message: "Logged in to Shanbay",
      };
    }
    return {
      loggedIn: false,
      status: "logged_out",
      message:
        "Not logged in: open web.shanbay.com and sign in in this browser (Safari users must sign in in Safari, not only Chrome)",
    };
  } catch (e) {
    return {
      loggedIn: false,
      status: "error",
      message: "Could not check login status. Refresh and try again.",
    };
  }
};

/**
 * Normalize a user selection into a lookup word.
 * Strips wrapping punctuation/quotes; keeps internal hyphens and apostrophes
 * (e.g. well-known, don't). Returns null if not a usable English word/phrase.
 * @param {unknown} raw
 * @returns {string|null}
 */
export const normalizeLookupWord = (raw) => {
  let s = String(raw == null ? "" : raw).trim();
  if (!s) return null;

  // Unwrap common quotes
  s = s.replace(/^["'`“”‘’«»]+|["'`“”‘’«»]+$/g, "").trim();
  // Strip leading/trailing punctuation & symbols (keep letters for next pass)
  s = s.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z]+$/, "").trim();
  if (!s) return null;

  // Collapse internal whitespace
  s = s.replace(/\s+/g, " ");

  // English letters; allow internal hyphen/apostrophe; optional multi-word phrase
  // well-known | don't | rock-n-roll | New York (two words)
  if (
    !/^[A-Za-z]+(?:['’\-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['’\-][A-Za-z]+)*)*$/.test(
      s
    )
  ) {
    return null;
  }

  // Avoid dumping whole paragraphs into the API
  if (s.length > 64 || s.split(/\s+/).length > 5) return null;

  return s;
};

/**
 * Turn API/network failures into clear Chinese messages for the popover.
 * @param {any} data
 * @returns {{ status: number, msg: string }}
 */
export const formatLookupError = (data) => {
  if (!data) {
    return { status: 500, msg: "Lookup failed. Please try again later." };
  }
  if (data.message === "Failed to fetch" || data.name === "TypeError") {
    return {
      status: 400,
      msg: "Network error: make sure you are logged into Shanbay in this browser, then refresh the page and try again.",
    };
  }
  const status = Number(data.status) || 500;
  let msg = data.msg || data.message || data.detail || "Lookup failed";
  if (typeof msg !== "string") msg = "Lookup failed";

  if (status === 401 || status === 403 || /登录|过期|auth|unauthorized|log\s*in|expired/i.test(msg)) {
    return {
      status: status === 403 ? 403 : 401,
      msg: "Not logged in or session expired. Open web.shanbay.com, sign in, then look up again on this page.",
    };
  }
  if (status === 404 && /登录|过期|log\s*in|expired/i.test(msg)) {
    return {
      status: 401,
      msg: "Not logged in or session expired. Open web.shanbay.com, sign in, then try again.",
    };
  }
  if (status === 504 || /超时|timeout/i.test(msg)) {
    return {
      status: 504,
      msg:
        msg.includes("web.shanbay")
          ? msg
          : "Lookup timed out. Open web.shanbay.com, sign in, keep that tab open, then try again.",
    };
  }
  if (status === 404) {
    return { status: 404, msg: msg || "Word not found" };
  }
  return { status, msg };
};

/**
 * @description 查询单词
 * @function lookUp
 * @param {string} word - 需要查询的单词
 * @return Promise<object>
 * */
export const lookUp = word => request((shanbayAPI.lookUp.url).replace('{word}', word), {method: shanbayAPI.wordExample.method})

export const checkWordAdded = wordID => request(shanbayAPI.wordCheck.url.replace('{id}', wordID), {method: shanbayAPI.wordExample.method})

export const getWordExampleSentence = wordID => request(shanbayAPI.wordExample.url.replace('{id}', wordID), {method: shanbayAPI.wordExample.method})

/**
 * @description 添加单词到单词本或忘记单词
 * @param {string} word - 单词
 * @param {string} wordID - 单词id
 * @return Promise<object>
 */
export const addOrForget = (word, wordID) => request(shanbayAPI.addOrForget.url, {
    method: shanbayAPI.addOrForget.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({"article_id":"","business_id":2,"vocab_id":wordID,"paragraph_id":"","sentence_id":"","source_content":"","source_name":"","summary":word}),
  });

export const getDailyTaskCount = () =>
  request(shanbayAPI.dailyReview).then(decodeDailyTaskResponse);
