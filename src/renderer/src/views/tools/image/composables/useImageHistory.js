import { ref, computed } from 'vue'

export function useImageHistory(initialDepth = 20) {
  const undoStack = ref([])
  const redoStack = ref([])
  const undoDepth = ref(initialDepth)

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  /**
   * 记录新的历史快照。
   * 当用户进行新的绘制、编辑或变换时，将先前的状态压入 undoStack，并清空 redoStack。
   */
  function pushSnapshot(snapshot) {
    if (!snapshot) return
    undoStack.value.push(snapshot)
    if (undoStack.value.length > undoDepth.value) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  /**
   * 撤销：将当前画面状态压入 redoStack，弹出上一个状态。
   * @param {Object} currentState - 撤销触发前一刻的画布状态
   * @returns {Object|null} 需恢复的目标状态
   */
  function undo(currentState) {
    if (undoStack.value.length === 0) return null
    const target = undoStack.value.pop()
    if (currentState) {
      redoStack.value.push(currentState)
      if (redoStack.value.length > undoDepth.value) {
        redoStack.value.shift()
      }
    }
    return target
  }

  /**
   * 重做：将当前画面状态压入 undoStack，弹出下一个状态。
   * @param {Object} currentState - 重做触发前一刻的画布状态
   * @returns {Object|null} 需恢复的目标状态
   */
  function redo(currentState) {
    if (redoStack.value.length === 0) return null
    const target = redoStack.value.pop()
    if (currentState) {
      undoStack.value.push(currentState)
      if (undoStack.value.length > undoDepth.value) {
        undoStack.value.shift()
      }
    }
    return target
  }

  function clearHistory() {
    undoStack.value = []
    redoStack.value = []
  }

  function setUndoDepth(depth) {
    undoDepth.value = Math.max(5, depth)
    while (undoStack.value.length > undoDepth.value) {
      undoStack.value.shift()
    }
    while (redoStack.value.length > undoDepth.value) {
      redoStack.value.shift()
    }
  }

  return {
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    undoDepth,
    pushSnapshot,
    undo,
    redo,
    clearHistory,
    setUndoDepth
  }
}
