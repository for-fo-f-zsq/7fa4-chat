import { ref } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'
import { clearAllDirtyMsgKeys, clearDirtyMsgKeys, markMsgDirty, peekDirtyMsgKeys } from '../../utils/chatSync.js'

/**
 * 会话与消息的本地 SQLite / 网页端偏好持久化：
 * 统一快照保存 saveAll、按需补拉历史 ensureConvoMessages、冷启动恢复 loadData、退登兜底 flushData。
 */
export function useChatPersistence() {
  const isWeb = isWebBrowser()
  const idsHydrated = new Set()
  const loadedDataUid = ref(null)
  let activeSavePromise = null
  let rerunRequested = false

  function resetLoadedUid() {
    loadedDataUid.value = null
    idsHydrated.clear()
  }

  function clearDirtyState() {
    clearAllDirtyMsgKeys()
    idsHydrated.clear()
  }

  async function saveAllOnce() {
    const uid = store.self.uid
    if (!uid) return
    const prefs = JSON.parse(JSON.stringify({
      drafts: store.drafts || {},
      mutedConvos: store.mutedConvos || {},
      hiddenConvos: store.hiddenConvos || {},
      stickers: store.stickers || [],
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
    const dirtyKeys = peekDirtyMsgKeys()
    const messages = {}
    if (dirtyKeys) {
      for (const key of dirtyKeys) {
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
    // 仅在写入确认成功后才清理本次快照的脏标记，避免写盘失败永久丢消息
    clearDirtyMsgKeys(dirtyKeys)
  }

  async function saveAll() {
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
        if (m && m.id != null && !store.messages[m.id]) store.messages[m.id] = m
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
    await saveAll()
    await new Promise((r) => setTimeout(r, 300))
  }

  async function loadData() {
    const uid = store.self.uid
    if (!uid || loadedDataUid.value === uid) return
    loadedDataUid.value = uid
    if (isWeb) {
      try {
        const pr = await window.api.storeLoadPrefs(uid)
        if (pr && pr.success && pr.data) {
          const d = pr.data
          if (d.drafts) store.drafts = d.drafts
          if (d.mutedConvos) store.mutedConvos = d.mutedConvos
          if (d.hiddenConvos) store.hiddenConvos = d.hiddenConvos
          if (d.stickers) store.stickers = d.stickers
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
          store.messages[msg.id] = msg
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
        if (d.stickers) store.stickers = d.stickers
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
  }

  return {
    saveAll,
    ensureConvoMessages,
    flushData,
    loadData,
    resetLoadedUid,
    clearDirtyState,
  }
}
