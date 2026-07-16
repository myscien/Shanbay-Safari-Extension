import {
  debugLogger,
  getRecentLookups,
  clearRecentLookups,
  RECENT_LOOKUPS_KEY,
} from './const.mjs'

const SHANBAY_LOGIN = 'https://web.shanbay.com/web/account/login/'

function detailUrl(item) {
  if (item && item.id) {
    return `https://web.shanbay.com/wordsweb/#/detail/${encodeURIComponent(item.id)}`
  }
  const q = item && item.word ? encodeURIComponent(item.word) : ''
  return `https://web.shanbay.com/wordsweb/#/search?query=${q}`
}

function renderRecent(list) {
  const ul = document.querySelector('#recent-list')
  const empty = document.querySelector('#recent-empty')
  const clearBtn = document.querySelector('#clear-recent')
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
    const a = document.createElement('a')
    a.href = detailUrl(item)
    a.target = '_blank'
    a.rel = 'noopener'
    const word = document.createElement('span')
    word.className = 'word'
    word.textContent = item.word || ''
    a.appendChild(word)
    if (item.def) {
      const def = document.createElement('span')
      def.className = 'def'
      def.textContent = item.def
      a.appendChild(def)
    }
    li.appendChild(a)
    ul.appendChild(li)
  })
}

function loadRecent() {
  getRecentLookups().then(renderRecent).catch(() => renderRecent([]))
}

function renderUser() {
  const login = document.querySelector('#login')
  const recheck = document.querySelector('#recheck')
  const batchAddBtn = document.querySelector('#batch-add')
  const learnBtn = document.querySelector('#begin-learning')
  const settingBtn = document.querySelector('#options')
  const statusEl = document.querySelector('#auth-status')
  const hintEl = document.querySelector('#auth-hint')

  const setChecking = () => {
    if (statusEl) {
      statusEl.className = 'checking'
      statusEl.textContent = 'Checking login…'
    }
    if (hintEl) {
      hintEl.className = 'hide'
      hintEl.textContent = ''
    }
  }

  const applyAuthUI = (info) => {
    let loggedIn = false
    let status = 'logged_out'
    let message = 'Not logged in'

    if (info && typeof info === 'object') {
      loggedIn = !!(info.loggedIn || info.token)
      status = info.status || (loggedIn ? 'logged_in' : 'logged_out')
      message = info.message || (loggedIn ? 'Logged in to Shanbay' : 'Not logged in')
    } else if (typeof info === 'string') {
      loggedIn = !!info.length
      status = loggedIn ? 'logged_in' : 'logged_out'
      message = loggedIn ? 'Logged in to Shanbay' : 'Not logged in'
    }

    debugLogger('log', 'popup auth', status)

    if (statusEl) {
      statusEl.className = status
      statusEl.textContent =
        status === 'logged_in'
          ? '● Logged in'
          : status === 'error'
            ? '● Status unknown'
            : '● Not logged in'
    }

    if (hintEl) {
      if (loggedIn) {
        hintEl.className = 'hide'
        hintEl.textContent = ''
      } else {
        hintEl.className = ''
        hintEl.textContent =
          message ||
          'Open web.shanbay.com and log in in this browser. Safari users must log in in Safari (Chrome login does not count).'
      }
    }

    if (settingBtn) settingBtn.className = ''
    if (recheck) recheck.className = ''

    if (loggedIn) {
      if (login) login.className = 'hide'
      if (batchAddBtn) batchAddBtn.className = ''
      if (learnBtn) learnBtn.className = ''
    } else {
      if (login) login.className = ''
      if (batchAddBtn) batchAddBtn.className = 'hide'
      if (learnBtn) learnBtn.className = 'hide'
    }
  }

  const refreshAuth = () => {
    setChecking()
    chrome.runtime.sendMessage({ action: 'getAuthInfo' }, (auth) => {
      if (chrome.runtime.lastError) {
        debugLogger('warn', 'getAuthInfo error', chrome.runtime.lastError.message)
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

  if (login) {
    login.onclick = function () {
      chrome.tabs.create({ url: SHANBAY_LOGIN })
      setTimeout(refreshAuth, 1500)
      setTimeout(refreshAuth, 4000)
    }
  }

  if (recheck) {
    recheck.onclick = function () {
      recheck.disabled = true
      refreshAuth()
      setTimeout(() => {
        recheck.disabled = false
      }, 600)
    }
  }

  refreshAuth()
  setTimeout(refreshAuth, 800)

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
}

document.addEventListener('DOMContentLoaded', function () {
  renderUser()
  loadRecent()

  const batch = document.querySelector('#batch-add')
  const learn = document.querySelector('#begin-learning')
  const options = document.querySelector('#options')
  const clearRecent = document.querySelector('#clear-recent')

  if (batch) {
    batch.onclick = function () {
      chrome.tabs.create({ url: 'https://web.shanbay.com/wordsweb/#/collection' })
    }
  }
  if (learn) {
    learn.onclick = function () {
      chrome.tabs.create({ url: 'https://web.shanbay.com/wordsweb/#/collection' })
    }
  }
  if (options) {
    options.onclick = function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
    }
  }
  if (clearRecent) {
    clearRecent.onclick = function () {
      clearRecentLookups().then(() => loadRecent())
    }
  }

  // Live-update when a lookup is recorded while popup is open
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
