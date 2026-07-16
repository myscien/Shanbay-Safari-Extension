import {
  debugLogger, storageSettingMap, lookUp, checkWordAdded,
  addOrForget, getWordExampleSentence, getDailyTaskCount, defaultIgnoreSites,
  getExtensionSettings, SETTINGS_KEY, getAuthToken
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
      const word = req.word
      const tabSender = sender
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
        '查询超时：请打开 web.shanbay.com 并登录，保持标签页打开后重试'
      )
        .then((data) => {
          data.__shanbayExtensionSettings = { autoRead: storage.autoRead }
          // Final result via tabs.sendMessage (reliable after long async work)
          replyToSender(tabSender, null, { action: 'lookup', data })
        })
        .catch((data) => {
          let error = {}
          if (data && data.message === 'Failed to fetch') {
            error.status = 400
            error.msg = '请求失败，请登录后刷新本页面'
          } else if (data && (data.msg || data.status)) {
            error = data
          } else {
            error = { status: 500, msg: (data && data.message) || '查询失败' }
          }
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
      getAuthToken()
        .then((token) => {
          debugLogger('log', 'getAuthInfo', token ? '(present)' : '(empty)')
          sendResponse(token)
        })
        .catch((e) => {
          debugLogger('error', 'getAuthInfo failed', e)
          sendResponse('')
        })
      break
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
            message: `今天还有${r.total}个单词需要复习`,
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

    // 查询单词
    const res = await lookUp(result);
    const existsRes = await checkWordAdded(res.id);
    res.exists = existsRes.objects[0].exists;
    res.__shanbayExtensionSettings = {autoRead: storage.autoRead};

    // 发送事件，弹窗
    chrome.tabs.sendMessage(tabId, {action: 'lookup', data: res});
  } catch (e) {
    debugLogger('error', e);
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
        title: '在扇贝网中查找 %s',
        contexts: ['selection'],
      })
      chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId !== 'shanbay-lookup-selection') return
        lookUp(info.selectionText)
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
        .catch(data => chrome.tabs.sendMessage(tab.id, {action: 'lookup', data}).catch(() => {}))
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
