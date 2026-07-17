import {
  debugLogger,
  getRecentLookups,
  clearRecentLookups,
  RECENT_LOOKUPS_KEY,
  getExtensionSettings,
  SETTINGS_KEY,
  normalizeLookupWord,
  playAudio,
  storageSettingMap,
} from './const.mjs'

const SHANBAY_LOGIN = 'https://web.shanbay.com/web/account/login/'

/** @type {Record<string, any>} */
const settings = Object.assign({}, storageSettingMap)

/** Current word result for Add / Forgot / Examples */
let currentWord = null

const $ = (sel) => document.querySelector(sel)

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Shanbay &lt;vocab&gt;…&lt;/vocab&gt; → bold */
function formatShanbayHtml(s) {
  const t = String(s == null ? '' : s)
  const re = /<vocab\b[^>]*>([\s\S]*?)<\/vocab>/gi
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(t)) !== null) {
    out += escapeHtml(t.slice(last, m.index))
    if (m[1]) out += `<b class="shanbay-vocab">${escapeHtml(m[1])}</b>`
    last = m.index + m[0].length
  }
  out += escapeHtml(t.slice(last))
  return out.replace(/&lt;\/?vocab\b[^&]*&gt;/gi, '')
}

function detectPopupMode() {
  // Side panel is tall and full-height; toolbar popup is constrained.
  // Heuristic: if window is short/narrow and not a full side panel chrome area.
  try {
    if (window.innerHeight < 500 && window.innerWidth < 420) {
      document.body.classList.add('is-popup')
    }
  } catch (_) {
    /* ignore */
  }
}

function loadSettings() {
  getExtensionSettings((result) => {
    const arr = result && result[SETTINGS_KEY]
    if (Array.isArray(arr)) {
      arr.forEach((item) => Object.assign(settings, item))
    }
  })
  try {
    chrome.storage.onChanged.addListener((changes) => {
      const change = changes[SETTINGS_KEY]
      if (!change || !change.newValue) return
      if (Array.isArray(change.newValue)) {
        change.newValue.forEach((item) => Object.assign(settings, item))
      }
    })
  } catch (_) {
    /* ignore */
  }
}

// ——— Auth ———

function applyAuthUI(info) {
  const login = $('#login')
  const learnBtn = $('#begin-learning')
  const statusEl = $('#auth-status')
  const hintEl = $('#auth-hint')

  let loggedIn = false
  let status = 'logged_out'
  let message = 'Not logged in'

  if (info && typeof info === 'object') {
    loggedIn = !!(info.loggedIn || info.token)
    status = info.status || (loggedIn ? 'logged_in' : 'logged_out')
    message = info.message || (loggedIn ? 'Logged in to Shanbay' : 'Not logged in')
  }

  if (statusEl) {
    statusEl.className = status
    statusEl.textContent =
      status === 'logged_in'
        ? 'Logged in'
        : status === 'error'
          ? 'Unknown'
          : 'Not logged in'
  }

  if (hintEl) {
    if (loggedIn) {
      hintEl.className = 'hide'
      hintEl.textContent = ''
    } else {
      hintEl.className = ''
      hintEl.textContent =
        message || 'Open web.shanbay.com and log in in this browser.'
    }
  }

  if (loggedIn) {
    if (login) login.className = 'hide'
    if (learnBtn) learnBtn.className = ''
  } else {
    if (login) login.className = ''
    if (learnBtn) learnBtn.className = 'hide'
  }
}

function refreshAuth() {
  const statusEl = $('#auth-status')
  if (statusEl) {
    statusEl.className = 'checking'
    statusEl.textContent = '…'
  }
  chrome.runtime.sendMessage({ action: 'getAuthInfo' }, (auth) => {
    if (chrome.runtime.lastError) {
      applyAuthUI({
        loggedIn: false,
        status: 'error',
        message: 'Could not check login: ' + chrome.runtime.lastError.message,
      })
      return
    }
    applyAuthUI(auth)
  })
}

// ——— Recent ———

function renderRecent(list) {
  const ul = $('#recent-list')
  const empty = $('#recent-empty')
  const clearBtn = $('#clear-recent')
  if (!ul) return

  ul.innerHTML = ''
  if (!list || !list.length) {
    if (empty) empty.className = ''
    if (clearBtn) clearBtn.className = 'hide'
    return
  }
  if (empty) empty.className = 'hide'
  if (clearBtn) clearBtn.className = ''

  list.slice(0, 20).forEach((item) => {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'recent-item'
    btn.dataset.word = item.word || ''

    const word = document.createElement('span')
    word.className = 'word'
    word.textContent = item.word || ''
    btn.appendChild(word)

    if (item.def) {
      const def = document.createElement('span')
      def.className = 'def'
      def.textContent = item.def
      btn.appendChild(def)
    }

    btn.addEventListener('click', () => {
      const w = item.word || ''
      const input = $('#word-input')
      if (input) input.value = w
      doLookup(w)
    })

    li.appendChild(btn)
    ul.appendChild(li)
  })
}

function loadRecent() {
  getRecentLookups().then(renderRecent).catch(() => renderRecent([]))
}

// ——— Result rendering ———

function showResultHtml(html, { empty = false } = {}) {
  const el = $('#result')
  if (!el) return
  el.className = empty ? 'empty' : ''
  el.innerHTML = html
}

function showPlaceholder() {
  showResultHtml(
    '<div class="placeholder">Type a word above, or double-click text on a page</div>',
    { empty: false }
  )
}

function showLoading(word) {
  const label = word ? `Looking up “${escapeHtml(word)}”…` : 'Looking up…'
  showResultHtml(`<div class="status-msg">${label}</div>`)
}

function showError(data) {
  const msg = escapeHtml((data && data.msg) || 'Lookup failed')
  const st = data && data.status
  const needLogin =
    [400, 401, 403].includes(st) ||
    /登录|过期|auth|未登录|log\s*in|expired|session/i.test(String((data && data.msg) || ''))

  const loginActions = needLogin
    ? `<div class="login-actions">
        <a href="${SHANBAY_LOGIN}" target="_blank" rel="noopener">Log in</a>
        <a href="https://web.shanbay.com/" target="_blank" rel="noopener">Open Shanbay</a>
      </div>`
    : ''

  showResultHtml(`<div class="error-message">${msg}</div>${loginActions}`)
}

function buildPronunciation(data) {
  if (!data.audios || !data.audios.length) return ''
  const first = data.audios[0] || {}
  let str = ''
  const ukUrl =
    first.uk && first.uk.urls && first.uk.urls[0] ? first.uk.urls[0] : ''
  const usUrl =
    first.us && first.us.urls && first.us.urls[0] ? first.us.urls[0] : ''

  if (first.uk) {
    str += '<div class="pron-row">'
    str += `<span>uk: </span><small>/${escapeHtml(first.uk.ipa || '')}/</small> `
    if (ukUrl) {
      str += `<span class="speaker uk" data-target="${escapeHtml(ukUrl)}" title="Play UK" role="button" tabindex="0"></span>`
    }
    str += '</div>'
  }
  if (first.us) {
    str += '<div class="pron-row">'
    str += `<span>us: </span><small>/${escapeHtml(first.us.ipa || '')}/</small> `
    if (usUrl) {
      str += `<span class="speaker us" data-target="${escapeHtml(usUrl)}" title="Play US" role="button" tabindex="0"></span>`
    }
    str += '</div>'
  }
  return str
}

function renderWordResult(data) {
  currentWord = data
  const defs = data.definitions || {}
  const cnDefs = Array.isArray(defs.cn) ? defs.cn : []
  const enDefs = Array.isArray(defs.en) ? defs.en : []

  const cnHtml =
    settings.paraphrase !== 'English' && cnDefs.length
      ? `<div><span class="def-lang">Chinese</span>${cnDefs
          .map(
            (p) =>
              `<div><span class="def-pos">${formatShanbayHtml(p.pos)}</span><span class="def-text">${formatShanbayHtml(p.def)}</span></div>`
          )
          .join('')}</div>`
      : ''

  const enHtml =
    settings.paraphrase !== 'Chinese' && enDefs.length
      ? `<div><span class="def-lang">English</span>${enDefs
          .map(
            (p) =>
              `<div><span class="def-pos">${formatShanbayHtml(p.pos)}</span><span class="def-text">${formatShanbayHtml(p.def)}</span></div>`
          )
          .join('')}</div>`
      : ''

  const showExamplesBtn =
    settings.exampleSentence !== false || settings.autoExampleSentence

  const addBtn =
    data.exists === 'error'
      ? ''
      : `<button type="button" id="add-word-btn" class="shanbay-btn ${data.exists ? 'forget' : ''}">${
          data.exists ? 'Forgot' : 'Add'
        }</button>`

  const html = `
    <div class="word-row">
      <span class="word">${escapeHtml(data.content)}</span>
      <a class="check-detail" href="https://web.shanbay.com/wordsweb/#/detail/${escapeHtml(data.id)}" target="_blank" rel="noopener">Details</a>
    </div>
    <div class="phonetic-symbols">${buildPronunciation(data)}</div>
    <div class="simple-definition">
      ${cnHtml}
      ${enHtml}
    </div>
    <div id="examples" class="examples hide"></div>
    <div class="footer-actions">
      ${showExamplesBtn ? '<button type="button" id="examples-btn" class="shanbay-btn">Examples</button>' : ''}
      ${addBtn}
    </div>
  `

  showResultHtml(html)
  bindResultEvents(data)

  // Auto-play pronunciation
  const autoRead =
    data.__shanbayExtensionSettings && data.__shanbayExtensionSettings.autoRead
  if (autoRead && autoRead !== 'false') {
    const autoBtn = document.querySelector('#result .speaker.' + autoRead)
    if (autoBtn) {
      playAudio(autoBtn.getAttribute('data-target') || autoBtn.dataset.target)
    }
  }

  if (settings.autoExampleSentence) {
    requestExamples(data.id)
  }
}

function bindResultEvents(data) {
  const root = $('#result')
  if (!root) return

  root.querySelectorAll('.speaker').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const src = btn.getAttribute('data-target') || btn.dataset.target || ''
      if (src) playAudio(src)
    })
  })

  const addBtn = $('#add-word-btn')
  if (addBtn) {
    addBtn.addEventListener('click', () => sendAddOrForget(data, addBtn))
  }

  const exBtn = $('#examples-btn')
  if (exBtn) {
    exBtn.addEventListener('click', () => requestExamples(data.id))
  }
}

function sendAddOrForget(data, btn) {
  if (!data || !btn) return
  const prev = btn.textContent
  btn.disabled = true
  btn.textContent = '…'
  chrome.runtime.sendMessage(
    {
      action: 'addOrForget',
      word: data.content,
      wordID: data.id,
    },
    (response) => {
      btn.disabled = false
      if (chrome.runtime.lastError) {
        btn.textContent = prev
        debugLogger('warn', chrome.runtime.lastError.message)
        return
      }
      if (response && response.data && response.data.errors === 'SUCCESS') {
        btn.textContent = 'Failed'
        return
      }
      // Toggle exists state
      data.exists = !data.exists
      currentWord = data
      btn.textContent = data.exists ? 'Forgot' : 'Add'
      btn.className = 'shanbay-btn ' + (data.exists ? 'forget' : '')
    }
  )
}

function requestExamples(wordId) {
  if (!wordId) return
  const box = $('#examples')
  const btn = $('#examples-btn')
  if (btn) {
    btn.disabled = true
    btn.textContent = '…'
  }
  chrome.runtime.sendMessage({ action: 'getWordExample', id: wordId }, (response) => {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Examples'
    }
    if (chrome.runtime.lastError) {
      debugLogger('warn', chrome.runtime.lastError.message)
      return
    }
    if (!box || !response || !Array.isArray(response.data)) return

    box.innerHTML = response.data
      .map((item, index) => {
        const en = formatShanbayHtml(item.content_en)
        const cn = formatShanbayHtml(item.content_cn)
        const audioUrl =
          item.audio && item.audio.us && item.audio.us.urls && item.audio.us.urls[0]
            ? item.audio.us.urls[0]
            : ''
        const speaker = audioUrl
          ? ` <span class="speaker" data-target="${escapeHtml(audioUrl)}" role="button" tabindex="0"></span>`
          : ''
        return `<p>${index + 1}. ${en}${speaker}</p><p class="cn">${cn}</p>`
      })
      .join('')
    box.classList.remove('hide')
    if (btn) btn.classList.add('hide')

    box.querySelectorAll('.speaker').forEach((dom) => {
      dom.addEventListener('click', (e) => {
        e.preventDefault()
        playAudio(dom.getAttribute('data-target') || dom.dataset.target)
      })
    })
  })
}

// ——— Lookup ———

function doLookup(raw) {
  const word = normalizeLookupWord(raw) || String(raw || '').trim()
  if (!word) {
    showError({ status: 400, msg: 'Please enter a valid English word' })
    return
  }

  const input = $('#word-input')
  if (input) input.value = word

  const btn = $('#lookup-btn')
  if (btn) btn.disabled = true
  showLoading(word)
  currentWord = null

  chrome.runtime.sendMessage({ action: 'lookup', word }, (response) => {
    if (btn) btn.disabled = false

    if (chrome.runtime.lastError) {
      showError({
        status: 500,
        msg: 'Lookup failed: ' + chrome.runtime.lastError.message,
      })
      return
    }

    // Content-script path may ack with lookupPending — side panel path should
    // get a single final { action: 'lookup', data }.
    if (response && response.action === 'lookupPending') {
      // Background may still deliver via a second mechanism; wait briefly
      // then surface a soft timeout if nothing arrived.
      return
    }

    if (response && response.action === 'lookup') {
      handleLookupData(response.data)
      return
    }

    // Some paths may return data directly
    if (response && (response.content || response.msg || response.status)) {
      handleLookupData(response)
      return
    }

    showError({ status: 500, msg: 'No response from extension' })
  })
}

function handleLookupData(data) {
  if (!data) {
    showError({ status: 500, msg: 'No results' })
    return
  }
  if (data.msg || (data.status && data.status >= 400 && !data.content)) {
    showError(data)
    return
  }
  if (!data.content) {
    showError({ status: 404, msg: 'Word not found' })
    return
  }
  renderWordResult(data)
  loadRecent()
}

// Listen for lookup results delivered via runtime broadcast (content-style path)
try {
  chrome.runtime.onMessage.addListener((msg) => {
    // Only handle when this panel is visible and the message is a final lookup
    // without a tab target context. Avoid stealing page popover results.
    if (!msg || msg.action !== 'lookup') return
    // If we are mid-lookup (button disabled), accept the result
    const btn = $('#lookup-btn')
    if (btn && btn.disabled && msg.data) {
      btn.disabled = false
      handleLookupData(msg.data)
    }
  })
} catch (_) {
  /* ignore */
}

// ——— Wire up ———

document.addEventListener('DOMContentLoaded', () => {
  detectPopupMode()
  loadSettings()
  refreshAuth()
  loadRecent()
  showPlaceholder()

  setTimeout(refreshAuth, 800)

  const form = $('#lookup-form')
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const input = $('#word-input')
      doLookup(input ? input.value : '')
    })
  }

  const input = $('#word-input')
  if (input) {
    // Focus search when panel opens
    requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true })
      } catch (_) {
        input.focus()
      }
    })
  }

  const learn = $('#begin-learning')
  if (learn) {
    learn.onclick = () => {
      chrome.tabs.create({ url: 'https://web.shanbay.com/wordsweb/#/collection' })
    }
  }

  const options = $('#options')
  if (options) {
    options.onclick = () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
    }
  }

  const login = $('#login')
  if (login) {
    login.onclick = () => {
      chrome.tabs.create({ url: SHANBAY_LOGIN })
      setTimeout(refreshAuth, 1500)
      setTimeout(refreshAuth, 4000)
    }
  }

  const clearRecent = $('#clear-recent')
  if (clearRecent) {
    clearRecent.onclick = () => {
      clearRecentLookups().then(() => loadRecent())
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAuth()
      loadRecent()
    }
  })
  window.addEventListener('focus', () => {
    refreshAuth()
    loadRecent()
  })

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[RECENT_LOOKUPS_KEY]) {
        renderRecent(changes[RECENT_LOOKUPS_KEY].newValue || [])
      }
    })
  } catch (_) {
    /* ignore */
  }
})
