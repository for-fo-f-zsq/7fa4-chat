/**
 * 工具宿主桥接（宿主侧）
 *
 * 负责 7FA4 Chat 宿主与 iframe 内工具之间的 RPC / 事件通道：
 *   - 工具 → 宿主 RPC：{ t:'req', id, method, params }  → { t:'res', id, ok, result?, error? }
 *   - 宿主 → 工具事件：{ t:'evt', name, data }
 *   - 工具 → 宿主事件：{ t:'evt', name, data }（ready / close / 其它，见 spec §6）
 *
 * 本模块刻意不 import Vue / store / utils：
 *   - RPC 方法表由 createAppHostHandlers() 组装后注入；
 *   - DOM / iframe / MessagePort 生命周期由 ToolHost.vue 负责。
 * 这样既方便在 node 下直接单测，也能被其它宿主（如未来的独立窗口）复用。
 */

/** iframe load 后宿主发给工具的初始化消息类型 */
export const TOOL_INIT_TYPE = 'tool:init'

/**
 * getEnv().theme.tokens 中携带的 CSS 变量清单。
 * 全部取自 themes/default.css（:root），各主题会覆盖同名变量；
 * 工具侧按同名 CSS 变量注入即可跟随应用换肤。
 */
export const TOOL_THEME_TOKENS = Object.freeze([
  '--bg-app',
  '--bg-sidebar',
  '--bg-sidebar-hover',
  '--bg-input',
  '--bg-input-focus',
  '--bg-code-block',
  '--bg-code-inline',
  '--bg-gradient-end',
  '--bg-modal-overlay',
  '--border-light',
  '--text-primary',
  '--text-secondary',
  '--text-placeholder',
  '--text-link',
  '--text-error',
  '--text-hint',
  '--text-on-accent',
  '--accent',
  '--accent-hover',
  '--accent-active',
  '--accent-light',
  '--accent-outline',
  '--message-self-bg',
  '--message-self-text',
  '--message-other-bg',
  '--shadow-card',
  '--shadow-card-hover',
  '--shadow-dropdown',
  '--shadow-modal',
  '--shadow-input',
  '--radius',
  '--radius-lg',
  '--font-size-base',
  '--font-size-small',
  '--font-size-large',
  '--danger',
  '--danger-hover',
  '--success',
  '--warning',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
  '--divider-bg',
])

/** 桥接协议参数 / 状态错误（带 code，方便工具侧区分“参数错”与“API 不可用”） */
export class ToolBridgeError extends Error {
  constructor(message, code = 'tool_bridge_error') {
    super(message)
    this.name = 'ToolBridgeError'
    this.code = code
  }
}

/** 统一的错误转字符串（RPC 响应里的 error 字段只放人类可读字符串） */
export function formatError(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  if (typeof err.message === 'string' && err.message) return err.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function getDocument() {
  return typeof document !== 'undefined' ? document : null
}

/** 深拷贝成可结构化克隆的普通对象（Vue reactive Proxy 不能直接 postMessage） */
export function clonePlain(value) {
  if (value == null) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

/**
 * 从 RPC 的 params 里取第 index 个参数。兼容三种来自不同 bridge-client 实现的写法：
 *   params = [a, b, c]      → JSON-RPC 风格，按位置取（推荐）
 *   params = { url, ... }   → 单参数对象，按 key 取；没有 key 时 index=0 视为整个对象
 *   params = 'value'        → 单个标量，index=0 视为该值
 */
export function paramAt(params, index, key) {
  if (params == null) return undefined
  if (Array.isArray(params)) return params[index]
  if (typeof params === 'object') {
    if (key && Object.prototype.hasOwnProperty.call(params, key)) return params[key]
    return index === 0 ? params : undefined
  }
  return index === 0 ? params : undefined
}

/** 把 params 规整成单个对象参数（timerFloat* 用） */
export function objectParam(params, label = '参数') {
  if (params == null) return {}
  if (Array.isArray(params)) {
    const first = params[0]
    if (first == null) return {}
    if (typeof first !== 'object') throw new ToolBridgeError(`${label}必须是对象`)
    return first
  }
  if (typeof params !== 'object') throw new ToolBridgeError(`${label}必须是对象`)
  return params
}

export function assertString(value, label) {
  if (typeof value !== 'string') throw new ToolBridgeError(`参数 ${label} 必须是字符串`)
  return value
}

export function assertNonEmptyString(value, label) {
  const str = assertString(value, label)
  if (!str.trim()) throw new ToolBridgeError(`参数 ${label} 不能为空`)
  return str
}

export function assertOptionalString(value, label, fallback = '') {
  if (value == null) return fallback
  return assertString(value, label)
}

/* ------------------------------------------------------------------ */
/* 主题                                                                 */
/* ------------------------------------------------------------------ */

/** 按 --bg-app 的亮度判断是否深色（与 ThemeModal.vue isDarkTheme 口径一致） */
export function isDarkColor(color) {
  if (typeof color !== 'string' || !color) return false
  const c = color.trim()
  let r = 255
  let g = 255
  let b = 255
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex
    if (full.length < 6) return false
    r = parseInt(full.slice(0, 2), 16)
    g = parseInt(full.slice(2, 4), 16)
    b = parseInt(full.slice(4, 6), 16)
    if ([r, g, b].some((n) => Number.isNaN(n))) return false
  } else {
    const nums = c.match(/\d+/g)
    if (!nums || nums.length < 3) return false
    r = Number(nums[0])
    g = Number(nums[1])
    b = Number(nums[2])
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

/**
 * 读取当前应用主题的 CSS 变量。
 * @param {Document} [doc]
 * @returns {Record<string, string>} CSS 变量名 → 计算值
 */
export function collectThemeTokens(doc = getDocument()) {
  const tokens = {}
  const docEl = doc && doc.documentElement
  if (!docEl) return tokens
  const view = doc.defaultView || (typeof window !== 'undefined' ? window : null)
  let style = null
  try {
    style = view && view.getComputedStyle ? view.getComputedStyle(docEl) : null
  } catch {
    style = null
  }
  // Chromium 支持 for...of 枚举 CSSStyleDeclaration 的全部自定义属性，全量下发可避免漏 token；
  // 失败时退回 TOOL_THEME_TOKENS 白名单（老引擎 / 测试环境）。
  if (style) {
    try {
      for (const name of style) {
        if (typeof name === 'string' && name.startsWith('--')) {
          const value = style.getPropertyValue(name).trim()
          if (value) tokens[name] = value
        }
      }
    } catch {
      /* ignore */
    }
  }
  for (const name of TOOL_THEME_TOKENS) {
    if (tokens[name]) continue
    const value = style ? style.getPropertyValue(name).trim() : ''
    if (value) tokens[name] = value
  }
  // 自定义主题（setting.theme='custom'）通过 root.style.setProperty 写入内联样式，不在样式表里
  const inline = docEl.style
  if (inline && typeof inline.length === 'number') {
    for (let i = 0; i < inline.length; i += 1) {
      const name = inline[i]
      if (typeof name === 'string' && name.startsWith('--')) {
        const value = inline.getPropertyValue(name).trim()
        if (value) tokens[name] = value
      }
    }
  }
  return tokens
}

/**
 * 当前主题快照：tokens + 深色标记 + 主题名。
 * 形状与工具侧 bridge-client 约定一致：{ tokens, name, dark }；
 * 因为 JSON 可序列化，也用于 watchAppTheme 的比较。
 */
export function collectThemeState(doc = getDocument()) {
  const docEl = doc && doc.documentElement
  const tokens = collectThemeTokens(doc)
  let name = 'default'
  const className = docEl && typeof docEl.className === 'string' ? docEl.className : ''
  const match = /(?:^|\s)theme-([A-Za-z0-9_-]+)/.exec(className)
  if (match) name = match[1]
  return {
    tokens,
    name,
    dark: isDarkColor(tokens['--bg-app']),
  }
}

function serializeTheme(doc) {
  try {
    return JSON.stringify(collectThemeState(doc))
  } catch {
    return ''
  }
}

/**
 * 监听应用主题变化（换主题 / 自定义变量变化）。
 * MutationObserver 覆盖 class/style 属性变化，定时器兜底其它途径（例如异步写 CSS 变量）。
 * @param {(state: ReturnType<typeof collectThemeState>) => void} onChange
 * @param {{ intervalMs?: number, doc?: Document }} [options]
 * @returns {() => void} 停止监听
 */
export function watchAppTheme(onChange, options = {}) {
  const { intervalMs = 1500, doc = getDocument() } = options
  const target = doc && doc.documentElement
  if (!target || typeof onChange !== 'function') return () => {}
  let disposed = false
  let last = serializeTheme(doc)

  function check() {
    if (disposed) return
    const next = serializeTheme(doc)
    if (next === last) return
    last = next
    try {
      onChange(collectThemeState(doc))
    } catch (err) {
      // 主题推送失败不能影响工具使用
      console.warn('[tool-bridge] theme push failed:', err)
    }
  }

  let observer = null
  try {
    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(check)
      observer.observe(target, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    }
  } catch {
    observer = null
  }

  let timer = null
  if (intervalMs > 0 && typeof setInterval === 'function') {
    timer = setInterval(check, intervalMs)
  }

  return function stop() {
    disposed = true
    try {
      if (observer) observer.disconnect()
    } catch {
      /* ignore */
    }
    if (timer) {
      try {
        clearInterval(timer)
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 把桌面端 window.api 的 timerFloat 事件转发为工具事件。
 * @param {object} api window.api
 * @param {(name: string, data: any) => void} emit 宿主事件发送函数
 * @returns {() => void} 取消全部订阅
 */
export function forwardTimerFloatEvents(api, emit) {
  const subscriptions = [
    ['onTimerFloatCommand', 'timer-float-command'],
    ['onTimerFloatClosed', 'timer-float-closed'],
    ['onTimerFloatMoved', 'timer-float-moved'],
  ]
  const cleanups = []
  if (!api || typeof emit !== 'function') return () => {}
  for (const [fnName, eventName] of subscriptions) {
    const fn = api[fnName]
    if (typeof fn !== 'function') continue
    try {
      const unsubscribe = fn((data) => {
        try {
          emit(eventName, data)
        } catch (err) {
          console.warn(`[tool-bridge] 转发 ${eventName} 失败:`, err)
        }
      })
      if (typeof unsubscribe === 'function') cleanups.push(unsubscribe)
    } catch (err) {
      console.warn(`[tool-bridge] 订阅 ${fnName} 失败:`, err)
    }
  }
  return function cleanup() {
    for (const unsubscribe of cleanups) {
      try {
        unsubscribe()
      } catch {
        /* ignore */
      }
    }
    cleanups.length = 0
  }
}

/**
 * 组装宿主 RPC 的默认 methods（全部落到现有 window.api / store / utils）。
 *
 * @param {{
 *   api?: object, store?: object, usersJson?: object, ranklistOrder?: any[],
 *   toolId?: string, platform?: 'desktop'|'android',
 * }} options
 * @returns {Record<string, (params: any, ctx?: object) => any>}
 */
export function createAppHostHandlers(options = {}) {
  const {
    api = null,
    store = null,
    usersJson = null,
    ranklistOrder = null,
    toolId = '',
    platform = null,
  } = options

  function requireApi(name) {
    const fn = api && api[name]
    if (typeof fn !== 'function') {
      throw new ToolBridgeError(`当前客户端暂不支持该操作（${name}），请更新应用`, 'api_unavailable')
    }
    return fn.bind(api)
  }

  function optionalApi(name) {
    const fn = api && api[name]
    return typeof fn === 'function' ? fn.bind(api) : null
  }

  return {
    getUsers: () => ({
      users: clonePlain((store && store.users) || {}),
      usersJson: clonePlain(usersJson || {}),
      ranklistOrder: clonePlain(ranklistOrder || []),
    }),

    getVersion: () => requireApi('getVersion')(),

    // 桌面 preload 的 getPlatform 返回 windows/macos/linux/desktop，与工具契约的
    // desktop/android 不一致（web-api 才有 android/web）。统一从宿主注入的 platform
    // （或 window 标记）派生，保证工具拿到的值与 getEnv 一致。
    getPlatform: () => (typeof platform === 'string' && platform ? platform : detectPlatform()),

    openExternal: (params) => {
      const url = assertNonEmptyString(paramAt(params, 0, 'url'), 'url')
      return requireApi('openExternal')(url)
    },

    selectFile: () => requireApi('selectFile')(),

    selectImage: () => requireApi('selectImage')(),

    downloadFile: (params) => {
      const base64 = assertNonEmptyString(paramAt(params, 0, 'base64'), 'base64')
      const name = assertOptionalString(paramAt(params, 1, 'name'), 'name', `tool-${toolId || 'file'}.bin`)
      const mime = assertOptionalString(paramAt(params, 2, 'mime'), 'mime', 'application/octet-stream')
      return requireApi('downloadFile')(base64, name, mime)
    },

    exportMarkdownPng: (params) => {
      const name = assertOptionalString(paramAt(params, 0, 'name'), 'name', `tool-${toolId || 'markdown'}.png`)
      // 允许空 Markdown（导出空白画布），只校验类型，与 preload 的行为保持一致
      const content = assertString(paramAt(params, 1, 'content') ?? '', 'content')
      return requireApi('exportMarkdownPng')(name, content)
    },

    timerFloatOpen: (params) => {
      const cfg = objectParam(params, 'timerFloatOpen 参数')
      return requireApi('openTimerFloat')(cfg)
    },

    timerFloatUpdate: (params) => {
      const payload = objectParam(params, 'timerFloatUpdate 参数')
      const update = optionalApi('updateTimerFloat')
      if (update) update(payload)
      return { success: !!update }
    },

    timerFloatUpdateConfig: (params) => {
      const cfg = objectParam(params, 'timerFloatUpdateConfig 参数')
      const update = optionalApi('updateTimerFloatConfig')
      if (update) update(cfg)
      return { success: !!update }
    },

    timerFloatClose: () => {
      const close = optionalApi('closeTimerFloat')
      if (close) close()
      return { success: !!close }
    },

    timerFloatIsOpen: () => {
      const isOpen = optionalApi('isTimerFloatOpen')
      if (!isOpen) return false
      // 桌面 preload / web-api 的 isTimerFloatOpen 都返回 Promise<boolean>，
      // 直接 !!Promise 恒为 true 会把未打开的悬浮窗误判成已打开；统一 resolve 后转 boolean。
      return Promise.resolve()
        .then(() => isOpen())
        .then((value) => !!value)
        .catch(() => false)
    },
  }
}

/**
 * 构造 iframe load 后通过 window.postMessage 发送的初始化消息。
 * ToolHost 用 iframe.contentWindow.postMessage(buildInitMessage(env), '*', [port2]) 发送。
 * theme 为可选项（工具侧据此避免首屏闪白），无则不带该字段。
 */
export function buildInitMessage(env = {}) {
  const { appVersion = '', platform = 'desktop', theme = null } = env || {}
  const message = {
    type: TOOL_INIT_TYPE,
    appVersion: typeof appVersion === 'string' ? appVersion : '',
    platform: typeof platform === 'string' && platform ? platform : 'desktop',
  }
  if (theme && typeof theme === 'object') message.theme = theme
  return message
}

/** 探测平台：Android 原生壳返回 android，其余（桌面端 / 纯网页）统一按 desktop 处理 */
export function detectPlatform(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return 'desktop'
  if (win.__7FA4_NATIVE__) return 'android'
  return 'desktop'
}

function normalizeTheme(rawTheme) {
  const theme = rawTheme && typeof rawTheme === 'object' ? rawTheme : {}
  const tokens = theme.tokens && typeof theme.tokens === 'object' ? theme.tokens : {}
  let name = 'default'
  if (typeof theme.name === 'string' && theme.name) name = theme.name
  else if (typeof theme.theme === 'string' && theme.theme) name = theme.theme
  return { tokens, name, dark: !!theme.dark }
}

function normalizeEnv(raw) {
  const env = raw && typeof raw === 'object' ? raw : {}
  const platform = env.platform === 'android' ? 'android' : 'desktop'
  return {
    appVersion: typeof env.appVersion === 'string' ? env.appVersion : '',
    platform,
    theme: normalizeTheme(env.theme),
  }
}

function normalizeLogLevel(level) {
  const value = typeof level === 'string' ? level.toLowerCase() : 'info'
  return ['debug', 'info', 'warn', 'error', 'log'].includes(value) ? value : 'info'
}

/**
 * 创建宿主侧桥接实例。
 *
 * @param {{
 *   port?: MessagePort,                     // 与 iframe 通信的 port1（推荐）
 *   post?: (message: any) => void,          // 自定义发送函数（不传则用 port.postMessage）
 *   handlers?: Record<string, Function>,    // 业务 RPC 方法表，见 createAppHostHandlers
 *   env?: object | (() => object),          // getEnv 返回值，支持函数形式以读取最新值
 *   onLog?: (level: string, message: string) => void,
 *   onReady?: (data: any) => void,          // 工具发来 {t:'evt',name:'ready'}
 *   onClose?: (data: any) => void,          // 工具发来 {t:'evt',name:'close'}
 *   onEvent?: (name: string, data: any) => void,
 *   onError?: (err: any) => void,
 * }} options
 */
export function createToolBridgeHost(options = {}) {
  const {
    port = null,
    post = null,
    handlers = {},
    env = {},
    onLog = null,
    onReady = null,
    onClose = null,
    onEvent = null,
    onError = null,
  } = options

  let boundPort = null
  let disposed = false

  function reportError(err) {
    if (typeof onError === 'function') {
      try {
        onError(err)
      } catch {
        /* ignore */
      }
    }
  }

  function send(message) {
    if (disposed) return false
    try {
      if (typeof post === 'function') post(message)
      else if (boundPort) boundPort.postMessage(message)
      else return false
      return true
    } catch (err) {
      reportError(err)
      return false
    }
  }

  /** 向工具推送事件 { t:'evt', name, data } */
  function emit(name, data) {
    if (typeof name !== 'string' || !name) return false
    return send({ t: 'evt', name, data })
  }

  function reply(id, ok, payload = {}) {
    const message = { t: 'res', id, ok }
    if (ok) {
      if (Object.prototype.hasOwnProperty.call(payload, 'result')) message.result = payload.result
    } else {
      message.error = payload.error || '未知错误'
    }
    return send(message)
  }

  const builtinHandlers = {
    getEnv: () => normalizeEnv(typeof env === 'function' ? env() : env),
    log: (params) => {
      const level = normalizeLogLevel(paramAt(params, 0, 'level'))
      const rawMessage = paramAt(params, 1, 'msg')
      const message = typeof rawMessage === 'string' ? rawMessage : rawMessage == null ? '' : String(rawMessage)
      if (typeof onLog === 'function') {
        try {
          onLog(level, message)
        } catch {
          /* ignore */
        }
      } else {
        const logger = console[level] || console.log
        try {
          logger(`[tool${toolLabel()}] ${message}`)
        } catch {
          /* ignore */
        }
      }
      return true
    },
  }

  function toolLabel() {
    try {
      const currentEnv = typeof env === 'function' ? env() : env
      return currentEnv && currentEnv.toolId ? `:${currentEnv.toolId}` : ''
    } catch {
      return ''
    }
  }

  function handleRequest(message) {
    const id = message.id
    const method = message.method
    if (typeof method !== 'string' || !method) {
      reply(id, false, { error: '无效的 RPC 方法名' })
      return
    }
    const handler = Object.prototype.hasOwnProperty.call(handlers, method) ? handlers[method] : builtinHandlers[method]
    if (typeof handler !== 'function') {
      reply(id, false, { error: `未实现的宿主方法: ${method}` })
      return
    }
    let result
    try {
      result = handler(message.params, { method, id })
    } catch (err) {
      reply(id, false, { error: formatError(err) })
      return
    }
    if (result && typeof result.then === 'function') {
      Promise.resolve(result).then(
        (value) => reply(id, true, { result: value }),
        (err) => reply(id, false, { error: formatError(err) }),
      )
    } else {
      reply(id, true, { result })
    }
  }

  function handleToolEvent(message) {
    const name = message.name
    if (typeof name !== 'string' || !name) return
    const data = message.data
    try {
      if (name === 'ready') {
        if (typeof onReady === 'function') onReady(data)
      } else if (name === 'close') {
        if (typeof onClose === 'function') onClose(data)
      } else if (typeof onEvent === 'function') {
        onEvent(name, data)
      }
    } catch (err) {
      reportError(err)
    }
  }

  /** 处理工具发来的消息；参数可以是 MessageEvent 或原始消息对象（便于单测） */
  function handleMessage(eventOrMessage) {
    if (disposed) return
    let data = null
    if (eventOrMessage && typeof eventOrMessage === 'object') {
      if ('t' in eventOrMessage) data = eventOrMessage
      else if ('data' in eventOrMessage) data = eventOrMessage.data
    }
    if (!data || typeof data !== 'object') return
    if (data.t === 'req') handleRequest(data)
    else if (data.t === 'evt') handleToolEvent(data)
  }

  function unbindPort() {
    if (!boundPort) return
    try {
      boundPort.removeEventListener('message', handleMessage)
    } catch {
      /* ignore */
    }
    try {
      if (typeof boundPort.close === 'function') boundPort.close()
    } catch {
      /* ignore */
    }
    boundPort = null
  }

  /** 绑定（或换绑）MessagePort；会在构造时自动绑定传入的 port */
  function bindPort(nextPort) {
    if (!nextPort || typeof nextPort.addEventListener !== 'function') {
      throw new ToolBridgeError('无效的 MessagePort')
    }
    unbindPort()
    boundPort = nextPort
    boundPort.addEventListener('message', handleMessage)
    try {
      if (typeof boundPort.start === 'function') boundPort.start()
    } catch {
      /* ignore */
    }
    return api
  }

  /** 断开端口并停止响应，工具关闭 / 宿主卸载时调用 */
  function dispose() {
    disposed = true
    unbindPort()
  }

  const api = {
    bindPort,
    dispose,
    emit,
    handleMessage,
    get disposed() {
      return disposed
    },
  }

  if (port) bindPort(port)

  return api
}
