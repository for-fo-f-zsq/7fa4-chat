import { nextTick, onMounted, onUnmounted } from 'vue'
import { store } from '../../store.js'
import { applyFontSize, safeFetch } from '../../utils.js'
import { showToast } from '../useToast.js'
import { ALLOWED_THEME_VARS, isValidThemeVarValue } from '../modals/useThemeEditor.js'

/**
 * ChatView 生命周期装配：设置加载、主题应用、系统事件监听、首屏拉取与退出落盘。
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
}) {
  let autoSaveTimer = null
  let unsubscribeNotifClick = null
  let unsubscribeFlush = null
  let unsubscribeAndroidBack = null

  function onOnline() {
    store.online = true
    polling.wakePoll()
  }

  function onOffline() {
    store.online = false
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
    store.initializing = true
    let pollingStarted = false
    try {
      setting.value = (await window.api.loadSetting()) || {}
      store.setting = setting.value
      if (setting.value.fontSize) applyFontSize(setting.value.fontSize)
      store.online = navigator.onLine
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
        if (data.chatType && data.targetId) {
          pageType.value = data.chatType
          pageId.value = Number(data.targetId)
        }
      })
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      window.addEventListener('focus', notifications.clearPendingNotifications)
      if (window.api.onAndroidBack) unsubscribeAndroidBack = window.api.onAndroidBack(onAndroidBack)
      unsubscribeFlush = window.api.onAppFlushBeforeClose(async () => {
        try { await persistence.flushData() } catch (e) { console.error('[flush] 退出落盘失败:', e) }
        finally { window.api.appFlushDone() }
      })

      if (!store.logined) {
        store.online = true
        store.netError = false
        bindGlobalListeners()
        return
      }

      if (!isWeb && !store.self.uid) {
        try {
          const cachedSelf = JSON.parse(localStorage.getItem('7fa4_self') || 'null')
          if (cachedSelf && cachedSelf.uid) Object.assign(store.self, cachedSelf)
        } catch {}
      }
      await persistence.loadData()

      let initialInfo = null
      try {
        const infoRes = await safeFetch('/chat/info')
        initialInfo = await infoRes.json()
        if (initialInfo && initialInfo._html) {
          store.netError = true
          if (isWeb) { banners.gotoLogin(); return }
        }
        if (initialInfo && initialInfo.success) {
          Object.assign(store.self, {
            uid: initialInfo.user.id,
            username: initialInfo.user.uid,
            nickname: initialInfo.user.nickname,
            realname: initialInfo.user.real_name,
          })
          await persistence.loadData()
        } else {
          store.netError = true
        }
        notifications.updateBadgeCount()
        nextTick(() => messageListRef.value?.scrollToBottomInstant({ respectUser: true }))
      } catch {
        store.netError = true
      }
      if (store.logined) {
        pollingStarted = true
        polling.startInfoLoop(initialInfo)
      }
      bindGlobalListeners()
    } finally {
      if (!pollingStarted) store.initializing = false
    }
  })

  onUnmounted(() => {
    polling.stopPolling()
    if (autoSaveTimer) clearInterval(autoSaveTimer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('focus', notifications.clearPendingNotifications)
    if (unsubscribeNotifClick) unsubscribeNotifClick()
    if (unsubscribeFlush) unsubscribeFlush()
    if (unsubscribeAndroidBack) unsubscribeAndroidBack()
  })

  return {
    onSettingChange,
  }
}
