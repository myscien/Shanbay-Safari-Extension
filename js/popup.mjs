import {debugLogger, defaultIgnoreSites} from './const.mjs'

function renderUser () {
  const login = document.querySelector('#login')
  const batchAddBtn = document.querySelector('#batch-add')
  const learnBtn = document.querySelector('#begin-learning')
  const settingBtn = document.querySelector('#options')
  login.onclick = function () {
    chrome.tabs.create({
      url: 'https://web.shanbay.com/web/account/login/'
    })
  }

  const applyAuthUI = (auth) => {
    debugLogger('log', 'popup auth', auth ? '(present)' : '(empty)')
    const loggedIn = !!(auth && String(auth).length)
    if (loggedIn) {
      login.className = 'hide'
      batchAddBtn.className = ''
      learnBtn.className = ''
      settingBtn.className = ''
    } else {
      login.className = ''
      batchAddBtn.className = 'hide'
      learnBtn.className = 'hide'
      settingBtn.className = 'hide'
    }
  }

  // Safari can be slow / flaky reading cookies — check twice.
  chrome.runtime.sendMessage({ action: 'getAuthInfo' }, (auth) => {
    if (chrome.runtime.lastError) {
      debugLogger('warn', 'getAuthInfo error', chrome.runtime.lastError.message)
      applyAuthUI('')
      return
    }
    applyAuthUI(auth)
  })

  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'getAuthInfo' }, (auth) => {
      if (!chrome.runtime.lastError) applyAuthUI(auth)
    })
  }, 800)

}

document.addEventListener('DOMContentLoaded', function () {
  renderUser()
  document.querySelector('#batch-add').onclick = function () {
    chrome.tabs.create({ url: 'https://web.shanbay.com/wordsweb/#/collection' })
  }
  document.querySelector('#begin-learning').onclick = function () {
    chrome.tabs.create({ url: 'https://web.shanbay.com/wordsweb/#/collection' })
  }
  document.querySelector('#options').onclick = function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
  }
})
