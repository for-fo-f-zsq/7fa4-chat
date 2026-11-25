import { ref, watch, onMounted, onUpdated, onUnmounted, nextTick } from 'vue'
import { isTextLikeContent } from '../../utils.js'

const CLAMP_LINES = 13
const BUBBLE_PAD_Y = 20
const OPTIMISTIC_CHARS = 800

/**
 * 长消息收起/展开测量与滚动锚定。
 *
 * 性能约定（这是滚动热路径上的第二号热点，审计 #2）：
 * 1. 绝不整表扫描：已测得结论的行记在 `settledIds` 里，`onUpdated` 只处理「还没结论」的
 *    少数新行；没有待测行时直接 return（0 次 DOM 查询、0 次 getComputedStyle）。
 * 2. 不轮询、不设等待窗口：内容尺寸变化由每行气泡自己的 ResizeObserver 驱动（图片解码、
 *    字体替换、公式重排都会改气泡高度 → RO 精确回调该行），媒体 load 事件作为兜底。
 *    原来的「每 300ms 重跑全表 + 最长等 15s」在长消息多的会话里是持续性的强制同步布局。
 * 3. 一次测量轮次里「先批量读、最后一次性写响应式」：读取（rect / scrollHeight /
 *    getComputedStyle）全部发生在写 expandableIds 之前，不会边读边写互相触发重排。
 * 4. clampPx 的 fontSize 每轮只取一次（原来每行一次），宽度变化才失效。
 */
export function useMessageExpand({
  messageAreaEl,
  pageType,
  pageId,
  expandedMsgs,
  isPollMsg,
}) {
  const expandableIds = ref(new Set())
  /** 自增用于让模板对「测量结论变化」产生依赖（不改标题就改这里） */
  const measureTick = ref(0)

  let measureRaf = 0
  let fullRescan = true
  let clampFontPx = 0
  let lastWidth = 0
  let areaResizeObserver = null
  let rowResizeObserver = null
  let childMutationObserver = null

  /** 已得到可靠实测结论的消息 id（不代表永久锁定，尺寸变化会被 RO 重新测量） */
  const settledIds = new Set()
  /** 本轮需要测量的行元素（RO / load / 首次挂载喂进来） */
  const dirtyRows = new Set()
  /** 本轮需要测量的 id（由 MessageList 更新时按新消息加入），用 id 查行，避免全表 querySelectorAll */
  const dirtyIds = new Set()
  const observedRows = new WeakSet()

  function clampPx(bubble) {
    if (clampFontPx > 0) return clampFontPx
    const fs = parseFloat(getComputedStyle(bubble).fontSize) || 14
    clampFontPx = 1.6 * fs * CLAMP_LINES + BUBBLE_PAD_Y
    return clampFontPx
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
    if (settledIds.has(msg.id)) return false
    // 尚未得到可靠测量：用字数乐观判断，避免长消息在首帧没有「展开全文」入口
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

  function queueRow(row) {
    if (row && row.dataset && row.dataset.msgId) dirtyRows.add(row)
  }

  /**
   * 单轮测量：只处理 dirtyRows / dirtyIds / 全量重扫 三种来源。
   * 读数（getComputedStyle、scrollHeight、rect）集中在循环内，写（expandableIds / measureTick）
   * 放在循环之后，避免读写交错触发额外重排。
   */
  function measurePass() {
    measureRaf = 0
    const area = messageAreaEl.value
    if (!area) return
    const rows = []
    if (fullRescan) {
      fullRescan = false
      for (const row of area.querySelectorAll('.msg-row')) rows.push(row)
      // 全量重扫时顺便补齐 RO 观测（新行、切会话后的新窗口）
      observeRows(rows)
    } else {
      for (const row of dirtyRows) if (row.isConnected !== false) rows.push(row)
      for (const id of dirtyIds) {
        if (settledIds.has(id)) continue
        const row = area.querySelector(`.msg-row[data-msg-id="${id}"]`)
        if (row) {
          rows.push(row)
          observeRows([row])
        }
      }
    }
    dirtyRows.clear()
    dirtyIds.clear()
    if (!rows.length) return

    const prev = expandableIds.value
    let next = null

    for (const row of rows) {
      const id = Number(row.dataset.msgId)
      if (!id) continue
      const bubble = row.querySelector('.bubble')
      if (!bubble) continue
      if (isMediaRow(row)) {
        // 媒体行不参与折叠判定（高度由图片/贴纸决定），仍然记录结论避免反复进入
        if (!settledIds.has(id)) settledIds.add(id)
        continue
      }
      const pendingImgs = Array.from(row.querySelectorAll('img')).filter((img) => !img.complete)
      const scrollH = bubble.scrollHeight
      // 测量尚不可靠（未布局 / 图片未解码完）：保持乐观判断，等 RO 或 load 再回来
      if (pendingImgs.length || !(scrollH > 0)) continue
      const limit = clampPx(bubble)
      const cut = scrollH > limit + 1 ? foldLineCutsImage(row, bubble) : false
      const expandable = !cut && scrollH > limit + 1
      settledIds.add(id)
      if (next === null) next = new Set(prev)
      if (expandable) next.add(id)
      else next.delete(id)
    }

    if (next) {
      let changed = next.size !== prev.size
      if (!changed) {
        for (const id of next) {
          if (!prev.has(id)) { changed = true; break }
        }
      }
      // 集合没变也必须推一次 measureTick：一个「乐观判为可展开（>800 字）」的行被实测为
      // 不可展开时并不在 expandableIds 里，只有 tick 变化才能让模板里的 isExpandable 重新求值。
      if (changed) expandableIds.value = next
      else measureTick.value++
    }
  }

  function scheduleMeasure() {
    if (measureRaf) return
    measureRaf = requestAnimationFrame(() => nextTick(measurePass))
  }

  function observeRows(rows) {
    if (!rowResizeObserver) return
    for (const row of rows) {
      if (!row || observedRows.has(row)) continue
      observedRows.add(row)
      const bubble = row.querySelector('.bubble')
      rowResizeObserver.observe(bubble || row)
    }
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

  function onMessageAreaLoad(e) {
    // 图片/媒体加载完成：只重测这张图所在的行，不碰其它行
    const target = e?.target
    const row = target && target.closest ? target.closest('.msg-row') : null
    if (row) {
      queueRow(row)
      settledIds.delete(Number(row.dataset.msgId))
    }
    scheduleMeasure()
  }

  function resetMeasure() {
    settledIds.clear()
    dirtyRows.clear()
    dirtyIds.clear()
    clampFontPx = 0
    expandableIds.value = new Set()
    fullRescan = true
    scheduleMeasure()
  }

  onMounted(() => {
    const area = messageAreaEl.value
    scheduleMeasure()
    area?.addEventListener('load', onMessageAreaLoad, true)
    if (typeof ResizeObserver !== 'undefined') {
      // 气泡级 RO：内容尺寸变化（图片解码、字体替换、公式重排）只回调受影响的行
      rowResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const node = entry.target
          const row = node?.closest ? node.closest('.msg-row') : null
          if (row) queueRow(row)
        }
        scheduleMeasure()
      })
      if (area && typeof MutationObserver !== 'undefined') {
        // 行被回收时解除观测，避免 RO 长期持有已移除节点
        childMutationObserver = new MutationObserver((records) => {
          for (const rec of records) {
            for (const node of rec.removedNodes) {
              if (node.nodeType !== 1) continue
              if (node.classList?.contains('msg-row')) rowResizeObserver.unobserve(node.querySelector('.bubble') || node)
              const bubbles = node.querySelectorAll ? node.querySelectorAll('.msg-row .bubble') : []
              for (const b of bubbles) rowResizeObserver.unobserve(b)
            }
          }
        })
        childMutationObserver.observe(area, { childList: true })
      }
      if (area) {
        // 宽度变化会让折叠行数对应的像素高度变化，需要重新分类
        areaResizeObserver = new ResizeObserver((entries) => {
          const w = Math.round(entries[0].contentRect.width)
          if (w === lastWidth) return
          lastWidth = w
          resetMeasure()
        })
        areaResizeObserver.observe(area)
      }
    }
  })

  onUpdated(() => {
    // 有 dirty 才排一次 rAF；没有待测行时这里是纯粹的布尔判断
    if (measureRaf || fullRescan || dirtyRows.size || dirtyIds.size) scheduleMeasure()
  })

  onUnmounted(() => {
    if (measureRaf) { cancelAnimationFrame(measureRaf); measureRaf = 0 }
    if (areaResizeObserver) { areaResizeObserver.disconnect(); areaResizeObserver = null }
    if (rowResizeObserver) { rowResizeObserver.disconnect(); rowResizeObserver = null }
    if (childMutationObserver) { childMutationObserver.disconnect(); childMutationObserver = null }
    messageAreaEl.value?.removeEventListener('load', onMessageAreaLoad, true)
  })

  watch(() => [pageType(), pageId()], () => resetMeasure())

  /**
   * MessageList 每次更新后调用：只把「还没结论」的消息 id 排进本轮，
   * 不再对整片消息区做 querySelectorAll + 逐行 getBoundingClientRect。
   */
  function noteMessages(messages) {
    if (!messages) return
    for (const msg of messages) {
      if (!msg || msg.id == null) continue
      const id = Number(msg.id)
      if (!id || settledIds.has(id)) continue
      if (!isTextLikeContent(msg.content)) continue
      if (isPollMsg?.(msg)) continue
      dirtyIds.add(id)
    }
  }

  return {
    isExpandable,
    isExpanded,
    isClamped,
    toggleExpand,
    markExpanded,
    noteMessages,
  }
}
