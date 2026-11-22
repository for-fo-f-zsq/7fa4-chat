import { nextTick, onMounted, onUnmounted } from 'vue'
import { store } from '../../store.js'
import { applyFontSize, ranklistOrder, safeFetch, usersJson } from '../../utils.js'
import { showToast } from '../useToast.js'
import { ALLOWED_THEME_VARS, isValidThemeVarValue } from '../modals/useThemeEditor.js'
import { dispatchToolSendImage } from './useChatActions.js'

/**
 * ChatView 生命周期装配：设置加载、主题应用、系统事件监听、本地首屏秒开与后台同步、退出落盘。
 */
export function useChatLifecycle({
  isWeb,
  setting,
  version,
  pageType,
  pageId,
  messageListRef,
  persistence,
  banners,
  notifications,
  polling,
  bindGlobalListeners,
  onAndroidBack,
  onToolSendImage,
}) {
  let autoSaveTimer = null
  let unsubscribeNotifClick = null
  let unsubscribeFlush = null
  let unsubscribeAndroidBack = null
  let unsubscribeToolSendImage = null
  let unsubscribeToolUsersReq = null
  let unmounted = false

  function onOnline() {
    store.online = true
    if (store.connStatus) {
      store.connStatus.online = true
      if (store.connStatus.state === 'offline') store.connStatus.state = 'reconnecting'
    }
    polling.wakePoll()
  }

  function onOffline() {
    store.online = false
    if (store.connStatus) {
      store.connStatus.online = false
      store.connStatus.apiReachable = false
      store.connStatus.state = 'offline'
    }
  }

  /** 三端 save-setting 的返回口径不同（桌面裸布尔 / web {success} / 抛异常），统一成一句结论 */
  function saveSettingOk(r) {
    if (r === false) return false
    if (r && typeof r === 'object' && r.success === false) return false
    return true
  }

  async function onSettingChange(changes) {
    if (changes._clearCache) { polling.clearCacheAndReload(); return }
    const prevSyncRange = setting.value?.syncRange
    const apiUrlChanged = changes.apiUrl !== undefined && changes.apiUrl !== setting.value?.apiUrl
    Object.assign(setting.value, changes)
    store.setting = setting.value
    if (changes.fontSize !== undefined) applyFontSize(changes.fontSize)
    // 角标开关立即生效：否则要等下一轮轮询才清零/恢复，关掉后旧数字会一直挂着
    if (changes.notifBadge !== undefined) notifications.updateBadgeCount()
    // 落盘失败要能看见：磁盘满 / localStorage 配额超限 / WebView 清存储时不能静默回退
    const snapshot = JSON.parse(JSON.stringify(setting.value))
    try {
      const r = await window.api.saveSetting(snapshot)
      if (!saveSettingOk(r)) throw new Error((r && r.error) || '保存失败')
    } catch (e) {
      console.error('[setting] 保存失败', e)
      showToast('设置未能保存，请检查存储空间后重试', { type: 'error', title: '保存失败', duration: 4000 })
    }
    if (changes.syncRange === 'all' && prevSyncRange !== 'all') {
      polling.backfillAllHistory?.()
    }
    if (apiUrlChanged) {
      polling.resetInfoTimestamp()
      polling.wakePoll()
    }
  }

  onMounted(async () => {
    store.initializing = true
    try {
      setting.value = (await window.api.loadSetting()) || {}
      store.setting = setting.value
      if (setting.value.fontSize) applyFontSize(setting.value.fontSize)
      store.online = navigator.onLine
      if (store.connStatus) {
        store.connStatus.online = store.online
        store.connStatus.state = store.online ? 'connecting' : 'offline'
      }
      try { version.value = await window.api.getVersion() } catch {}

      const root = document.documentElement
      if (setting.value.theme && setting.value.theme !== 'default' && setting.value.theme !== 'custom') {
        root.classList.add(`theme-${setting.value.theme}`)
      }
      if (setting.value.theme === 'custom' && setting.value.customVars) {
        for (const [k, v] of Object.entries(setting.value.customVars)) {
          if (ALLOWED_THEME_VARS.has(k) && isValidThemeVarValue(v)) {
            root.style.setProperty(k, v)
          }
        }
      }

      autoSaveTimer = setInterval(() => persistence.saveAll(), 10000)
      unsubscribeNotifClick = window.api.onNotifClick((data) => {
        if (data && data.chatType && data.targetId) {
          const type = data.chatType === 'group' ? 'group' : 'user'
          const id = Number(data.targetId)
          pageType.value = type
          pageId.value = id
          const target = type === 'group' ? store.groups?.[id] : store.users?.[id]
          if (target) {
            target.unread = 0
            if (type === 'group') target.mentioned = false
          }
          notifications.updateBadgeCount()
          persistence.ensureConvoMessages(type, id)
          if (isWeb) {
            polling.webExhausted?.delete((type === 'group' ? 'g:' : 'u:') + id)
            polling.loadConversationLite?.(type, id)
          }
        }
      })
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      window.addEventListener('focus', notifications.clearPendingNotifications)
      if (window.api.onAndroidBack) unsubscribeAndroidBack = window.api.onAndroidBack(onAndroidBack)
      if (typeof window.api.onToolSendImage === 'function') {
        unsubscribeToolSendImage = window.api.onToolSendImage((payload) => {
          if (typeof onToolSendImage === 'function') onToolSendImage(payload)
          else dispatchToolSendImage(payload)
        })
      }
      if (typeof window.api.onToolUsersRequest === 'function') {
        unsubscribeToolUsersReq = window.api.onToolUsersRequest((payload) => {
          const reqId = payload && typeof payload === 'object' ? payload.reqId : payload
          if (reqId == null || typeof window.api.replyToolUsers !== 'function') return
          try {
            const snapshot = JSON.parse(JSON.stringify({
              users: store.users || {},
              usersJson: usersJson || {},
              ranklistOrder: ranklistOrder || [],
            }))
            window.api.replyToolUsers(reqId, snapshot)
          } catch {
            window.api.replyToolUsers(reqId, { users: {}, usersJson: {}, ranklistOrder: [] })
          }
        })
      }
      unsubscribeFlush = window.api.onAppFlushBeforeClose(async () => {
        try { await persistence.flushData() } catch (e) { console.error('[flush] 退出落盘失败:', e) }
        finally { window.api.appFlushDone() }
      })

      if (!store.logined) {
        store.online = true
        store.netError = false
        if (store.connStatus) {
          store.connStatus.online = true
          store.connStatus.state = 'ok'
        }
        bindGlobalListeners()
        return
      }

      // 离线/冷启动先加载本地缓存并立即解锁主界面，再异步后台联网同步（断网不覆写已有本地会话）
      await persistence.loadData()
      notifications.updateBadgeCount()
      store.initializing = false
      nextTick(() => messageListRef.value?.scrollToBottomInstant({ respectUser: true }))
      bindGlobalListeners()

      ;(async () => {
        let initialInfo = null
        try {
          const t0 = Date.now()
          const infoRes = await safeFetch('/chat/info')
          initialInfo = await infoRes.json()
          const latencyMs = Date.now() - t0
          if (unmounted) return
          if (initialInfo && initialInfo._html) {
            store.netError = true
            if (store.connStatus) {
              store.connStatus.apiReachable = true
              store.connStatus.sessionValid = false
              store.connStatus.latencyMs = latencyMs
              store.connStatus.state = 'reconnecting'
              store.connStatus.lastError = '登录会话已失效'
            }
            if (isWeb) { banners.gotoLogin(); return }
          } else if (initialInfo && initialInfo.success) {
            Object.assign(store.self, {
              uid: initialInfo.user.id,
              username: initialInfo.user.uid,
              nickname: initialInfo.user.nickname,
              realname: initialInfo.user.real_name,
            })
            await persistence.loadData()
            if (store.connStatus) {
              store.connStatus.online = true
              store.connStatus.apiReachable = true
              store.connStatus.sessionValid = true
              store.connStatus.latencyMs = latencyMs
              store.connStatus.lastInfoAt = Date.now()
              store.connStatus.state = 'ok'
              store.connStatus.lastError = ''
            }
          } else {
            store.netError = true
            if (store.connStatus) {
              store.connStatus.apiReachable = !initialInfo?._netError
              store.connStatus.online = navigator.onLine
              store.connStatus.state = navigator.onLine ? 'reconnecting' : 'offline'
              store.connStatus.lastError = initialInfo?.err?.message || '连接服务器失败'
            }
          }
          notifications.updateBadgeCount()
        } catch (e) {
          store.netError = true
          if (store.connStatus) {
            store.connStatus.apiReachable = false
            store.connStatus.online = navigator.onLine
            store.connStatus.state = navigator.onLine ? 'reconnecting' : 'offline'
            store.connStatus.lastError = (e && e.message) || '网络错误'
          }
        }
        if (store.logined && !unmounted) {
          polling.startInfoLoop(initialInfo)
        }
      })()
    } finally {
      store.initializing = false
    }
  })

  onUnmounted(() => {
    unmounted = true
    polling.stopPolling()
    if (autoSaveTimer) clearInterval(autoSaveTimer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('focus', notifications.clearPendingNotifications)
    if (unsubscribeNotifClick) unsubscribeNotifClick()
    if (unsubscribeFlush) unsubscribeFlush()
    if (unsubscribeAndroidBack) unsubscribeAndroidBack()
    if (unsubscribeToolSendImage) unsubscribeToolSendImage()
    if (unsubscribeToolUsersReq) unsubscribeToolUsersReq()
  })

  return {
    onSettingChange,
  }
}
