import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'

const DEFAULT_SHORTCUTS = {
  sendMessage: 'enter',
  search: 'ctrl+f',
  switchToChat: 'ctrl+1',
  switchToTools: 'ctrl+2',
  switchToSettings: 'ctrl+3',
  switchToAbout: 'ctrl+4',
  newConversation: 'ctrl+n',
}

function parseShortcut(shortcut) {
  const parts = shortcut.toLowerCase().split('+')
  return {
    ctrl: parts.includes('ctrl'),
    meta: parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.filter((p) => !['ctrl', 'meta', 'shift', 'alt'].includes(p))[0] || '',
  }
}

function matchShortcut(e, shortcut) {
  const s = parseShortcut(shortcut)
  return (
    e.ctrlKey === s.ctrl &&
    e.metaKey === s.meta &&
    e.shiftKey === s.shift &&
    e.altKey === s.alt &&
    e.key.toLowerCase() === s.key
  )
}

/**
 * 全局快捷键、Esc 逐层关闭、外部点击收起、鼠标位置记忆及 Android 返回键/新手引导桥接。
 */
export function useGlobalShortcuts({
  getSetting,
  isChatPage,
  getHasActiveConvo,
  getNavPageType,
  searchVisible,
  searchPanelRef,
  conversationListRef,
  inputFooterRef,
  messageListRef,
  forwardModalVisible,
  groupModal,
  shortcutModal,
  targetMenu,
  previewData,
  showAddFriendModal,
  switchPage,
  onBackFromChat,
  onOpenUserFromOnboarding,
}) {
  const isWeb = isWebBrowser()
  const lastMouseX = ref(0)
  const lastMouseY = ref(0)

  function getShortcutValue(action) {
    return getSetting()?.shortcuts?.[action] || DEFAULT_SHORTCUTS[action]
  }

  function handleGlobalShortcuts(e) {
    if (matchShortcut(e, getShortcutValue('search'))) {
      e.preventDefault()
      const activeEl = document.activeElement
      if (activeEl?.closest?.('.list-search') || activeEl?.classList.contains('list-search-input')) {
        if (isChatPage.value) {
          if (!searchVisible.value) searchVisible.value = true
          nextTick(() => searchPanelRef.value?.focusInput())
        }
      } else if (activeEl?.classList.contains('search-input') || activeEl?.closest?.('.search-bar')) {
        conversationListRef.value?.focusSearch()
      } else if (forwardModalVisible.value) {
      } else if (groupModal.show) {
        document.dispatchEvent(new CustomEvent('focus-group-search'))
      } else if (inputFooterRef.value?.emojiVisible) {
        document.dispatchEvent(new CustomEvent('focus-emoji-search'))
      } else {
        const mouseTarget = document.elementFromPoint(lastMouseX.value, lastMouseY.value)
        const inChatArea = mouseTarget?.closest('.chat-main')
        if (inChatArea) {
          if (isChatPage.value) {
            if (!searchVisible.value) searchVisible.value = true
            nextTick(() => searchPanelRef.value?.focusInput())
          }
        } else if (searchVisible.value) {
          searchPanelRef.value?.focusInput()
        } else if (isChatPage.value) {
          conversationListRef.value?.focusSearch()
        }
      }
      return true
    }
    if (matchShortcut(e, getShortcutValue('switchToChat'))) { e.preventDefault(); switchPage('chat'); return true }
    if (!isWeb && matchShortcut(e, getShortcutValue('switchToTools'))) { e.preventDefault(); switchPage('tools'); return true }
    if (matchShortcut(e, getShortcutValue('switchToSettings'))) { e.preventDefault(); switchPage('settings'); return true }
    if (matchShortcut(e, getShortcutValue('switchToAbout'))) { e.preventDefault(); switchPage('about'); return true }
    if (matchShortcut(e, getShortcutValue('newConversation'))) { e.preventDefault(); showAddFriendModal.value = true; return true }
    return false
  }

  function onDocKeydown(e) {
    if (!isWeb && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')))) {
      e.preventDefault()
      return
    }
    if (handleGlobalShortcuts(e)) return
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isChatPage.value) {
      const tag = document.activeElement?.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.activeElement?.isContentEditable) {
        e.preventDefault()
        conversationListRef.value?.navigateConversation(e.key === 'ArrowUp' ? -1 : 1)
        return
      }
    }
    if (e.key === 'Escape') {
      if (store.multiSelectMode) { messageListRef.value?.exitMultiSelect(); return }
      if (shortcutModal.value) { shortcutModal.value = false; return }
      if (inputFooterRef.value?.emojiVisible) { inputFooterRef.value.emojiVisible = false; return }
      if (inputFooterRef.value?.mentionVisible) { inputFooterRef.value.mentionVisible = false; return }
      if (targetMenu.show) { targetMenu.show = false; return }
      if (messageListRef.value?.msgCtx?.show) { messageListRef.value.msgCtx.show = false; return }
      if (previewData.show) { previewData.show = false; return }
      if (forwardModalVisible.value) { forwardModalVisible.value = false; return }
      if (groupModal.show) { groupModal.show = false; return }
      if (inputFooterRef.value?.replyTo) { inputFooterRef.value.replyTo = null; return }
    }
  }

  function onDocClick(e) {
    if (!e.target.closest('.context-menu') && !e.target.closest('.ui-menu')) targetMenu.show = false
    if (!e.target.closest('.msg-ctx') && !e.target.closest('.ui-menu') && messageListRef.value) {
      messageListRef.value.msgCtx.show = false
    }
    if (!e.target.closest('.emoji-picker') && !e.target.closest('#emoji_btn')) {
      if (inputFooterRef.value?.emojiVisible) inputFooterRef.value.emojiVisible = false
    }
  }

  function onMouseMove(e) {
    lastMouseX.value = e.clientX
    lastMouseY.value = e.clientY
  }

  function onAndroidBack() {
    if (getHasActiveConvo()) { onBackFromChat(); return }
    if (getNavPageType() !== 'chat') { switchPage('chat'); return }
    window.api.androidExit?.()
  }

  function onOnboardingAction(e) {
    const d = e.detail || {}
    if (d.action === 'openUser' && d.id) onOpenUserFromOnboarding(Number(d.id))
    else if (d.action === 'switch' && d.page) switchPage(d.page)
  }

  let listenersActive = false
  function bindGlobalListeners() {
    if (listenersActive) return
    listenersActive = true
    document.addEventListener('keydown', onDocKeydown)
    document.addEventListener('click', onDocClick)
    document.addEventListener('mousemove', onMouseMove)
  }

  onMounted(() => {
    window.addEventListener('onboarding-action', onOnboardingAction)
  })

  onUnmounted(() => {
    window.removeEventListener('onboarding-action', onOnboardingAction)
    if (listenersActive) {
      document.removeEventListener('keydown', onDocKeydown)
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('mousemove', onMouseMove)
      listenersActive = false
    }
  })

  return {
    bindGlobalListeners,
    onAndroidBack,
  }
}
