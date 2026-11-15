import { ref, computed } from 'vue'

const MAX_HISTORY = 100
// 连续手输时，每隔这么久落一个检查点，撤销才不会一口气退回打开文档那一帧。
const CHECKPOINT_MS = 800

export function useMdHistory({ getTa, content, scheduleRender }) {
  const undoStack = ref([])
  const redoStack = ref([])
  // 编辑器里的实时文本。手输不会立刻入栈，靠它与栈顶比较判断「有没有未记录的改动」。
  const liveValue = ref('')
  let lastCheckpointAt = 0

  const topEntry = () => undoStack.value[undoStack.value.length - 1] || null

  const canUndo = computed(() => {
    if (!undoStack.value.length) return false
    // 栈顶就是当前文本时要还有更早的一格；文本已偏离栈顶（手输未入栈）时随时可撤。
    return undoStack.value.length > 1 || topEntry().value !== liveValue.value
  })
  const canRedo = computed(() => redoStack.value.length > 0)

  function snapshot(ta) {
    return {
      value: ta.value,
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd
    }
  }

  function pushHistory() {
    const ta = getTa()
    if (!ta) return
    const val = ta.value
    liveValue.value = val
    const top = topEntry()
    if (!top || top.value !== val) {
      undoStack.value.push(snapshot(ta))
      if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
      redoStack.value = []
    }
  }

  /** 手输入口：同步实时文本、作废重做链，并按节流落检查点。 */
  function noteInput() {
    const ta = getTa()
    if (!ta) return
    liveValue.value = ta.value
    if (redoStack.value.length) redoStack.value = []
    const now = Date.now()
    if (now - lastCheckpointAt >= CHECKPOINT_MS) {
      lastCheckpointAt = now
      pushHistory()
      // pushHistory 也会写 liveValue，这里已一致
    }
  }

  function diffCaret(from, to) {
    const max = Math.min(from.length, to.length)
    let i = 0
    while (i < max && from.charCodeAt(i) === to.charCodeAt(i)) i++
    return i
  }

  function scrollCaretIntoView() {
    const ta = getTa()
    if (!ta) return
    const before = ta.value.slice(0, ta.selectionStart)
    const line = before.split('\n').length - 1
    const style = window.getComputedStyle(ta)
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.5) || 20
    const target = line * lineHeight
    if (target < ta.scrollTop || target > ta.scrollTop + ta.clientHeight - lineHeight) {
      ta.scrollTop = Math.max(0, target - ta.clientHeight / 2)
    }
  }

  function applyHistoryEntry(entry) {
    const ta = getTa()
    if (!ta) return
    const previous = ta.value
    ta.value = entry.value
    const pos = previous === entry.value
      ? Math.min(entry.selectionStart ?? entry.value.length, entry.value.length)
      : Math.min(diffCaret(previous, entry.value), entry.value.length)
    ta.setSelectionRange(pos, pos)
    ta.focus()
    scrollCaretIntoView()
    liveValue.value = entry.value
    content.value = entry.value
    scheduleRender(true)
  }

  function undo() {
    const ta = getTa()
    if (!ta) return
    const top = topEntry()
    if (!top) return
    if (top.value !== ta.value) {
      // 手输/输入法还没入栈：先把当前文本放进重做栈，再回到栈顶那一格。
      redoStack.value.push(snapshot(ta))
      applyHistoryEntry(top)
      return
    }
    if (undoStack.value.length <= 1) return
    const cur = undoStack.value.pop()
    redoStack.value.push({
      value: cur.value,
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd
    })
    applyHistoryEntry(topEntry())
  }

  function redo() {
    if (redoStack.value.length > 0) {
      const next = redoStack.value.pop()
      undoStack.value.push(next)
      applyHistoryEntry(next)
    }
  }

  function resetHistory() {
    undoStack.value = []
    redoStack.value = []
    liveValue.value = ''
    lastCheckpointAt = 0
  }

  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    pushHistory,
    noteInput,
    undo,
    redo,
    resetHistory
  }
}
