// ========== Web/Android 平台适配层 ==========
// 在非 Electron 环境（Capacitor Android / 浏览器）下安装与 preload/index.js 完全同契约的 window.api。
// 仅在入口检测到 window.api 缺失时动态加载（桌面端永远不会打包进主 chunk）。
// 数据通道：IndexedDB（对应桌面 node:sqlite）；网络：CapacitorHttp 原生请求（绕过 CORS/SameSite，直连 8888）。
/* global __APP_VERSION__ */
import { Capacitor, CapacitorHttp, CapacitorCookies } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { LocalNotifications } from '@capacitor/local-notifications'

const IS_NATIVE = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.()
// 自建后端已全部下线：更新检查、更新日志、赞助名单都直接读公开的 GitLab 项目 886。
// 9080 站点必须与「API 网址」设置一致：jx / in 是两套分开的镜像，不能交叉混用。
function gitlabWebBase() {
  return `${apiBase()}:9080`
}
function gitlabApiBase() {
  return `${gitlabWebBase()}/api/v4/projects/886`
}
function gitlabLatestPackage() {
  return `${gitlabApiBase()}/packages/generic/7FA4-Chat/latest`
}
function gitlabSponsorsFile() {
  return `${gitlabApiBase()}/repository/files/assets%2Fsponsors.json/raw?ref=master`
}

// ---------- 事件注册表（渲染层订阅） ----------
const listeners = {
  notifClick: [],
  nativeTheme: [],
  flushBeforeClose: [],
  androidBack: [],
  toolProgress: []
}
function emit(name, data) { for (const cb of listeners[name]) { try { cb(data) } catch {} } }
function on(name) {
  return (cb) => {
    listeners[name].push(cb)
    return () => off(name, cb)
  }
}
function off(name, cb) {
  const i = listeners[name].indexOf(cb)
  if (i >= 0) listeners[name].splice(i, 1)
}

// ---------- 设置（对应桌面 setting.7c → localStorage） ----------
const SETTING_KEY = '7fa4_setting'
function loadSettingObj() {
  try { return JSON.parse(localStorage.getItem(SETTING_KEY) || '{}') } catch { return {} }
}
function apiBase() {
  return (loadSettingObj().apiUrl || 'https://jx.7fa4.cn').replace(/^http:\/\//, 'https://').replace(/\/+$/, '')
}

// ---------- WebCrypto AES-256-GCM 解密（与主进程 crypto 模块同格式：{v:1,iv,tag,data} base64） ----------
async function deriveKey(passphrase) {
  const raw = new TextEncoder().encode(passphrase)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt'])
}
function unb64(str) {
  const s = atob(str)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
async function aesDecrypt(passphrase, payload) {
  const key = await deriveKey(passphrase)
  const iv = unb64(payload.iv)
  const data = unb64(payload.data)
  const tag = unb64(payload.tag)
  const merged = new Uint8Array(data.length + tag.length)
  merged.set(data); merged.set(tag, data.length)
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, merged)
  return new TextDecoder().decode(buf)
}

// ---------- 原生网络请求（fetch 拦截 → CapacitorHttp，绕过 CORS/cookie SameSite） ----------
const API_PREFIXES = ['/api/', '/chat', '/user', '/ranklist', '/logout']
const origFetch = window.fetch.bind(window)

function isApiPath(url) {
  return API_PREFIXES.some((p) => url === p || url.startsWith(p))
}

/** 构造与 fetch 一致的 Response：CapacitorHttp 已按 content-type 解析 data，统一还原成文本 */
function makeResponse(res) {
  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '')
  const headers = new Headers()
  for (const [k, v] of Object.entries(res.headers || {})) {
    try { headers.set(k, Array.isArray(v) ? v[0] : String(v)) } catch {}
  }
  return new Response(body, { status: res.status || 200, statusText: res.statusText || '', headers })
}

async function nativeHttp(fullUrl, init = {}) {
  const method = (init.method || 'GET').toUpperCase()
  const headers = {}
  const h = init.headers
  if (h) {
    if (typeof h.forEach === 'function') h.forEach((v, k) => { headers[k] = v })
    else Object.assign(headers, h)
  }
  const ctype = (headers['Content-Type'] || headers['content-type'] || '').toLowerCase()
  let data
  const body = init.body
  if (body != null && body !== '') {
    if (typeof body === 'string') {
      data = body
    } else if (body instanceof URLSearchParams) {
      // urlencoded 下原生层对对象做表单编码；其余情况传原始字符串
      data = ctype.includes('urlencoded') ? Object.fromEntries(body.entries()) : body.toString()
    } else if (typeof body === 'object') {
      data = body
    } else {
      data = String(body)
    }
  }
  let req
  if (IS_NATIVE) {
    req = CapacitorHttp.request({
      url: fullUrl, method, headers, data,
      connectTimeout: 15000, readTimeout: 60000
    })
  } else {
    // 浏览器兜底（PWA 调试用，受 CORS 限制）
    req = origFetch(fullUrl, init).then(async (r) => ({
      status: r.status,
      headers: Object.fromEntries(r.headers.entries()),
      data: ctype.includes('json') ? await r.json().catch(() => '') : await r.text()
    }))
  }
  // safeFetch 依赖 AbortController 超时，原生请求无法取消 → race 拒绝即可
  if (init.signal) {
    if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const abortP = new Promise((_, rej) =>
      init.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')), { once: true })
    )
    return makeResponse(await Promise.race([req, abortP]))
  }
  return makeResponse(await req)
}

window.fetch = (input, init = {}) => {
  let url = ''
  if (typeof input === 'string') url = input
  else if (input && typeof input.url === 'string') url = input.url
  if (!url.startsWith('/') || !isApiPath(url)) return origFetch(input, init)
  return nativeHttp(apiBase() + ':8888' + url, init)
}

/** GitLab 公开接口（项目 886，匿名可读）：原生层用 CapacitorHttp 直连，浏览器兜底 fetch */
async function gitlabRequest(url, options = {}) {
  if (IS_NATIVE) return nativeHttp(url, options)
  return origFetch(url, options)
}

// ---------- 在线工具（GitLab 886 静态包，安装到 Filesystem Directory.Data） ----------
// 布局与桌面一致（spec §3）：tools/<id>/<version>/... + tools/<id>/installed.json。
// 桌面用 tool:// 特权协议打开；这里用 Filesystem.getUri() + Capacitor.convertFileSrc()
// 得到 WebView 可加载的入口 URL。全程只用浏览器/Capacitor API，不 import Node。
const TOOL_ID_RE = /^[a-z0-9][a-z0-9_-]*$/
const TOOL_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]*$/
const TOOL_SHA256_RE = /^[0-9a-f]{64}$/
const TOOL_ICON_RE = /^[a-z0-9][a-z0-9 _-]{0,63}$/i // 展示用 Font Awesome class
const TOOLS_DIR = 'tools'
const TOOL_MANIFEST_TIMEOUT = 20000
const TOOL_FILE_TIMEOUT = 60000

// 工具包基址：generic package「TOOLS」的最新版目录
//   https://<api-host>:9080/api/v4/projects/886/packages/generic/TOOLS/latest
// 跟随「API 网址」设置（jx / in 两套镜像）；包内布局 tools.json + <id>/<version>/...
function toolsRawBase() {
  return `${gitlabWebBase()}/api/v4/projects/886/packages/generic/TOOLS/latest`
}
function toolVersionPath(id, version) {
  return `${TOOLS_DIR}/${id}/${version}`
}
function toolInstalledPath(id) {
  return `${TOOLS_DIR}/${id}/installed.json`
}

function appVersion() {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
}

// 语义化版本比较（与 utils.js 的 compareVersion 同逻辑）：返回 1 / 0 / -1
function compareToolVersion(a, b) {
  const pa = String(a || '').split('.').map(Number)
  const pb = String(b || '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

// 包内相对路径校验：拒绝绝对路径、盘符、空段、. 与 .. 段（防路径穿越第一道）
function isSafeToolRelPath(p) {
  if (typeof p !== 'string' || !p || p.includes('\0')) return false
  if (p.startsWith('/') || p.startsWith('\\')) return false
  if (/^[A-Za-z]:/.test(p)) return false
  const segs = p.split(/[\\/]+/)
  return segs.every((s) => s && s !== '.' && s !== '..')
}

// 清单条目归一化（与桌面主进程同规则）：非法条目返回 null，size 以 files 之和为准
function normalizeToolMeta(tool) {
  if (!tool || typeof tool !== 'object') return null
  const id = String(tool.id || '')
  const version = String(tool.version || '')
  if (!TOOL_ID_RE.test(id) || !TOOL_VERSION_RE.test(version)) return null
  const dir = `${id}/${version}`
  if (tool.dir !== undefined && String(tool.dir) !== dir) return null
  const entry = tool.entry === undefined ? 'index.html' : String(tool.entry)
  if (!isSafeToolRelPath(entry)) return null
  if (!Array.isArray(tool.files) || tool.files.length === 0) return null
  const seen = new Set()
  const files = []
  for (const f of tool.files) {
    if (!f || typeof f !== 'object') return null
    const rel = String(f.path || '')
    if (!isSafeToolRelPath(rel) || seen.has(rel)) return null
    seen.add(rel)
    const size = Number(f.size)
    const sha256 = String(f.sha256 || '').toLowerCase()
    if (!Number.isInteger(size) || size < 0) return null
    if (!TOOL_SHA256_RE.test(sha256)) return null
    files.push({ path: rel, size, sha256 })
  }
  if (!seen.has(entry)) return null // 入口必须是包内文件
  const rawIcon = typeof tool.icon === 'string' ? tool.icon.trim() : ''
  return {
    id,
    name: String(tool.name || id),
    desc: String(tool.desc || ''),
    icon: TOOL_ICON_RE.test(rawIcon) ? rawIcon : 'fas fa-puzzle-piece',
    version,
    dir,
    entry,
    size: files.reduce((n, f) => n + f.size, 0),
    minAppVersion: String(tool.minAppVersion || ''),
    files
  }
}

// ---------- base64 / sha256 工具（crypto.subtle，无 Node 依赖） ----------
function b64ToBytes(b64) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
function bytesToB64(bytes) {
  let bin = ''
  const chunk = 0x8000 // 分块避免 String.fromCharCode 参数过多
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 下载单个工具文件：原生层 CapacitorHttp(arraybuffer → base64)，浏览器层 fetch(arrayBuffer)
async function fetchToolFile(url) {
  if (IS_NATIVE) {
    const res = await CapacitorHttp.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer', // Android 原生层返回 base64 字符串
      connectTimeout: 15000,
      readTimeout: TOOL_FILE_TIMEOUT
    })
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`)
    if (typeof res.data === 'string' && res.data) {
      const bytes = b64ToBytes(res.data)
      return { base64: res.data, bytes }
    }
    if (res.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(res.data)
      return { base64: bytesToB64(bytes), bytes }
    }
    throw new Error('下载内容为空')
  }
  const r = await origFetch(url, { signal: AbortSignal.timeout(TOOL_FILE_TIMEOUT) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const bytes = new Uint8Array(await r.arrayBuffer())
  return { base64: bytesToB64(bytes), bytes }
}

// ---------- Filesystem 封装（Directory.Data 下的相对路径） ----------
async function fsMkdir(path) {
  try {
    await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true })
  } catch { /* 已存在（Web 实现会抛错）忽略 */ }
}
async function fsWriteBase64(path, base64) {
  // 不传 encoding：data 按 base64 解码后写入二进制文件
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true })
}
async function fsWriteText(path, text) {
  await Filesystem.writeFile({ path, data: text, directory: Directory.Data, recursive: true, encoding: Encoding.UTF8 })
}
async function fsRemoveDir(path) {
  try {
    await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true })
  } catch { /* 不存在即视为已清理 */ }
}
async function fsRename(from, to) {
  await Filesystem.rename({ from, to, directory: Directory.Data, toDirectory: Directory.Data })
}

// installed.json 读取：不存在 / 损坏 / 版本号非法均视为未安装
async function readInstalledMeta(id) {
  if (!TOOL_ID_RE.test(String(id))) return null
  try {
    const res = await Filesystem.readFile({
      path: toolInstalledPath(id),
      directory: Directory.Data,
      encoding: Encoding.UTF8
    })
    const text = typeof res.data === 'string' ? res.data : ''
    const meta = JSON.parse(text)
    if (!meta || typeof meta !== 'object') return null
    if (!TOOL_VERSION_RE.test(String(meta.version || ''))) return null
    return meta
  } catch {
    return null
  }
}

// 入口推断：installed.json（spec 形状）不含 entry，优先 index.html，否则取第一个 html
function pickToolEntry(installed, preferred) {
  const files = Array.isArray(installed && installed.files)
    ? installed.files.map((f) => String(f.path || ''))
    : []
  if (preferred && isSafeToolRelPath(String(preferred)) && files.includes(String(preferred))) {
    return String(preferred)
  }
  if (files.includes('index.html')) return 'index.html'
  const html = files.find((p) => /\.html?$/i.test(p))
  return html || null
}

// 拉取并校验远端工具清单（tools/tools.json）
async function fetchToolsManifest() {
  try {
    const res = await gitlabRequest(`${toolsRawBase()}/tools.json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TOOL_MANIFEST_TIMEOUT)
    })
    if (!res.ok) return { success: false, tools: [], error: `HTTP ${res.status}` }
    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object' || !Array.isArray(data.tools)) {
      return { success: false, tools: [], error: '工具清单格式异常' }
    }
    const tools = []
    for (const item of data.tools) {
      const meta = normalizeToolMeta(item)
      if (meta) tools.push(meta)
      else console.warn('[Tools] 忽略无效的清单条目:', item && item.id)
    }
    return { success: true, tools, updatedAt: String(data.updatedAt || '') }
  } catch (e) {
    return { success: false, tools: [], error: e.message || '获取工具清单失败' }
  }
}

// 安装 / 更新：逐文件下载并校验 size+sha256 → 全部落临时目录 → 原子替换版本目录 → 写 installed.json
// 进度：{ id, phase:'download', index, count, path, received, total }（received 为累计字节数）
async function installTool(toolMeta) {
  const meta = normalizeToolMeta(toolMeta)
  if (!meta) return { success: false, error: '工具信息无效' }
  if (meta.minAppVersion && compareToolVersion(appVersion(), meta.minAppVersion) < 0) {
    return { success: false, error: `请先更新应用（需要 v${meta.minAppVersion} 及以上）` }
  }
  const idDir = `${TOOLS_DIR}/${meta.id}`
  const targetDir = toolVersionPath(meta.id, meta.version)
  const stagingDir = `${idDir}/.staging-${meta.version}-${Date.now()}`
  const count = meta.files.length
  let received = 0
  try {
    // 清理上次中断留下的临时目录（与桌面端行为一致）
    try {
      const stale = await Filesystem.readdir({ path: idDir, directory: Directory.Data })
      for (const entry of Array.isArray(stale.files) ? stale.files : []) {
        if (entry.type === 'directory' && String(entry.name).startsWith('.staging-')) {
          await fsRemoveDir(`${idDir}/${entry.name}`)
        }
      }
    } catch { /* 首次安装：目录还不存在 */ }
    await fsMkdir(stagingDir)
    for (let i = 0; i < count; i++) {
      const file = meta.files[i]
      // 该实例的 generic 包不支持嵌套路径（file_name 不能含 `/`）：
      // 包内文件名 = 「dir/file.path」把 `/` 全部换成 `__`，须与 scripts/publish-tools.mjs 一致
      const flatName = `${meta.dir}/${file.path}`.replaceAll('/', '__')
      const url = `${toolsRawBase()}/${encodeURIComponent(flatName)}`
      const { base64, bytes } = await fetchToolFile(url)
      if (bytes.length !== file.size) throw new Error(`文件大小校验失败：${file.path}`)
      const sha256 = await sha256Hex(bytes)
      if (sha256 !== file.sha256) throw new Error(`SHA-256 校验失败：${file.path}`)
      await fsWriteBase64(`${stagingDir}/${file.path}`, base64)
      received += bytes.length
      emit('toolProgress', {
        id: meta.id,
        phase: 'download',
        index: i + 1,
        count,
        path: file.path,
        received,
        total: meta.size
      })
    }
    // 临时目录 → 版本目录；installed.json 最后写入（写成功才算安装完成）
    await fsRemoveDir(targetDir)
    await fsRename(stagingDir, targetDir)
    const installed = {
      version: meta.version,
      installedAt: new Date().toISOString(),
      size: meta.size,
      files: meta.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 }))
    }
    await fsWriteText(toolInstalledPath(meta.id), JSON.stringify(installed, null, 2))
    // 更新成功后清理旧版本目录（与桌面端一致），清理失败不影响安装结果
    try {
      const entries = await Filesystem.readdir({ path: idDir, directory: Directory.Data })
      for (const entry of Array.isArray(entries.files) ? entries.files : []) {
        if (entry.type === 'directory' && entry.name !== meta.version) {
          await fsRemoveDir(`${idDir}/${entry.name}`)
        }
      }
    } catch { /* 清理失败不影响安装 */ }
    return { success: true }
  } catch (e) {
    // 失败清理半成品；不动旧版本目录与旧 installed.json
    await fsRemoveDir(stagingDir)
    return { success: false, error: e.message || '安装工具失败' }
  }
}

// 已安装列表：{ [id]: { version, installedAt, size } }
async function listInstalledTools() {
  const installed = {}
  let entries = []
  try {
    const res = await Filesystem.readdir({ path: TOOLS_DIR, directory: Directory.Data })
    entries = Array.isArray(res.files) ? res.files : []
  } catch {
    entries = [] // 首次使用：目录还不存在
  }
  for (const entry of entries) {
    if (entry.type !== 'directory' || !TOOL_ID_RE.test(entry.name)) continue
    const meta = await readInstalledMeta(entry.name)
    if (!meta) continue
    installed[entry.name] = {
      version: String(meta.version),
      installedAt: String(meta.installedAt || ''),
      size: Number(meta.size) || 0
    }
  }
  return { success: true, installed }
}

async function removeTool(id) {
  if (!TOOL_ID_RE.test(String(id))) return { success: false, error: '工具 ID 无效' }
  try {
    await Filesystem.rmdir({ path: `${TOOLS_DIR}/${id}`, directory: Directory.Data, recursive: true })
    return { success: true }
  } catch (e) {
    // 目录本就不存在也视为卸载成功
    return { success: true, warning: e.message }
  }
}

// 入口 URL：Android 用 convertFileSrc(file://...) 映射为 WebView 可加载地址；
// 纯网页端没有可用的本地文件加载通道（convertFileSrc 在 Web 上是恒等映射），返回 unsupported。
async function getToolEntryUrl(id, entry) {
  if (!TOOL_ID_RE.test(String(id))) return { success: false, error: '工具 ID 无效' }
  const installed = await readInstalledMeta(String(id))
  if (!installed) return { success: false, error: '工具未安装' }
  const entryPath = pickToolEntry(installed, entry)
  if (!entryPath) return { success: false, error: '工具入口文件缺失' }
  if (!IS_NATIVE) return { success: false, error: '网页端不支持打开本地工具' }
  try {
    const file = await Filesystem.getUri({
      path: `${toolVersionPath(id, installed.version)}/${entryPath}`,
      directory: Directory.Data
    })
    return { success: true, url: Capacitor.convertFileSrc(file.uri) }
  } catch (e) {
    return { success: false, error: e.message || '获取工具入口失败' }
  }
}

// ---------- IndexedDB 用户数据存储（对应桌面 storage.js 四表语义） ----------
const DB_NAME = '7fa4chat'
const DB_VERSION = 1
/** 本地缓存版本：旧版数据不迁移，检测到就整体清空，由服务端重新拉取 */
const LOCAL_KEY_VER = 2
let dbPromise = null

/** 本地缓存版本校验（幂等）：kv 中无版本标记即为旧版数据 → 清空 convos/messages/prefs */
function resetIfStale(db) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    try {
      const t = db.transaction(['kv', 'convos', 'messages', 'prefs'], 'readwrite')
      const kv = t.objectStore('kv')
      const r = kv.get('key-ver')
      r.onsuccess = () => {
        if (String((r.result && r.result.value) || '') === String(LOCAL_KEY_VER)) return
        for (const name of ['convos', 'messages', 'prefs']) t.objectStore(name).clear()
        kv.put({ key: 'key-ver', value: String(LOCAL_KEY_VER) })
      }
      t.oncomplete = finish
      t.onerror = finish
      t.onabort = finish
    } catch { finish() }
  })
}

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('convos')) {
        const s = db.createObjectStore('convos', { keyPath: ['uid', 'kind', 'cid'] })
        s.createIndex('byUid', 'uid')
      }
      if (!db.objectStoreNames.contains('messages')) {
        const s = db.createObjectStore('messages', { keyPath: ['uid', 'kind', 'cid', 'mid'] })
        s.createIndex('byUid', 'uid')
        s.createIndex('byConvo', ['uid', 'kind', 'cid'])
      }
      if (!db.objectStoreNames.contains('prefs')) {
        db.createObjectStore('prefs', { keyPath: ['uid', 'key'] })
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).then(async (db) => {
    await resetIfStale(db)
    return db
  })
  return dbPromise
}

function tx(stores, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode)
    const result = { value: undefined }
    t.oncomplete = () => resolve(result.value)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
    fn(t, result)
  }))
}
function reqAsPromise(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
}
/** 包装一个已发出的 IDBRequest（如 store.getAll(range)）为 Promise */
function storeAll(request) {
  return reqAsPromise(request)
}
const store = {
  async init() {
    await openDB()
    return { success: true }
  },
  async loadConvos(uid) {
    const rows = await tx(['convos'], 'readonly', (t, out) => {
      out.value = storeAll(t.objectStore('convos').index('byUid').getAll(IDBKeyRange.only(Number(uid))))
    })
    const users = {}
    const groups = {}
    for (const r of rows || []) {
      if (r.kind === 'group') groups[r.cid] = r.meta
      else users[r.cid] = r.meta
    }
    return { success: true, users, groups }
  },
  saveConvos(uid, convos) {
    return tx(['convos'], 'readwrite', (t) => {
      const s = t.objectStore('convos')
      for (const c of convos || []) s.put({ uid: Number(uid), kind: c.kind, cid: Number(c.cid), meta: c.meta, updated: Date.now() })
    }).then(() => ({ success: true }))
  },
  async saveMessages(uid, kind, cid, msgs) {
    await tx(['messages'], 'readwrite', (t) => {
      const s = t.objectStore('messages')
      for (const m of msgs || []) {
        if (m == null) continue
        const mid = m.mid ?? m.id
        if (mid == null) continue
        s.put({ uid: Number(uid), kind, cid: Number(cid), mid: Number(mid), send_time: Number(m.send_time || 0), content: { ...m, id: Number(mid), mid: Number(mid) } })
      }
    })
    return { success: true, count: (msgs || []).length }
  },
  /** 全量快照：与桌面 saveAll 相同语义（INSERT OR REPLACE 增量合并，不做会话级 DELETE） */
  async saveAll(uid, { convos, prefs, messages } = {}) {
    const u = Number(uid)
    await tx(['convos', 'messages', 'prefs'], 'readwrite', (t) => {
      if (Array.isArray(convos)) {
        const cs = t.objectStore('convos')
        for (const c of convos) cs.put({ uid: u, kind: c.kind, cid: Number(c.cid), meta: c.meta, updated: Date.now() })
      }
      if (messages && typeof messages === 'object') {
        const ms = t.objectStore('messages')
        for (const [key, msgs] of Object.entries(messages)) {
          const [kind, cid] = key.split(':')
          if (!kind || cid == null || !Array.isArray(msgs)) continue
          for (const m of msgs) {
            if (m == null || m.id == null) continue
            ms.put({ uid: u, kind, cid: Number(cid), mid: Number(m.id), send_time: Number(m.send_time || 0), content: { ...m, id: Number(m.id), mid: Number(m.id) } })
          }
        }
      }
      if (prefs && typeof prefs === 'object') {
        const ps = t.objectStore('prefs')
        for (const [k, v] of Object.entries(prefs)) ps.put({ uid: u, key: k, value: v })
      }
    })
    return { success: true }
  },
  async loadMessages(uid, kind, cid, limit = 500, before = null) {
    const rows = await tx(['messages'], 'readonly', (t, out) => {
      out.value = storeAll(t.objectStore('messages').index('byConvo').getAll(IDBKeyRange.only([Number(uid), kind, Number(cid)])))
    })
    const list = (rows || [])
      .filter((r) => (before == null || r.send_time < Number(before)))
      .sort((a, b) => b.send_time - a.send_time || b.mid - a.mid)
      .slice(0, Number(limit))
      .map((r) => r.content)
    return { success: true, data: list }
  },
  async loadLastMessages(uid) {
    const rows = await tx(['messages'], 'readonly', (t, out) => {
      out.value = storeAll(t.objectStore('messages').index('byUid').getAll(IDBKeyRange.only(Number(uid))))
    })
    const latest = new Map()
    for (const r of rows || []) {
      const k = r.kind + ':' + r.cid
      const prev = latest.get(k)
      if (!prev || r.mid > prev.mid) latest.set(k, r)
    }
    const data = []
    for (const r of latest.values()) data.push({ kind: r.kind, cid: r.cid, msg: r.content })
    return { success: true, data }
  },
  async cleanMessages(uid, keepPerConvo = 2000) {
    const rows = await tx(['messages'], 'readonly', (t, out) => {
      out.value = storeAll(t.objectStore('messages').index('byUid').getAll(IDBKeyRange.only(Number(uid))))
    })
    const byConvo = new Map()
    for (const r of rows || []) {
      const k = r.kind + ':' + r.cid
      if (!byConvo.has(k)) byConvo.set(k, [])
      byConvo.get(k).push(r)
    }
    let removed = 0
    await tx(['messages'], 'readwrite', (t) => {
      const s = t.objectStore('messages')
      for (const list of byConvo.values()) {
        if (list.length <= keepPerConvo) continue
        list.sort((a, b) => a.mid - b.mid)
        const excess = list.slice(0, list.length - keepPerConvo)
        for (const r of excess) { s.delete([r.uid, r.kind, r.cid, r.mid]); removed++ }
      }
    })
    return { success: true, removed }
  },
  async loadPrefs(uid) {
    const rows = await tx(['prefs'], 'readonly', (t, out) => {
      out.value = storeAll(t.objectStore('prefs').getAll())
    })
    const out = {}
    for (const r of rows || []) if (r.uid === Number(uid)) out[r.key] = r.value
    return { success: true, data: out }
  },
  savePrefs(uid, entries) {
    return tx(['prefs'], 'readwrite', (t) => {
      const s = t.objectStore('prefs')
      for (const [k, v] of Object.entries(entries || {})) s.put({ uid: Number(uid), key: k, value: v })
    }).then(() => ({ success: true }))
  },
  async exportAll(uid) {
    const u = Number(uid)
    const [convos, msgs, prefs] = await Promise.all([
      tx(['convos'], 'readonly', (t, out) => { out.value = storeAll(t.objectStore('convos').getAll()) }),
      tx(['messages'], 'readonly', (t, out) => { out.value = storeAll(t.objectStore('messages').getAll()) }),
      tx(['prefs'], 'readonly', (t, out) => { out.value = storeAll(t.objectStore('prefs').getAll()) })
    ])
    const users = {}
    const groups = {}
    for (const r of convos || []) {
      if (r.uid !== u) continue
      if (r.kind === 'group') groups[r.cid] = r.meta
      else users[r.cid] = r.meta
    }
    const messages = {}
    for (const r of msgs || []) if (r.uid === u && r.content && r.content.id != null) messages[r.content.id] = r.content
    const prefData = {}
    for (const r of prefs || []) if (r.uid === u) prefData[r.key] = r.value
    return { success: true, users, groups, messages, prefs: prefData }
  },
  /** 恢复备份（importLegacyData 语义：按 message_ids 归属会话） */
  async importAll(uid, data) {
    if (!data || typeof data !== 'object') return { success: false, error: '数据格式异常' }
    const u = Number(uid)
    const convoMap = new Map()
    const convos = []
    for (const g of Object.values(data.users || {})) {
      const cid = Number(g.uid ?? g.id)
      convos.push({ kind: 'user', cid, meta: g })
      for (const mid of g.message_ids || []) convoMap.set(Number(mid), ['user', cid])
    }
    for (const g of Object.values(data.groups || {})) {
      const cid = Number(g.gid ?? g.id)
      convos.push({ kind: 'group', cid, meta: g })
      for (const mid of g.message_ids || []) convoMap.set(Number(mid), ['group', cid])
    }
    const byConvo = new Map()
    let total = 0
    for (const m of Object.values(data.messages || {})) {
      if (!m || m.id == null) continue
      const loc = convoMap.get(Number(m.id))
      if (!loc) continue
      const k = loc.join(':')
      if (!byConvo.has(k)) byConvo.set(k, [])
      byConvo.get(k).push({ ...m, mid: Number(m.id), send_time: m.send_time || 0 })
      total++
    }
    await this.saveAll(u, {
      convos,
      prefs: {
        drafts: data.drafts || {},
        mutedConvos: data.mutedConvos || {},
        hiddenConvos: data.hiddenConvos || {},
        stickers: data.stickers || []
      },
      messages: Object.fromEntries(byConvo)
    })
    return { success: true, messages: total }
  }
}

// ---------- 文件选择 / 保存（Android 文件选择器 + Filesystem+Share 保存） ----------
function pickFile(accept, capture) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    // capture="environment"：移动浏览器（含 Android WebView）据此直接唤起**后置相机**，
    // 拍完即得到文件，语义与桌面端的「系统相机应用」对齐；桌面浏览器会忽略该属性、退化为选图。
    if (capture) input.capture = 'environment'
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const cleanup = () => { input.remove() }
    input.addEventListener('change', () => {
      settled = true
      const file = input.files && input.files[0]
      cleanup()
      if (!file) return resolve({ success: false, canceled: true })
      const reader = new FileReader()
      reader.onload = () => {
        const b64 = String(reader.result || '').split(',')[1] || ''
        resolve({ success: true, name: file.name, size: file.size, data: b64, mime: file.type || 'application/octet-stream' })
      }
      reader.onerror = () => resolve({ success: false, error: '读取文件失败' })
      reader.readAsDataURL(file)
    })
    // Android WebView 取消选择不触发 change：窗口 focus 回来且未 change 视为取消
    window.addEventListener('focus', () => {
      setTimeout(() => { if (!settled && !input.files?.length) { settled = true; cleanup(); resolve({ success: false, canceled: true }) } }, 500)
    }, { once: true })
    input.click()
  })
}

async function saveAndShare(base64Data, suggestedName, mime) {
  try {
    if (IS_NATIVE) {
      const fileName = suggestedName || `download-${Date.now()}`
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
        encoding: Encoding.Base64
      })
      await Share.share({
        title: fileName,
        url: result.uri,
        dialogTitle: '保存文件'
      }).catch(() => {}) // 用户取消分享不视为失败（文件已在缓存目录）
      return { success: true, path: result.uri }
    }
    // 浏览器：a[download]
    const a = document.createElement('a')
    a.href = `data:${mime || 'application/octet-stream'};base64,${base64Data}`
    a.download = suggestedName || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return { success: true, path: suggestedName }
  } catch (e) {
    return { success: false, error: e.message || '保存失败' }
  }
}

// ---------- 通知（LocalNotifications） ----------
let notifId = 1
async function ensureNotifPermission() {
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') await LocalNotifications.requestPermissions()
  } catch {}
}

// ---------- 安卓返回键 & 生命周期 ----------
if (IS_NATIVE) {
  CapApp.addListener('backButton', () => {
    const cbs = listeners.androidBack
    if (cbs.length) { try { cbs[cbs.length - 1]() } catch {} }
    else CapApp.exitApp()
  })
  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event?.notification?.extra || {}
    emit('notifClick', { chatType: extra.chatType, targetId: extra.targetId })
  })
  // 应用退到后台/页面隐藏时触发数据落盘（对应桌面 close 拦截 flush）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') emit('flushBeforeClose')
  })
  window.addEventListener('pagehide', () => emit('flushBeforeClose'))
}

// ---------- window.api 安装 ----------
window.api = {
  getVersion: async () => (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'),
  getPlatform: async () => (IS_NATIVE ? 'android' : 'web'),
  loadSetting: async () => loadSettingObj(),
  saveSetting: async (data) => {
    const merged = { ...loadSettingObj(), ...(data || {}) }
    localStorage.setItem(SETTING_KEY, JSON.stringify(merged))
    return { success: true }
  },
  notify: async (sender, content, chatType, targetId) => {
    if (!IS_NATIVE) return
    try {
      await ensureNotifPermission()
      await LocalNotifications.schedule({
        notifications: [{
          id: notifId++,
          title: String(sender || '7FA4 Chat'),
          body: String(content || ''),
          extra: { chatType, targetId }
        }]
      })
    } catch {}
  },
  showMainWindow: async () => {},
  onNotifClick: on('notifClick'),
  windowMinimize: async () => {},
  windowMaximize: async () => {},
  windowClose: async () => { if (IS_NATIVE) CapApp.exitApp() },
  windowIsMaximized: async () => false,
  onWindowMaximized: () => () => {},
  getWindowState: async () => ({
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    minimized: document.hidden
  }),
  clipboardWriteText: async (text) => {
    try { await navigator.clipboard.writeText(String(text)); return { success: true } }
    catch (e) { return { success: false, error: e.message } }
  },
  selectFile: () => pickFile(null),
  selectImage: () => pickFile('image/*'),
  // 拍照：网页端没有「系统相机应用」这个概念，无法像桌面端那样拉起来取图。
  // 走 <input type="file" accept="image/*" capture="environment"> —— 移动浏览器会
  // 直接唤起系统相机，语义与桌面端一致（拍完即得到文件）；桌面浏览器则退化成选图。
  launchCamera: () => pickFile('image/*', true),
  // 网页端的 launchCamera 是一次性的文件选择框，没有「等待新图」的概念，无需取消。
  cancelCamera: async () => ({ success: true }),
  downloadFile: (base64Data, suggestedName, mime) => saveAndShare(base64Data, suggestedName, mime),
  // 按 URL 下载：网页端不提供（这里 fetch 受同源策略约束，且远程站点通常不带
  // 允许跨域的响应头）。返回 unsupported 让调用方回落到「取 base64 → downloadFile」的通用路径。
  // Electron 端的同名能力在主进程实现（Node 无同源限制），见 src/main/index.js。
  downloadUrl: async () => ({ success: false, unsupported: true }),
  // 网页/安卓没有可直写的真实路径（浏览器是下载、安卓是缓存目录 + 分享），
  // 返回 unsupported 让调用方回落到 downloadFile —— 不用平台判断也能走对分支。
  saveFileTo: async () => ({ success: false, unsupported: true }),
  clipboardWriteImage: async (base64Data) => {
    try {
      const blob = await (await fetch(`data:image/png;base64,${base64Data}`)).blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  },
  openExternal: async (url) => {
    try {
      if (IS_NATIVE) await Browser.open({ url: String(url), windowName: '_system' })
      else window.open(String(url), '_blank')
    } catch { window.open(String(url), '_blank') }
  },
  // --- IndexedDB 存储 ---
  storeInit: (uid) => store.init(uid),
  storeLoadConvos: (uid) => store.loadConvos(uid),
  storeLoadLastMessages: (uid) => store.loadLastMessages(uid),
  storeLoadMessages: (uid, kind, cid, limit, before) => store.loadMessages(uid, kind, cid, limit, before),
  storeSaveAll: (uid, data) => store.saveAll(uid, data),
  storeLoadPrefs: (uid) => store.loadPrefs(uid),
  storeExportAll: (uid) => store.exportAll(uid),
  storeImportAll: (uid, data) => store.importAll(uid, data),
  // --- 生命周期 ---
  onAppFlushBeforeClose: on('flushBeforeClose'),
  appFlushDone: () => {},
  // --- 更新（Android 无 electron-updater：版本信息读 GitLab 项目 886 的最新 release） ---
  checkForUpdate: async () => ({ status: 'not-packaged' }),
  downloadUpdate: async () => ({ status: 'not-packaged' }),
  installUpdate: async () => ({ status: 'not-packaged' }),
  // 更新状态由渲染层 UpdatePanel 依据 fetchVersionInfo 比对生成（不再回调死结论）
  onUpdateStatus: () => () => {},
  fetchVersionInfo: async () => {
    try {
      const res = await gitlabRequest(`${gitlabApiBase()}/releases?per_page=1`, { method: 'GET', headers: { Accept: 'application/json' } })
      const data = await res.json().catch(() => null)
      const rel = Array.isArray(data) ? data[0] : null
      if (!res.ok || !rel) return { success: false, error: (data && data.message) || `HTTP ${res.status}` }
      const links = (rel.assets && Array.isArray(rel.assets.links)) ? rel.assets.links : []
      const apk = links.find((l) => /\.apk$/i.test(l.name || '') || /\.apk($|\?)/i.test(l.url || ''))
      const latestVersion = String(rel.tag_name || '').replace(/^v/i, '')
      const artifacts = apk ? [{ platform: 'android', url: apk.direct_asset_url || apk.url, size: 0 }] : []
      return { success: true, latestVersion, artifacts, publishDate: rel.released_at || rel.created_at || '' }
    } catch (e) {
      return { success: false, error: e.message || '网络错误' }
    }
  },
  fetchChangelog: async () => {
    // 更新日志随包上传在 GitLab 的 latest/CHANGELOG（Markdown，渲染层自行渲染）
    try {
      const res = await gitlabRequest(`${gitlabLatestPackage()}/CHANGELOG`, { method: 'GET' })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const markdown = await res.text()
      if (!markdown || !markdown.trim()) return { success: false, error: '更新日志为空' }
      return { success: true, markdown }
    } catch (e) {
      return { success: false, error: e.message || '获取更新日志失败' }
    }
  },
  // --- 站点 API（GitLab 公开仓库） ---
  setBadgeCount: async () => ({ success: true }),
  // 赞助名单：GitLab 公开仓库 assets/sponsors.json
  fetchSponsors: async () => {
    try {
      const res = await gitlabRequest(gitlabSponsorsFile(), { method: 'GET', headers: { Accept: 'application/json' } })
      const data = await res.json().catch(() => null)
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.list) ? data.list : null)
      if (res.ok && list) return { success: true, list }
      return { success: false, list: [], error: (data && data.error) || `HTTP ${res.status}` }
    } catch (e) {
      return { success: false, list: [], error: e.message || '网络错误' }
    }
  },
  exportData: async (data) => saveAndShare(
    btoa(unescape(encodeURIComponent(String(data)))),
    `7fa4-chat-backup-${Date.now()}.json`,
    'application/json'
  ),
  importData: async () => {
    const r = await pickFile('application/json,.json')
    if (!r.success) return { success: false, canceled: true }
    try {
      const text = decodeURIComponent(escape(atob(r.data)))
      return { success: true, data: text }
    } catch (e) {
      return { success: false, error: e.message || '读取失败' }
    }
  },
  getCacheSize: async () => {
    try {
      const est = await navigator.storage.estimate()
      return { success: true, size: est.usage || 0 }
    } catch (e) { return { success: false, error: e.message } }
  },
  clearCache: async () => {
    try {
      await tx(['messages'], 'readwrite', (t) => { t.objectStore('messages').clear() })
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  },
  // --- 计时器悬浮窗（桌面端专属：需要独立置顶无边框窗口）---
  openTimerFloat: async () => ({ success: false, unsupported: true }),
  closeTimerFloat: async () => ({ success: false, unsupported: true }),
  isTimerFloatOpen: async () => false,
  updateTimerFloat: () => {},
  updateTimerFloatConfig: () => {},
  onTimerFloatCommand: () => () => {},
  onTimerFloatClosed: () => () => {},
  onTimerFloatMoved: () => () => {},
  // --- 工具 ---
  loadUsersDb: async () => {
    try {
      const payload = await (await origFetch('/users.7c')).json()
      const text = await aesDecrypt('7fa4-chat::users-db::v1', payload)
      return { success: true, data: JSON.parse(text) }
    } catch (e) {
      return { success: false, error: e.message || '加载用户数据库失败' }
    }
  },
  clearSessionCookies: async () => {
    try {
      if (IS_NATIVE) {
        await CapacitorCookies.clearAllCookies()
      } else {
        document.cookie.split(';').forEach((c) => {
          const name = c.split('=')[0].trim()
          if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
        })
      }
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  },
  exportMarkdownPng: async (suggestedName, html) => {
    try {
      const { default: html2canvas } = await import('html2canvas')
      const holder = document.createElement('div')
      holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;background:#fff;color:#222;padding:24px;z-index:-1;'
      holder.innerHTML = html
      document.body.appendChild(holder)
      const canvas = await html2canvas(holder, { backgroundColor: '#ffffff', scale: 2 })
      holder.remove()
      const base64 = canvas.toDataURL('image/png').split(',')[1]
      return await saveAndShare(base64, suggestedName || 'markdown.png', 'image/png')
    } catch (e) {
      return { success: false, error: e.message || '导出失败' }
    }
  },
  // --- 在线工具（GitLab 886 静态包；契约与桌面 preload 完全一致）---
  fetchToolsManifest: () => fetchToolsManifest(),
  listInstalledTools: () => listInstalledTools(),
  installTool: (toolMeta) => installTool(toolMeta),
  removeTool: (id) => removeTool(id),
  getToolEntryUrl: (id, entry) => getToolEntryUrl(id, entry),
  onToolProgress: on('toolProgress'),
  offToolProgress: (cb) => off('toolProgress', cb),
  // --- Android 专属（Electron 下不存在，调用处需用可选链） ---
  onAndroidBack: on('androidBack'),
  androidExit: () => { if (IS_NATIVE) CapApp.exitApp() }
}

// 平台标记（渲染层可读取，如 GeoGebra iframe 路径分支 / 反馈客户端信息）。
// ⚠️ 三者语义不同，别混用：
//   __7FA4_WEB__      = 「非 Electron 环境」——网页浏览器 **和** Android 原生 App 共用本适配层，
//                       所以它在 APK 里同样是 true。凡是要判断"是不是纯网页"的地方，
//                       必须用 utils.js 的 isWebBrowser()（它额外排除 Android），不要直接读这个值。
//   __7FA4_PLATFORM__ = 'web' | 'android'，与 window.api.getPlatform() 同源（反馈上报用这个）。
//   __7FA4_NATIVE__   = 是否 Capacitor 原生外壳（Android APK）。
window.__7FA4_WEB__ = true
window.__7FA4_PLATFORM__ = IS_NATIVE ? 'android' : 'web'
window.__7FA4_NATIVE__ = !!IS_NATIVE