import { ref, watch } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils.js'
import { THEMES } from '../constants.js'
import { useCurrentMessages } from '../useCurrentMessages.js'
import { useNarrow } from '../useNarrow.js'
import { useSplitPane } from '../useSplitPane.js'
import { useChatPersistence } from './useChatPersistence.js'
import { useNetworkBanners } from './useNetworkBanners.js'
import { useUnreadNotifications } from './useUnreadNotifications.js'
import { useGroupActions } from './useGroupActions.js'
import { usePollingSync } from './usePollingSync.js'
import { useChatActions } from './useChatActions.js'
import { useGlobalShortcuts } from './useGlobalShortcuts.js'
import { useChatNavigation } from './useChatNavigation.js'
import { useChatLifecycle } from './useChatLifecycle.js'
import { useChatModals } from './useChatModals.js'

/**
 * ChatView 工作区编排：统一装配状态、导航、轮询、动作、快捷键与生命周期。
 */
export function useChatWorkspace({
  messageListRef,
  inputFooterRef,
  conversationListRef,
  searchPanelRef,
  modalHostRef,
}) {
  const isWeb = isWebBrowser()
  const allThemes = THEMES.map((t) => t.value)
  const setting = ref({})
  const version = ref('')

  const modals = useChatModals()
  const { isNarrow: isNarrowLayout } = useNarrow()
  const { size: listWidth, startResize: startListResize } = useSplitPane({ initial: 260, min: 180, max: 500 })

  const persistence = useChatPersistence()
  const banners = useNetworkBanners()
  const notifications = useUnreadNotifications({ saveAll: persistence.saveAll })

  let polling = null
  const nav = useChatNavigation({
    isWeb,
    isNarrowLayout,
    inputFooterRef,
    messageListRef,
    groupModal: modals.modalState.groupModal,
    showCreateGroupModal: modals.showCreateGroupModal,
    showAddFriendModal: modals.showAddFriendModal,
    addFriendInitialQuery: modals.addFriendInitialQuery,
    getCurrentMessagesLength: () => currentMessagesLength.value,
    getDeps: () => ({ persistence, polling, notifications, banners }),
  })

  const { currentMessages, currentMessagesLength } = useCurrentMessages(nav.pageType, nav.pageId)

  const groupActions = useGroupActions({
    getActiveGroupId: () => modals.modalState.groupModal.groupId || nav.pageId.value,
    onCloseGroupModal: () => { modals.modalState.groupModal.show = false },
    onSelectConversation: nav.onSelectConversation,
    onOpenUserInfo: modals.openUserInfo,
    onRefreshInfo: () => polling?.refreshInfo(),
  })

  polling = usePollingSync({
    getPage: () => ({ pageType: nav.pageType.value, pageId: nav.pageId.value }),
    getSetting: () => setting.value,
    isChatPage: () => nav.isChatPage.value,
    persistence,
    banners,
    notifications,
    postGroup: (...args) => groupActions.postGroup(...args),
    onTokenInfo: (tokenInfo) => {
      if (tokenInfo && inputFooterRef.value) inputFooterRef.value.tokenInfo = tokenInfo
    },
  })

  watch(() => (store.logined && store.self.uid) || false, (ready) => {
    if (ready) persistence.loadData()
  }, { immediate: true })

  const chatActions = useChatActions({
    getPage: () => ({ pageType: nav.pageType.value, pageId: nav.pageId.value }),
    getInputFooter: () => inputFooterRef.value,
    onExitMultiSelect: () => messageListRef.value?.exitMultiSelect(),
  })
  chatActions.forwardModalRef.value = { focus: () => modalHostRef.value?.focusForward?.() }

  const { bindGlobalListeners, onAndroidBack } = useGlobalShortcuts({
    getSetting: () => setting.value,
    isChatPage: nav.isChatPage,
    getHasActiveConvo: () => nav.isChatPage.value && nav.pageId.value != null,
    getNavPageType: () => nav.navPageType.value,
    searchVisible: nav.searchVisible,
    searchPanelRef,
    conversationListRef,
    inputFooterRef,
    messageListRef,
    forwardModalVisible: chatActions.forwardModalVisible,
    groupModal: modals.modalState.groupModal,
    shortcutModal: modals.shortcutModal,
    targetMenu: modals.modalState.targetMenu,
    previewData: chatActions.previewData,
    showAddFriendModal: modals.showAddFriendModal,
    switchPage: nav.switchPage,
    onBackFromChat: nav.onBackFromChat,
    onOpenUserFromOnboarding: nav.openUserFromOnboarding,
  })

  const { onSettingChange } = useChatLifecycle({
    isWeb,
    setting,
    version,
    pageType: nav.pageType,
    pageId: nav.pageId,
    messageListRef,
    persistence,
    banners,
    notifications,
    polling,
    bindGlobalListeners,
    onAndroidBack,
  })

  function startReply(msg) { inputFooterRef.value?.startReply(msg) }
  function onNewConversationFromList(type) { if (type === 'group') modals.showCreateGroupModal.value = true }

  async function onUserAction(kind) {
    if (kind === 'logout' && store.logined) { await polling.logout(false, true); return }
    if (kind === 'relogin' && store.logined) { await polling.logout(true, false); return }
    if (kind === 'login') { store.guestMode = false; store.logined = false }
  }

  function onTargetMenuAction({ kind, type, id, isUnread }) {
    if (kind === 'leavegroup') groupActions.leaveGroupFromMenu(id)
    else if (kind === 'blockgroup') groupActions.blockGroupFromMenu(id)
    else if (kind === 'unblockgroup') groupActions.unblockGroupFromMenu(id)
    else if (kind === 'dissolvegroup') groupActions.dissolveGroupFromMenu(id)
    else if (kind === 'togglehidden') notifications.toggleHiddenConvo(type, id)
    else if (kind === 'mute') notifications.toggleMute(type, id)
    else if (kind === 'read') notifications.toggleRead(type, id, isUnread)
  }

  return {
    isWeb,
    allThemes,
    setting,
    version,
    isNarrowLayout,
    listWidth,
    startListResize,
    currentMessages,
    canLoadOlder: polling.canLoadOlder,
    markAllRead: notifications.markAllRead,
    banners,
    nav,
    modals,
    groupActions,
    chatActions,
    onSettingChange,
    startReply,
    onNewConversationFromList,
    onUserAction,
    onTargetMenuAction,
  }
}
