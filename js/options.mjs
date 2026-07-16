import {
  debugLogger,
  defaultIgnoreSites,
  storageSettingArray,
  getExtensionSettings,
  setExtensionSettings,
  SETTINGS_KEY,
} from './const.mjs'

const renderDefaultIgnoreSites = () => {
  document.querySelector('.ignore-sites').innerHTML = defaultIgnoreSites.map(site => `<li>${site}</li>`).join('')
}

const renderOptions = (settings) => {
  renderDefaultIgnoreSites()
  /**
   * 根据配置渲染页面的方法
   * @param settings: 页面配置的数组
  * */
  settings.forEach(setting => {
    let name = Object.keys(setting)[0]
    let value = setting[name]
    let inputs
    switch (setting.type) {
      case 'text':
        inputs = document.querySelectorAll(`input[name="${name}"]`)
        inputs[0].value = value
        break
      case 'radio':
        inputs = document.querySelectorAll(`input[name="${name}"]`);
        [].forEach.call(inputs, input => {
          if (input.value === value.toString()) {
            input.checked = true
          }
        })
        break
      case 'select':
        document.querySelector(`select[name="${name}"]`).value = value
        break
      case 'textarea':
        document.querySelector(`textarea[name="${name}"]`).value = value.join('\n')
        break
      default:
        throw new ErrorEvent('invalid option form input type: ',  + setting.type)
    }

  })
}

const getOptions = () => {
  /**
   * 根据页面的选项获取设置信息
   * @return setting 配置信息的数组
   * */
  const inputs = document.querySelectorAll('input')
  const settings = []
  ;[].forEach.call(inputs, input => {
    if (input.type === 'checkbox') {
      settings.push({
        [input.name]: input.checked,
        type: 'checkbox'
      })
    } else if (input.type === 'radio') {
      if (input.checked) {
        settings.push({
          [input.name]: input.value === 'true',
          type: 'radio'
        })
      }

    } else {
      settings.push({
        [input.name]: input.value,
        type: 'text'
      })
    }
  })
  const selects = document.querySelectorAll('select')
  ;[].forEach.call(selects, select => {
    settings.push({
      [select.name]: select.value,
      type: 'select'
    })
  })

  const textareas = document.querySelectorAll('textarea')
  ;[].forEach.call(textareas, area => {
    if(area.value.trim()) {
      const sites = area.value.split('\n')
      if (sites.every(site => site.trim().match(/^([\w-]+\.){1,2}[\w]+$/))) {
        settings.push({
          [area.name]: sites.trim(),
          type: 'textarea'
        })
      } else {
        alert('屏蔽站点格式不正确')
        throw new Error('屏蔽站点格式不正确')
      }
    }
  })

  return settings
}

document.addEventListener('DOMContentLoaded', function () {
  getExtensionSettings((result) => {
    const settings = result[SETTINGS_KEY]
    debugLogger('log', `${SETTINGS_KEY}: `, settings)
    if (settings && Object.keys(settings).length) {
      renderOptions(settings)
    } else {
      renderOptions(storageSettingArray)
    }
  })


  document.querySelector('#save').onclick = function () {
    try {
      const _settings = getOptions()
      this.disabled = true
      setExtensionSettings(_settings, (lastError) => {
        debugLogger('log', 'lastError in options js: ', lastError)
        if (!lastError) {
          const saveRes = document.querySelector('#saveRes')
          saveRes.className = ''
          setTimeout( () => {
            saveRes.className = 'height-0'
            this.disabled = false
          }, 1000)
        }
        debugLogger('log', `${SETTINGS_KEY} settled.`)
      })
    } catch (e) {

    }
  }
})