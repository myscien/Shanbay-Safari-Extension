import { debugLogger } from './const.mjs'

const SHANBAY_LOGIN = 'https://web.shanbay.com/web/account/login/'

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
    // Support structured { loggedIn, status, message } or legacy string token
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

    // Settings always available; learn actions need login
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
    if (document.visibilityState === 'visible') refreshAuth()
  })
  window.addEventListener('focus', refreshAuth)
}

document.addEventListener('DOMContentLoaded', function () {
  renderUser()

  const batch = document.querySelector('#batch-add')
  const learn = document.querySelector('#begin-learning')
  const options = document.querySelector('#options')

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
})
