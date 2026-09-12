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
const SITE_BASE = 'https://chat.forfof.cloud'

// ---------- 事件注册表（渲染层订阅） ----------
const listeners = {
  notifClick: [],
  nativeTheme: [],
  flushBeforeClose: [],
  androidBack: []
}
function emit(name, data) { for (const cb of listeners[name]) { try { cb(data) } catch {} } }
function on(name) {
  return (cb) => {
    listeners[name].push(cb)
    return () => { const i = listeners[name].indexOf(cb); if (i >= 0) listeners[name].splice(i, 1) }
  }
}

// ---------- 设置（对应桌面 setting.7c → localStorage） ----------
const SETTING_KEY = '7fa4_setting'
function loadSettingObj() {
  try { return JSON.parse(localStorage.getItem(SETTING_KEY) || '{}') } catch { return {} }
}
function apiBase() {
  return (loadSettingObj().apiUrl || 'https://jx.7fa4.cn').replace(/^http:\/\//, 'https://').replace(/\/+$/, '')
}

// ---------- WebCrypto AES-256-GCM（与主进程 crypto 模块同格式：{v:1,iv,tag,data} base64） ----------
async function deriveKey(passphrase) {
  const raw = new TextEncoder().encode(passphrase)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
function b64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
function unb64(str) {
  const s = atob(str)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
async function aesEncrypt(passphrase, plain) {
  const key = await deriveKey(passphrase)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  // WebCrypto 把 16 字节 authTag 拼在密文尾部，与 Node 的 cipher/final + getAuthTag 需手动拆分
  const all = new Uint8Array(buf)
  const data = all.slice(0, all.length - 16)
  const tag = all.slice(all.length - 16)
  return { v: 1, iv: b64(iv), tag: b64(tag), data: b64(data) }
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

/** 站点 API（feedback/sponsors/上报）：原生直连，浏览器走 fetch（站点已配 CORS 与否视情况） */
async function siteRequest(path, options = {}) {
  const full = SITE_BASE + path
  if (IS_NATIVE) return nativeHttp(full, options)
  return origFetch(full, options)
}

// ---------- 用户照片同步（收集信息时把 OJ 学籍照片转存到官网作头像） ----------
// CapacitorHttp 对 image/* 自动返回 base64；浏览器兜底跨域不通，直接跳过。6h 一次。
const PHOTO_INTERVAL = 30 * 60 * 1000
const lastPhotoUploadAt = {} // 按 uid 记录，切换账号互不影响
async function syncUserPhoto(uid) {
  const now = Date.now()
  if (now - (lastPhotoUploadAt[uid] || 0) < PHOTO_INTERVAL) return
  lastPhotoUploadAt[uid] = now
  if (!IS_NATIVE) return
  try {
    const res = await CapacitorHttp.request({
      url: `https://jx.7fa4.cn:8888/user/${uid}/photo`,
      method: 'GET',
      connectTimeout: 15000,
      readTimeout: 30000
    })
    const mime = String((res.headers && (res.headers['Content-Type'] || res.headers['content-type'])) || '').split(';')[0]
    const data = typeof res.data === 'string' ? res.data : ''
    if (!res.status || res.status >= 400) return
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) return
    if (!data || data.length > 3 * 1024 * 1024) return
    const body = JSON.stringify(await aesEncrypt('7fa4-chat::photo::v1', JSON.stringify({ uid, mime, data, date: Date.now() })))
    await siteRequest(`/user/${uid}/photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  } catch { /* 尽力而为：照片同步失败不影响使用 */ }
}



// ---------- IndexedDB 用户数据存储（对应桌面 storage.js 四表语义） ----------
const DB_NAME = '7fa4chat'
const DB_VERSION = 1
let dbPromise = null

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
function storePut(store, value) {
  store.put(value)
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
        favorites: data.favorites || [],
        mutedConvos: data.mutedConvos || {},
        hiddenConvos: data.hiddenConvos || {},
        deletedMsgIds: data.deletedMsgIds || [],
        stickers: data.stickers || []
      },
      messages: Object.fromEntries(byConvo)
    })
    return { success: true, messages: total }
  }
}

// ---------- 文件选择 / 保存（Android 文件选择器 + Filesystem+Share 保存） ----------
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
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
  getUserDataPath: async () => null,
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
  onAppCtrlW: () => () => {},
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
  downloadFile: (base64Data, suggestedName, mime) => saveAndShare(base64Data, suggestedName, mime),
  startDragFile: async () => ({ success: false }),
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
  saveDataFile: async (filename, content) => {
    try { localStorage.setItem('datafile:' + filename, String(content)); return { success: true } } catch (e) { return { success: false, error: e.message } }
  },
  loadDataFile: async (filename) => {
    try {
      const v = localStorage.getItem('datafile:' + filename)
      return v == null ? { success: false, error: '文件不存在' } : { success: true, data: v }
    } catch (e) { return { success: false, error: e.message } }
  },
  deleteDataFile: async (filename) => {
    try { localStorage.removeItem('datafile:' + filename); return { success: true } }
    catch (e) { return { success: false, error: e.message } }
  },
  // --- IndexedDB 存储 ---
  storeInit: (uid) => store.init(uid),
  storeLoadConvos: (uid) => store.loadConvos(uid),
  storeSaveConvos: (uid, convos) => store.saveConvos(uid, convos),
  storeLoadLastMessages: (uid) => store.loadLastMessages(uid),
  storeLoadMessages: (uid, kind, cid, limit, before) => store.loadMessages(uid, kind, cid, limit, before),
  storeSaveAll: (uid, data) => store.saveAll(uid, data),
  storeCleanMessages: (uid, keepPerConvo) => store.cleanMessages(uid, keepPerConvo),
  storeLoadPrefs: (uid) => store.loadPrefs(uid),
  storeSavePrefs: (uid, entries) => store.savePrefs(uid, entries),
  storeExportAll: (uid) => store.exportAll(uid),
  storeImportAll: (uid, data) => store.importAll(uid, data),
  // --- 生命周期 ---
  onAppFlushBeforeClose: on('flushBeforeClose'),
  appFlushDone: () => {},
  // --- 更新（Android 无 electron-updater：版本信息由本地后端 /web/api/version 聚合 GitLab） ---
  checkForUpdate: async () => ({ status: 'not-packaged' }),
  downloadUpdate: async () => ({ status: 'not-packaged' }),
  installUpdate: async () => ({ status: 'not-packaged' }),
  // 更新状态由渲染层 UpdatePanel 依据 fetchVersionInfo 比对生成（不再回调死结论）
  onUpdateStatus: () => () => {},
  fetchVersionInfo: async () => {
    try {
      const res = await siteRequest('/web/api/version', { method: 'GET', headers: { 'Accept': 'application/json' } })
      const data = await res.json().catch(() => null)
      if (res.ok && data && data.success) {
        return { success: true, latestVersion: data.latestVersion || '', artifacts: data.artifacts || [], publishDate: data.publishDate || '', fetchedAt: data.fetchedAt || 0 }
      }
      return { success: false, error: (data && data.error) || `HTTP ${res.status}` }
    } catch (e) {
      return { success: false, error: e.message || '网络错误' }
    }
  },
  fetchChangelog: async () => {
    // 由本地后端 /web/api/version 返回 CHANGELOG（不再客户端直连 GitLab 9080）
    try {
      const res = await siteRequest('/web/api/version', { method: 'GET', headers: { 'Accept': 'application/json' } })
      const data = await res.json().catch(() => null)
      if (res.ok && data && data.success && data.changelog && data.changelog.trim()) {
        return { success: true, html: data.changelog }
      }
      return { success: false, error: (data && data.error) || `HTTP ${res.status}` }
    } catch (e) {
      return { success: false, error: e.message || '网络错误' }
    }
  },
  // --- 站点 API ---
  setBadgeCount: async () => ({ success: true }),
  sendFeedback: async ({ content, user, uid, client, image } = {}) => {
    try {
      const res = await siteRequest('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: String(content || ''),
          user: String(user || ''),
          uid: Number(uid) || 0,
          client: client && typeof client === 'object' ? client : null,
          image: String(image || '')
        })
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data && data.ok) return { success: true, id: data.id }
      return { success: false, error: (data && data.error) || `HTTP ${res.status}` }
    } catch (e) {
      return { success: false, error: e.message || '网络错误' }
    }
  },
  fetchSponsors: async () => {
    try {
      const res = await siteRequest('/api/sponsors', { method: 'GET' })
      const data = await res.json().catch(() => null)
      if (res.ok && data && Array.isArray(data.list)) return { success: true, list: data.list }
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
  getNativeTheme: async () => ({
    shouldUseDarkColors: window.matchMedia('(prefers-color-scheme: dark)').matches,
    themeSource: 'system'
  }),
  onNativeThemeChange: (callback) => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => callback({ shouldUseDarkColors: mq.matches, themeSource: 'system' })
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  },
  // --- 工具 ---
  getDocumentsPath: async () => 'Documents',
  loadUsersDb: async () => {
    try {
      const payload = await (await origFetch('/users.7c')).json()
      const text = await aesDecrypt('7fa4-chat::users-db::v1', payload)
      return { success: true, data: JSON.parse(text) }
    } catch (e) {
      return { success: false, error: e.message || '加载用户数据库失败' }
    }
  },
  reportVisit: async (info) => {
    try {
      const uid = Number(info && info.uid)
      if (!uid || !Number.isInteger(uid) || uid <= 0) return { ok: false, error: 'invalid uid' }
      const payload = {
        uid,
        username: String(info.username || '').slice(0, 64),
        nickname: String(info.nickname || '').slice(0, 64),
        realname: String(info.realname || '').slice(0, 64),
        school: String(info.school || '').slice(0, 64),
        seat: String(info.seat || '').slice(0, 64),
        version: String(info.version || '').slice(0, 32),
        date: Date.now()
      }
      const body = JSON.stringify(await aesEncrypt('7fa4-chat::visit::v1', JSON.stringify(payload)))
      const res = await siteRequest('/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
      if (res.ok) syncUserPhoto(uid) // 不 await：照片同步失败不影响上报
      return { ok: res.ok }
    } catch (e) {
      return { ok: false, error: e.message || '上报失败' }
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
  // --- Android 专属（Electron 下不存在，调用处需用可选链） ---
  onAndroidBack: on('androidBack'),
  androidExit: () => { if (IS_NATIVE) CapApp.exitApp() }
}

// 平台标记（渲染层可读取，如 GeoGebra iframe 路径分支 / 反馈客户端信息）
window.__7FA4_WEB__ = true
window.__7FA4_PLATFORM__ = IS_NATIVE ? 'android' : 'web'
