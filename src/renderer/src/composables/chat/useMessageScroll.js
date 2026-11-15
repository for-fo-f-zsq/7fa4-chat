import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { scrollToY, cancelScrollToY, waitForMotion, motionDuration } from '../../utils/motion.js'
import { consumeOwnSentMsg } from '../../utils/chatSync.js'

const AT_BOTTOM_THRESHOLD = 60

/**
 * 消息列表滚动窗口、吸底跟随、上拉加载更多与定位高亮跳转。
 */
export function useMessageScroll({
  messageAreaEl,
  pageType,
  pageId,
  selfUid,
  visibleCount,
  canLoadOlder,
  currentMessages,
  targetUser,
  targetGroup,
  onLoadOlder,
  onLoadAll,
  onEnsureExpanded,
}) {
  const loadingMore = ref(false)
  const isAtBottom = ref(true)
  const pinnedGrow = ref(0)

  let loadingMoreTimer = null
  let lastMsgCount = 0
  let lastPageId = pageId()
  let pendingInitialPosition = true
  let userScrolledUp = false
  let lastTailId = null
  let scrollTimer = null
  let lastScrollTop = 0
  let programmaticSeq = 0
  let activeBottomScroll = false
  let anchorScrollGuard = false
  let lastUpGestureAt = 0
  let lastLoadOlderAt = 0
  let areaResizeObserver = null
  let childMutationObserver = null
  let observedChildren = new WeakSet()

  function abortPendingAutoScroll() {
    programmaticSeq = 0
    activeBottomScroll = false
    anchorScrollGuard = false
    if (scrollTimer) {
      clearTimeout(scrollTimer)
      scrollTimer = null
    }
    cancelScrollToY(messageAreaEl.value)
  }

  function runScrollToY(el, targetTop, duration) {
    const seq = ++programmaticSeq
    return scrollToY(el, targetTop, { duration: duration ?? motionDuration('slow') }).finally(() => {
      if (el) lastScrollTop = el.scrollTop
      if (programmaticSeq === seq) programmaticSeq = 0
    })
  }

  function markUserScrolledUp() {
    userScrolledUp = true
    pendingInitialPosition = false
    abortPendingAutoScroll()
  }

  const windowSize = computed(() => (
    canLoadOlder() === null ? visibleCount() : visibleCount() + pinnedGrow.value
  ))

  const hasOlderMessages = computed(() => {
    if (canLoadOlder() !== null) return canLoadOlder() && currentMessages.value.length > 0
    return currentMessages.value.length > windowSize.value
  })

  const visibleMessages = computed(() => {
    const all = currentMessages.value
    if (all.length <= windowSize.value) return all
    return all.slice(all.length - windowSize.value)
  })

  function snapToBottom(el) {
    if (!el) return
    el.scrollTop = el.scrollHeight
    lastScrollTop = el.scrollTop
    isAtBottom.value = true
  }

  function smoothScrollTo(el, targetTop, duration) {
    if (!el) return
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
    const resolved = Number.isFinite(targetTop) ? Math.min(targetTop, maxScroll) : maxScroll
    if (resolved <= el.scrollTop) {
      snapToBottom(el)
      return
    }
    activeBottomScroll = true
    runScrollToY(el, Number.isFinite(targetTop) ? targetTop : Infinity, duration).finally(() => {
      activeBottomScroll = false
      if (!userScrolledUp && !anchorScrollGuard) {
        snapToBottom(messageAreaEl.value)
      }
    })
  }

  function needsSnapToBottom(el) {
    if (!el) return false
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
    return maxScroll - el.scrollTop > 1 || !isAtBottom.value
  }

  function keepBottomIfPinned() {
    if (userScrolledUp || loadingMore.value || anchorScrollGuard) return
    const el = messageAreaEl.value
    if (!el) return
    if (!activeBottomScroll && needsSnapToBottom(el)) {
      snapToBottom(el)
    }
    nextTick(() => {
      if (userScrolledUp || loadingMore.value || anchorScrollGuard || activeBottomScroll) return
      const cur = messageAreaEl.value
      if (needsSnapToBottom(cur)) snapToBottom(cur)
    })
  }

  function doScrollToBottom(pageChanged, { force = false, skipBottomCheck = false } = {}) {
    if (!force && userScrolledUp) return
    abortPendingAutoScroll()
    const tryScroll = () => {
      scrollTimer = null
      nextTick(() => {
        if (!force && userScrolledUp) return
        const el = messageAreaEl.value
        if (!el) return
        if (pageChanged) {
          snapToBottom(el)
          return
        }
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD
        if (force || skipBottomCheck || atBottom) {
          smoothScrollTo(el, Infinity)
        }
      })
    }
    if (pageChanged) {
      tryScroll()
      return
    }
    scrollTimer = setTimeout(tryScroll, 10)
  }

  function onScroll() {
    const el = messageAreaEl.value
    if (!el) return
    const curTop = el.scrollTop
    const prevTop = lastScrollTop
    const scrolledUpDelta = curTop < prevTop - 1
    const scrolledDownDelta = curTop > prevTop + 2
    lastScrollTop = curTop
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
    const atBottom = maxScroll - curTop < AT_BOTTOM_THRESHOLD
    isAtBottom.value = atBottom
    if (programmaticSeq === 0) {
      const now = performance.now()
      // 仅当实际向上滚动（且非气泡收起导致的贴底高度回缩）时才锁定上滑状态，避免图片/排版撑高 scrollHeight 时误锁
      const isUpwardIntent = scrolledUpDelta && (!atBottom || maxScroll - curTop > 2)
      if (isUpwardIntent) {
        markUserScrolledUp()
      } else if (
        maxScroll > 0 &&
        scrolledDownDelta &&
        maxScroll - curTop <= 8 &&
        !loadingMore.value &&
        now - lastUpGestureAt > 200 &&
        now - lastLoadOlderAt > 300
      ) {
        // 仅当用户真正主动向下滑到底端边缘时恢复新消息吸底跟随
        userScrolledUp = false
        pinnedGrow.value = 0
      }
    }
    if (loadingMore.value && curTop > 0) {
      loadingMore.value = false
    }
    if (curTop === 0 && hasOlderMessages.value && !loadingMore.value) {
      const height = el.scrollHeight
      loadingMore.value = true
      lastLoadOlderAt = performance.now()
      onLoadOlder(height)
    }
  }

  function onWheel(e) {
    if (e.deltaY < 0) {
      lastUpGestureAt = performance.now()
      markUserScrolledUp()
    }
  }

  let touchStartY = null
  function onTouchStart(e) {
    touchStartY = e.touches?.[0]?.clientY ?? null
  }
  function onTouchMove(e) {
    const y = e.touches?.[0]?.clientY
    if (touchStartY != null && y != null && y > touchStartY + 4) {
      lastUpGestureAt = performance.now()
      markUserScrolledUp()
    }
  }
  function onPointerDown() {
    // 拖拽滚动条或点按中断正在进行的自动吸底动画
    abortPendingAutoScroll()
  }

  function onMediaLoad() {
    keepBottomIfPinned()
  }

  function observeAreaChildren(el) {
    if (!areaResizeObserver || !el || !el.children) return
    for (const child of el.children) {
      if (observedChildren.has(child)) continue
      observedChildren.add(child)
      areaResizeObserver.observe(child)
    }
  }

  watch(messageAreaEl, (el, prevEl) => {
    if (prevEl) {
      prevEl.removeEventListener('wheel', onWheel)
      prevEl.removeEventListener('touchstart', onTouchStart)
      prevEl.removeEventListener('touchmove', onTouchMove)
      prevEl.removeEventListener('pointerdown', onPointerDown)
      prevEl.removeEventListener('load', onMediaLoad, true)
      cancelScrollToY(prevEl)
    }
    if (childMutationObserver) {
      childMutationObserver.disconnect()
      childMutationObserver = null
    }
    if (areaResizeObserver) {
      areaResizeObserver.disconnect()
      areaResizeObserver = null
    }
    observedChildren = new WeakSet()
    if (el) {
      lastScrollTop = el.scrollTop
      el.addEventListener('wheel', onWheel, { passive: true })
      el.addEventListener('touchstart', onTouchStart, { passive: true })
      el.addEventListener('touchmove', onTouchMove, { passive: true })
      el.addEventListener('pointerdown', onPointerDown, { passive: true })
      // 图片等媒体异步解码撑高容器时，若用户未上滑则维持贴底
      el.addEventListener('load', onMediaLoad, true)
      if (typeof ResizeObserver !== 'undefined') {
        areaResizeObserver = new ResizeObserver(() => keepBottomIfPinned())
        areaResizeObserver.observe(el)
        observeAreaChildren(el)
      }
      if (typeof MutationObserver !== 'undefined') {
        childMutationObserver = new MutationObserver(() => {
          observeAreaChildren(el)
          keepBottomIfPinned()
        })
        childMutationObserver.observe(el, { childList: true })
      }
      nextTick(() => {
        if (!userScrolledUp && pendingInitialPosition) snapToBottom(messageAreaEl.value)
      })
    }
  }, { immediate: true })

  watch(visibleCount, () => {
    loadingMore.value = false
    pinnedGrow.value = 0
  })

  watch(hasOlderMessages, (v) => {
    if (!v) loadingMore.value = false
  })

  watch(loadingMore, (v) => {
    if (loadingMoreTimer) { clearTimeout(loadingMoreTimer); loadingMoreTimer = null }
    if (v) {
      loadingMoreTimer = setTimeout(() => {
        loadingMore.value = false
        loadingMoreTimer = null
      }, 8000)
    }
  })

  watch(currentMessages, (msgs, oldMsgs) => {
    if (oldMsgs === undefined) {
      // 挂载时同步初始化基线；pendingInitialPosition 保持 true，确保首屏异步补拉历史或媒体解码时能正常贴底
      lastPageId = pageId()
      lastMsgCount = msgs.length
      lastTailId = msgs.length ? msgs[msgs.length - 1].id : null
      pendingInitialPosition = true
      return
    }
    const curId = pageId()
    const pageChanged = curId !== lastPageId
    lastPageId = curId
    const grew = msgs.length > lastMsgCount
    let consumedLiveTail = false
    if (pageChanged) {
      pinnedGrow.value = 0
      lastTailId = null
      userScrolledUp = false
      pendingInitialPosition = true
      doScrollToBottom(true)
    } else {
      if (grew && !isAtBottom.value && lastMsgCount > 0 && canLoadOlder() !== null) {
        pinnedGrow.value = Math.min(pinnedGrow.value + (msgs.length - lastMsgCount), 200)
      }
      if (grew) {
        const wasAtBottom = isAtBottom.value
        const last = msgs[msgs.length - 1]
        const tailId = last ? last.id : null
        const tailGrew = lastTailId !== null ? tailId !== lastTailId : msgs.length > 0
        const mineJustSent = tailGrew && consumeOwnSentMsg(tailId)
        if (mineJustSent) {
          userScrolledUp = false
          consumedLiveTail = true
          doScrollToBottom(false, { force: true })
        } else if (!userScrolledUp && (pendingInitialPosition || (wasAtBottom && tailGrew))) {
          if (tailGrew && lastMsgCount > 0) {
            consumedLiveTail = true
            doScrollToBottom(false, { skipBottomCheck: true })
          } else {
            // 仅头部补拉历史（如桌面端 1 条缓存 -> 补齐其余消息）且用户尚未上滑时，瞬时贴底
            doScrollToBottom(true)
          }
        }
      }
    }
    if (consumedLiveTail) pendingInitialPosition = false
    lastMsgCount = msgs.length
    lastTailId = msgs.length ? msgs[msgs.length - 1].id : null
  }, { immediate: true })

  watch(pageId, () => {
    userScrolledUp = false
    pinnedGrow.value = 0
    const msgs = currentMessages.value
    lastPageId = pageId()
    lastMsgCount = msgs.length
    lastTailId = msgs.length ? msgs[msgs.length - 1].id : null
    pendingInitialPosition = true
    doScrollToBottom(true)
  })

  function scrollToBottom() {
    userScrolledUp = false
    pendingInitialPosition = false
    pinnedGrow.value = 0
    abortPendingAutoScroll()
    nextTick(() => {
      if (messageAreaEl.value) {
        smoothScrollTo(messageAreaEl.value, Infinity)
      }
    })
  }

  /** 在程序化守卫下调整滚动位置（供加载更早消息后锚定视口，防止被误判为用户主动上滑或被后续新消息拉回） */
  function setScrollTopProgrammatic(top) {
    const el = messageAreaEl.value
    if (!el) return
    anchorScrollGuard = true
    const seq = ++programmaticSeq
    el.scrollTop = Math.max(0, Number(top) || 0)
    lastScrollTop = el.scrollTop
    isAtBottom.value = Math.max(0, el.scrollHeight - el.clientHeight) - el.scrollTop < AT_BOTTOM_THRESHOLD
    requestAnimationFrame(() => {
      if (programmaticSeq === seq) programmaticSeq = 0
      anchorScrollGuard = false
    })
  }

  function scrollToBottomInstant({ respectUser = false } = {}) {
    if (respectUser && userScrolledUp) return
    abortPendingAutoScroll()
    nextTick(() => {
      if (respectUser && userScrolledUp) return
      snapToBottom(messageAreaEl.value)
    })
  }

  function jumpToMessage(msgId) {
    const item = pageType() === 'user' ? targetUser.value : targetGroup.value
    if (!item) return
    onEnsureExpanded?.(msgId)
    const idx = currentMessages.value.findIndex((m) => m.id === msgId)
    if (idx >= 0 && idx < currentMessages.value.length - visibleCount()) {
      onLoadAll()
    }
    nextTick(() => {
      const area = messageAreaEl.value
      const el = area?.querySelector(`[data-msg-id="${msgId}"]`)
      if (!el || !area) return
      const areaRect = area.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const centerTop = elRect.top - areaRect.top + area.scrollTop - area.clientHeight / 2 + elRect.height / 2
      userScrolledUp = true
      pendingInitialPosition = false
      abortPendingAutoScroll()
      runScrollToY(area, Math.max(0, centerTop))
      el.classList.add('motion-highlight')
      waitForMotion(el, { timeout: motionDuration('hold') + 200 }).then(() => el.classList.remove('motion-highlight'))
    })
  }

  onUnmounted(() => {
    if (loadingMoreTimer) clearTimeout(loadingMoreTimer)
    abortPendingAutoScroll()
    if (childMutationObserver) {
      childMutationObserver.disconnect()
      childMutationObserver = null
    }
    if (areaResizeObserver) {
      areaResizeObserver.disconnect()
      areaResizeObserver = null
    }
    const el = messageAreaEl.value
    if (el) {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('load', onMediaLoad, true)
    }
  })

  return {
    loadingMore,
    isAtBottom,
    hasOlderMessages,
    visibleMessages,
    onScroll,
    scrollToBottom,
    scrollToBottomInstant,
    setScrollTopProgrammatic,
    jumpToMessage,
  }
}
