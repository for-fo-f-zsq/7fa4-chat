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
    if (navPageType.value === 'settings' || navPageType.value === 'about') return true
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

  /**
   * 搜索面板打开时，把当前会话剩下的本地历史分页补进内存。
   * 原因：会话内/全局搜索都是**纯内存**过滤（useMessageSearch 直接遍历 store.messages），
   * 首屏只加载 50 条后，若不补拉，「打开会话直接搜」会比以前（1000 条）少搜到很多旧消息。
   * 不在会话打开时做这件事——那正是要消掉的「点会话卡一下」；
   * 放到空闲时段、按 200 条一页、切会话/关面板即停。
   */
  let hydrateSeq = 0

  async function hydrateCurrentConvo() {
    const seq = ++hydrateSeq
    const kind = convoKindOf(pageType.value)
    const cid = pageId.value
    if (cid == null) return
    const { persistence } = getDeps()
    if (!persistence?.loadOlderFromStore) return
    const idle = () => new Promise((resolve) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 1500 })
      else setTimeout(resolve, 120)
    })
    let guard = 0
    while (guard++ < 40) {
      if (seq !== hydrateSeq) return
      if (convoKindOf(pageType.value) !== kind || String(pageId.value) !== String(cid)) return
      if (!hasUnloadedLocal(kind, cid)) return
      await idle()
      if (seq !== hydrateSeq) return
      const r = await persistence.loadOlderFromStore(kind, cid, 200)
      if (!r || !r.loaded) return
    }
  }

  function toggleSearch() {
    searchVisible.value = !searchVisible.value
    if (searchVisible.value) hydrateCurrentConvo()
  }

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

  function clearConvoUnread(type, id) {
    if (type === 'user') {
      const user = store.users?.[id]
      if (user) user.unread = 0
    } else if (type === 'group') {
      const group = store.groups?.[id]
      if (group) {
        group.unread = 0
        group.mentioned = false
      }
    }
    getDeps().notifications?.updateBadgeCount?.()
  }

  function onOpenTool(tool) {
    if (tool && tool.remote && typeof window !== 'undefined' && typeof window.api?.openToolWindow === 'function') {
      window.api.openToolWindow({
        id: tool.id,
        name: tool.name || tool.id,
        url: tool.url || '',
        version: tool.version || '',
      })
      return
    }
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
    clearConvoUnread(type, id)
    const { persistence, polling } = getDeps()
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

  // ===== 本地历史翻页（桌面端）=====
  // 首次打开会话只从本地库取最新 ENSURE_LIMIT 条，更早的历史按页补拉：
  // storeLoadMessages 支持 send_time 游标（before），但此前全仓没有调用者，
  // 库里的旧消息永远进不了内存。这里把「上滑到底」和「搜索跳转旧消息」两条路接上。
  let olderLoading = false

  function convoKindOf(type) {
    return type === 'group' ? 'group' : 'user'
  }

  function hasUnloadedLocal(kind, cid) {
    const target = kind === 'group' ? store.groups?.[cid] : store.users?.[cid]
    if (!target || !Array.isArray(target.message_ids)) return false
    for (const mid of target.message_ids) {
      if (!store.messages[mid]) return true
    }
    return false
  }

  /** 一直翻到「目标消息已进内存」或「库里没有了」为止（搜索跳转旧消息用） */
  async function ensureMessageLoaded(kind, cid, msgId, maxPages = 40) {
    const { persistence } = getDeps()
    if (!persistence?.loadOlderFromStore) return !!store.messages[msgId]
    let guard = 0
    while (!store.messages[msgId] && hasUnloadedLocal(kind, cid) && guard++ < maxPages) {
      const r = await persistence.loadOlderFromStore(kind, cid, 200)
      if (!r || !r.loaded) break
    }
    return !!store.messages[msgId]
  }

  /** 把本地库里该会话剩下的历史全部拉进内存（搜索「加载全部」/ 跳转最旧消息用） */
  async function ensureAllLocal(kind, cid, maxPages = 40) {
    const { persistence } = getDeps()
    if (!persistence?.loadOlderFromStore) return
    let guard = 0
    while (hasUnloadedLocal(kind, cid) && guard++ < maxPages) {
      const r = await persistence.loadOlderFromStore(kind, cid, 500)
      if (!r || !r.loaded) break
    }
  }

  // 「取回 0 条」兜底：库里可能存在不在 message_ids 里的孤儿行，或 message_ids 被服务端
  // 重建后变短，导致 before 游标不动、每次上滑都取回同一批（batch 里已存在 → loaded=0）。
  // 第一次无进展先记一笔，下一次上滑直接把内存里的都算作可见并停手（不再打 IPC）。
  const olderStall = new Set()

  async function loadOlderPage(kind, forPage, height) {
    if (olderLoading) return
    const stallKey = kind + ':' + forPage
    if (olderStall.has(stallKey)) {
      const len = getCurrentMessagesLength()
      if (len > 0) visibleCount.value = len
      return
    }
    olderLoading = true
    try {
      const { persistence } = getDeps()
      const r = await persistence?.loadOlderFromStore?.(kind, forPage, 50)
      if (!r || !r.loaded) {
        // 库里确实没有了，或本次一条都没新进内存 → 记为停摆，下次上滑不再请求
        olderStall.add(stallKey)
        if (!r || r.exhausted) {
          const len = getCurrentMessagesLength()
          if (len > 0) visibleCount.value = len
        }
        return
      }
      olderStall.delete(stallKey)
      // 切了会话就丢弃这一页的滚动锚定（数据照常留在 store 里）
      if (convoKindOf(pageType.value) !== kind || String(pageId.value) !== String(forPage)) return
      visibleCount.value += r.loaded
      const el = messageListRef.value?.messageAreaEl
      if (!el) return
      nextTick(() => {
        // 与原有桌面端翻页同一口径：以插入前的高度为锚，保持当前视口内容不动
        const target = el.scrollHeight - height
        const nextTop = target > 0 ? target : 0
        if (messageListRef.value?.setScrollTopProgrammatic) messageListRef.value.setScrollTopProgrammatic(nextTop)
        else el.scrollTop = nextTop
      })
    } finally {
      olderLoading = false
    }
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
    if (loadAll) {
      // 搜索跳转/「加载全部」：先把本地库里还没进内存的历史补齐，再一次性放出
      const kind = convoKindOf(pageType.value)
      const forPage = pageId.value
      if (hasUnloadedLocal(kind, forPage)) {
        ensureAllLocal(kind, forPage).then(() => {
          if (convoKindOf(pageType.value) !== kind || String(pageId.value) !== String(forPage)) return
          visibleCount.value = getCurrentMessagesLength()
        })
        return
      }
      visibleCount.value = totalLen
      return
    }
    if (visibleCount.value >= totalLen) {
      // 已加载的都放出来了，但库里还有更早的：按页补拉（防重入）
      const kind = convoKindOf(pageType.value)
      const forPage = pageId.value
      if (hasUnloadedLocal(kind, forPage)) loadOlderPage(kind, forPage, height)
      return
    }
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

  /** 目标消息不在内存里（早于本地首屏窗口）时先补拉，再跳转 */
  async function jumpWhenLoaded(msgId, kind, cid) {
    if (msgId == null) return
    const { persistence } = getDeps()
    if (!store.messages[msgId]) {
      try { await persistence?.ensureConvoMessages?.(kind, cid) } catch {}
      if (!store.messages[msgId]) {
        const ok = await ensureMessageLoaded(kind, cid, msgId)
        if (!ok) return
      }
    }
    if (convoKindOf(pageType.value) !== kind || String(pageId.value) !== String(cid)) return
    pendingJumpMsgId = null
    messageListRef.value?.jumpToMessage(msgId)
  }

  function onSearchJump(data) {
    if (typeof data === 'object' && data.convoType) {
      clearConvoUnread(data.convoType, data.convoId)
      if (`${data.convoType}:${data.convoId}` === chatKey.value) {
        if (data.msgId != null && !store.messages[data.msgId]) {
          jumpWhenLoaded(data.msgId, convoKindOf(data.convoType), data.convoId)
        } else {
          messageListRef.value?.jumpToMessage(data.msgId)
        }
        return
      }
      pageType.value = data.convoType
      pageId.value = data.convoId
      pendingJumpMsgId = data.msgId
      const { persistence, polling } = getDeps()
      persistence?.ensureConvoMessages?.(data.convoType, data.convoId)
      // 目标消息可能比本地首屏窗口更早：补拉到位后再跳（若 onChatMainEnter 已跳空，这里兜底再跳一次）
      if (data.msgId != null && !store.messages[data.msgId]) {
        jumpWhenLoaded(data.msgId, convoKindOf(data.convoType), data.convoId)
      }
      if (isWeb) {
        polling?.webExhausted?.delete((data.convoType === 'group' ? 'g:' : 'u:') + data.convoId)
        polling?.loadConversationLite?.(data.convoType, data.convoId)
      }
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
