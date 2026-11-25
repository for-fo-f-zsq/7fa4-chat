import { ref } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'
import {
  clearAllDirtyMsgKeys,
  clearDirtyMsgSnapshot,
  markMsgDirty,
  normalizeFree,
  peekDirtyMsgSnapshot,
} from '../../utils/chatSync.js'

const OWN_VOTE_TTL_SEC = 24 * 60 * 60
const LAST_UID_KEY = '7fa4_last_uid'
// 落盘防抖：新消息到达后延迟这么久再写盘，把连续几条合并成一次事务
const SAVE_DEBOUNCE_MS = 1500
// 首次打开会话时从本地库预取的条数（更早的历史按页补拉：loadOlderFromStore）
const ENSURE_LIMIT = 50
const OLDER_PAGE_SIZE = 50

let activePersistFns = null

// ===== 增量落盘状态（纯内存，不参与响应式）=====
// 桌面端每次 saveAll 以前都会把所有会话 JSON 深拷一遍、并把脏会话的整段历史（最多
// 1000 条，可能含 100KB 的 base64 图）重新序列化再跨 IPC。这里记住「上次落盘时的
// 会话指纹」与「已经落过的消息 id」，只把真正新增/变化的部分发出去。
let saveCacheUid = null
const savedConvoSig = new Map() // 'user:101' -> 上次落盘的 meta 指纹
const savedMsgIds = new Map() // 'user:101' -> Set<已落盘 mid>
// 同一条消息会被原地重写（chatSync 合并投票 votes/custom/voteMeta、失效标记），id 不变但内容变了。
// 所以除「id 落过盘」外还要记「上次落盘时的内容指纹」，指纹变了必须重发。
const savedMsgSig = new Map() // 'user:101' -> Map<mid, 内容指纹>
let savedPrefsSig = ''

function resetSaveCache() {
  saveCacheUid = null
  savedConvoSig.clear()
  savedMsgIds.clear()
  savedMsgSig.clear()
  savedPrefsSig = ''
}

function ensureSaveCache(uid) {
  const key = uid == null ? '' : String(uid)
  if (saveCacheUid === key) return
  resetSaveCache()
  saveCacheUid = key
}

/**
 * 轻量 plain 拷贝：剥掉 Vue Proxy、去掉 undefined/函数（与原来的 JSON 往返同口径），
 * 但不再经过 JSON.parse —— 大段 base64 只复制字符串引用，不做二次解析。
 */
function plainCopy(v, depth = 0) {
  if (v == null) return v
  const t = typeof v
  if (t === 'function' || t === 'symbol') return undefined
  if (t !== 'object') return v
  if (v instanceof Date) return v.toISOString()
  if (depth > 8) return v
  if (Array.isArray(v)) {
    const out = new Array(v.length)
    for (let i = 0; i < v.length; i++) {
      const c = plainCopy(v[i], depth + 1)
      out[i] = c === undefined ? null : c
    }
    return out
  }
  if (v instanceof Map || v instanceof Set) return v
  const out = {}
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue
    const c = plainCopy(v[k], depth + 1)
    if (c !== undefined) out[k] = c
  }
  return out
}

function sameVoteList(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x === y) continue
    if (!x || !y || x.id !== y.id || x.send_time !== y.send_time || x.free !== y.free) return false
  }
  return true
}

function msgIdSet(key) {
  let s = savedMsgIds.get(key)
  if (!s) {
    s = new Set()
    savedMsgIds.set(key, s)
  }
  return s
}

function markIdsSaved(key, ids) {
  if (!key || !Array.isArray(ids) || !ids.length) return
  const s = msgIdSet(key)
  for (const id of ids) s.add(id)
}

function msgSigMap(key) {
  let m = savedMsgSig.get(key)
  if (!m) {
    m = new Map()
    savedMsgSig.set(key, m)
  }
  return m
}

function markMsgSigSaved(key, entries) {
  if (!key || !Array.isArray(entries) || !entries.length) return
  const m = msgSigMap(key)
  for (const [mid, sig] of entries) m.set(mid, sig)
}

export function pruneOwnVotes(list, nowSec = Math.floor(Date.now() / 1000)) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const v of list) {
    if (!v || v.id == null) continue
    const t = Number(v.send_time) || 0
    if (t <= 0 || nowSec - t > OWN_VOTE_TTL_SEC) continue
    const key = String(v.id)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: v.id, send_time: t, free: normalizeFree(v.free) })
  }
  return out
}

export function recordOwnVote(entry) {
  if (!entry || entry.id == null) return
  const nowSec = Math.floor(Date.now() / 1000)
  const next = pruneOwnVotes(
    [
      ...(Array.isArray(store.ownVotes) ? store.ownVotes : []),
      {
        id: entry.id,
        send_time: Number(entry.send_time) || nowSec,
        free: normalizeFree(entry.free),
      },
    ],
    nowSec,
  )
  store.ownVotes = next
  activePersistFns?.scheduleSave?.()
}

export function persistNow() {
  return activePersistFns?.saveAll?.()
}

export function schedulePersistSave(delayMs = 1500) {
  return activePersistFns?.scheduleSave?.(delayMs)
}

function readFallbackUid() {
  try {
    const cachedSelf = JSON.parse(localStorage.getItem('7fa4_self') || 'null')
    if (cachedSelf && cachedSelf.uid) return cachedSelf
  } catch {}
  try {
    const raw = localStorage.getItem(LAST_UID_KEY)
    if (raw) {
      const n = Number(raw)
      return { uid: Number.isFinite(n) && n > 0 ? n : raw }
    }
  } catch {}
  return null
}

function syncPinnedConvosFromStore() {
  const pinned = { ...(store.pinnedConvos || {}) }
  for (const [id, u] of Object.entries(store.users || {})) {
    if (!u) continue
    const key = `user_${id}`
    if (u.pinned) pinned[key] = true
    else delete pinned[key]
  }
  for (const [id, g] of Object.entries(store.groups || {})) {
    if (!g) continue
    const key = `group_${id}`
    if (g.pinned) pinned[key] = true
    else delete pinned[key]
  }
  store.pinnedConvos = pinned
  return pinned
}

function applyPinnedConvosToStore() {
  const pinned = store.pinnedConvos || {}
  for (const [id, u] of Object.entries(store.users || {})) {
    if (!u) continue
    const key = `user_${id}`
    if (pinned[key]) u.pinned = true
    else if (u.pinned) pinned[key] = true
  }
  for (const [id, g] of Object.entries(store.groups || {})) {
    if (!g) continue
    const key = `group_${id}`
    if (pinned[key]) g.pinned = true
    else if (g.pinned) pinned[key] = true
  }
}

/**
 * 会话与消息的本地 SQLite / 网页端偏好持久化：
 * 统一快照保存 saveAll、短防抖落盘 scheduleSave、按需补拉历史 ensureConvoMessages/loadOlderFromStore、
 * 冷启动恢复 loadData、退登/切后台兜底 flushData。
 */
export function useChatPersistence() {
  const isWeb = isWebBrowser()
  const idsHydrated = new Set()
  const loadedDataUid = ref(null)
  let activeSavePromise = null
  let rerunRequested = false
  let debounceTimer = null

  function resetLoadedUid() {
    loadedDataUid.value = null
    idsHydrated.clear()
    resetSaveCache()
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function clearDirtyState() {
    clearAllDirtyMsgKeys()
    idsHydrated.clear()
    resetSaveCache()
  }

  /** 冷启动从库里恢复的数据本来就已落盘：把它们记为「已保存」，避免首轮 saveAll 全量重写 */
  function seedSavedIdsFromStore() {
    const seed = (key, ids) => {
      markIdsSaved(key, ids)
      const sigs = []
      for (const mid of ids) {
        const m = store.messages[mid]
        if (!m) continue
        try { sigs.push([mid, JSON.stringify(m)]) } catch {}
      }
      if (sigs.length) markMsgSigSaved(key, sigs)
    }
    for (const [id, u] of Object.entries(store.users || {})) {
      if (!u || !Array.isArray(u.message_ids)) continue
      const ids = u.message_ids.filter((mid) => store.messages[mid])
      if (ids.length) seed('user:' + id, ids)
    }
    for (const [id, g] of Object.entries(store.groups || {})) {
      if (!g || !Array.isArray(g.message_ids)) continue
      const ids = g.message_ids.filter((mid) => store.messages[mid])
      if (ids.length) seed('group:' + id, ids)
    }
  }

  async function saveAllOnce() {
    const uid = store.self.uid
    if (!uid) return
    ensureSaveCache(uid)
    try { localStorage.setItem(LAST_UID_KEY, String(uid)) } catch {}
    const pinnedConvos = syncPinnedConvosFromStore()
    const ownVotes = pruneOwnVotes(store.ownVotes)
    // 每次落盘都赋新数组会让所有依赖 ownVotes 的视图白重算，只有内容真变了才写回
    if (!sameVoteList(store.ownVotes, ownVotes)) store.ownVotes = ownVotes
    const prefs = plainCopy({
      drafts: store.drafts || {},
      mutedConvos: store.mutedConvos || {},
      hiddenConvos: store.hiddenConvos || {},
      pinnedConvos,
      stickers: store.stickers || [],
      ownVotes,
    })
    const prefsSig = JSON.stringify(prefs)
    const prefsChanged = prefsSig !== savedPrefsSig
    if (isWeb) {
      const r = await window.api.storeSaveAll(uid, { prefs })
      if (r && r.success === false) throw new Error(r.error || 'storeSaveAll failed')
      savedPrefsSig = prefsSig
      return
    }

    // 1) 会话元数据：指纹没变的不发（原来每次都把所有会话深拷一遍再全量发）
    const convos = []
    const pendingConvoSig = new Map()
    const collectConvo = (kind, id, obj) => {
      if (!obj) return
      const meta = plainCopy(obj)
      const ckey = kind + ':' + id
      const sig = JSON.stringify(meta)
      if (savedConvoSig.get(ckey) === sig) return
      pendingConvoSig.set(ckey, sig)
      convos.push({ kind, cid: Number(id), meta })
    }
    for (const [id, u] of Object.entries(store.users || {})) {
      if (u && u.uid != null) collectConvo('user', id, u)
    }
    for (const [id, g] of Object.entries(store.groups || {})) {
      if (g && g.gid != null) collectConvo('group', id, g)
    }

    // 2) 消息：脏会话里「新增或内容变化」的消息才发。
    //    不能只按「已落盘 id」过滤：同一条 id 会被原地重写（chatSync 合并投票
    //    votes/custom/voteMeta、失效标记），id 没变但内容变了，按 id 过滤会把
    //    合并结果永久留在内存（重启后票数回退）。这里按「内容指纹」判断，
    //    指纹与主进程的 sha1 判重同源（都是消息 JSON），未变的仍然一条不发。
    const dirtySnap = peekDirtyMsgSnapshot()
    const messages = {}
    const pendingMsgIds = []
    const pendingMsgSig = []
    if (dirtySnap) {
      for (const key of dirtySnap.keys()) {
        const [kind, cid] = key.split(':')
        const target = kind === 'group' ? store.groups[cid] : store.users[cid]
        if (!target || !Array.isArray(target.message_ids)) continue
        const sigMap = msgSigMap(key)
        const batch = []
        const mids = []
        const sigs = []
        for (const mid of target.message_ids) {
          const m = store.messages[mid]
          if (!m) continue
          let sig = null
          try {
            sig = JSON.stringify(m)
          } catch {}
          if (sig != null && sigMap.get(mid) === sig) continue
          const copy = plainCopy(m)
          batch.push(copy)
          mids.push(mid)
          sigs.push([mid, sig != null ? sig : JSON.stringify(copy)])
        }
        if (batch.length) {
          messages[key] = batch
          pendingMsgIds.push([key, mids])
          pendingMsgSig.push([key, sigs])
        }
      }
    }

    const hasMessages = Object.keys(messages).length > 0
    if (!convos.length && !hasMessages && !prefsChanged) {
      // 没有任何实际变化：完全不跨 IPC，只把这些「已经落过盘」的脏标清掉
      if (dirtySnap) clearDirtyMsgSnapshot(dirtySnap)
      return
    }

    const r = await window.api.storeSaveAll(uid, {
      convos,
      messages,
      prefs: prefsChanged ? prefs : undefined,
    })
    if (r && r.success === false) throw new Error(r.error || 'storeSaveAll failed')
    // 成功之后才更新指纹/已落盘 id，避免失败时把未写盘的数据当成已保存
    savedPrefsSig = prefsSig
    for (const [k, sig] of pendingConvoSig) savedConvoSig.set(k, sig)
    for (const [key, mids] of pendingMsgIds) markIdsSaved(key, mids)
    for (const [key, sigs] of pendingMsgSig) markMsgSigSaved(key, sigs)
    // 按版本号安全清理本次快照脏标；若存盘期间同会话又来了新消息，保留脏标并触发补存
    const hasConcurrentDirt = clearDirtyMsgSnapshot(dirtySnap)
    if (hasConcurrentDirt) rerunRequested = true
  }

  async function saveAll() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    const uid = store.self.uid
    if (!uid) return
    if (activeSavePromise) {
      rerunRequested = true
      await activeSavePromise
      return
    }
    activeSavePromise = (async () => {
      do {
        rerunRequested = false
        try {
          await saveAllOnce()
        } catch (e) {
          console.error('[Persistence] saveAll 失败:', e)
        }
      } while (rerunRequested && store.self.uid)
    })().finally(() => {
      activeSavePromise = null
    })
    await activeSavePromise
  }

  function scheduleSave(delayMs = SAVE_DEBOUNCE_MS) {
    if (!store.self.uid) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      saveAll()
    }, Math.max(50, Number(delayMs) || SAVE_DEBOUNCE_MS))
  }

  async function ensureConvoMessages(kind, cid) {
    if (isWeb) return
    const uid = store.self.uid
    if (!uid || cid == null) return
    const target = kind === 'group' ? store.groups[cid] : store.users[cid]
    if (!target || !Array.isArray(target.message_ids)) return
    const key = kind + ':' + cid
    const firstTime = !idsHydrated.has(key)
    if (!firstTime && !target.message_ids.some((mid) => !store.messages[mid])) return
    store.loadingConvoKey = key
    try {
      const r = await window.api.storeLoadMessages(uid, kind, Number(cid), ENSURE_LIMIT)
      if (!r.success || !Array.isArray(r.data)) return
      // 批量落地：以前是 1000 次单键响应式写（每次都过一次 Proxy + 触发依赖），
      // 现在先造好 plain 批次再一次性 Object.assign，Vue 只调度一轮更新。
      const batch = {}
      const loadedIds = []
      for (const m of r.data) {
        if (!m || m.id == null) continue
        loadedIds.push(m.id)
        if (store.messages[m.id]) continue
        batch[m.id] = { ...m, free: normalizeFree(m.token_free ?? m.free) }
      }
      if (Object.keys(batch).length) Object.assign(store.messages, batch)
      // 这些 id 本来就在本地库里 → 记为已落盘，否则下一次 saveAll 会把它们整段重新写一遍
      markIdsSaved(key, loadedIds)
      // 指纹按「刚从库里读到的内容」记（只对本次真正新入内存的），这样内存里被改写过的旧消息不会被误标为已保存
      const seeded = []
      for (const m of r.data) {
        if (!m || m.id == null || !batch[m.id]) continue
        try { seeded.push([m.id, JSON.stringify(batch[m.id])]) } catch {}
      }
      if (seeded.length) markMsgSigSaved(key, seeded)
      if (firstTime) {
        let added = 0
        for (const m of r.data) {
          const mid = m && m.id
          if (mid == null) continue
          if (target.message_ids.indexOf(mid) === -1) {
            target.message_ids.push(mid)
            added++
          }
        }
        idsHydrated.add(key)
        if (added) markMsgDirty(kind === 'group' ? 'group' : 'user', Number(cid))
      }
    } catch {} finally {
      if (store.loadingConvoKey === key) store.loadingConvoKey = ''
    }
  }

  /**
   * 上滑翻页：从本地库再取一页更早的消息（比当前已加载的最早 send_time 更早）。
   * 桌面端 onMessageAreaScrollToTop 在「可见条数已用完但 message_ids 里还有未加载的 id」时调用。
   * @returns {{ loaded: number, exhausted: boolean }}
   */
  async function loadOlderFromStore(kind, cid, pageSize = OLDER_PAGE_SIZE) {
    if (isWeb) return { loaded: 0, exhausted: true }
    const uid = store.self.uid
    if (!uid || cid == null) return { loaded: 0, exhausted: true }
    const target = kind === 'group' ? store.groups[cid] : store.users[cid]
    if (!target || !Array.isArray(target.message_ids)) return { loaded: 0, exhausted: true }
    const key = kind + ':' + cid
    let before = null
    for (const mid of target.message_ids) {
      const m = store.messages[mid]
      if (!m) continue
      const t = Number(m.send_time) || 0
      if (t > 0 && (before == null || t < before)) before = t
    }
    if (before == null) return { loaded: 0, exhausted: true }
    try {
      const r = await window.api.storeLoadMessages(uid, kind, Number(cid), Number(pageSize) || OLDER_PAGE_SIZE, before)
      if (!r.success || !Array.isArray(r.data) || !r.data.length) return { loaded: 0, exhausted: true }
      const batch = {}
      const fresh = []
      for (const m of r.data) {
        if (!m || m.id == null) continue
        if (!store.messages[m.id]) {
          batch[m.id] = { ...m, free: normalizeFree(m.token_free ?? m.free) }
        }
        if (target.message_ids.indexOf(m.id) === -1) fresh.push(m.id)
      }
      if (Object.keys(batch).length) Object.assign(store.messages, batch)
      markIdsSaved(key, r.data.map((m) => m && m.id).filter((id) => id != null))
      // 与 ensureConvoMessages 同一口径：指纹只按「刚读到的库内容」记
      const seeded = []
      for (const m of r.data) {
        if (!m || m.id == null || !batch[m.id]) continue
        try { seeded.push([m.id, JSON.stringify(batch[m.id])]) } catch {}
      }
      if (seeded.length) markMsgSigSaved(key, seeded)
      if (fresh.length) {
        // 更早的消息排在 message_ids 前面（保持升序，useCurrentMessages 的零拷贝路径依赖这一点）
        fresh.sort((a, b) => a - b)
        target.message_ids.unshift(...fresh)
      }
      return { loaded: Object.keys(batch).length, exhausted: r.data.length < (Number(pageSize) || OLDER_PAGE_SIZE) }
    } catch {
      return { loaded: 0, exhausted: false }
    }
  }

  async function flushData() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    await saveAll()
  }

  async function loadData() {
    if (!store.self.uid && !isWeb) {
      const fallback = readFallbackUid()
      if (fallback && fallback.uid) Object.assign(store.self, fallback)
    }
    const uid = store.self.uid
    if (!uid || loadedDataUid.value === uid) return
    loadedDataUid.value = uid
    try { localStorage.setItem(LAST_UID_KEY, String(uid)) } catch {}
    if (isWeb) {
      try {
        const pr = await window.api.storeLoadPrefs(uid)
        if (pr && pr.success && pr.data) {
          const d = pr.data
          if (d.drafts) store.drafts = d.drafts
          if (d.mutedConvos) store.mutedConvos = d.mutedConvos
          if (d.hiddenConvos) store.hiddenConvos = d.hiddenConvos
          if (d.pinnedConvos) store.pinnedConvos = d.pinnedConvos
          if (d.stickers) store.stickers = d.stickers
          if (Array.isArray(d.ownVotes)) store.ownVotes = pruneOwnVotes(d.ownVotes)
          applyPinnedConvosToStore()
        }
      } catch {}
      return
    }
    try { await window.api.storeInit(uid) } catch {}
    try {
      const [cr, pr, lr] = await Promise.all([
        window.api.storeLoadConvos(uid),
        window.api.storeLoadPrefs(uid),
        window.api.storeLoadLastMessages(uid),
      ])
      if (lr && lr.success && Array.isArray(lr.data)) {
        for (const { msg } of lr.data) {
          if (!msg || msg.id == null || store.messages[msg.id]) continue
          store.messages[msg.id] = { ...msg, free: normalizeFree(msg.token_free ?? msg.free) }
        }
      }
      if (cr && cr.success) {
        if (cr.users) store.users = { ...store.users, ...cr.users }
        if (cr.groups) store.groups = { ...store.groups, ...cr.groups }
      }
      if (pr && pr.success && pr.data) {
        const d = pr.data
        if (d.drafts) store.drafts = d.drafts
        if (d.mutedConvos) store.mutedConvos = d.mutedConvos
        if (d.hiddenConvos) store.hiddenConvos = d.hiddenConvos
        if (d.pinnedConvos) store.pinnedConvos = d.pinnedConvos
        if (d.stickers) store.stickers = d.stickers
        if (Array.isArray(d.ownVotes)) store.ownVotes = pruneOwnVotes(d.ownVotes)
      }
    } catch {}
    if (Array.isArray(store.users)) store.users = Object.fromEntries(store.users.map((u) => [u.uid, u]))
    if (Array.isArray(store.groups)) store.groups = Object.fromEntries(store.groups.map((g) => [g.gid, g]))
    if (!store.messages || typeof store.messages !== 'object') store.messages = {}
    Object.values(store.users).forEach((u) => {
      if (Array.isArray(u.messages) && !u.message_ids) {
        u.message_ids = []
        for (const m of u.messages) u.message_ids.push(m.id)
        delete u.messages
      }
      if (!Array.isArray(u.message_ids)) u.message_ids = []
      if (u.unread === undefined || u.unread === false) u.unread = 0
      if (u.unread === true) u.unread = 1
      if (u.pinned === undefined) u.pinned = false
    })
    Object.values(store.groups).forEach((g) => {
      if (Array.isArray(g.messages) && !g.message_ids) {
        g.message_ids = []
        for (const m of g.messages) g.message_ids.push(m.id)
        delete g.messages
      }
      if (!Array.isArray(g.message_ids)) g.message_ids = []
      if (g.unread === undefined || g.unread === false) g.unread = 0
      if (g.unread === true) g.unread = 1
      if (g.pinned === undefined) g.pinned = false
      if (g.mentioned === undefined) g.mentioned = false
      if (g.exited === undefined) g.exited = false
      if (g.blocked === undefined) g.blocked = false
    })
    applyPinnedConvosToStore()
    seedSavedIdsFromStore()
  }

  activePersistFns = { saveAll, scheduleSave }

  return {
    saveAll,
    scheduleSave,
    ensureConvoMessages,
    loadOlderFromStore,
    flushData,
    loadData,
    resetLoadedUid,
    clearDirtyState,
  }
}
