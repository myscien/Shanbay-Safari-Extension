import {
  debugLogger,
  storageSettingMap,
  defaultIgnoreSites,
  getExtensionSettings,
  playAudio,
  SETTINGS_KEY,
  normalizeLookupWord,
  setDebugLogsEnabled,
} from './const.mjs';

// Bump this string whenever content-script behavior changes — check DevTools console.
export const CONTENT_BUILD = "2026-07-17-vocab-inline-v12";

// Content script entry (ES module). Safari gets an IIFE bundle of this file.
// Default settings immediately so double-click works before storage returns.
const storage = Object.assign({}, storageSettingMap);
  /** Clear "查询中" watchdog when a final result arrives */
  let lookupLoadingTimer = null;
  /** 当前选区的父级body
   * @type {DOM(body) | null}
   * */
  let selectionParentBody = null;

  // @param {DOM(range) | null}
  let selectionRange = null;

  // Slightly wider = fewer wrapped lines = less vertical scrolling
  const popoverWidth = 320;

  const escapeHtml = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  /**
   * Shanbay API wraps headwords in &lt;vocab&gt;…&lt;/vocab&gt;.
   * Convert to bold (safe HTML): escape all text, wrap vocab spans in &lt;b&gt;.
   * Empty &lt;vocab&gt;&lt;/vocab&gt; is dropped.
   * @param {unknown} s
   * @returns {string} safe HTML fragment
   */
  const formatShanbayHtml = (s) => {
    const t = String(s == null ? "" : s);
    const re = /<vocab\b[^>]*>([\s\S]*?)<\/vocab>/gi;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      out += escapeHtml(t.slice(last, m.index));
      const inner = m[1];
      if (inner) {
        out += `<b class="shanbay-vocab">${escapeHtml(inner)}</b>`;
      }
      last = m.index + m[0].length;
    }
    out += escapeHtml(t.slice(last));
    // Drop any leftover empty / unmatched vocab tags
    return out.replace(/&lt;\/?vocab\b[^&]*&gt;/gi, "");
  };

  /**
   * 从 chrome.storage 获取插件设置（sync 优先，Safari 等环境回退 local）
   * */
  const applyStorageDefaults = () => {
    if (storage.clickLookup === undefined) storage.clickLookup = true;
    if (storage.contextLookup === undefined) storage.contextLookup = true;
    if (storage.exampleSentence === undefined) storage.exampleSentence = true;
    if (storage.autoExampleSentence === undefined)
      storage.autoExampleSentence = false;
    if (storage.debugLogs === undefined) storage.debugLogs = false;
    setDebugLogsEnabled(!!storage.debugLogs);
    debugLogger(
      "info",
      `[Shanbay Helper] content build=${CONTENT_BUILD}`,
      storage,
    );
  };

  getExtensionSettings((settings) => {
    if (settings[SETTINGS_KEY] && Object.keys(settings[SETTINGS_KEY]).length) {
      settings[SETTINGS_KEY].forEach((item) => {
        Object.assign(storage, item);
      });
    }
    applyStorageDefaults();
  });

  /**
   * 监听设置变化的事件，如果修改了设置，就更新全局的storage的值
   * */
  chrome.storage.onChanged.addListener(function (changes) {
    debugLogger("info", "chrome storage changed");
    const change = changes[SETTINGS_KEY];
    if (!change || !change.newValue) return;
    change.newValue.forEach((item) => {
      Object.assign(storage, item);
    });
    setDebugLogsEnabled(!!storage.debugLogs);
  });
  /**
   * 双击事件和右键选中后的事件处理器。
   * @function pendingSearchSelection
   * @param {object}[event] - 双击事件的对象
   * 兼容性: node.getRootNode: chrome 54+
   * */
  const pendingSearchSelection = (event) => {
    if (defaultIgnoreSites.some((site) => location.hostname.includes(site)))
      return;
    if (
      storage.ignoreSites &&
      storage.ignoreSites.some((site) => location.hostname.includes(site))
    )
      return;

    const _popover = document.querySelector("#__shanbay-popover");
    if (_popover) return;
    let _selection = getSelection();
    if (!_selection.rangeCount) return;
    let _range = getSelection().getRangeAt(0);
    selectionRange = _range;
    if (event && storage.clickLookup !== false) {
      const root = event.target && event.target.getRootNode
        ? event.target.getRootNode()
        : document;
      selectionParentBody = (root && root.body) || document.body;
      const word = normalizeLookupWord(getSelection().toString());
      if (word) {
        popover({ loading: true, msg: "Looking up…" });
        debugLogger("info", "get word: ", word);
        if (lookupLoadingTimer) clearTimeout(lookupLoadingTimer);
        // Never leave loading forever (Safari async reply can drop)
        lookupLoadingTimer = setTimeout(() => {
          lookupLoadingTimer = null;
          popover({
            loading: false,
            data: {
              status: 504,
              msg: "Lookup timed out. Open web.shanbay.com, sign in, keep that tab open, then try again.",
            },
          });
        }, 16000);

        chrome.runtime.sendMessage(
          {
            action: "lookup",
            word,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              debugLogger(
                "warn",
                "lookup message failed:",
                chrome.runtime.lastError.message
              );
              // Final result may still arrive via onMessage
              return;
            }
            // lookupPending is just an ack — wait for final lookup via onMessage
            if (response && response.action === "lookupPending") return;
            if (response && response.action === "lookup") {
              if (lookupLoadingTimer) {
                clearTimeout(lookupLoadingTimer);
                lookupLoadingTimer = null;
              }
              popover({ loading: false, data: response.data });
            }
          }
        );
      }
    } else {
      selectionParentBody =
        (_range.startContainer &&
          _range.startContainer.ownerDocument &&
          _range.startContainer.ownerDocument.body) ||
        document.body;
    }
  };

  /**
   * 获取输入框中选中文本的坐标
   */
  const getSelectionRect = (range) => {
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return rect;
    }

    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT")
    ) {
      try {
        const mirrorDiv = document.createElement("div");
        const style = window.getComputedStyle(activeEl);

        // 复制样式
        Array.from(style).forEach((key) => {
          mirrorDiv.style.setProperty(key, style.getPropertyValue(key));
        });

        mirrorDiv.style.position = "absolute";
        mirrorDiv.style.visibility = "hidden";
        mirrorDiv.style.top = "-9999px";
        mirrorDiv.style.left = "-9999px";
        mirrorDiv.style.whiteSpace = "pre-wrap";

        // 对于 input，需要特殊处理 white-space
        if (activeEl.tagName === "INPUT") {
          mirrorDiv.style.whiteSpace = "pre";
        }

        const text = activeEl.value;
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;

        const beforeText = text.substring(0, start);
        const selectedText = text.substring(start, end);
        const afterText = text.substring(end);

        const span = document.createElement("span");
        span.textContent = selectedText;

        mirrorDiv.textContent = beforeText;
        mirrorDiv.appendChild(span);
        mirrorDiv.appendChild(document.createTextNode(afterText));

        document.body.appendChild(mirrorDiv);

        const spanRect = span.getBoundingClientRect();
        const inputRect = activeEl.getBoundingClientRect();

        // 计算相对位置
        // 注意：这里只是简化的计算，可能需要考虑 scroll 等因素
        // 实际上 mirrorDiv 应该完全重叠在 activeEl 上才能最准确，但那样会遮挡
        // 所以我们计算 span 在 mirrorDiv 中的 offset，然后应用到 activeEl 上

        // 更准确的做法：
        // 将 mirrorDiv 放置在 body 中，但是位置和 activeEl 一致（或者不一致，只算相对位移）
        // 这里我们采用计算 span 相对于 mirrorDiv 的偏移量，加上 activeEl 的位置

        // 由于 mirrorDiv 的样式复制了 padding border 等，内容区域应该是一致的
        // 但是 scrollLeft / scrollTop 需要处理

        const mirrorRect = mirrorDiv.getBoundingClientRect();
        const spanRelativeTop = spanRect.top - mirrorRect.top;
        const spanRelativeLeft = spanRect.left - mirrorRect.left;

        const top = inputRect.top + spanRelativeTop - activeEl.scrollTop;
        const left = inputRect.left + spanRelativeLeft - activeEl.scrollLeft;

        document.body.removeChild(mirrorDiv);

        return {
          top: top,
          left: left,
          width: spanRect.width,
          height: spanRect.height,
          bottom: top + spanRect.height,
          right: left + spanRect.width,
          x: left,
          y: top
        };

      } catch (e) {
        debugLogger("error", "Error calculating textarea rect", e);
        return rect;
      }
    }
    return rect;
  };

  /**
   * @desc 根据弹窗高度动态计算弹出框位置。
   * @desc 1，页面居中位置，空间足够时，弹窗在单词的正下方
   * @desc 2，单词靠近左边区域，左边区域不支持弹窗居中显示，则弹窗位置以选中区域的左边缘为起点
   * @desc 3，单词靠近右边区域，右边区域不支持弹窗居中显示，则弹窗位置以选中区域的右边缘为终点
   * @desc 5，单词靠近屏幕底部区域，底部区域空间不够窗向下显示，则弹窗位置以选中区域的上部开始向上渲染
   * @desc 6，如果选中区域上方下方的高度都不能放下弹窗内容，则使用较高的空间展示弹窗，且使弹窗滚动
   * @desc 也即是每次 __shanbay-popover 内容有更新或者显示后，根据选中文本计算当前弹窗的位置，以保证不滚动可视区域的时候，可以完整看到弹窗。
   * 不return了，直接修改dom样式
   * returns {{popper: {top: number, left: number}, arrow: {top: string, left: number, bottom: string}} - 计算后的位置和最大高度
   */
  function calculatePopoverPosition() {
    const arrowSize = 11;
    const SPACING = 8;
    const MIN_HEIGHT = 160;
    // Long definitions: use almost the whole screen, not only the gap under the word
    const VIEWPORT_HEIGHT_RATIO = 0.92;

    const mainContainer = document.querySelector("#__shanbay-popover");
    if (!mainContainer) return;
    const inner = mainContainer.querySelector("#shanbay-inner");
    const scrollEl = mainContainer.querySelector("#shanbay-scroll");
    const arrowEl = mainContainer.querySelector("#shanbay-arrow");

    // Fixed to the viewport so long content cannot run off-screen with the page
    mainContainer.style.setProperty("position", "fixed", "important");
    mainContainer.style.setProperty("z-index", "2147483646", "important");
    mainContainer.style.setProperty("width", popoverWidth + "px", "important");

    // Measure true content height — uncapped (title + body + sticky footer)
    if (inner) {
      inner.style.setProperty("max-height", "none", "important");
      inner.style.setProperty("overflow", "visible", "important");
      inner.classList.remove("is-scrollable");
    }
    if (scrollEl) {
      scrollEl.style.setProperty("max-height", "none", "important");
      scrollEl.style.setProperty("overflow", "visible", "important");
    }
    mainContainer.style.setProperty("max-height", "none", "important");
    mainContainer.style.removeProperty("height");

    const naturalHeight = mainContainer.offsetHeight || 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let rect;
    try {
      rect = selectionRange
        ? getSelectionRect(selectionRange)
        : { top: 80, bottom: 100, left: 80, right: 80, width: 0, height: 0 };
    } catch (e) {
      rect = { top: 80, bottom: 100, left: 80, right: 80, width: 0, height: 0 };
    }
    // Fallback if selection rect is empty/invalid
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.bottom === 0)) {
      rect = {
        top: Math.min(120, viewportHeight / 4),
        bottom: Math.min(140, viewportHeight / 4 + 20),
        left: Math.max(SPACING, viewportWidth / 2 - 40),
        right: Math.max(SPACING, viewportWidth / 2 + 40),
        width: 80,
        height: 20,
      };
    }

    // Cap by nearly full viewport (not by space above/below the word only)
    const maxViewport = Math.max(
      MIN_HEIGHT,
      Math.floor(viewportHeight * VIEWPORT_HEIGHT_RATIO),
    );
    const displayHeight = Math.min(naturalHeight, maxViewport);
    const maxInnerHeight = Math.max(MIN_HEIGHT, displayHeight);
    const needsScroll = naturalHeight > maxViewport + 1;

    const arrow = {
      top: `-${arrowSize}px`,
      left: "50%",
      bottom: "unset",
      rotate: "0deg",
    };

    // Prefer near the word; if tall, shift within the viewport so we can grow tall
    const topIfBelow = rect.bottom + arrowSize;
    const topIfAbove = rect.top - displayHeight - arrowSize;
    let top;
    let placeBelow = true;

    if (topIfBelow + displayHeight <= viewportHeight - SPACING) {
      // Fits entirely under the word
      top = topIfBelow;
      placeBelow = true;
    } else if (topIfAbove >= SPACING) {
      // Fits entirely above the word
      top = topIfAbove;
      placeBelow = false;
    } else {
      // Tall content: pin into the viewport (use full allowed height).
      // Stay as close to the word as possible without going off-screen.
      top = Math.min(topIfBelow, viewportHeight - SPACING - displayHeight);
      top = Math.max(SPACING, top);
      // Arrow points toward the selection
      const popoverMid = top + displayHeight / 2;
      const selMid = (rect.top + rect.bottom) / 2;
      placeBelow = selMid <= popoverMid;
    }

    if (!placeBelow) {
      arrow.top = "unset";
      arrow.bottom = `-${arrowSize}px`;
      arrow.rotate = "180deg";
      arrow.left = `calc(50% - ${arrowSize}px)`;
    }

    // --- horizontal ---
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    if (left < SPACING) {
      left = SPACING;
      arrow.left = Math.min(Math.max(rect.left + rect.width / 2 - left, 12), popoverWidth - 24) + "px";
    } else if (left + popoverWidth > viewportWidth - SPACING) {
      left = Math.max(SPACING, viewportWidth - SPACING - popoverWidth);
      const selectionCenter = rect.left + rect.width / 2;
      let arrowLeft = selectionCenter - left - arrowSize;
      arrowLeft = Math.max(6, Math.min(arrowLeft, popoverWidth - arrowSize * 2 - 6));
      arrow.left = arrowLeft + "px";
    }

    // Shell (inner) is a flex column: title + scroll body + sticky footer.
    // Only #shanbay-scroll scrolls so footer buttons stay visible.
    if (inner) {
      inner.style.setProperty("max-height", maxInnerHeight + "px", "important");
      inner.style.setProperty("width", popoverWidth - 4 + "px", "important");
      inner.style.setProperty("display", "flex", "important");
      inner.style.setProperty("flex-direction", "column", "important");
      inner.style.setProperty("overflow", "hidden", "important");
      if (needsScroll) {
        inner.classList.add("is-scrollable");
      } else {
        inner.classList.remove("is-scrollable");
      }
    }
    if (scrollEl) {
      scrollEl.style.setProperty("flex", "1 1 auto", "important");
      scrollEl.style.setProperty("min-height", "0", "important");
      scrollEl.style.setProperty("overflow-x", "hidden", "important");
      scrollEl.style.setProperty("overflow-y", "auto", "important");
      if (!scrollEl.__shanbayWheelBound) {
        scrollEl.__shanbayWheelBound = true;
        scrollEl.addEventListener(
          "wheel",
          (e) => {
            const el = e.currentTarget;
            if (el.scrollHeight > el.clientHeight + 1) {
              e.stopPropagation();
            }
          },
          { passive: true },
        );
      }
    }

    mainContainer.style.setProperty("top", top + "px", "important");
    mainContainer.style.setProperty("left", left + "px", "important");
    mainContainer.style.setProperty("right", "auto", "important");
    mainContainer.style.setProperty("bottom", "auto", "important");
    mainContainer.classList.remove("invisible");

    if (arrowEl) {
      arrowEl.style.left = arrow.left;
      arrowEl.style.top = arrow.top;
      arrowEl.style.bottom = arrow.bottom;
      arrowEl.style.rotate = arrow.rotate;
    }

    // Focus so keyboard shortcuts work without clicking the popover first
    focusPopover(mainContainer);

    debugLogger(
      "info",
      `[Shanbay Helper] popover layout  build=${CONTENT_BUILD}  natural=${naturalHeight}px  max=${maxInnerHeight}px  scroll=${needsScroll}`,
    );
  }

  /**
   * Make the popover keyboard-focusable and move focus into it (no page scroll).
   * Required for reliable Esc/A/E/1/2 shortcuts, especially on Safari.
   */
  function focusPopover(el) {
    if (!el) return;
    try {
      if (!el.hasAttribute("tabindex")) {
        el.setAttribute("tabindex", "-1");
      }
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "Shanbay Helper lookup");
      // Defer until after layout / paint so focus sticks
      requestAnimationFrame(() => {
        try {
          el.focus({ preventScroll: true });
        } catch (_) {
          try {
            el.focus();
          } catch (__) {
            /* ignore */
          }
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * 根据参数和设置渲染弹出框，并处理弹出框上的各种事件
   * @function popover
   * @param {object} res
   * @param {boolean} [res.loading] - 查询前的准备状态和未登录的提示
   * @param {object} [res.data] - 查询结果
   * */
  const popover = (res) => {
    /** 如果全局的父级body不存在，使用pendingSearchSelection查找父级body，是右键查询，非事件触发使用的*/
    if (!selectionParentBody) {
      pendingSearchSelection();
    }

    /** 先根据选区确定弹出框的位置，生成弹出框，然后根据参数和设置，往里面插入内容*/
    let html = `<div id="__shanbay-popover" class="invisible" tabindex="-1" role="dialog" aria-label="Shanbay Helper lookup">
      <div id="shanbay-arrow"></div>
      <div id="shanbay-inner">
        <div id="shanbay-title" style="border: none;"></div>
      </div>
    </div>`;

    /** 这里是为了防止多次调用popover产生多个弹出框的。因为一次查询最起码会调用两次popover*/
    if (!selectionParentBody) {
      selectionParentBody = document.body;
    }
    // Always mount on document.body so position:fixed is viewport-relative
    // (a transformed ancestor would otherwise break fixed positioning).
    const mountRoot = document.body || selectionParentBody;
    if (!mountRoot) {
      debugLogger("warn", "no document.body to attach popover");
      return;
    }
    let mainContainer = document.querySelector("#__shanbay-popover");
    if (!mainContainer) {
      mountRoot.insertAdjacentHTML("beforeEnd", html);
      mainContainer = document.querySelector("#__shanbay-popover");
    } else if (mainContainer.parentElement !== mountRoot) {
      mountRoot.appendChild(mainContainer);
    }
    if (!mainContainer) return;

    if (res.loading) {
      /** 查询之前和未登录的提示信息*/
      mainContainer.querySelector("#shanbay-title").innerHTML = res.msg;
      // Must position + remove .invisible or the loading bubble stays hidden
      try {
        calculatePopoverPosition();
      } catch (e) {
        mainContainer.classList.remove("invisible");
        mainContainer.style.top = "80px";
        mainContainer.style.left = "80px";
        focusPopover(mainContainer);
      }
    } else if (res.data && res.data.msg) {
      const st = res.data.status;
      const msg = String(res.data.msg || "");
      const needLogin =
        [400, 401, 403].includes(st) ||
        /登录|过期|auth|未登录|log\s*in|expired|session/i.test(msg);
      const loginActions = needLogin
        ? `<div class="login" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px;">
            <a href="https://web.shanbay.com/web/account/login/" target="_blank" class="shanbay-btn">Log in</a>
            <a href="https://web.shanbay.com/" target="_blank" class="shanbay-btn">Open Shanbay</a>
          </div>
          <div class="login-hint">After logging in, refresh this page and look up again</div>`
        : "";
      mainContainer.querySelector("#shanbay-inner").innerHTML = `
    <div id="shanbay-title" class="has-error">
      <div class="error-message">${msg}</div>
      ${loginActions}
    </div>`;
      try {
        calculatePopoverPosition();
      } catch (e) {
        mainContainer.classList.remove("invisible");
      }
    } else if (!res.data) {
      mainContainer.querySelector("#shanbay-title").innerHTML = "No results";
      try {
        calculatePopoverPosition();
      } catch (e) {
        mainContainer.classList.remove("invisible");
      }
    } else {
      /** 查询单词或者单词其他操作成功*/
      let data = res.data;
      const esc = escapeHtml;
      const assemblyPronunciationStr = () => {
        if (!data.audios || !data.audios.length) {
          debugLogger("warn", "no audios[] on word result");
          return "";
        }
        let str = "";
        const first = data.audios[0] || {};
        const ukUrl =
          first.uk && first.uk.urls && first.uk.urls[0]
            ? first.uk.urls[0]
            : "";
        const usUrl =
          first.us && first.us.urls && first.us.urls[0]
            ? first.us.urls[0]
            : "";
        if (first.uk) {
          str += "<div class='pron-row'>";
          str += `<span>uk: </span><small>/${esc(first.uk.ipa || "")}/</small> `;
          if (ukUrl) {
            str += `<span class="speaker uk" data-target="${esc(ukUrl)}" title="Play UK" role="button" tabindex="0"></span> `;
          }
          str += "</div>";
        }
        if (first.us) {
          str += "<div class='pron-row'>";
          str += `<span>us: </span><small>/${esc(first.us.ipa || "")}/</small> `;
          if (usUrl) {
            str += `<span class="speaker us" data-target="${esc(usUrl)}" title="Play US" role="button" tabindex="0"></span> `;
          }
          str += "</div>";
        }
        if (!ukUrl && !usUrl) {
          debugLogger("warn", "audios present but no uk/us urls", first);
        }
        return str;
      };

      // Safe definition lists (API shape can vary / miss fields)
      const defs = data.definitions || {};
      const cnDefs = Array.isArray(defs.cn) ? defs.cn : [];
      const enDefs = Array.isArray(defs.en) ? defs.en : [];
      const cnHtml =
        storage.paraphrase !== "English" && cnDefs.length
          ? `<div><b>Chinese:</b> ${cnDefs
              .map(
                (p) =>
                  `<div><span class="def-pos">${formatShanbayHtml(p.pos)} </span><span class="def-text">${formatShanbayHtml(p.def)}</span></div>`
              )
              .join("")}</div>`
          : "";
      const enHtml =
        storage.paraphrase !== "Chinese" && enDefs.length
          ? `<div><b>English:</b> ${enDefs
              .map(
                (p) =>
                  `<div><span class="def-pos">${formatShanbayHtml(p.pos)} </span><span class="def-text">${formatShanbayHtml(p.def)}</span></div>`
              )
              .join("")}</div>`
          : "";

      let contentHtml = "";
      try {
        contentHtml = `
      <div id="shanbay-title">
          <span class="word">${esc(data.content)}</span>
          <a class="check-detail" href="https://web.shanbay.com/wordsweb/#/detail/${esc(data.id)}" target="_blank"> Details </a>
          <div class="phonetic-symbols">${assemblyPronunciationStr()}</div>
      </div>
      <div id="shanbay-scroll">
          <div id="shanbay-content">
              <div class="simple-definition">
                  ${cnHtml}
                  ${enHtml}
              </div>
              <div id="shanbay-example-sentence-div" class="hide"></div>
          </div>
      </div>
      <div id="shanbay-footer">
            <span id="shanbay-example-sentence-span" class="hide"><button type="button" id="shanbay-example-sentence-btn" class="shanbay-btn">Examples</button></span>
            ${data.exists === "error" ? "" : `<span id="shanbay-add-word-span"><button type="button" id="shanbay-add-word-btn" class="shanbay-btn ${data.exists ? "forget" : ""}">${data.exists ? "Forgot" : "Add"}</button></span>`}
      </div>
    `;
      } catch (buildErr) {
        debugLogger("error", "build popover HTML failed", buildErr);
        contentHtml = `<div id="shanbay-title" class="has-error"><div class="error-message">Render error: ${esc(buildErr && buildErr.message)}</div></div>`;
      }

      mainContainer.querySelector("#shanbay-inner").innerHTML = contentHtml;

      try {
        calculatePopoverPosition();
        // Re-measure after layout (fonts / multi-line wrap)
        requestAnimationFrame(() => {
          try {
            calculatePopoverPosition();
          } catch (_) {
            /* ignore */
          }
        });
      } catch (posErr) {
        debugLogger("warn", "calculatePopoverPosition failed", posErr);
        mainContainer.classList.remove("invisible");
      }

      /** 发音：event delegation on popover root */
      if (!mainContainer.__shanbayAudioDelegated) {
        mainContainer.__shanbayAudioDelegated = true;
        mainContainer.addEventListener(
          "click",
          function (e) {
            const btn =
              e.target && e.target.closest
                ? e.target.closest(".speaker")
                : null;
            if (!btn || !mainContainer.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            const now = Date.now();
            if (
              mainContainer.__shanbayLastPlay &&
              now - mainContainer.__shanbayLastPlay < 400
            ) {
              return;
            }
            mainContainer.__shanbayLastPlay = now;
            const src =
              btn.getAttribute("data-target") || btn.dataset.target || "";
            if (!src) {
              debugLogger("error", "speaker click but data-target empty");
              return;
            }
            playAudio(src);
          },
          true
        );
      }

      const autoRead =
        data.__shanbayExtensionSettings &&
        data.__shanbayExtensionSettings.autoRead;
      if (autoRead && autoRead !== "false") {
        const autoBtn = mainContainer.querySelector(".speaker." + autoRead);
        if (autoBtn) {
          playAudio(
            autoBtn.getAttribute("data-target") || autoBtn.dataset.target
          );
        }
      }

      const exampleSentenceBtn = mainContainer.querySelector(
        "#shanbay-example-sentence-btn",
      );
      const exampleSentenceSpan = mainContainer.querySelector(
        "#shanbay-example-sentence-span",
      );

      /** Add / Forgot */
      const addWordBtn = mainContainer.querySelector("#shanbay-add-word-btn");
      const sendAddOrForget = () => {
        if (!addWordBtn || addWordBtn.classList.contains("hide")) return;
        chrome.runtime.sendMessage(
          {
            action: "addOrForget",
            word: data.content,
            wordID: data.id,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              debugLogger("warn", chrome.runtime.lastError.message);
              return;
            }
            if (response) handleBackgroundMessage(response);
          }
        );
      };
      if (addWordBtn) {
        if (data.exists === true) {
          addWordBtn.addEventListener("click", sendAddOrForget);
        } else if (data.exists === false) {
          if (storage.addBook) {
            addWordBtn.className = "hide";
            sendAddOrForget();
          } else {
            addWordBtn.addEventListener("click", sendAddOrForget);
          }
        }
      }

      const requestExamples = () => {
        if (!data.id) return;
        chrome.runtime.sendMessage(
          { action: "getWordExample", id: data.id },
          (response) => {
            if (chrome.runtime.lastError) {
              debugLogger("warn", chrome.runtime.lastError.message);
              return;
            }
            if (response) handleBackgroundMessage(response);
          }
        );
      };

      const showExampleButton =
        storage.exampleSentence !== false || storage.autoExampleSentence;
      if (showExampleButton && exampleSentenceSpan && exampleSentenceBtn) {
        exampleSentenceSpan.classList.remove("hide");
        exampleSentenceBtn.addEventListener("click", requestExamples);
      }

      // Optional: auto-load examples after definition render
      if (storage.autoExampleSentence) {
        requestExamples();
      }

      // Expose actions for keyboard shortcuts
      mainContainer.__shanbayActions = {
        /** A — add new word */
        add: () => {
          if (data.exists === false) sendAddOrForget();
        },
        /** F — mark as forgotten (already in book) */
        forget: () => {
          if (data.exists === true) sendAddOrForget();
        },
        examples: requestExamples,
        playUk: () => {
          const btn = mainContainer.querySelector(".speaker.uk");
          if (btn)
            playAudio(btn.getAttribute("data-target") || btn.dataset.target);
        },
        playUs: () => {
          const btn = mainContainer.querySelector(".speaker.us");
          if (btn)
            playAudio(btn.getAttribute("data-target") || btn.dataset.target);
        },
      };
    }
  };

  /** Handle background → content payloads (callback and/or onMessage) */
  const handleBackgroundMessage = (res) => {
    if (!res || !res.action) return;
    const addWordSpan = document.querySelector("#shanbay-add-word-span");
    const exampleSentenceDiv = document.querySelector(
      "#shanbay-example-sentence-div",
    );
    const exampleSentenceSpan = document.querySelector(
      "#shanbay-example-sentence-span",
    );
    switch (res.action) {
      case "lookup":
        // Clear loading / show result (Safari delivers final result here)
        if (lookupLoadingTimer) {
          clearTimeout(lookupLoadingTimer);
          lookupLoadingTimer = null;
        }
        popover({ loading: false, data: res.data });
        break;
      case "lookupPending":
        break;
      case "playSound":
        playAudio(res.url);
        break;
      case "addOrForget":
        if (addWordSpan) {
          if (res.data && res.data.errors === "SUCCESS") {
            addWordSpan.innerHTML = "Add failed";
          } else {
            addWordSpan.innerHTML = "Added";
          }
        }
        break;
      case "getWordExample":
        if (!exampleSentenceDiv || !Array.isArray(res.data)) break;
        exampleSentenceDiv.innerHTML = res.data
          .map((item, index) => {
            const en = formatShanbayHtml(item.content_en);
            const cn = formatShanbayHtml(item.content_cn);
            const audioUrl =
              item.audio &&
              item.audio.us &&
              item.audio.us.urls &&
              item.audio.us.urls[0]
                ? item.audio.us.urls[0]
                : "";
            const speaker = audioUrl
              ? ` <span class="speaker" data-target="${audioUrl}"></span>`
              : "";
            return `<p>${index + 1}, ${en}${speaker}</p><p>  ${cn}</p>`;
          })
          .join("");
        exampleSentenceDiv.className = "simple-definition";
        if (exampleSentenceSpan) exampleSentenceSpan.innerHTML = "";
        Array.from(exampleSentenceDiv.querySelectorAll(".speaker")).forEach(
          (dom) => {
            dom.addEventListener("click", function (e) {
              e.preventDefault();
              e.stopPropagation();
              playAudio(
                this.getAttribute("data-target") || this.dataset.target
              );
            });
          },
        );
        calculatePopoverPosition();
        break;
    }
  };

  /** 与 background 交互，返回信息的处理 (also used by context menu path) */
  chrome.runtime.onMessage.addListener(function (res) {
    handleBackgroundMessage(res);
  });
  /**
   * 隐藏弹出框
   * @function hidePopover
   * @param {number} delay, ms 隐藏弹出框的延迟
   * */
  const hidePopover = (delay) => {
    setTimeout(function () {
      const el = document.querySelector("#__shanbay-popover");
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      selectionParentBody = null;
    }, delay || 0);
  };

  /** Keyboard: Esc close · A add · F forget · E examples · 1 UK · 2 US */
  const onPopoverKeydown = (e) => {
    const pop = document.querySelector("#__shanbay-popover");
    if (!pop || pop.classList.contains("invisible")) return;

    // Allow shortcuts when focus is on the popover OR anywhere on the page
    // (except real form fields the user is typing into).
    const tag = (e.target && e.target.tagName) || "";
    const inField =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      (e.target && e.target.isContentEditable);
    if (inField && !pop.contains(e.target)) return;

    const key = e.key;
    const actions = pop.__shanbayActions || {};

    if (key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hidePopover();
      return;
    }
    if (key === "a" || key === "A") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof actions.add === "function") actions.add();
      return;
    }
    if (key === "f" || key === "F") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof actions.forget === "function") actions.forget();
      return;
    }
    if (key === "e" || key === "E") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof actions.examples === "function") actions.examples();
      return;
    }
    if (key === "1") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof actions.playUk === "function") actions.playUk();
      return;
    }
    if (key === "2") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof actions.playUs === "function") actions.playUs();
    }
  };

  if (
    document.addEventListener ||
    event.type === "load" ||
    document.readyState === "complete"
  ) {
    debugLogger("info", "content script ready, dblclick enabled");
    document.addEventListener("dblclick", pendingSearchSelection);
    document.addEventListener("click", function (e) {
      /** 屏蔽弹出框的双击事件*/
      const _popover = document.querySelector("#__shanbay-popover");
      if (_popover && selectionParentBody) {
        if (!e.composedPath().some((ele) => ele === _popover)) {
          hidePopover();
        }
      }
    });
    document.addEventListener("keydown", onPopoverKeydown, true);
  }

