import './css/themes/index.css'
import {
  buildInitMessage,
  collectThemeState,
  createAppHostHandlers,
  createToolBridgeHost,
  forwardTimerFloatEvents,
  watchAppTheme,
} from './tools/tool-bridge-host.js'

const LOAD_TIMEOUT_MS = 25000
const VERSION_TIMEOUT_MS = 3000

const frameEl = document.getElementById('tool-frame')
const loadingEl = document.getElementById('tool-loading')
const errorEl = document.getElementById('tool-error')
const errorMsgEl = document.getElementById('tool-error-msg')
const retryBtn = document.getElementById('tool-retry')

let meta = null
let appVersion = ''
let bridge = null
let bridgeReady = false
let pendingToolEvent = null
let loadTimer = null
let stopThemeWatch = null
let cleanupTimerFloat = null
let unsubscribeThemeSync = null
let unsubscribeInit = null
let unsubscribeToolEvent = null
let versionPromise = null
const appliedCustomVars = new Set()

function isValidCssVarName(name) {
  return typeof name === 'string' && /^--[A-Za-z0-9_-]+$/.test(name)
}

function isValidCssVarValue(val) {
  return typeof val === 'string' && val.length > 0 && !/[;{}]/.test(val)
}

function applyHostTheme(themeSetting) {
  const root = document.documentElement
  if (!root) return

  for (const name of appliedCustomVars) {
    root.style.removeProperty(name)
  }
  appliedCustomVars.clear()

  for (const cls of [...root.classList]) {
    if (cls.startsWith('theme-')) root.classList.remove(cls)
  }

  if (!themeSetting || typeof themeSetting !== 'object') return
  const theme = typeof themeSetting.theme === 'string' ? themeSetting.theme.trim() : 'default'
  if (theme && theme !== 'default' && theme !== 'custom' && /^[A-Za-z0-9_-]+$/.test(theme)) {
    root.classList.add(`theme-${theme}`)
  }
  if (theme === 'custom' && themeSetting.customVars && typeof themeSetting.customVars === 'object') {
    for (const [k, v] of Object.entries(themeSetting.customVars)) {
      if (isValidCssVarName(k) && isValidCssVarValue(v)) {
        root.style.setProperty(k, v)
        appliedCustomVars.add(k)
      }
    }
  }
}

function setStatus(state, message = '') {
  if (loadingEl) loadingEl.hidden = state !== 'loading'
  if (errorEl) errorEl.hidden = state !== 'error'
  if (state === 'error' && errorMsgEl) {
    errorMsgEl.textContent = message || '工具加载失败，请检查文件是否完整或稍后重试'
  }
}

function clearLoadTimeout() {
  if (loadTimer) {
    clearTimeout(loadTimer)
    loadTimer = null
  }
}

function startLoadTimeout() {
  clearLoadTimeout()
  loadTimer = setTimeout(() => {
    loadTimer = null
    setStatus('error', '工具加载超时，请稍后重试')
  }, LOAD_TIMEOUT_MS)
}

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(fallback), ms)
    Promise.resolve(promise).then(finish, () => finish(fallback))
  })
}

function ensureVersion() {
  if (!versionPromise) {
    versionPromise = (async () => {
      try {
        if (window.api && typeof window.api.getVersion === 'function') {
          const val = await window.api.getVersion()
          if (typeof val === 'string') appVersion = val
        }
      } catch (err) {
        console.warn('[tool-window] 获取版本号失败:', err)
      }
      return appVersion
    })()
  }
  return versionPromise
}

function currentEnv() {
  return {
    toolId: (meta && meta.id) || '',
    appVersion,
    platform: 'desktop',
    theme: collectThemeState(),
  }
}

function pushTheme() {
  if (bridge) bridge.emit('theme', collectThemeState())
}

function disconnectBridge() {
  bridgeReady = false
  if (!bridge) return
  try {
    bridge.dispose()
  } catch {
    /* ignore */
  }
  bridge = null
}

function connectBridge() {
  disconnectBridge()
  const win = frameEl && frameEl.contentWindow
  if (!win || typeof MessageChannel === 'undefined') return
  try {
    const channel = new MessageChannel()
    const handlers = createAppHostHandlers({
      api: window.api || null,
      toolId: (meta && meta.id) || '',
      platform: 'desktop',
    })
    handlers.getUsers = () => {
      if (!window.api || typeof window.api.requestToolUsers !== 'function') {
        return { users: {}, usersJson: {}, ranklistOrder: [] }
      }
      return window.api.requestToolUsers()
    }
    handlers.closeTool = () => {
      setTimeout(() => window.close(), 0)
      return { success: true }
    }

    bridge = createToolBridgeHost({
      port: channel.port1,
      handlers,
      env: currentEnv,
      onReady: () => {
        bridgeReady = true
        pushTheme()
        if (pendingToolEvent && pendingToolEvent.name) {
          const ev = pendingToolEvent
          pendingToolEvent = null
          bridge.emit(ev.name, ev.data)
        }
      },
      onClose: () => window.close(),
      onEvent: (name, data) => {
        if (name === 'sendImage') {
          if (window.api && typeof window.api.sendToolImage === 'function') {
            window.api.sendToolImage(data).catch((err) => {
              console.warn('[tool-window] 转发 sendImage 失败:', err)
            })
          }
          return
        }
        console.warn(`[tool-window] 未处理的工具事件: ${name}`, data)
      },
      onError: (err) => console.warn('[tool-window] bridge 错误:', err),
    })

    win.postMessage(
      buildInitMessage({
        appVersion,
        platform: 'desktop',
        theme: collectThemeState(),
      }),
      '*',
      [channel.port2],
    )
  } catch (err) {
    console.warn('[tool-window] 建立工具桥接失败:', err)
    bridge = null
  }
}

function loadToolFrame() {
  if (!meta || !meta.url) {
    setStatus('error', '工具地址无效，请从工具列表重新打开')
    return
  }
  setStatus('loading')
  startLoadTimeout()
  frameEl.src = meta.url
}

function startWithMeta(initMeta) {
  if (!initMeta || !initMeta.url) return
  if (initMeta.pendingEvent && initMeta.pendingEvent.name) {
    if (bridge && bridgeReady) {
      bridge.emit(initMeta.pendingEvent.name, initMeta.pendingEvent.data)
    } else {
      pendingToolEvent = initMeta.pendingEvent
    }
  }
  if (meta && meta.id === initMeta.id && meta.url === initMeta.url) return
  meta = initMeta
  document.title = meta.name || meta.id || '工具'
  if (meta.themeSetting) applyHostTheme(meta.themeSetting)
  loadToolFrame()
}

if (frameEl) {
  frameEl.addEventListener('load', async () => {
    if (!meta || !meta.url) return
    clearLoadTimeout()
    setStatus('ready')
    await withTimeout(ensureVersion(), VERSION_TIMEOUT_MS, '')
    connectBridge()
  })
  frameEl.addEventListener('error', () => {
    clearLoadTimeout()
    setStatus('error', '工具页面加载失败，请检查文件是否完整或稍后重试')
  })
}

if (retryBtn) {
  retryBtn.addEventListener('click', () => {
    disconnectBridge()
    if (frameEl) frameEl.src = 'about:blank'
    setTimeout(loadToolFrame, 0)
  })
}

function cleanup() {
  clearLoadTimeout()
  disconnectBridge()
  if (stopThemeWatch) {
    stopThemeWatch()
    stopThemeWatch = null
  }
  if (cleanupTimerFloat) {
    cleanupTimerFloat()
    cleanupTimerFloat = null
  }
  if (unsubscribeThemeSync) {
    unsubscribeThemeSync()
    unsubscribeThemeSync = null
  }
  if (unsubscribeInit) {
    unsubscribeInit()
    unsubscribeInit = null
  }
  if (unsubscribeToolEvent) {
    unsubscribeToolEvent()
    unsubscribeToolEvent = null
  }
}

window.addEventListener('beforeunload', cleanup)

async function bootstrap() {
  ensureVersion()
  stopThemeWatch = watchAppTheme(() => pushTheme())
  cleanupTimerFloat = forwardTimerFloatEvents(window.api, (name, data) => {
    if (bridge) bridge.emit(name, data)
  })
  if (window.api && typeof window.api.onToolThemeChanged === 'function') {
    unsubscribeThemeSync = window.api.onToolThemeChanged((themeSetting) => {
      applyHostTheme(themeSetting)
      pushTheme()
    })
  }
  if (window.api && typeof window.api.onToolWindowEvent === 'function') {
    unsubscribeToolEvent = window.api.onToolWindowEvent((ev) => {
      if (!ev || typeof ev.name !== 'string' || !ev.name) return
      if (bridge && bridgeReady) bridge.emit(ev.name, ev.data)
      else pendingToolEvent = ev
    })
  }
  if (window.api && typeof window.api.onToolWindowInit === 'function') {
    unsubscribeInit = window.api.onToolWindowInit((initMeta) => startWithMeta(initMeta))
  }
  if (window.api && typeof window.api.getToolWindowInit === 'function') {
    try {
      const initMeta = await window.api.getToolWindowInit()
      if (initMeta && initMeta.url) {
        startWithMeta(initMeta)
      } else if (initMeta && initMeta.themeSetting) {
        applyHostTheme(initMeta.themeSetting)
      }
    } catch (err) {
      console.warn('[tool-window] 获取初始化信息失败:', err)
    }
  }
}

bootstrap()
