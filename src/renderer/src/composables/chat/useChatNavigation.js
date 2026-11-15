import { computed, nextTick, reactive, ref, watch } from 'vue'
import { store } from '../../store.js'

/**
 * 主工作区页面/会话导航、搜索跳转与历史消息分页滚动锚定。
 */
export function useChatNavigation({
  isWeb,
  isNarrowLayout,
  inputFooterRef,
  messageListRef,
  groupModal,
  showCreateGroupModal,
  showAddFriendModal,
  addFriendInitialQuery,
  getCurrentMessagesLength,
  getDeps,
}) {
  const pageType = ref('chat')
  const pageId = ref(null)
  const currentTool = ref('list')
  const searchVisible = ref(false)
  const expandedMsgs = reactive({})
  const visibleCount = ref(20)

  let toolOrigin = { type: 'list' }
  let pendingJumpMsgId = null

  const isChatPage = computed(() => pageType.value === 'chat' || pageType.value === 'user' || pageType.value === 'group')
  const navPageType = computed(() => (isChatPage.value ? 'chat' : pageType.value))

  const showNavBar = computed(() => {
    if (!isNarrowLayout.value) return true
    if (isChatPage.value && pageId.value) return false
    if (navPageType.value === 'tools') return currentTool.value === 'list'
    if (navPageType.value === 'settings') return true
    return navPageType.value === 'chat'
  })

  const pageStageKey = computed(() => {
    if (isChatPage.value) return 'chat'
    if (pageType.value === 'tools') {
      const tool = currentTool.value
      if (typeof tool === 'string') return 'tools:' + tool
      return 'tools:remote-' + (tool?.id ?? tool?.name ?? 'unknown')
    }
    return pageType.value
  })

  const chatKey = computed(() => `${pageType.value}:${pageId.value}`)

  watch(() => store.logined, (logged) => {
    if (!logged && isChatPage.value) {
      pageType.value = 'about'
      pageId.value = null
    }
  }, { immediate: true })

  const targetUser = computed(() => store.users?.[pageId.value] || null)
  const targetGroup = computed(() => store.groups?.[pageId.value] || null)

  const watchWarnText = computed(() => {
    if (pageType.value !== 'user') return ''
    const u = targetUser.value
    if (u && u.watchee === true && u.watcher !== true) return '对方没有关注你，无法给对方发消息'
    return ''
  })

  const inputDisabled = computed(() => {
    if (pageType.value === 'user') return !targetUser.value?.watcher
    if (pageType.value === 'group') return !!targetGroup.value?.exited
    return false
  })

  function closeSearch() { searchVisible.value = false }
  function toggleSearch() { searchVisible.value = !searchVisible.value }

  function clearFooterTransient() {
    if (!inputFooterRef.value) return
    inputFooterRef.value.mentionVisible = false
    inputFooterRef.value.emojiVisible = false
  }

  function switchPage(type) {
    if (!store.logined && type === 'chat') return
    if (type === 'tools') {
      if (isWeb) return
      if (pageType.value === 'tools') {
        if (currentTool.value !== 'list') { currentTool.value = 'list'; toolOrigin = { type: 'list' } }
        return
      }
      groupModal.show = false
      pageType.value = 'tools'
      pageId.value = null
      currentTool.value = 'list'
      toolOrigin = { type: 'list' }
      clearFooterTransient()
      closeSearch()
      return
    }
    if (pageType.value === type) return
    if (type === 'chat' && isChatPage.value) return
    groupModal.show = false
    pageType.value = type
    pageId.value = null
    clearFooterTransient()
    closeSearch()
  }

  function backToChatList() {
    if (!store.logined) {
      if (isWeb) { getDeps().banners.gotoLogin(); return }
      switchPage('tools')
      return
    }
    switchPage('chat')
  }

  function onBackFromChat() {
    if (pageId.value == null) return
    pageId.value = null
    pageType.value = 'chat'
    clearFooterTransient()
    closeSearch()
    getDeps().notifications.updateBadgeCount()
  }

  function onOpenTool(tool) {
    toolOrigin = { type: 'list' }
    currentTool.value = tool
  }

  function onToolBack() {
    if (toolOrigin.type === 'chat' && toolOrigin.pageId != null) {
      onSelectConversation({ type: toolOrigin.pageType, id: toolOrigin.pageId })
    } else {
      currentTool.value = 'list'
    }
    toolOrigin = { type: 'list' }
  }

  function onSelectConversation({ type, id }) {
    if (id === '__new__') {
      if (type === 'group') showCreateGroupModal.value = true
      if (type === 'user') showAddFriendModal.value = true
      return
    }
    if (pageId.value === id && (pageType.value === type || pageType.value === 'chat')) return
    pageType.value = type
    pageId.value = id
    if (inputFooterRef.value) {
      clearFooterTransient()
      inputFooterRef.value.replyTo = null
      inputFooterRef.value.errorMessage = ''
    }
    closeSearch()
    visibleCount.value = 20
    Object.keys(expandedMsgs).forEach((k) => delete expandedMsgs[k])
    if (type === 'user') {
      const user = store.users[id]
      if (user) user.unread = 0
    } else if (type === 'group') {
      const group = store.groups[id]
      if (group) { group.unread = 0; group.mentioned = false }
    }
    const { notifications, persistence, polling } = getDeps()
    notifications.updateBadgeCount()
    persistence.ensureConvoMessages(type, id)
    if (isWeb) {
      polling.webExhausted.delete((type === 'group' ? 'g:' : 'u:') + id)
      polling.loadConversationLite(type, id)
    }
  }

  function onChatMainEnter() {
    if (pendingJumpMsgId != null) {
      const msgId = pendingJumpMsgId
      pendingJumpMsgId = null
      messageListRef.value?.jumpToMessage(msgId)
      return
    }
    messageListRef.value?.scrollToBottomInstant({ respectUser: true })
  }

  function onMessageAreaScrollToTop(height, loadAll) {
    const totalLen = getCurrentMessagesLength()
    if (isWeb) {
      if (loadAll) { visibleCount.value = totalLen; return }
      const { polling } = getDeps()
      const kind = pageType.value === 'group' ? 'group' : 'user'
      const key = (kind === 'group' ? 'g:' : 'u:') + pageId.value
      if (polling.webExhausted.has(key)) { visibleCount.value = totalLen; return }
      if (polling.webLoadingOlder.has(key)) return
      polling.webLoadingOlder.add(key)
      const forPage = pageId.value
      const el = messageListRef.value?.messageAreaEl
      const anchor = el ? (() => {
        const areaTop = el.getBoundingClientRect().top
        for (const row of el.querySelectorAll('.msg-row')) {
          const r = row.getBoundingClientRect()
          if (r.bottom > areaTop + 1) return { id: row.getAttribute('data-msg-id'), top: r.top - areaTop }
        }
        return null
      })() : null
      polling.loadOlderLite(kind, forPage).then(() => {
        polling.webLoadingOlder.delete(key)
        if (pageId.value !== forPage) return
        visibleCount.value = getCurrentMessagesLength()
        if (!el || !anchor) return
        nextTick(() => {
          const row = el.querySelector('[data-msg-id="' + anchor.id + '"]')
          if (!row) return
          const delta = (row.getBoundingClientRect().top - el.getBoundingClientRect().top) - anchor.top
          const target = Math.max(0, el.scrollTop + delta)
          if (messageListRef.value?.setScrollTopProgrammatic) messageListRef.value.setScrollTopProgrammatic(target)
          else el.scrollTop = target
        })
      }, () => { polling.webLoadingOlder.delete(key) })
      return
    }
    if (loadAll) { visibleCount.value = totalLen; return }
    visibleCount.value += 20
    const el = messageListRef.value?.messageAreaEl
    if (el) {
      nextTick(() => {
        const target = el.scrollHeight - height
        const nextTop = target > 0 ? target : 0
        if (messageListRef.value?.setScrollTopProgrammatic) messageListRef.value.setScrollTopProgrammatic(nextTop)
        else el.scrollTop = nextTop
      })
    }
  }

  function onSearchJump(data) {
    if (typeof data === 'object' && data.convoType) {
      if (`${data.convoType}:${data.convoId}` === chatKey.value) {
        messageListRef.value?.jumpToMessage(data.msgId)
        return
      }
      pageType.value = data.convoType
      pageId.value = data.convoId
      pendingJumpMsgId = data.msgId
    } else {
      messageListRef.value?.jumpToMessage(data)
    }
  }

  function openUserFromOnboarding(uid) {
    if (!store.logined) { getDeps().banners.gotoLogin(); return }
    if (store.users?.[uid]) { onSelectConversation({ type: 'user', id: uid }); return }
    addFriendInitialQuery.value = String(uid)
    showAddFriendModal.value = true
  }

  return {
    pageType,
    pageId,
    currentTool,
    searchVisible,
    expandedMsgs,
    visibleCount,
    isChatPage,
    navPageType,
    showNavBar,
    pageStageKey,
    chatKey,
    targetUser,
    targetGroup,
    watchWarnText,
    inputDisabled,
    closeSearch,
    toggleSearch,
    switchPage,
    backToChatList,
    onBackFromChat,
    onOpenTool,
    onToolBack,
    onSelectConversation,
    onChatMainEnter,
    onMessageAreaScrollToTop,
    onSearchJump,
    openUserFromOnboarding,
  }
}
