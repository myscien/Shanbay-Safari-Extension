# chrome-shanbay-v2

> shanbay 网页查单词浏览器扩展（Chrome / Edge / Safari）

Chrome 商店地址：https://chrome.google.com/webstore/detail/%E6%89%87%E8%B4%9D%E5%8A%A9%E6%89%8Bv2/pkibohmmnmpgbnaoappgndlfncanookc

当前版本：**2.4.0**（侧边栏查词、英文界面、Safari 工具链）

## 安装

### Chrome / Edge

1. 打开 `chrome://extensions`（Edge: `edge://extensions`）
2. 开启 **开发者模式**
3. **加载已解压的扩展程序** → 选择本仓库目录

### Safari（macOS，长期使用）

临时扩展（Developer → Add Temporary Extension）在退出 Safari 后会消失。日常使用请用 Xcode 签名安装：

**首次**（配置签名 Team 一次）：

```bash
./scripts/install-safari-permanent.sh
# 或 ./scripts/convert-to-safari.sh ，再按 SAFARI.md 配置 Team 并 ⌘R
```

**以后改代码后一键同步 + 编译 + 启动**（推荐）：

```bash
./scripts/rebuild-safari.sh
```

详见 **[SAFARI.md](./SAFARI.md)**。

- 个人本机使用：免费 Apple ID 即可  
- 上架 App Store：需加入 Apple Developer Program（约 $99/年）  
- 请在 **Safari** 内登录 [web.shanbay.com](https://web.shanbay.com)，查词时保持扇贝标签页可用更稳妥  
- 工具栏弹窗会显示 **已登录 / 未登录**；未登录时点「去扇贝登录」，登完点「重新检测登录」

## 提供的功能
- 单词双击选中自动弹出释义
- 选中之后右键菜单查词
- 可供选择中英文释义
- 角标上显示今天还有多少单词需要背，这个是在扇贝网设置的
- 有定时提醒，默认3小时一次，提醒你非常丑，该背单词了😂
- 如果查询的是新词，会有一个添加的按钮，用来添加到单词本里。如果已经在你的单词本里，会有一个按钮叫我忘了，点击一下相当于把单词的熟悉度重置里，以后还得背的意思
- 登录之后点击插件图标，显示的背单词和批量添加生词的两个按钮，顾名思义咯。这功能是扇贝做的，按钮就是一扇贝网的链接。
- **侧边栏查词（2.4）**：点击工具栏图标，在浏览器侧边栏（Chrome / Edge）或弹窗（Safari）中直接输入单词查询释义、例句、加入单词本
- 由于内核相同，这个插件也可以在360极速浏览器、QQ浏览器上使用。~~由于某些不可描述的原因，你可以去[这里](https://github.com/maicss/chrome-shanbay-v2/releases)下载crx包，然后拖到扩展管理界面就行了。2010年开始，Chrome加强了限制，只能在开发模式这样使用插件，不推荐下载crx包，而且也不会更新crx包了~~。**2023年更新：推荐使用 Edge 浏览器，可以无障碍打开 Chrome 商店安装插件。**



## 已知的问题

- 有些词语的释义渲染的很差。这个锅主要由扇贝的API来背……
- 网页中嵌套iframe的时候，不能正确触发事件。这个不打算处理。
- 在input和textarea里面双击的时候，能查询单词，但是弹出框的定位是在页面的左上角。这个也不打算处理。



## 更新记录：
- 2026.7 v2.4.0 工具栏图标打开侧边栏查词（Chrome Side Panel；Safari 同 UI 弹窗）；面板内搜索 / 释义 / 例句 / 加词 / 最近记录
- 2026.7 v2.3.2+ 英文界面；登录状态与错误提示；选词增强；最近查词；自动例句；弹窗快捷键与自动聚焦；默认关闭调试日志；暗色弹窗；Safari 一键 rebuild
- 2026.7 v2.3.0 Safari Web Extension 兼容：跨浏览器消息与发音、登录会话回退、存储 local 回退；清理调试日志；安装文档与脚本
- 2018年之前，使用的是扇贝开放API。~~虽然没有官方自己用的库全，API更好用~~
- 2020.10 扇贝关闭了原来的2.0API，使用了新的3.0API，插件改成直接调官方未开放的API。
- 2021.6 扇贝修改查不到单词的API，导致未找到单词没有正确渲染结果，修改了一点样式。
- 2023.2 更新到 Chrome manifest v3，修改一个小 BUG。
- 2023.8 重写了播放音频的功能；增加了用户自定义屏蔽双击弹窗的域名；shanbay把*今日复习*接口重写为返回一个加密字符串（越来越封闭）,扒了源码做出来了；未登录提示由通知改为弹窗上提示了，因为用户如果禁用了浏览器通知，导致什么提示也看不到，基本功能都无法使用
- 2025.11 自适应弹窗位置; 增加对textarea 内文本的支持

---

## English (new features & workflow)

> The **product UI is English**. The section above keeps the original Chinese docs; below is the updated English guide for recent work.

### Version

**2.4.0** — Side-panel word lookup on toolbar click; English UI; Safari tooling.

### Install (summary)

**Chrome / Edge:** Load this folder unpacked under Developer mode.

**Safari (macOS):**

```bash
# first-time signing setup
./scripts/install-safari-permanent.sh

# after code changes (sync + xcodebuild + open app)
./scripts/rebuild-safari.sh
```

See **[SAFARI.md](./SAFARI.md)** for Team signing, permissions, and troubleshooting.

- Log into [web.shanbay.com](https://web.shanbay.com) **in the same browser** you use for lookup  
- Source of truth: this repo · Safari Xcode project: `../chrome-shanbay-v2-safari/` (sync via scripts; don’t hand-edit Resources long-term)

### Features (including recent)

**Lookup**
- Double-click or context-menu lookup  
- Smarter selection: strips punctuation/quotes; keeps hyphens / apostrophes (`well-known`, `don't`)  
- Chinese / English / bilingual definitions  
- UK / US audio; bold headwords from Shanbay `<vocab>` tags  

**Popover**
- Viewport-fixed, tall panel with sticky footer (Examples / Add / Forgot always visible)  
- Auto-focus for keyboard shortcuts  
- System **light / dark** appearance  

**Shortcuts** (popover open)

| Key | Action |
|-----|--------|
| `Esc` | Close |
| `A` | Add |
| `F` | Forget |
| `E` | Examples |
| `1` / `2` | UK / US audio |

**Toolbar side panel** (Chrome / Edge) or **popup** (Safari)
- Click the extension icon → panel opens with a search box  
- Look up any word: definitions, UK/US audio, examples, Add / Forgot  
- Login status, Learn / Settings links  
- Recent lookups (last 20) — click to re-look up  
- Page double-click / context-menu lookup still works as before

### Known limitations (same as above)

- API definition quality varies  
- Nested iframes not supported  
- Some `input`/`textarea` double-clicks still mis-position the popover  
- Safari may need per-site extension access  

### Changelog (English, recent)

- **2.4.0** — Toolbar opens side panel (Chrome Side Panel API; Safari uses same UI as popup) with in-panel word search  
- **2.3.2+** — English UI; clearer login/errors; smarter selection; recent lookups; optional auto examples; shortcuts + auto-focus; quiet logs; dark-mode popover; Safari one-command rebuild  
- **2.3.0** — Safari Web Extension support; messaging/audio/storage fallbacks; install docs  
- Earlier history: see Chinese 更新记录 above / git log  
