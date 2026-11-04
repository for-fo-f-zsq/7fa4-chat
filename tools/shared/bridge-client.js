/**
 * tools/shared/bridge-client.js
 *
 * 工具 iframe 侧桥接客户端（实现 tmp/tools-online-spec.md §6 的「工具侧」）。
 *
 * 宿主（src/renderer/src/components/ToolHost.vue）在 iframe load 之后注入一个 MessageChannel 端口：
 *
 *   iframe.contentWindow.postMessage(
 *     { type: 'tool:init', appVersion, platform: 'desktop' | 'android', theme: { tokens, name, dark } },
 *     '*',
 *     [port2]
 *   )
 *
 * 本模块的职责：
 *   1. 监听 window 的 message 事件，收到 tool:init 后接管 e.ports[0]；
 *   2. 在**模块加载时立刻**把 window.api 定义成与桌面 preload 兼容的 RPC 代理 ——
 *      工具组件模块（如 timer/timerStore.js）在顶层就会访问 window.api，那时 init 还没到，
 *      所以 init 之前发起的调用先排队，端口就绪后按序 flush；
 *   3. 接收宿主 → 工具的事件（theme / timer-float-* / 其他），派发给 window.api 的回调；
 *   4. 暴露 window.__toolBridge（getEnv / getUsers / onTheme / onEvent / log / requestClose）。
 *
 * 每个工具的 src/main.js 必须**在最前面** import 本模块（先于 Vue / 组件模块求值），
 * 否则组件模块顶层的 window.api 访问会拿到 undefined。
 *
 * RPC 帧（全部走注入的 MessagePort，不再经过 window.postMessage）：
 *   工具 → 宿主：{ t: 'req', id: number, method: string, params: any[] }   // params 为位置参数数组
 *   宿主 → 工具：{ t: 'res', id: number, ok: boolean, result?: any, error?: string }
 *   宿主 → 工具：{ t: 'evt', name: string, data: any }
 *
 * 约束（spec §5/§9）：工具包内不允许依赖 Electron preload / Node，也不允许直接 import 宿主渲染层代码；
 * 一切跨边界能力都走这里的 RPC。
 */

/** 工具侧桥接协议版本（宿主可在 tool:init 里带 bridgeVersion，便于将来平滑升级） */
const BRIDGE_VERSION = 1

/** init 等待上限：超时后把排队中的调用全部拒绝，避免直接双击 index.html 调试时永远 pending */
const INIT_WAIT_MS = 20000

/** 排队上限，防止宿主一直不初始化时无限增长 */
const QUEUE_LIMIT = 2000

/**
 * 与 ipcRenderer.send 语义一致、不需要回包的方法：不建 pending、不参与超时拒绝。
 * （timer 工具每 100ms 级的心跳式推送，若每个都留 pending 会持续占内存）
 */
const FIRE_AND_FORGET = new Set(['timerFloatUpdate', 'timerFloatUpdateConfig'])

/** 已接管的 MessagePort；null 表示宿主还没发 tool:init */
let port = null
/** 端口是否已就绪（port 已接管 + 队列已 flush） */
let ready = false
/** RPC 请求自增 id */
let seq = 0
/** 等待 init 的超时定时器 */
let initTimer = 0

/** id -> { resolve, reject, method } */
const pending = new Map()
/** 尚未 flush 的 req 帧（宿主未初始化时发起） */
const queue = []
/** 事件名 -> Set<callback> */
const listeners = new Map()

/** 工具运行环境缓存（init / getEnv 时更新） */
const env = {
  appVersion: '',
  platform: 'desktop',
  theme: { tokens: {}, name: '', dark: false }
}

/* ------------------------------------------------------------------ *
 * 通用小工具
 * ------------------------------------------------------------------ */

function toError(raw, method) {
  const message =
    typeof raw === 'string' && raw
      ? raw
      : `[tool-bridge] RPC failed: ${method || 'unknown'}`
  const err = new Error(message)
  err.code = 'TOOL_BRIDGE_RPC'
  err.method = method
  return err
}

function rejectSlot(id, err) {
  const slot = pending.get(id)
  if (!slot) return
  pending.delete(id)
  slot.reject(err instanceof Error ? err : new Error(String(err)))
}

/** 当前主题快照（深拷贝 tokens，避免调用方改到内部状态） */
function themeSnapshot() {
  return {
    tokens: { ...env.theme.tokens },
    name: env.theme.name,
    dark: env.theme.dark
  }
}

/**
 * 应用宿主下发的主题。
 * - tokens：宿主 documentElement 上实际生效的自定义属性（`--bg-app` 等），逐个写到本页 :root 行内样式；
 * - name：写到 <html data-theme="...">，让工具包自带的 themes/*.css 选中对应主题；
 * - dark：同步 <html class="dark">。
 * 行内样式的优先级高于工具包内置的 theme.css，因此宿主 tokens 总是以宿主为准。
 */
function applyTheme(theme) {
  if (!theme || typeof theme !== 'object') return
  const root = document.documentElement
  if (!root) return

  // 兼容两种下发形状：{ tokens: {...}, name, dark } 或直接 {...cssVars}
  const rawTokens =
    theme.tokens && typeof theme.tokens === 'object' ? theme.tokens : theme
  const next = themeSnapshot()

  for (const key of Object.keys(rawTokens)) {
    if (typeof key !== 'string' || !key.startsWith('--')) continue
    const value = rawTokens[key]
    if (value == null || value === '') continue
    const str = String(value)
    next.tokens[key] = str
    root.style.setProperty(key, str)
  }

  if (typeof theme.name === 'string' && theme.name) {
    next.name = theme.name
    root.dataset.theme = theme.name
  }
  if (typeof theme.dark === 'boolean') {
    next.dark = theme.dark
    root.classList.toggle('dark', theme.dark)
  }

  env.theme = next
}

/* ------------------------------------------------------------------ *
 * 事件订阅（宿主 → 工具）
 * ------------------------------------------------------------------ */

function subscribe(name, cb) {
  if (typeof cb !== 'function') return () => {}
  let set = listeners.get(name)
  if (!set) {
    set = new Set()
    listeners.set(name, set)
  }
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

function dispatch(name, data) {
  const set = listeners.get(name)
  if (!set || set.size === 0) return
  for (const cb of [...set]) {
    try {
      cb(data)
    } catch (e) {
      console.error(`[tool-bridge] 事件回调异常：${name}`, e)
    }
  }
}

/* ------------------------------------------------------------------ *
 * RPC
 * ------------------------------------------------------------------ */

function armInitTimeout() {
  if (initTimer || ready) return
  if (pending.size === 0 && queue.length === 0) return
  initTimer = setTimeout(() => {
    initTimer = 0
    if (ready) return
    const err = new Error(
      '[tool-bridge] 未收到宿主 tool:init（工具可能被直接打开而非嵌入宿主）。已取消排队中的 RPC 调用。'
    )
    err.code = 'TOOL_BRIDGE_NO_HOST'
    for (const id of [...pending.keys()]) rejectSlot(id, err)
    queue.length = 0
  }, INIT_WAIT_MS)
  // Node 环境下避免定时器把进程吊住（浏览器/Electron 里不会有这个 API，判空即可）
  if (initTimer && typeof initTimer.unref === 'function') initTimer.unref()
}

function sendFrame(frame) {
  if (ready && port) {
    try {
      port.postMessage(frame)
      return
    } catch (e) {
      if (!FIRE_AND_FORGET.has(frame.method)) rejectSlot(frame.id, e)
      return
    }
  }
  if (queue.length >= QUEUE_LIMIT) {
    rejectSlot(frame.id, new Error('[tool-bridge] RPC 队列溢出（宿主未初始化？）'))
    return
  }
  queue.push(frame)
  armInitTimeout()
}

/**
 * 发起一次 RPC，返回 Promise。
 * @param {string} method 宿主侧方法名（见 spec §6）
 * @param {any[]} [params] 位置参数数组
 */
function request(method, params) {
  method = String(method)
  const args =
    params === undefined ? [] : Array.isArray(params) ? params : [params]
  const frame = { t: 'req', id: ++seq, method, params: args }

  if (FIRE_AND_FORGET.has(method)) {
    sendFrame(frame)
    return Promise.resolve(undefined)
  }

  const promise = new Promise((resolve, reject) => {
    pending.set(frame.id, { resolve, reject, method })
    sendFrame(frame)
  })
  return promise
}

function handlePortMessage(event) {
  const msg = event && event.data
  if (!msg || typeof msg !== 'object') return

  if (msg.t === 'res') {
    const slot = pending.get(msg.id)
    if (!slot) return // fire-and-forget 的回包 / 重复回包：忽略
    pending.delete(msg.id)
    if (msg.ok) slot.resolve(msg.result)
    else slot.reject(toError(msg.error, slot.method))
    return
  }

  if (msg.t === 'evt') {
    if (typeof msg.name !== 'string' || !msg.name) return
    if (msg.name === 'theme') {
      applyTheme(msg.data)
      dispatch('theme', themeSnapshot())
      return
    }
    dispatch(msg.name, msg.data)
  }
}

/* ------------------------------------------------------------------ *
 * 初始化
 * ------------------------------------------------------------------ */

function initBridge(data, messagePort) {
  if (!messagePort || typeof messagePort.postMessage !== 'function') return

  // 重复 init（宿主重发 / 热更新）：先释放旧端口，改用新端口
  if (port && port !== messagePort) {
    try {
      port.close()
    } catch {
      /* 忽略 */
    }
  }

  port = messagePort
  port.onmessage = handlePortMessage
  if (typeof port.start === 'function') port.start()

  if (initTimer) {
    clearTimeout(initTimer)
    initTimer = 0
  }

  if (data && typeof data === 'object') {
    if (data.appVersion) env.appVersion = String(data.appVersion)
    if (data.platform === 'android' || data.platform === 'desktop') {
      env.platform = data.platform
    }
    if (data.bridgeVersion && Number(data.bridgeVersion) > BRIDGE_VERSION) {
      console.warn(
        `[tool-bridge] 宿主协议版本 ${data.bridgeVersion} 高于工具侧 ${BRIDGE_VERSION}，可能有未知字段（忽略即可）`
      )
    }
    if (data.theme) applyTheme(data.theme)
  }

  ready = true

  // flush 初始化前累积的请求（保持发起顺序）
  while (queue.length > 0) {
    const frame = queue.shift()
    try {
      port.postMessage(frame)
    } catch (e) {
      if (!FIRE_AND_FORGET.has(frame.method)) rejectSlot(frame.id, e)
    }
  }

  dispatch('bridge-ready', {
    appVersion: env.appVersion,
    platform: env.platform
  })
  dispatch('theme', themeSnapshot())

  // 通知宿主「工具侧已就绪」（宿主协议里 {t:'evt',name:'ready'} 会触发 onReady 回调，
  // ToolHost 据此补推一次主题，避免首屏主题与宿主不一致）。失败不影响工具运行。
  try {
    port.postMessage({
      t: 'evt',
      name: 'ready',
      data: {
        appVersion: env.appVersion,
        platform: env.platform,
        bridgeVersion: BRIDGE_VERSION
      }
    })
  } catch (e) {
    console.warn('[tool-bridge] 发送 ready 事件失败（忽略）：', e)
  }

  // init 里没带主题（宿主旧版本 / 省流量）：主动拉一次环境，把 appVersion 与主题补齐
  if (!data || !data.theme) {
    request('getEnv', [])
      .then((r) => {
        if (!r || typeof r !== 'object') return
        if (!env.appVersion && r.appVersion) env.appVersion = String(r.appVersion)
        if (r.platform === 'android' || r.platform === 'desktop') env.platform = r.platform
        if (r.theme) {
          applyTheme(r.theme)
          dispatch('theme', themeSnapshot())
        }
      })
      .catch(() => {
        /* 宿主没实现 getEnv 也不算致命：主题退回工具包内置默认主题 */
      })
  }
}

function handleWindowMessage(event) {
  // 只信任父窗口（宿主）发来的 init，忽略工具页面内其他 iframe / 子窗口的消息
  if (event.source !== window.parent) return
  const data = event.data
  if (!data || typeof data !== 'object' || data.type !== 'tool:init') return
  const messagePort = event.ports && event.ports[0]
  if (!messagePort) {
    console.warn('[tool-bridge] tool:init 未携带 MessagePort，已忽略')
    return
  }
  initBridge(data, messagePort)
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', handleWindowMessage)
  if (window.parent === window) {
    console.info(
      '[tool-bridge] 当前页面不在宿主 iframe 内（独立调试模式）；RPC 会等待宿主初始化。'
    )
  }
}

/* ------------------------------------------------------------------ *
 * window.api —— 与桌面 preload 兼容的代理
 *
 * 注意：
 * - getVersion 返回 Promise<string>（preload 里是 ipcRenderer.invoke）；
 * - selectFile/selectImage/downloadFile/exportMarkdownPng 的返回值形状与 preload 完全一致；
 * - 故意**不提供 saveFileTo**：宿主 spec 未开放可直写路径，工具里的 saveToolFile()
 *   会自动回落 downloadFile（每次另存为），等迁移任务再补。
 * ------------------------------------------------------------------ */

const api = {
  /** 通用 RPC 入口：window.api.call('someMethod', [arg1, arg2]) */
  call(method, params) {
    return request(method, params)
  },

  getVersion() {
    if (env.appVersion) return Promise.resolve(env.appVersion)
    return request('getEnv', []).then((r) => {
      if (r && typeof r === 'object' && r.appVersion) env.appVersion = String(r.appVersion)
      return env.appVersion
    })
  },

  getPlatform() {
    return Promise.resolve(env.platform)
  },

  openExternal(url) {
    return request('openExternal', [String(url || '')])
  },

  selectFile() {
    return request('selectFile', [])
  },

  selectImage() {
    return request('selectImage', [])
  },

  downloadFile(base64Data, suggestedName, mime) {
    return request('downloadFile', [base64Data, suggestedName, mime])
  },

  exportMarkdownPng(suggestedName, html) {
    return request('exportMarkdownPng', [suggestedName, html])
  },

  /* ---------- 计时器悬浮窗（宿主主进程持有独立窗口，工具只发指令） ---------- */

  openTimerFloat(cfg) {
    return request('timerFloatOpen', [cfg])
  },

  updateTimerFloat(payload) {
    return request('timerFloatUpdate', [payload])
  },

  updateTimerFloatConfig(cfg) {
    return request('timerFloatUpdateConfig', [cfg])
  },

  closeTimerFloat() {
    return request('timerFloatClose', [])
  },

  isTimerFloatOpen() {
    return request('timerFloatIsOpen', []).then((v) => !!v)
  },

  onTimerFloatCommand(callback) {
    return subscribe('timer-float-command', callback)
  },

  onTimerFloatClosed(callback) {
    // preload 侧回调不带参数，这里保持同样语义
    return subscribe('timer-float-closed', () => {
      if (typeof callback === 'function') callback()
    })
  },

  onTimerFloatMoved(callback) {
    return subscribe('timer-float-moved', callback)
  }
}

function installGlobalApi() {
  try {
    window.api = api
    if (window.api === api) return
  } catch {
    /* 某些环境 window.api 只读，走 defineProperty */
  }
  try {
    Object.defineProperty(window, 'api', {
      value: api,
      configurable: true,
      writable: true
    })
  } catch (e) {
    console.error('[tool-bridge] 无法覆盖 window.api（工具将无法调用宿主能力）：', e)
  }
}

installGlobalApi()

/* ------------------------------------------------------------------ *
 * window.__toolBridge —— 面向工具迁移任务的新式便捷接口
 * ------------------------------------------------------------------ */

const toolBridge = {
  version: BRIDGE_VERSION,

  get ready() {
    return ready
  },

  /** 当前环境快照；init 之前调用会走 RPC（由宿主回 getEnv） */
  getEnv() {
    const snapshot = {
      appVersion: env.appVersion,
      platform: env.platform,
      theme: themeSnapshot()
    }
    if (ready && (snapshot.appVersion || Object.keys(snapshot.theme.tokens).length > 0)) {
      return Promise.resolve(snapshot)
    }
    return request('getEnv', []).then((r) => {
      if (r && typeof r === 'object') {
        if (r.appVersion) env.appVersion = String(r.appVersion)
        if (r.platform === 'android' || r.platform === 'desktop') env.platform = r.platform
        if (r.theme) applyTheme(r.theme)
      }
      return { appVersion: env.appVersion, platform: env.platform, theme: themeSnapshot() }
    })
  },

  /** 用户名单（宿主 store）：{ users, usersJson, ranklistOrder } */
  getUsers() {
    return request('getUsers', [])
  },

  /**
   * 订阅主题：cb({ tokens, name, dark })。
   * 已初始化时会立刻补发一次当前主题，之后每次宿主主题变化再回调。
   * @returns {() => void} 退订函数
   */
  onTheme(cb) {
    const off = subscribe('theme', cb)
    if (ready) {
      const snapshot = themeSnapshot()
      Promise.resolve().then(() => {
        if (!ready) return
        try {
          cb(snapshot)
        } catch (e) {
          console.error('[tool-bridge] onTheme 回调异常', e)
        }
      })
    }
    return off
  },

  /**
   * 订阅宿主事件（如 'timer-float-command'）。
   * @returns {() => void} 退订函数
   */
  onEvent(name, cb) {
    return subscribe(String(name || ''), cb)
  },

  /** 打日志到宿主（方便宿主统一收集工具异常） */
  log(level, message) {
    return request('log', [String(level || 'info'), String(message == null ? '' : message)])
  },

  /** 请求宿主关闭当前工具（对应宿主 ToolHost 的返回按钮；宿主未实现时 promise 会 reject） */
  requestClose() {
    return request('closeTool', [])
  }
}

if (typeof window !== 'undefined') {
  if (window.__toolBridge) {
    console.warn('[tool-bridge] window.__toolBridge 已存在，保留先注册的实例')
  } else {
    window.__toolBridge = toolBridge
  }
}
