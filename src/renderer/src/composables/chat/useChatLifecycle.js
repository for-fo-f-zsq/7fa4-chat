import { nextTick, onMounted, onUnmounted } from 'vue'
import { store, updateConnStatus, flushConnStatusHistory } from '../../store.js'
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
    updateConnStatus({
      online: true,
      state: store.connStatus?.state === 'offline' ? 'reconnecting' : (store.connStatus?.state || 'ok'),
    }, { sample: true, title: '网络已恢复' })
    polling.wakePoll()
  }

  function onOffline() {
    store.online = false
    updateConnStatus({
      online: false,
      apiReachable: false,
      state: 'offline',
      lastError: '本地网络已断开',
    }, { sample: 'force', title: '本地网络已断开' })
  }

  /** 三端 save-setting 的返回口径不同（桌面裸布尔 / web {success} / 抛异常），统一成一句结论 */
  function saveSettingOk(r) {
    if (r === false) return false
    if (r && typeof r === 'object' && r.success === false) return false
    return true
  }

  async function onSettingChange(changes) {
    if (changes._clearCache) { polling.clearCacheAndReload(); return }
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
    if (apiUrlChanged) {
      polling.resetInfoTimestamp()
      polling.wakePoll()
    }
  }

  onMounted(async () => {
    let pollingStarted = false
    store.initializing = true
    try {
      setting.value = (await window.api.loadSetting()) || {}
      store.setting = setting.value
      if (setting.value.fontSize) applyFontSize(setting.value.fontSize)
      store.online = navigator.onLine
      updateConnStatus({
        online: store.online,
        state: store.online ? 'connecting' : 'offline',
      }, { sample: true, title: store.online ? '应用启动，准备连接' : '应用启动（当前离线）' })
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
        try {
          flushConnStatusHistory()
          await persistence.flushData()
        } catch (e) { console.error('[flush] 退出落盘失败:', e) }
        finally { window.api.appFlushDone() }
      })

      if (!store.logined) {
        store.online = true
        store.netError = false
        updateConnStatus({ online: true, state: 'ok' })
        bindGlobalListeners()
        return
      }

      await persistence.loadData()
      notifications.updateBadgeCount()
      nextTick(() => messageListRef.value?.scrollToBottomInstant({ respectUser: true }))

      let initialInfo = null
      try {
        const t0 = Date.now()
        const infoRes = await safeFetch('/chat/info')
        initialInfo = await infoRes.json()
        const latencyMs = Date.now() - t0
        if (unmounted) return
        if (initialInfo && initialInfo._html) {
          store.netError = true
          updateConnStatus({
            apiReachable: true,
            sessionValid: false,
            latencyMs,
            state: 'reconnecting',
            lastError: '登录会话已失效',
          }, { sample: 'force' })
          if (isWeb) { banners.gotoLogin(); return }
        } else if (initialInfo && initialInfo.success) {
          Object.assign(store.self, {
            uid: initialInfo.user.id,
            username: initialInfo.user.uid,
            nickname: initialInfo.user.nickname,
            realname: initialInfo.user.real_name,
          })
          await persistence.loadData()
          updateConnStatus({
            online: true,
            apiReachable: true,
            sessionValid: true,
            latencyMs,
            lastInfoAt: Date.now(),
            state: 'ok',
            lastError: '',
          }, { sample: 'force', forceEvent: true, title: '首次连接成功' })
        } else {
          store.netError = true
          updateConnStatus({
            apiReachable: !initialInfo?._netError,
            online: navigator.onLine,
            state: navigator.onLine ? 'reconnecting' : 'offline',
            lastError: initialInfo?.err?.message || '连接服务器失败',
          }, { sample: 'force' })
        }
        notifications.updateBadgeCount()
        nextTick(() => messageListRef.value?.scrollToBottomInstant({ respectUser: true }))
      } catch (e) {
        store.netError = true
        updateConnStatus({
          apiReachable: false,
          online: navigator.onLine,
          state: navigator.onLine ? 'reconnecting' : 'offline',
          lastError: (e && e.message) || '网络错误',
        }, { sample: 'force' })
      }
      if (store.logined && !unmounted) {
        pollingStarted = true
        polling.startInfoLoop(initialInfo)
      }
      bindGlobalListeners()
    } finally {
      if (!pollingStarted) store.initializing = false
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
