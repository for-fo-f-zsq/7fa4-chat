import { reactive, computed } from 'vue'
import md5 from 'md5'
import { store, updateConnStatus, resetConnStatusHistory } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'
import { safeFetch, tryLogin, markMsgDirty, ingestMessage } from '../../utils/chatSync.js'
import { clearPendingVotes } from '../../utils/poll.js'
import { startRanklistFetch, stopRanklistFetch } from '../../utils/users.js'

const WEB_INFO_EVERY_MS = 60 * 1000
const INFO_EVERY_ROUNDS = 2
const TOKEN_EVERY_ROUNDS = 1
const INCR_TAKE_START = 5
const INCR_TAKE_MAX = 16
const INCR_MAX_PAGES = 4
const TARGET_TIMES_BATCH = 200
const AUTO_RELOGIN_COOLDOWN_MS = 10 * 60 * 1000
const AUTO_RELOGIN_REJECT_COOLDOWN_MS = 30 * 60 * 1000

let activePollingApi = null

export function triggerReconnectNow() {
  return activePollingApi?.reconnectNow?.()
}

export function triggerCheckConnection() {
  return activePollingApi?.checkConnection?.()
}

/**
 * 轮询同步、自动续期重登（>=10m 冷却）、连接状态与历史记录监控、退出清理。
 */
export function usePollingSync({
  getPage,
  getSetting,
  isChatPage,
  persistence,
  banners,
  notifications,
  postGroup,
  onTokenInfo,
}) {
  const isWeb = isWebBrowser()

  let lastInfoAt = 0
  let infoLoopRunning = false
  let initialSynced = false
  let failCount = 0
  let wakePollFn = null
  let lastAutoReloginAt = 0
  let reloginCooldownMs = AUTO_RELOGIN_COOLDOWN_MS

  const webExhausted = reactive(new Set())
  const webLoadingOlder = new Set()
  const backfillKeys = new Set()
  const lastSendTimes = new Map()
  const sameSecondRechecked = new Map()

  function setConnStatus(patch, opts) {
    updateConnStatus(patch, opts)
  }

  const canLoadOlder = computed(() => {
    const { pageType, pageId } = getPage()
    if (pageId == null) return false
    const prefix = pageType === 'group' ? 'g:' : 'u:'
    return !webExhausted.has(prefix + pageId)
  })

  function wakePoll() {
    wakePollFn?.()
  }

  function resetInfoTimestamp() {
    lastInfoAt = 0
    lastAutoReloginAt = 0
    reloginCooldownMs = AUTO_RELOGIN_COOLDOWN_MS
    setConnStatus({ retryCooldownUntil: 0 })
  }

  function stopPolling() {
    infoLoopRunning = false
    wakePoll()
  }

  function webTarget(kind, id) {
    return kind === 'group' ? store.groups[id] : store.users[id]
  }

  function applyLastSendTimesToList() {
    for (const [key, sec] of lastSendTimes) {
      const t = webTarget(key.startsWith('g:') ? 'group' : 'user', Number(key.slice(2)))
      if (t && sec > (t.lastSendTime || 0)) t.lastSendTime = sec
    }
  }

  function isCurrentConvo(kind, id) {
    const { pageType, pageId } = getPage()
    return pageId != null && Number(pageId) === Number(id) && pageType === kind
  }

  function oldestKnownSec(kind, id) {
    const t = webTarget(kind, id)
    if (!t || !Array.isArray(t.message_ids)) return 0
    let min = 0
    for (const mid of t.message_ids) {
      const m = store.messages[mid]
      const sec = m && (m.send_time || m.time)
      if (sec && (!min || sec < min)) min = sec
    }
    return min
  }

  async function loadConversationLite(kind, id) {
    const end = Date.now()
    if (kind === 'group') {
      await fetchMessages('group', end, 30, false, id, 0, true)
      return
    }
    await fetchMessages('user', end, 30, false, id, 0, true)
    await fetchMessages('send_user', end, 30, false, id, 0, true)
  }

  async function loadOlderOne(type, id, oldest) {
    let take = 30
    let res = await fetchMessages(type, oldest * 1000, take, false, id, 0, true)
    if (res && !res.inserted && res.count >= take && res.oldestSendTime != null && res.oldestSendTime >= oldest) {
      take = 100
      res = await fetchMessages(type, oldest * 1000, take, false, id, 0, true)
    }
    return res
  }

  async function loadOlderLite(kind, id) {
    const key = (kind === 'group' ? 'g:' : 'u:') + id
    if (webExhausted.has(key)) return false
    const oldest = oldestKnownSec(kind, id)
    if (!oldest) {
      webExhausted.add(key)
      return false
    }
    const results = kind === 'group'
      ? [await loadOlderOne('group', id, oldest)]
      : [await loadOlderOne('user', id, oldest), await loadOlderOne('send_user', id, oldest)]
    if (results.some((r) => r === null)) return true
    const got = results.some((r) => r && r.inserted)
    if (!got) webExhausted.add(key)
    return got
  }

  function pollSleep(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { wakePollFn = null; resolve() }, ms)
      wakePollFn = () => { clearTimeout(t); wakePollFn = null; resolve() }
    })
  }

  async function tryAutoRelogin(manual = false) {
    if (isWeb) return false
    const s = getSetting()
    const now = Date.now()
    if (!s || !s.keepLogin || !s.loginUsername || !s.loginPassword) {
      setConnStatus({
        sessionValid: false,
        state: 'rejected',
        lastError: '会话已失效（未启用自动保存凭据）',
      })
      return false
    }
    if (!manual && now - lastAutoReloginAt < reloginCooldownMs) {
      setConnStatus({
        retryCooldownUntil: lastAutoReloginAt + reloginCooldownMs,
      })
      return false
    }
    lastAutoReloginAt = now
    try {
      const hashed = md5(String(s.loginPassword) + 'syzoj2_xxx')
      const r = await tryLogin(s.loginUsername, hashed)
      if (r && r.error_code === 1) {
        reloginCooldownMs = AUTO_RELOGIN_COOLDOWN_MS
        setConnStatus({
          sessionValid: true,
          apiReachable: true,
          retryCooldownUntil: 0,
          lastError: '',
          state: 'connecting',
        })
        return true
      }
      if (r && r.error_code === -2) {
        setConnStatus({
          apiReachable: false,
          online: navigator.onLine,
          retryCooldownUntil: now + reloginCooldownMs,
          lastError: r.message || '无法连接服务器',
          state: navigator.onLine ? 'reconnecting' : 'offline',
        })
        return false
      }
      // 遇到 1005 / 密码错误 / 封禁等服务端拒绝，进一步拉长冷却避免高频重试
      reloginCooldownMs = Math.min(AUTO_RELOGIN_REJECT_COOLDOWN_MS, Math.max(AUTO_RELOGIN_REJECT_COOLDOWN_MS, reloginCooldownMs * 2))
      setConnStatus({
        sessionValid: false,
        apiReachable: true,
        retryCooldownUntil: now + reloginCooldownMs,
        lastError: (r && r.message) || (r && r.error_code != null ? `登录被拒绝 (${r.error_code})` : '自动重连被拒绝'),
        state: 'rejected',
      })
      return false
    } catch (e) {
      setConnStatus({
        retryCooldownUntil: now + reloginCooldownMs,
        lastError: (e && e.message) || '自动重连异常',
      })
      return false
    }
  }

  async function update(result) {
    if (!result || !result.user) return
    if (result.limit && typeof result.limit === 'object') store.tokenLimit = result.limit
    Object.assign(store.self, {
      ...result.user,
      uid: result.user.id,
      username: result.user.uid,
      student_no: result.user.username,
      nickname: result.user.nickname,
      realname: result.user.real_name,
      school: result.user.school,
      seat: result.user.seat,
    })
    try {
      localStorage.setItem('7fa4_self', JSON.stringify({
        uid: result.user.id,
        username: result.user.uid,
        nickname: result.user.nickname,
        realname: result.user.real_name,
      }))
      localStorage.setItem('7fa4_last_uid', String(result.user.id))
    } catch {}
    const friendsMap = Object.fromEntries((result.friends || [])
      .filter((f) => f.watchee === true || f.watcher === true)
      .map((f) => {
        const old = store.users[f.id]
        const isCur = isCurrentConvo('user', f.id)
        const pinned = !!(store.pinnedConvos?.[`user_${f.id}`] ?? (old ? old.pinned : false))
        return [f.id, {
          uid: f.id,
          realname: f.real_name,
          username: f.username,
          nickname: f.nickname,
          grade: f.grade,
          grade_class: f.grade_class,
          seat: f.seat,
          watchee: f.watchee === true,
          watcher: f.watcher === true,
          note: old ? old.note : '',
          message_ids: old ? old.message_ids : [],
          unread: isCur ? 0 : (old ? old.unread : 0),
          pinned,
          lastSendTime: old ? old.lastSendTime : 0,
          _fetchedAt: old ? old._fetchedAt : undefined,
        }]
      }))
    const hiddenUsers = Object.fromEntries(
      Object.entries(store.users).filter(([, u]) => u.show === false && !friendsMap[u.uid]),
    )
    store.users = { ...friendsMap, ...hiddenUsers }

    const newGroupIds = new Set((result.groups || []).map((g) => g.id))
    const newGroups = Object.fromEntries((result.groups || []).map((g) => {
      const old = store.groups[g.id]
      const isCur = isCurrentConvo('group', g.id)
      const pinned = !!(store.pinnedConvos?.[`group_${g.id}`] ?? (old ? old.pinned : false))
      return [g.id, {
        gid: g.id,
        name: g.title,
        mute: g.mute,
        users: g.users.map(({ user_id, type, mute }) => ({ user_id, type, mute })),
        message_ids: old ? old.message_ids : [],
        unread: isCur ? 0 : (old ? old.unread : 0),
        pinned,
        mentioned: isCur ? false : (old ? old.mentioned : false),
        exited: false,
        blocked: old ? old.blocked : false,
        lastSendTime: old ? old.lastSendTime : 0,
      }]
    }))
    for (const [gid, oldGroup] of Object.entries(store.groups)) {
      if (!newGroupIds.has(Number(gid))) {
        oldGroup.exited = true
        newGroups[gid] = oldGroup
      }
    }
    for (const [gid, newGroup] of Object.entries(newGroups)) {
      if (newGroup.blocked && !newGroup.exited) {
        try {
          const r = await postGroup({ type: 'leave', group_id: Number(gid), target_id: 0 })
          if (r && r.success) newGroup.exited = true
          else newGroup.blocked = false
        } catch {
          newGroup.blocked = false
        }
      }
    }
    store.groups = newGroups
  }

  async function fetchMessages(type, end, take = 10, allowPage = false, targetId = null, depth = 0, allowManual = false) {
    if (!infoLoopRunning && !allowManual) return null
    try {
      const endSec = Math.floor(end / 1000) + 1
      const targetQuery = targetId == null ? '' : `&target_id=${targetId}`
      const t0 = Date.now()
      const r = await (await safeFetch(`/chat/chat?type=${type}&end_time=${endSec}&take=${take}${targetQuery}`)).json()
      const latencyMs = Date.now() - t0
      if (!r || !r.success) {
        if (r && r._html) {
          setConnStatus({ apiReachable: true, sessionValid: false, latencyMs }, { sample: true })
        } else if (r && r._netError) {
          setConnStatus({ apiReachable: false, online: navigator.onLine }, { sample: true })
        }
        return null
      }
      setConnStatus({
        online: true,
        apiReachable: true,
        sessionValid: true,
        latencyMs,
        lastSyncAt: Date.now(),
        lastError: '',
      })
      if (!r.chats || !r.chats.length) {
        return { inserted: false, caughtUp: true, oldestSendTime: null, maxSendTime: 0, count: 0 }
      }
      let hasNew = false
      let oldestSendTime = null
      let maxSendTime = 0
      for (const c of r.chats) {
        if (!infoLoopRunning && !allowManual) return null
        if (oldestSendTime === null || c.send_time < oldestSendTime) oldestSendTime = c.send_time
        if (c.send_time > maxSendTime) maxSendTime = c.send_time
        end = Math.min(end, c.send_time * 1000)
        const t = type === 'group'
          ? store.groups[c.receiver_id]
          : type === 'send_user' ? store.users[c.receiver_id] : store.users[c.sender_id]
        if (!t) continue
        if (c.send_time && c.send_time > (t.lastSendTime || 0)) t.lastSendTime = c.send_time
        const known = t.message_ids.includes(c.id)
        if (type === 'user' && c.sender_id === store.self.uid) continue
        const targetConvoId = type === 'group' ? c.receiver_id : (type === 'send_user' ? c.receiver_id : c.sender_id)
        const persistKind = type === 'group' ? 'group' : 'user'
        const isCurrentPageBefore = isCurrentConvo(persistKind, targetConvoId)
        if (isCurrentPageBefore) {
          t.unread = 0
          if (type === 'group') t.mentioned = false
        }
        if (known) {
          if (!store.messages[c.id]) {
            ingestMessage(t, c)
            markMsgDirty(persistKind, targetConvoId)
          }
        } else {
          const msgContent = c.content
          const ing = ingestMessage(t, c)
          if (store.initializing && ing.kind !== 'vote') store.fetchNewCount++
          markMsgDirty(persistKind, targetConvoId)
          hasNew = true
          if (ing.kind === 'vote') continue
          await notifications.notifyIncomingMessage({
            chatType: persistKind,
            targetId: targetConvoId,
            senderId: c.sender_id,
            msgContent,
            setting: getSetting(),
            isCurrentPage: isCurrentPageBefore,
          })
          // await 期间用户可能已切入或切出该会话，必须实时重判是否标未读
          const isCurrentPageNow = isCurrentConvo(persistKind, targetConvoId)
          if (isCurrentPageNow) {
            t.unread = 0
            if (type === 'group') t.mentioned = false
          } else if (c.sender_id !== store.self.uid) {
            t.unread = (t.unread || 0) + 1
            if (type === 'group') {
              try {
                const msgObj = JSON.parse(msgContent)
                if (msgObj.mentions && (msgObj.mentions.includes(store.self.uid) || msgObj.mentions.includes('all'))) {
                  t.mentioned = true
                }
              } catch {}
            }
          }
        }
      }
      notifications.updateBadgeCount()
      if (hasNew) persistence.scheduleSave?.()
      if (hasNew && allowPage && depth < 200) {
        await fetchMessages(type, end, 100, true, targetId, depth + 1)
      } else if (hasNew && allowPage) {
        console.warn('[chat] 历史翻页达到上限，可能是同一秒内消息数超过单页容量：', type, targetId)
      }
      return { inserted: hasNew, caughtUp: !hasNew, oldestSendTime, maxSendTime, count: r.chats.length }
    } catch (e) {
      console.error(e)
      return null
    }
  }

  async function updateMessagesData(take = 10, allowPage = false) {
    const a = await fetchMessages('user', Date.now(), take, allowPage)
    const b = await fetchMessages('send_user', Date.now(), take, allowPage)
    const c = await fetchMessages('group', Date.now(), take, allowPage)
    return !!a && !!b && !!c
  }

  function isConversationUser(u) {
    if (!u || u.uid == null) return false
    return u.watchee === true || u.watcher === true || (u.message_ids && u.message_ids.length > 0)
  }

  function targetTimesBatches() {
    const gids = []
    for (const g of Object.values(store.groups || {})) if (g && !g.exited && g.gid != null) gids.push(g.gid)
    const uids = []
    for (const u of Object.values(store.users || {})) if (isConversationUser(u)) uids.push(u.uid)
    const batches = []
    for (let i = 0; i < Math.max(gids.length, uids.length, 1); i += TARGET_TIMES_BATCH) {
      batches.push({
        group_ids: gids.slice(i, i + TARGET_TIMES_BATCH).join(','),
        user_ids: uids.slice(i, i + TARGET_TIMES_BATCH).join(','),
      })
    }
    return batches
  }

  async function probeTargetTimes(seed = false) {
    const batches = targetTimesBatches()
    if (!batches.length || (!batches[0].group_ids && !batches[0].user_ids)) return []
    const changes = []
    const collect = (map, prefix, kind) => {
      for (const [rawId, rawSec] of Object.entries(map || {})) {
        const id = Number(rawId)
        const sec = Number(rawSec) || 0
        if (!id || !sec) continue
        const key = prefix + id
        const prev = lastSendTimes.get(key) || 0
        if (sec < prev) continue
        if (sec === prev) {
          if (seed || prev === 0 || sameSecondRechecked.get(key) === sec) continue
          sameSecondRechecked.set(key, sec)
          changes.push({ kind, id, fresh: false, key, sec, sameSecond: true })
          continue
        }
        if (seed) {
          lastSendTimes.set(key, sec)
          sameSecondRechecked.set(key, sec)
          continue
        }
        changes.push({ kind, id, fresh: prev === 0, key, sec })
      }
    }
    for (const batch of batches) {
      const qs = new URLSearchParams({ group_ids: batch.group_ids, user_ids: batch.user_ids, scope: '' }).toString()
      let r
      const t0 = Date.now()
      try {
        const res = await safeFetch('/chat/target-times?' + qs)
        r = await res.json()
        const latencyMs = Date.now() - t0
        if (r && r._html) {
          setConnStatus({ apiReachable: true, sessionValid: false, latencyMs, lastError: '会话已失效' })
          return null
        }
        if (r && r.success) {
          setConnStatus({
            online: true,
            apiReachable: true,
            sessionValid: true,
            latencyMs,
            lastSyncAt: Date.now(),
            lastError: '',
          })
        }
      } catch {
        setConnStatus({ apiReachable: false, online: navigator.onLine })
        return null
      }
      if (!r || !r.success) {
        banners.noteServerFailure(r)
        if (r && r._netError) setConnStatus({ apiReachable: false, online: navigator.onLine, lastError: r.err?.message || '网络错误' })
        return null
      }
      collect(r.groups, 'g:', 'group')
      collect(r.users, 'u:', 'user')
    }
    return changes
  }

  async function pullOne(type, targetId, fresh) {
    if (fresh) {
      const r = await fetchMessages(type, Date.now(), 100, true, targetId)
      return { ok: !!r, maxSeen: r ? r.maxSendTime : 0, done: true }
    }
    let end = Date.now()
    let take = INCR_TAKE_START
    let maxSeen = 0
    for (let page = 0; page < INCR_MAX_PAGES; page++) {
      const res = await fetchMessages(type, end, take, false, targetId)
      if (!res) return { ok: false, maxSeen, done: false }
      if (res.maxSendTime > maxSeen) maxSeen = res.maxSendTime
      if (res.caughtUp || res.oldestSendTime === null) return { ok: true, maxSeen, done: true }
      const nextEnd = res.oldestSendTime * 1000
      if (nextEnd >= end) {
        if (res.count >= take && take < 100) {
          take = Math.min(take * 4, 100)
          page--
          continue
        }
        return { ok: true, maxSeen, done: res.count < take }
      }
      end = nextEnd
      take = Math.min(take * 2, INCR_TAKE_MAX)
    }
    return { ok: true, maxSeen, done: false }
  }

  async function pullConversation(kind, id, fresh) {
    if (kind === 'group') return pullOne('group', id, fresh)
    const a = await pullOne('user', id, fresh)
    const b = await pullOne('send_user', id, fresh)
    return { ok: a.ok && b.ok, maxSeen: Math.max(a.maxSeen, b.maxSeen), done: a.done && b.done }
  }

  async function runInitialSync(infoResult) {
    await update(infoResult)
    lastInfoAt = Date.now()
    setConnStatus({
      lastInfoAt,
      lastSyncAt: Date.now(),
      state: 'ok',
      sessionValid: true,
      apiReachable: true,
      failCount: 0,
      lastError: '',
    }, { sample: 'force', forceEvent: true, title: '初始同步完成' })
    store.fetchNewCount = 0
    if (isWeb) {
      try { await probeTargetTimes(true) } catch {}
      applyLastSendTimesToList()
    } else {
      await updateMessagesData(100, true)
    }
    store.initializing = false
    startRanklistFetch()
  }

  async function attemptInfoRefresh() {
    const t0 = Date.now()
    const res = await safeFetch('/chat/info')
    let result = await res.json()
    const latencyMs = Date.now() - t0
    if (result && result._html) {
      if (isWeb) { banners.gotoLogin(); return { ok: false, webRedirect: true } }
      setConnStatus({ apiReachable: true, sessionValid: false, latencyMs })
      if (await tryAutoRelogin()) {
        const retryRes = await safeFetch('/chat/info')
        result = await retryRes.json()
      }
    }
    if (result && result._html) {
      store.netError = true
      setConnStatus({ apiReachable: true, sessionValid: false })
      return { ok: false }
    }
    if (result && result.success) {
      lastInfoAt = Date.now()
      failCount = 0
      store.netError = false
      store.online = true
      setConnStatus({
        state: 'ok',
        online: true,
        apiReachable: true,
        sessionValid: true,
        latencyMs,
        lastInfoAt,
        lastSyncAt: Date.now(),
        failCount: 0,
        retryCooldownUntil: 0,
        lastError: '',
      }, { sample: true })
      if (infoLoopRunning) {
        await update(result)
        if (isWeb) applyLastSendTimesToList()
      }
      return { ok: true, result }
    }
    return { ok: false, result }
  }

  async function checkConnection() {
    setConnStatus({ online: navigator.onLine })
    try {
      const t0 = Date.now()
      const res = await safeFetch('/chat/info')
      const r = await res.json()
      const latencyMs = Date.now() - t0
      if (r && r.success) {
        lastInfoAt = Date.now()
        failCount = 0
        store.netError = false
        store.online = true
        setConnStatus({
          state: 'ok',
          online: true,
          apiReachable: true,
          sessionValid: true,
          latencyMs,
          lastInfoAt,
          failCount: 0,
          retryCooldownUntil: 0,
          lastError: '',
        }, { sample: 'force' })
      } else if (r && r._html) {
        store.netError = true
        setConnStatus({
          state: store.connStatus?.state === 'rejected' ? 'rejected' : 'reconnecting',
          online: navigator.onLine,
          apiReachable: true,
          sessionValid: false,
          latencyMs,
          lastError: '登录会话已失效',
        }, { sample: 'force' })
      } else {
        store.netError = true
        setConnStatus({
          state: navigator.onLine ? 'reconnecting' : 'offline',
          online: navigator.onLine,
          apiReachable: !r?._netError,
          lastError: r?.err?.message || '连接失败',
        }, { sample: 'force' })
      }
    } catch (e) {
      store.netError = true
      setConnStatus({
        state: navigator.onLine ? 'reconnecting' : 'offline',
        online: navigator.onLine,
        apiReachable: false,
        lastError: (e && e.message) || '网络错误',
      }, { sample: 'force' })
    }
    return { ...(store.connStatus || {}) }
  }

  async function reconnectNow() {
    resetInfoTimestamp()
    setConnStatus({
      state: 'connecting',
      online: navigator.onLine,
      lastError: '',
    }, { forceEvent: true, title: '手动发起重连' })
    let infoCheck = await checkConnection()
    if (!infoCheck.sessionValid && !isWeb) {
      const relogged = await tryAutoRelogin(true)
      if (relogged) infoCheck = await checkConnection()
    }
    if (infoCheck.state === 'ok') {
      try {
        const res = await safeFetch('/chat/info')
        const r = await res.json()
        if (r && r.success) {
          if (!initialSynced && infoLoopRunning) {
            await runInitialSync(r)
            initialSynced = true
          } else {
            await update(r)
            await probeTargetTimes(false)
          }
        }
      } catch {}
    }
    wakePoll()
    return { ok: store.connStatus?.state === 'ok', connStatus: { ...(store.connStatus || {}) } }
  }

  async function startInfoLoop(prefetchedInfo = null) {
    if (!store.logined) return
    if (infoLoopRunning) return
    infoLoopRunning = true
    failCount = 0
    initialSynced = false

    let r = prefetchedInfo
    try {
      if (!r) {
        const t0 = Date.now()
        const res = await safeFetch('/chat/info')
        r = await res.json()
        if (r && r.success) setConnStatus({ latencyMs: Date.now() - t0 })
      }
      if (r && r._html) {
        if (isWeb) { store.initializing = false; banners.gotoLogin(); return }
        if (await tryAutoRelogin()) {
          const retryRes = await safeFetch('/chat/info')
          r = await retryRes.json()
        }
      }
      if (!infoLoopRunning) { store.initializing = false; return }
      if (r && r.success) {
        failCount = 0
        store.netError = false
        store.online = true
        await runInitialSync(r)
        initialSynced = true
      } else {
        failCount = 1
        store.netError = true
        setConnStatus({
          failCount,
          online: navigator.onLine,
          apiReachable: !r?._netError,
          sessionValid: !(r && r._html),
          state: r && r._html ? (store.connStatus?.state === 'rejected' ? 'rejected' : 'reconnecting') : (navigator.onLine ? 'reconnecting' : 'offline'),
          lastError: (r && r.err?.message) || (r && r._html ? '会话已失效' : '连接服务器失败'),
        })
        store.initializing = false
      }
    } catch (e) {
      failCount = 1
      store.netError = true
      setConnStatus({
        failCount,
        online: navigator.onLine,
        apiReachable: false,
        state: navigator.onLine ? 'reconnecting' : 'offline',
        lastError: (e && e.message) || '网络错误',
      })
      store.initializing = false
    }

    let round = 0
    while (infoLoopRunning && store.logined) {
      round++
      try {
        if (!initialSynced) {
          const infoAttempt = await attemptInfoRefresh()
          if (infoAttempt.webRedirect) return
          if (!infoLoopRunning) break
          if (infoAttempt.ok && infoAttempt.result) {
            await runInitialSync(infoAttempt.result)
            initialSynced = true
          } else {
            failCount++
            store.netError = true
            setConnStatus({
              failCount,
              online: navigator.onLine,
              state: store.connStatus?.state === 'rejected' ? 'rejected' : (navigator.onLine ? 'reconnecting' : 'offline'),
            })
            if (failCount >= 3) store.online = false
          }
          if (!infoLoopRunning) break
          await pollSleep(failCount >= 3 ? 10000 : (getSetting().pollInterval || 1000))
          continue
        }

        const changes = await probeTargetTimes()
        if (isWeb) applyLastSendTimesToList()
        if (changes === null) {
          if (banners.serverNotice.value) {
            failCount = 0
            store.netError = false
          } else {
            failCount++
            store.netError = true
            setConnStatus({
              failCount,
              online: navigator.onLine,
              state: store.connStatus?.state === 'rejected' ? 'rejected' : (navigator.onLine ? 'reconnecting' : 'offline'),
            }, { sample: true })
          }
        } else {
          failCount = 0
          store.netError = false
          store.online = true
          setConnStatus({
            failCount: 0,
            state: 'ok',
            online: true,
            apiReachable: true,
            sessionValid: true,
            lastSyncAt: Date.now(),
            lastError: '',
          }, { sample: true })
          for (const c of changes) {
            if (!infoLoopRunning) break
            if (isWeb) {
              const t = webTarget(c.kind, c.id)
              if (t) t.lastSendTime = c.sec
              lastSendTimes.set(c.key, c.sec)
              if (!isCurrentConvo(c.kind, c.id)) continue
              try {
                const pulled = await pullConversation(c.kind, c.id, c.fresh)
                if (pulled.ok && !pulled.done) backfillKeys.add(c.key)
              } catch (e) { console.error(e) }
              continue
            }
            try {
              const pulled = await pullConversation(c.kind, c.id, c.fresh)
              if (pulled.ok && pulled.maxSeen >= c.sec) lastSendTimes.set(c.key, c.sec)
              if (pulled.ok && !pulled.done) backfillKeys.add(c.key)
            } catch (e) { console.error(e) }
          }
          if (!isWeb && infoLoopRunning && backfillKeys.size) {
            let budget = 3
            for (const key of Array.from(backfillKeys)) {
              if (!infoLoopRunning || budget-- <= 0) break
              const kind = key.startsWith('g:') ? 'group' : 'user'
              const id = Number(key.slice(2))
              if (!id) { backfillKeys.delete(key); continue }
              try {
                const pulled = await pullConversation(kind, id, false)
                if (!pulled.ok || pulled.done) backfillKeys.delete(key)
                else if (pulled.maxSeen > (lastSendTimes.get(key) || 0)) lastSendTimes.set(key, pulled.maxSeen)
              } catch (e) { console.error(e) }
            }
          }
        }
        if (!infoLoopRunning) break
        if (failCount >= 3) {
          store.online = false
        }
        // 修复：failCount >= 3 时不再提前 continue 跳过 /chat/info + tryAutoRelogin 恢复通道
        const shouldRefreshInfo =
          failCount >= 3 ||
          (isWeb ? (Date.now() - lastInfoAt >= WEB_INFO_EVERY_MS) : (round % INFO_EVERY_ROUNDS === 0))
        if (shouldRefreshInfo) {
          const infoAttempt = await attemptInfoRefresh()
          if (infoAttempt.webRedirect) return
          if (!infoLoopRunning) break
        }
        if (failCount < 3 && (round === 1 || round % TOKEN_EVERY_ROUNDS === 0)) {
          try {
            const tr = await (await safeFetch('/chat/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'none' }),
            })).json()
            if (tr.success && tr.remain_token_count !== undefined) {
              onTokenInfo?.({ remain: tr.remain_token_count, total: tr.remain_token_count + tr.used_token_count })
            }
          } catch {}
        }
      } catch (e) {
        console.error('[poll] 本轮出错，继续重试：', e)
        failCount++
        setConnStatus({ failCount, lastError: (e && e.message) || '轮询出错' })
      }
      await pollSleep(failCount >= 3 ? 10000 : (getSetting().pollInterval || 1000))
    }
  }

  async function refreshInfo() {
    const info = await (await safeFetch('/chat/info')).json()
    if (info.success) await update(info)
  }

  async function clearCacheAndReload() {
    store.initializing = true
    persistence.resetLoadedUid()
    try {
      store.users = {}
      store.groups = {}
      store.messages = {}
      store.stickers = []
      store.drafts = {}
      store.mutedConvos = {}
      store.hiddenConvos = {}
      store.pinnedConvos = {}
      store.ownVotes = []
      webExhausted.clear()
      lastSendTimes.clear()
      sameSecondRechecked.clear()
      backfillKeys.clear()
      const result = await (await safeFetch('/chat/info')).json()
      if (result.success) await runInitialSync(result)
      else store.initializing = false
    } catch {} finally {
      store.initializing = false
    }
  }

  async function logout(toLogin = false, clearCred = false) {
    stopPolling()
    persistence.resetLoadedUid()
    stopRanklistFetch()
    lastSendTimes.clear()
    sameSecondRechecked.clear()
    backfillKeys.clear()
    webExhausted.clear()
    await new Promise((r) => setTimeout(r, 100))
    await persistence.flushData()
    persistence.clearDirtyState?.()
    try { await safeFetch('/logout', { method: 'POST' }, 10000) } catch {}
    try { await window.api.clearSessionCookies() } catch {}
    const s = await window.api.loadSetting()
    if (clearCred) {
      s.keepLogin = false
      s.loginUsername = ''
      s.loginPassword = ''
    }
    await window.api.saveSetting(s)
    try {
      localStorage.removeItem('7fa4_logined')
      localStorage.removeItem('7fa4_self')
      localStorage.removeItem('7fa4_last_uid')
    } catch {}
    Object.assign(store, {
      self: { uid: null, username: null, nickname: null, realname: null },
      users: {},
      groups: {},
      messages: {},
      stickers: [],
      drafts: {},
      mutedConvos: {},
      hiddenConvos: {},
      pinnedConvos: {},
      ownVotes: [],
    })
    clearPendingVotes()
    store.logined = false
    store.netError = false
    store.online = navigator.onLine
    setConnStatus({
      state: 'ok',
      online: store.online,
      apiReachable: true,
      sessionValid: false,
      failCount: 0,
      retryCooldownUntil: 0,
      lastError: '',
    })
    resetConnStatusHistory()
    store.guestMode = !toLogin
    if (isWeb) location.href = '/login'
  }

  const api = {
    webExhausted,
    webLoadingOlder,
    canLoadOlder,
    startInfoLoop,
    stopPolling,
    wakePoll,
    resetInfoTimestamp,
    loadConversationLite,
    loadOlderLite,
    reconnectNow,
    checkConnection,
    refreshInfo,
    clearCacheAndReload,
    logout,
  }
  activePollingApi = api
  return api
}
