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

let activePersistFns = null

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

export function schedulePersistSave(delayMs = 500) {
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
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function clearDirtyState() {
    clearAllDirtyMsgKeys()
    idsHydrated.clear()
  }

  async function saveAllOnce() {
    const uid = store.self.uid
    if (!uid) return
    try { localStorage.setItem(LAST_UID_KEY, String(uid)) } catch {}
    const pinnedConvos = syncPinnedConvosFromStore()
    const ownVotes = pruneOwnVotes(store.ownVotes)
    store.ownVotes = ownVotes
    const prefs = JSON.parse(JSON.stringify({
      drafts: store.drafts || {},
      mutedConvos: store.mutedConvos || {},
      hiddenConvos: store.hiddenConvos || {},
      pinnedConvos,
      stickers: store.stickers || [],
      ownVotes,
    }))
    if (isWeb) {
      const r = await window.api.storeSaveAll(uid, { prefs })
      if (r && r.success === false) throw new Error(r.error || 'storeSaveAll failed')
      return
    }
    const convos = []
    for (const [id, u] of Object.entries(store.users || {})) {
      if (u && u.uid != null) convos.push({ kind: 'user', cid: Number(id), meta: JSON.parse(JSON.stringify(u)) })
    }
    for (const [id, g] of Object.entries(store.groups || {})) {
      if (g && g.gid != null) convos.push({ kind: 'group', cid: Number(id), meta: JSON.parse(JSON.stringify(g)) })
    }
    const dirtySnap = peekDirtyMsgSnapshot()
    const messages = {}
    if (dirtySnap) {
      for (const key of dirtySnap.keys()) {
        const [kind, cid] = key.split(':')
        const target = kind === 'group' ? store.groups[cid] : store.users[cid]
        if (!target || !Array.isArray(target.message_ids)) continue
        const list = []
        for (const mid of target.message_ids) {
          const m = store.messages[mid]
          if (m) list.push(JSON.parse(JSON.stringify(m)))
        }
        if (list.length) messages[key] = list
      }
    }
    const r = await window.api.storeSaveAll(uid, { convos, messages, prefs })
    if (r && r.success === false) throw new Error(r.error || 'storeSaveAll failed')
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

  function scheduleSave(delayMs = 500) {
    if (!store.self.uid) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      saveAll()
    }, Math.max(50, Number(delayMs) || 500))
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
    try {
      const r = await window.api.storeLoadMessages(uid, kind, Number(cid), 1000)
      if (!r.success || !Array.isArray(r.data)) return
      for (const m of r.data) {
        if (m && m.id != null && !store.messages[m.id]) {
          store.messages[m.id] = { ...m, free: normalizeFree(m.token_free ?? m.free) }
        }
      }
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
    } catch {}
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
  }

  activePersistFns = { saveAll, scheduleSave }

  return {
    saveAll,
    scheduleSave,
    ensureConvoMessages,
    flushData,
    loadData,
    resetLoadedUid,
    clearDirtyState,
  }
}
