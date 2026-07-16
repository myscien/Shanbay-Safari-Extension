import {
  debugLogger, storageSettingMap, lookUp, checkWordAdded,
  addOrForget, getWordExampleSentence, getDailyTaskCount, defaultIgnoreSites,
  getExtensionSettings, SETTINGS_KEY, getAuthToken,
  normalizeLookupWord, formatLookupError
} from './const.mjs'

const storage = {}

/**
 * Play pronunciation without chrome.offscreen (not available on Safari).
 * Prefer the calling content script; fall back to Chrome offscreen when present.
 */
const playSound = (url, sender) => {
  if (!url) return

  // Content script / tab can play Audio in the page context (Chrome + Safari).
  if (sender && sender.tab && sender.tab.id != null) {
    chrome.tabs.sendMessage(sender.tab.id, { action: 'playSound', url }).catch(() => {
      playSoundViaOffscreen(url)
    })
    return
  }

  playSoundViaOffscreen(url)
}

const playSoundViaOffscreen = (url) => {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) {
    debugLogger('warn', 'playSound: no tab and no offscreen API')
    return
  }
  const ensureOffscreen = () =>
    chrome.offscreen.hasDocument().then((flag) => {
      if (!flag) {
        return chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Play word pronunciation audio',
        })
      }
    })
  ensureOffscreen()
    .then(() =>
      chrome.runtime.sendMessage({ action: 'playSound', target: 'offscreen', url })
    )
    .catch((e) => debugLogger('error', 'offscreen playSound failed', e))
}

/**
 * Reply to the content-script caller.
 * For long Safari lookups, sendResponse may expire — always also tabs.sendMessage.
 */
const replyToSender = (sender, sendResponse, payload) => {
  try {
    if (typeof sendResponse === 'function') sendResponse(payload)
  } catch (e) {
    debugLogger('warn', 'sendResponse failed', e)
  }
  if (sender && sender.tab && sender.tab.id != null) {
    try {
      chrome.tabs.sendMessage(sender.tab.id, payload, () => {
        void chrome.runtime.lastError
      })
    } catch (_) {
      /* ignore */
    }
  }
}

const withTimeout = (promise, ms, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject({ status: 504, msg: message }), ms)
    }),
  ])

chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
  switch (req.action) {
    case 'lookup': {
      // Acknowledge immediately so the message channel does not hang on Safari.
      try {
        sendResponse({ action: 'lookupPending', ok: true })
      } catch (_) {
        /* ignore */
      }
      const word = normalizeLookupWord(req.word) || String(req.word || '').trim()
      const tabSender = sender
      if (!word) {
        replyToSender(tabSender, null, {
          action: 'lookup',
          data: { status: 400, msg: 'Please select a valid English word' },
        })
        break
      }
      withTimeout(
        lookUp(word).then((res) =>
          checkWordAdded(res.id)
            .then((existsRes) => {
              res.exists =
                existsRes && existsRes.objects && existsRes.objects[0]
                  ? existsRes.objects[0].exists
                  : false
              return res
            })
            .catch(() => {
              res.exists = 'error'
              return res
            })
        ),
        15000,
        'Lookup timed out. Open web.shanbay.com, sign in, keep that tab open, then try again.'
      )
        .then((data) => {
          data.__shanbayExtensionSettings = { autoRead: storage.autoRead }
          // Final result via tabs.sendMessage (reliable after long async work)
          replyToSender(tabSender, null, { action: 'lookup', data })
        })
        .catch((data) => {
          const error = formatLookupError(data)
          replyToSender(tabSender, null, { action: 'lookup', data: error })
        })
      break
    }
    case 'addOrForget':
      addOrForget(req.word, req.wordID)
        .then(res => replyToSender(sender, sendResponse, { action: 'addOrForget', data: res }))
        .catch(err => replyToSender(sender, sendResponse, {
          action: 'addOrForget',
          data: { errors: 'SUCCESS', message: String(err) },
        }))
      break
    case 'getWordExample':
      getWordExampleSentence(req.id)
        .then(data => replyToSender(sender, sendResponse, { action: 'getWordExample', data }))
        .catch(err => replyToSender(sender, sendResponse, {
          action: 'getWordExample',
          data: [],
          error: String(err),
        }))
      break
    case 'playSound':
      // Content scripts play locally; this handles any remaining background requests.
      playSound(req.url, sender)
      sendResponse({ ok: true })
      break
    case 'fetchAudio': {
      // Safari: content-script Audio(cross-origin) often fails; fetch here with host perms.
      const audioUrl = req.url
      if (!audioUrl) {
        sendResponse({ error: 'empty url' })
        break
      }
      fetch(audioUrl, { credentials: 'include', mode: 'cors', cache: 'force-cache' })
        .then((r) => {
          if (!r.ok) throw new Error('audio http ' + r.status)
          return r.arrayBuffer()
        })
        .then((buf) => {
          const bytes = new Uint8Array(buf)
          let binary = ''
          const chunk = 0x8000
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(
              null,
              bytes.subarray(i, i + chunk)
            )
          }
          const mime = /\.ogg(\?|$)/i.test(audioUrl)
            ? 'audio/ogg'
            : /\.wav(\?|$)/i.test(audioUrl)
              ? 'audio/wav'
              : 'audio/mpeg'
          sendResponse({ dataUrl: `data:${mime};base64,${btoa(binary)}` })
        })
        .catch((e) => {
          debugLogger('error', 'fetchAudio failed', e)
          sendResponse({ error: String(e && e.message ? e.message : e) })
        })
      break
    }
    case 'getAuthInfo':
      // Structured status for popup (also exposes token for legacy checks).
      getAuthToken()
        .then((token) => {
          const loggedIn = !!(token && String(token).length)
          const payload = {
            loggedIn,
            status: loggedIn ? 'logged_in' : 'logged_out',
            message: loggedIn
              ? 'Logged in to Shanbay'
              : 'Not logged in: open web.shanbay.com and sign in in this browser',
            token: token || '',
          }
          debugLogger('log', 'getAuthInfo', payload.status)
          sendResponse(payload)
        })
        .catch((e) => {
          debugLogger('error', 'getAuthInfo failed', e)
          sendResponse({
            loggedIn: false,
            status: 'error',
            message: 'Could not check login status. Refresh and try again.',
            token: '',
          })
        })
      return true
    case 'authHarvest':
      // Persist any page-visible tokens from shanbay.com (auth-bridge.js)
      try {
        const harvest = {
          href: req.href || '',
          cookie: req.cookie || '',
          localStorage: req.localStorage || {},
          sessionStorage: req.sessionStorage || {},
          at: Date.now(),
        }
        chrome.storage.local.set({ __shanbayAuthHarvest: harvest }, () => {
          debugLogger('info', 'auth harvest saved', Object.keys(harvest.localStorage || {}))
          sendResponse({ ok: true })
        })
      } catch (e) {
        sendResponse({ ok: false })
      }
      break
    default:
      throw Error('Invalid action type')
  }
  return true
})

  /**
   * 每3小时检测一下今天的剩余单词数量, 必须登录扇贝之后才可以使用
   * @function getDailyTask
   * */
const getDailyTask = () => {
  const reminderName = 'remindAlarm'
  if (storage.alarm) {
    chrome.alarms.create(reminderName, {
      delayInMinutes: 60,
      periodInMinutes: 180
    })
    chrome.alarms.onAlarm.addListener(() => {
      if (!storage.alarm) return chrome.alarms.clear(reminderName)
      debugLogger('log', 'send daily task request')
      getDailyTaskCount().then(r => {
        if (r.total === 0) {
          chrome.action.setBadgeText({text: ''})
        } else {
          chrome.action.setBadgeText({text: r.total + ''})
          notify({
            message: `You have ${r.total} word(s) left to review today`,
            url: 'https://web.shanbay.com/wordsweb/#/collection'
          })
        }
      }).catch(e => debugLogger('error', 'get daily task failed, cause: ', e))
    })
  } else {
    chrome.alarms.clear(reminderName)
  }
}

/**
 * 根据网页上选择的文本进行查询
 */
const lookUpBySelection = async (tabId) => {
  try {
    // 获取网页中选择的文本
    const [{result}] = await chrome.scripting.executeScript({
      target: {tabId: tabId},
      func: () => getSelection().toString(),
    });

    const word = normalizeLookupWord(result)
    if (!word) {
      chrome.tabs.sendMessage(tabId, {
        action: 'lookup',
        data: { status: 400, msg: 'Please select a valid English word (hyphens OK, e.g. well-known)' },
      }).catch(() => {})
      return
    }

    // Look up word
    const res = await lookUp(word);
    const existsRes = await checkWordAdded(res.id);
    res.exists = existsRes.objects[0].exists;
    res.__shanbayExtensionSettings = {autoRead: storage.autoRead};

    // 发送事件，弹窗
    chrome.tabs.sendMessage(tabId, {action: 'lookup', data: res});
  } catch (e) {
    debugLogger('error', e);
    try {
      chrome.tabs.sendMessage(tabId, {
        action: 'lookup',
        data: formatLookupError(e),
      })
    } catch (_) {
      /* ignore */
    }
  }
}

chrome.storage.onChanged.addListener(changes => {
  const change = changes[SETTINGS_KEY]
  if (!change || !change.newValue) return
  const settings = change.newValue
  if (Array.isArray(settings) && settings.length) {
    settings.forEach(item => {
      Object.assign(storage, item)
    })
  }
  getDailyTask()
})

getExtensionSettings((settings) => {
  if (settings[SETTINGS_KEY] && Object.keys(settings[SETTINGS_KEY]).length) {
    settings[SETTINGS_KEY].forEach(item => {
      Object.assign(storage, item)
    })
  } else {
    Object.assign(storage, storageSettingMap)
  }

  // contentMenu (background has no page location; do not use location.hostname here)
  chrome.contextMenus.removeAll(function () {
    if (storage.contextLookup) {
      debugLogger('info', 'contextMenu added')
      chrome.contextMenus.create({
        id: 'shanbay-lookup-selection',
        title: 'Look up “%s” in Shanbay',
        contexts: ['selection'],
      })
      chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId !== 'shanbay-lookup-selection') return
        const word = normalizeLookupWord(info.selectionText)
        if (!word) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'lookup',
            data: { status: 400, msg: 'Please select a valid English word (hyphens OK, e.g. well-known)' },
          }).catch(() => {})
          return
        }
        lookUp(word)
        .then(res =>
          checkWordAdded(res.id)
            .then(existsRes => {
              res.exists = existsRes && existsRes.objects && existsRes.objects[0]
                ? existsRes.objects[0].exists
                : false
              return res
            })
            .catch(() => {
              res.exists = 'error'
              return res
            })
        )
        .then(res => {
          res.__shanbayExtensionSettings = {autoRead: storage.autoRead}
          chrome.tabs.sendMessage(tab.id, {action: 'lookup', data: res}).catch(() => {})
          })
        .catch(data =>
          chrome.tabs
            .sendMessage(tab.id, { action: 'lookup', data: formatLookupError(data) })
            .catch(() => {})
        )
      })
    }
  })
  getDailyTask()
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  switch (command) {
    case "look-up-in-shanbay":
      lookUpBySelection(tab.id);
      break;

    default:
      break;
  }
});
