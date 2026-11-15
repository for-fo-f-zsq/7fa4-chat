import { ref, watch, onMounted, onUpdated, onUnmounted, nextTick } from 'vue'
import { isTextLikeContent } from '../../utils.js'

const CLAMP_LINES = 13
const BUBBLE_PAD_Y = 20
const OPTIMISTIC_CHARS = 800
const SETTLE_MS = 1200
const RETRY_MS = 300
const MAX_WAIT_MS = 15000

/**
 * 长消息收起/展开测量与滚动锚定，处理字体/公式/图片解码后的二次稳态复核。
 */
export function useMessageExpand({
  messageAreaEl,
  pageType,
  pageId,
  expandedMsgs,
  isPollMsg,
}) {
  const expandableIds = ref(new Set())
  const measureTick = ref(0)

  let measureRaf = 0
  let debugRound = 0
  let settleTimer = 0
  let lockedCount = -1
  let areaResizeObserver = null

  const firstSeenAt = new Map()
  const lastHeights = new Map()
  const measuredMsgIds = new Set()

  function clampPx(bubble) {
    const fs = parseFloat(getComputedStyle(bubble).fontSize) || 14
    return 1.6 * fs * CLAMP_LINES + BUBBLE_PAD_Y
  }

  function isMediaRow(row) {
    return !!row.querySelector(
      '.chat-image[data-image-msg="1"], .sticker-msg, .emoji-msg, .file-msg, .poll-card, video, iframe'
    )
  }

  function foldLineCutsImage(row, bubble) {
    const line = bubble.getBoundingClientRect().top + clampPx(bubble)
    return Array.from(row.querySelectorAll('.chat-image')).some((img) => {
      const r = img.getBoundingClientRect()
      return r.top < line && r.bottom > line
    })
  }

  function isExpandable(msg) {
    if (!msg) return false
    if (!isTextLikeContent(msg.content)) return false
    if (isPollMsg?.(msg)) return false
    measureTick.value
    if (expandableIds.value.has(msg.id)) return true
    if (measuredMsgIds.has(msg.id)) return false
    return String(msg.content || '').length > OPTIMISTIC_CHARS
  }

  function isExpanded(msg) {
    return !!(msg && expandedMsgs[msg.id])
  }

  function isClamped(msg) {
    return isExpandable(msg) && !isExpanded(msg)
  }

  function markExpanded(msgId) {
    if (expandableIds.value.has(msgId)) expandedMsgs[msgId] = true
  }

  function measureExpandableOnce() {
    measureRaf = 0
    const area = messageAreaEl.value
    if (!area) return
    const DBG = (() => { try { return localStorage.getItem('debug_expand') === '1' } catch { return false } })()
    const now = performance.now()
    const next = new Set(expandableIds.value)
    const rows = area.querySelectorAll('.msg-row')
    if (DBG) {
      console.log('[expand] 第 ' + (++debugRound) + ' 轮测量，共 ' + rows.length + ' 行，已锁定 ' + measuredMsgIds.size)
    }
    for (const row of rows) {
      const id = Number(row.dataset.msgId)
      if (!id || measuredMsgIds.has(id)) continue
      const bubble = row.querySelector('.bubble')
      if (!bubble) continue
      if (!firstSeenAt.has(id)) firstSeenAt.set(id, now)
      const settled = now - firstSeenAt.get(id) >= SETTLE_MS
      if (isMediaRow(row)) {
        if (settled) measuredMsgIds.add(id)
        continue
      }
      const pendingImgs = Array.from(row.querySelectorAll('img')).filter((img) => !img.complete)
      if (pendingImgs.length && !settled) continue
      const scrollH = bubble.scrollHeight
      const limit = clampPx(bubble)
      const cut = foldLineCutsImage(row, bubble)
      const expandable = !cut && scrollH > limit + 1
      if (expandable) next.add(id)
      else next.delete(id)
      const stable = lastHeights.get(id) === scrollH
      lastHeights.set(id, scrollH)
      const giveUp = now - firstSeenAt.get(id) >= MAX_WAIT_MS
      if ((settled && stable) || giveUp) measuredMsgIds.add(id)
    }
    const prev = expandableIds.value
    let changed = next.size !== prev.size
    if (!changed) {
      for (const id of next) {
        if (!prev.has(id)) { changed = true; break }
      }
    }
    if (changed) expandableIds.value = next
    if (changed || measuredMsgIds.size !== lockedCount) {
      lockedCount = measuredMsgIds.size
      measureTick.value++
    }
  }

  function scheduleSettleRecheck() {
    if (settleTimer) return
    settleTimer = setTimeout(() => {
      settleTimer = 0
      const area = messageAreaEl.value
      if (!area) return
      const now = performance.now()
      let pending = false
      for (const row of area.querySelectorAll('.msg-row')) {
        const id = Number(row.dataset.msgId)
        if (!id || measuredMsgIds.has(id)) continue
        const seen = firstSeenAt.get(id)
        if (seen === undefined || now - seen > MAX_WAIT_MS + 1000) continue
        pending = true
        break
      }
      if (!pending) return
      measureExpandableOnce()
      scheduleSettleRecheck()
    }, RETRY_MS)
  }

  function scheduleMeasureExpandable() {
    if (measureRaf) return
    measureRaf = requestAnimationFrame(() => nextTick(measureExpandableOnce))
    scheduleSettleRecheck()
  }

  function toggleExpand(msg) {
    if (!msg) return
    const area = messageAreaEl.value
    const id = msg.id
    const wasExpanded = isExpanded(msg)
    const btn = area && area.querySelector(`.msg-row[data-msg-id="${id}"] .expand-btn`)
    if (wasExpanded) delete expandedMsgs[id]
    else expandedMsgs[id] = true

    nextTick(() => {
      if (!area) return
      const areaRect = area.getBoundingClientRect()
      if (!wasExpanded) {
        const br = btn && btn.getBoundingClientRect()
        if (br && br.bottom > areaRect.bottom) {
          area.scrollTop += br.bottom - areaRect.bottom + 8
        }
      } else {
        const bubble = area.querySelector(`.msg-row[data-msg-id="${id}"] .bubble`)
        const bubRect = bubble && bubble.getBoundingClientRect()
        if (bubRect && bubRect.top < areaRect.top) {
          area.scrollTop += bubRect.top - areaRect.top - 8
        }
      }
    })
  }

  function onMessageAreaLoad() {
    scheduleMeasureExpandable()
  }

  function resetMeasure() {
    measuredMsgIds.clear()
    firstSeenAt.clear()
    lastHeights.clear()
    expandableIds.value = new Set()
    scheduleMeasureExpandable()
  }

  onMounted(() => {
    scheduleMeasureExpandable()
    messageAreaEl.value?.addEventListener('load', onMessageAreaLoad, true)
    if (messageAreaEl.value && typeof ResizeObserver !== 'undefined') {
      let lastW = 0
      areaResizeObserver = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width)
        if (w === lastW) return
        lastW = w
        resetMeasure()
      })
      areaResizeObserver.observe(messageAreaEl.value)
    }
  })

  onUpdated(() => {
    scheduleMeasureExpandable()
  })

  onUnmounted(() => {
    if (measureRaf) { cancelAnimationFrame(measureRaf); measureRaf = 0 }
    if (areaResizeObserver) { areaResizeObserver.disconnect(); areaResizeObserver = null }
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = 0 }
    messageAreaEl.value?.removeEventListener('load', onMessageAreaLoad, true)
  })

  watch(() => [pageType(), pageId()], () => resetMeasure())

  return {
    isExpandable,
    isExpanded,
    isClamped,
    toggleExpand,
    markExpanded,
  }
}
