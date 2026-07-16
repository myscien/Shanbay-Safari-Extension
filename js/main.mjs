import {
  debugLogger,
  storageSettingMap,
  defaultIgnoreSites,
  getExtensionSettings,
  playAudio,
  SETTINGS_KEY,
} from './const.mjs';

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

  const popoverWidth = 280;

  /**
   * 从 chrome.storage 获取插件设置（sync 优先，Safari 等环境回退 local）
   * */
  getExtensionSettings((settings) => {
    debugLogger("info", "chrome storage loaded", settings);
    if (settings[SETTINGS_KEY] && Object.keys(settings[SETTINGS_KEY]).length) {
      settings[SETTINGS_KEY].forEach((item) => {
        Object.assign(storage, item);
      });
    }
    // Ensure required defaults if missing from stored settings
    if (storage.clickLookup === undefined) storage.clickLookup = true;
    if (storage.contextLookup === undefined) storage.contextLookup = true;
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
      let matchResult = getSelection()
        .toString()
        .trim()
        .match(/^[a-zA-Z\s']+$/);
      if (matchResult) {
        popover({ loading: true, msg: "查询中...." });
        debugLogger("info", "get word: ", matchResult[0]);
        if (lookupLoadingTimer) clearTimeout(lookupLoadingTimer);
        // Never leave "查询中" forever (Safari async reply can drop)
        lookupLoadingTimer = setTimeout(() => {
          lookupLoadingTimer = null;
          popover({
            loading: false,
            data: {
              status: 504,
              msg: "查询超时：请打开 web.shanbay.com 并登录，保持标签页打开后重试",
            },
          });
        }, 16000);

        chrome.runtime.sendMessage(
          {
            action: "lookup",
            word: matchResult[0],
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
    const arrwoWidth = 11
    // 默认的垂直和水平间距
    const SPACING = 4;


    // 1. 获取选中区域的边界矩形 (相对于视口)
    const rect = getSelectionRect(selectionRange);
    debugLogger("rect", rect);

    // 2. 获取视口的尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const popper = { top: 0, left: 0 };
    const arrow = {
      top: "-11px",
      left: "50%",
      bottom: "unset",
      rotate: "0deg",
    };

    // --- 垂直定位 (Y 轴) ---

    // 选中区域下方空间
    const spaceBelow = viewportHeight - rect.bottom - SPACING;
    // 选中区域上方空间
    const spaceAbove = rect.top - SPACING;
    let maxHeight = Math.max(spaceBelow, spaceAbove); // 初始最大高度为理想高度
    const mainContainer = document.querySelector("#__shanbay-popover");
    const popoverHeight = mainContainer.offsetHeight;
    mainContainer.style.maxHeight = maxHeight + "px";

    // 优先尝试向下渲染
    if (spaceBelow >= popoverHeight) {
      // ✅ 空间足够，向下显示
      popper.top = rect.bottom + arrwoWidth;
      maxHeight = popoverHeight;
    } else if (spaceAbove >= popoverHeight) {
      // ✅ 下方不足，但上方足够，向上显示
      popper.top = rect.top - popoverHeight - arrwoWidth;
      maxHeight = popoverHeight;
      arrow.top = "unset";
      arrow.left = `calc(50% - ${arrwoWidth}px)`;
      arrow.rotate = "180deg";
      arrow.bottom = `-${arrwoWidth}px`;
    } else {
      // ⚠️ 上下空间都不足，选择空间较大的一侧并设置 maxHeight 启用滚动

      if (spaceBelow >= spaceAbove && spaceBelow > 0) {
        // ⬇️ 下方空间较大 (或相等)，向下显示，并限制高度
        popper.top = rect.bottom - arrwoWidth;
        maxHeight = spaceBelow;
        arrow.left = `calc(50% - ${arrwoWidth}px)`;
      } else if (spaceAbove > 0) {
        // ⬆️ 上方空间较大，向上显示，并限制高度
        maxHeight = spaceAbove;
        popper.top = rect.top - maxHeight;
        arrow.top = "unset";
        arrow.left = `calc(50% - ${arrwoWidth}px)`;
        arrow.bottom = `-${arrwoWidth}px`;
      } else {
        // ❌ 极小概率事件：上方和下方空间都为 0 (或负数)，通常发生在屏幕极小或元素贴边时。
        // 默认放在下方，并限制高度为 0 (实际上不会发生，只是为了逻辑完整)
        popper.top = rect.bottom;
        maxHeight = 0;
      }

      // 如果计算出的 maxHeight 小于一个合理的最小高度，可能需要强制设置一个值或给用户提示
      maxHeight = Math.max(0, maxHeight);
    }

    // --- 水平定位 (X 轴) ---

    // 1. 尝试水平居中
    let potentialLeft = rect.left + rect.width / 2 - popoverWidth / 2;

    // 2. 检查是否超出左边缘 (规则 2)
    if (potentialLeft < SPACING) {
      // 靠近左边区域，左边空间不支持居中，左边缘对齐选中区域的左边缘
      popper.left = rect.left;
      // 确保不会超出左侧视口边界（例如，选中区域本身就在屏幕外）
      popper.left = Math.max(SPACING, popper.left);
      arrow.left = Math.min(rect.width / 2, 8) + "px";
    }
    // 3. 检查是否超出右边缘 (规则 3)
    else if (potentialLeft + popoverWidth > viewportWidth) {
      // 靠近右边区域，右边空间不支持居中，右边缘对齐选中区域的右边缘
      popper.left = rect.right - popoverWidth;
      // 确保不会超出右侧视口边界
      popper.left = Math.min(viewportWidth - popoverWidth, popper.left);

      // 计算箭头位置：让箭头指向选中区域的中心
      const selectionCenter = rect.left + rect.width / 2;
      let arrowLeft = selectionCenter - popper.left - arrwoWidth;

      // 限制箭头在 popover 内部，保留 6px 的圆角安全距离
      arrowLeft = Math.max(6, Math.min(arrowLeft, popoverWidth - arrwoWidth * 2 - 6));
      arrow.left = arrowLeft + "px";
    } else {
      // ✅ 居中安全，采用居中位置 (规则 1)
      popper.left = potentialLeft;
    }
    popper.top = popper.top + window.scrollY;
    popper.left = popper.left + window.scrollX;
    // return { popper, arrow };

    mainContainer.style.top = popper.top + "px";
    mainContainer.style.left = popper.left + "px";
    mainContainer.classList.remove("invisible");
    const arrowElement = mainContainer.querySelector("#shanbay-arrow");
    arrowElement.style.left = arrow.left;
    arrowElement.style.top = arrow.top;
    arrowElement.style.bottom = arrow.bottom;
    arrowElement.style.rotate = arrow.rotate;
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
    let html = `<div id="__shanbay-popover" class="invisible">
      <div id="shanbay-arrow"></div>
      <div id="shanbay-inner">
        <div id="shanbay-title" style="border: none;"></div>
      </div>
    </div>`;

    /** 这里是为了防止多次调用popover产生多个弹出框的。因为一次查询最起码会调用两次popover*/
    if (!selectionParentBody) {
      selectionParentBody = document.body;
    }
    if (!selectionParentBody) {
      debugLogger("warn", "no document.body to attach popover");
      return;
    }
    if (!document.querySelector("#__shanbay-popover")) {
      selectionParentBody.insertAdjacentHTML("beforeEnd", html);
    }

    const mainContainer = document.querySelector("#__shanbay-popover");

    if (res.loading) {
      /** 查询之前和未登录的提示信息*/
      mainContainer.querySelector("#shanbay-title").innerHTML = res.msg;
      // Must position + remove .invisible or the loading bubble stays hidden
      try {
        calculatePopoverPosition();
      } catch (e) {
        mainContainer.classList.remove("invisible");
        mainContainer.style.top = window.scrollY + 80 + "px";
        mainContainer.style.left = window.scrollX + 80 + "px";
      }
    } else if (res.data && res.data.msg) {
      mainContainer.querySelector("#shanbay-inner").innerHTML = `
    <div id="shanbay-title" class="has-error">
      <div class="error-message">${res.data.msg}</div>
      ${[400, 401, 403, 404].includes(res.data.status) || (res.data.msg && /登录|过期/.test(res.data.msg)) ? '<div class="login"><a href="https://web.shanbay.com/web/account/login/" target="_blank" class="shanbay-btn">去登录</a></div>' : ""}
    </div>`;
      try {
        calculatePopoverPosition();
      } catch (e) {
        mainContainer.classList.remove("invisible");
      }
    } else if (!res.data) {
      mainContainer.querySelector("#shanbay-title").innerHTML = "查询无结果";
      try {
        calculatePopoverPosition();
      } catch (e) {
        mainContainer.classList.remove("invisible");
      }
    } else {
      /** 查询单词或者单词其他操作成功*/
      let data = res.data;
      const esc = (s) =>
        String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
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
          ? `<div><b>中文：</b> ${cnDefs
              .map(
                (p) =>
                  `<div><span style="color: #333">${esc(p.pos)} </span><span>${esc(p.def)}</span></div>`
              )
              .join("")}</div>`
          : "";
      const enHtml =
        storage.paraphrase !== "Chinese" && enDefs.length
          ? `<div><b>英文：</b>${enDefs
              .map(
                (p) =>
                  `<div><span style="color: #333">${esc(p.pos)} </span><span>${esc(p.def)}</span></div>`
              )
              .join("")}</div>`
          : "";

      let contentHtml = "";
      try {
        contentHtml = `
      <div id="shanbay-title">
          <span class="word">${esc(data.content)}</span>
          <a class="check-detail" href="https://web.shanbay.com/wordsweb/#/detail/${esc(data.id)}" target="_blank"> 查看详情 </a>
          <div class="phonetic-symbols">${assemblyPronunciationStr()}</div>
      </div>
      <div id="shanbay-content">
          <div class="simple-definition">
              ${cnHtml}
              ${enHtml}
          </div>
          <div id="shanbay-example-sentence-div" class="hide"></div>
          <div id="shanbay-footer">
            <span id="shanbay-example-sentence-span" class="hide"><button type="button" id="shanbay-example-sentence-btn" class="shanbay-btn">查看例句</button></span>
            ${data.exists === "error" ? "" : `<span id="shanbay-add-word-span"><button type="button" id="shanbay-add-word-btn" class="shanbay-btn ${data.exists ? "forget" : ""}">${data.exists ? "我忘了" : "添加"}</button></span>`}
          </div>
      </div>
    `;
      } catch (buildErr) {
        debugLogger("error", "build popover HTML failed", buildErr);
        contentHtml = `<div id="shanbay-title" class="has-error"><div class="error-message">渲染失败: ${esc(buildErr && buildErr.message)}</div></div>`;
      }

      mainContainer.querySelector("#shanbay-inner").innerHTML = contentHtml;

      try {
        calculatePopoverPosition();
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

      /** 添加单词和忘记单词的事件处理*/
      const addWordBtn = mainContainer.querySelector("#shanbay-add-word-btn");
      const sendAddOrForget = () => {
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

      if (storage.exampleSentence) {
        exampleSentenceSpan.classList.remove("hide");
        exampleSentenceBtn.addEventListener("click", () => {
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
        });
      }
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
            addWordSpan.innerHTML = "添加失败";
          } else {
            addWordSpan.innerHTML = "添加成功";
          }
        }
        break;
      case "getWordExample":
        if (!exampleSentenceDiv || !Array.isArray(res.data)) break;
        exampleSentenceDiv.innerHTML = res.data
          .map(
            (item, index) =>
              `<p>${index + 1}, ${item.content_en.replaceAll("vocab", "b")} <span class="speaker" data-target="${item.audio.us.urls[0]}"></span></p><p>  ${item.content_cn}</p>`,
          )
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
    // })
  }

