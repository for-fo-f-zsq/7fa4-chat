import { store } from '../../store.js'
import { parseMsgContent } from '../../utils/format.js'
import { getMessagePlainText } from '../../utils/message.js'
import {
  getConvoKey,
  shouldNotifyDetailed,
  getNotifContent,
  buildNotificationPayload,
  playNotificationSound,
} from '../../utils/notify.js'
import { getUsername, isUserHiddenBySetting } from '../../utils/users.js'

// 同一会话 4 秒内只弹一次，其余消息只累加计数，弹窗里以「(+N)」体现。
const NOTIF_COOLDOWN_MS = 4000

/**
 * 未读计数、系统托盘角标、全部已读、免打扰/隐藏会话及多通道消息提醒。
 * getSetting 用于角标开关（useChatWorkspace 暂未传参，取不到时按开启处理）。
 */
export function useUnreadNotifications({ saveAll, getSetting } = {}) {
  const notifCooldown = {}
  const notifPendingCount = {}
  // 托盘/Dock 角标是跨进程 IPC（Electron: setBadgeCount → 主进程 → 系统），
  // 而 updateBadgeCount 会在每次 fetchMessages 之后被调用（一轮同步里好几次）。
  // 记住上一次真正下发的数字：没变就不再打穿进程边界，也不再重复置 0。
  let lastBadgeValue = null
  // 冷却表与聚合计数必须按账号划分：否则 A 账号的 4s 冷却会压掉 B 账号同号会话的提醒，
  // 已弹出的卡片点一下还会把点击事件发给新账号（跳到别人的会话）。
  let notifOwnerUid = null

  function ownerPrefix() {
    const uid = store.self?.uid
    return uid == null ? 'anon|' : String(uid) + '|'
  }

  /** 账号变化时清空上一账号的冷却与聚合计数 */
  function syncNotifOwner() {
    const uid = store.self?.uid ?? null
    if (uid === notifOwnerUid) return
    notifOwnerUid = uid
    for (const k of Object.keys(notifPendingCount)) delete notifPendingCount[k]
    for (const k of Object.keys(notifCooldown)) delete notifCooldown[k]
  }

  // getSetting 未接入时退回 store.setting（useChatLifecycle 会同步一份），再退回 {}。
  function currentSetting() {
    const s = typeof getSetting === 'function' ? getSetting() : null
    return s || store.setting || {}
  }

  function updateBadgeCount(force = false) {
    const enabled = currentSetting().notifBadge !== false
    // 关掉角标时不需要遍历任何会话：只需要保证「上一次发过的非 0 数字被清零」。
    if (!enabled) {
      if (force || lastBadgeValue !== 0) {
        lastBadgeValue = 0
        if (window.api?.setBadgeCount) window.api.setBadgeCount(0)
      }
      return 0
    }
    let total = 0
    for (const u of Object.values(store.users)) {
      if (!isUserHiddenBySetting(u)) total += (u.unread || 0)
    }
    for (const g of Object.values(store.groups)) total += (g.unread || 0)
    // 数字没变（绝大多数轮询都是这种情况）就完全不写 IPC。
    if (!force && total === lastBadgeValue) return total
    lastBadgeValue = total
    if (window.api?.setBadgeCount) window.api.setBadgeCount(total)
    return total
  }

  function markAllRead() {
    for (const user of Object.values(store.users)) user.unread = 0
    for (const group of Object.values(store.groups)) {
      group.unread = 0
      group.mentioned = false
    }
    updateBadgeCount()
  }

  function toggleHiddenConvo(type, id) {
    const key = getConvoKey(type, id)
    if (!store.hiddenConvos) store.hiddenConvos = {}
    if (store.hiddenConvos[key]) delete store.hiddenConvos[key]
    else store.hiddenConvos[key] = true
    saveAll?.()
  }

  function toggleMute(type, id) {
    const key = getConvoKey(type, id)
    if (!store.mutedConvos) store.mutedConvos = {}
    store.mutedConvos[key] = !store.mutedConvos[key]
    if (!store.mutedConvos[key]) delete store.mutedConvos[key]
    // 与 toggleHiddenConvo 对齐：立刻落盘，别指望 10s 自动保存（用户切页/退出会丢）
    saveAll?.()
  }

  function toggleRead(type, id, isUnread) {
    const item = type === 'user' ? store.users[id] : store.groups[id]
    if (!item) return
    if (isUnread) {
      item.unread = 0
      if (type === 'group') item.mentioned = false
    } else {
      item.unread = 1
    }
    updateBadgeCount()
  }

  /** 窗口回到前台时调用：计数与冷却一起清空，避免下次弹窗带上失焦期间的旧数字。 */
  function clearPendingNotifications() {
    for (const k of Object.keys(notifPendingCount)) delete notifPendingCount[k]
    for (const k of Object.keys(notifCooldown)) delete notifCooldown[k]
  }

  // ---- 窗口前后台状态 ----
  // 以前每条通知都要 `await window.api.getWindowState()` 跨一次进程边界（Electron 下是 IPC 往返）。
  // 现在：主进程一旦推送窗口状态（window.api.onWindowState），就以推送值为主并本地缓存，
  // 通知路径上不再有任何 IPC；推送通道尚未落地时保持原行为（一条通知一次读取），
  // 语义与之前完全一致（也是唯一被 data-sync 用例固定下来的口径：读到的焦点状态即事实）。
  let pushedWinState = null
  let winStateBound = false
  let winStateUnsub = null

  function bindWindowState() {
    if (winStateBound) return
    winStateBound = true
    try {
      if (typeof window.api?.onWindowState === 'function') {
        winStateUnsub = window.api.onWindowState((s) => {
          if (!s || typeof s !== 'object') return
          pushedWinState = { focused: !!s.focused, visible: s.visible !== false }
        })
      }
    } catch {}
  }

  async function currentWindowState() {
    bindWindowState()
    if (pushedWinState) return pushedWinState
    // preload 侧缓存（主进程 focus/blur/show/hide 主动推送）：同步、0 次 IPC。
    // 还没收到过推送时返回 null，此时再回落到 invoke，保证首条通知也不会误判。
    if (typeof window.api?.getCachedWindowState === 'function') {
      try {
        const c = window.api.getCachedWindowState()
        if (c && typeof c === 'object') {
          const st = { focused: !!c.focused, visible: c.visible !== false }
          pushedWinState = st
          return st
        }
      } catch {}
    }
    if (window.api?.getWindowState) {
      try {
        const s = await window.api.getWindowState()
        if (s && typeof s === 'object') return { focused: !!s.focused, visible: s.visible !== false }
      } catch {}
    }
    return { focused: false, visible: true }
  }

  async function notifyIncomingMessage({ chatType, targetId, senderId, msgContent, setting, isCurrentPage }) {
    try {
      if (store.initializing) return
      syncNotifOwner()
      const s = setting || currentSetting()
      const prefix = ownerPrefix()
      const convoKey = prefix + getConvoKey(chatType, targetId)

      // 1. 解析消息本身（@我 / @all 决定提示音档位与 mention-only 是否放行）
      const msg = parseMsgContent(msgContent) || { type: 'text', content: String(msgContent ?? '') }
      const mentionList = Array.isArray(msg.mentions) ? msg.mentions : []
      const selfUid = store.self?.uid
      // 第三方客户端可能把 uid 序列化成字符串，比较前统一 String()，否则 @我 会漏判。
      const mention =
        selfUid != null &&
        mentionList.some((m) => {
          const v = String(m)
          return (selfUid != null && v === String(selfUid)) || v === 'all'
        })

      // 2. 统一闸门：会话免打扰 / 全局 DND / 仅提醒提及我的
      const policy = shouldNotifyDetailed(chatType, targetId, s, { mention, chatType })
      if (!policy.ok) {
        notifPendingCount[convoKey] = 0
        return
      }

      // 3. 正在看这个会话：既不提醒也不打扰（判定由调用方传入，store.pageType/pageId 全仓无人写）
      if (isCurrentPage) return

      const raw = getMessagePlainText(msgContent)
      const senderName = getUsername(senderId, store.users)
      const title = chatType === 'group' ? store.groups?.[targetId]?.name || '群聊' : senderName || '新消息'
      const subtitle = chatType === 'group' ? senderName : ''

      // 3. 窗口状态：后台/失焦且开启系统通知时发 OS 原生通知；前台非当前会话仅播提示音与未读角标
      const state = await currentWindowState()
      const isForeground = !!state.focused && state.visible !== false
      const wantDesktopNotif = !isForeground && s.notifDesktop !== false
      const wantSound = s.notifSound !== false
      if (!wantDesktopNotif && !wantSound) return

      // 4. 聚合：冷区内只累加计数，不弹/不重复响铃
      const count = (notifPendingCount[convoKey] || 0) + 1
      notifPendingCount[convoKey] = count
      const now = Date.now()
      if (notifCooldown[convoKey] && now - notifCooldown[convoKey] < NOTIF_COOLDOWN_MS) return
      notifCooldown[convoKey] = now

      let ok = true
      if (wantDesktopNotif) {
        // 5. 正文：隐私模式替换原文（且不再拼发送者名，避免「隐藏消息内容」仍暴露是谁发的）
        const content = getNotifContent(raw, s)
        const contentWithCount = count > 1 ? `${content} (+${count - 1})` : content
        const body =
          chatType === 'group' && !s.notifPrivacy ? `${senderName}：${contentWithCount}` : contentWithCount

        const payload = buildNotificationPayload({
          chatType,
          targetId,
          title,
          subtitle,
          body,
          mention,
          count,
          setting: s,
          timestamp: now,
        })

        try {
          if (!window.api?.notify) ok = false
          else {
            // 主进程/白名单可能在 resolve 里返回 { success:false }，web-api 则直接返回布尔 false：
            // 两者都算没发出去，不能清聚合计数，否则被闸门拒掉的提醒会让「(+N)」凭空消失。
            const res = await window.api.notify(payload)
            ok = res !== false && res?.success !== false
          }
        } catch {
          ok = false
        }
      }

      if (wantSound) {
        playNotificationSound(mention ? 'mention' : 'default', s.notifSoundVolume ?? 60)
      }
      if (ok) notifPendingCount[convoKey] = 0
    } catch (e) {
      console.error('[notify] 通知失败（不影响消息拉取）：', e)
    }
  }

  return {
    updateBadgeCount,
    markAllRead,
    toggleHiddenConvo,
    toggleMute,
    toggleRead,
    clearPendingNotifications,
    notifyIncomingMessage,
  }
}
