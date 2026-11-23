import { ref, nextTick } from 'vue'
import { readEditorText, renderTextObjects } from '../imageTextRenderer.js'

export function useImageText({
  color,
  zoomScale,
  getEditCtx,
  pushStrokeSnapshot,
  render,
  dirty
}) {
  const textRef = ref(null)
  const textDraft = ref(false)
  const textPos = ref({ x: 0, y: 0 })
  const textBoxLeft = ref(0)
  const textBoxTop = ref(0)
  const fontSize = ref(24)
  const textObjects = ref([])
  const selectedTextId = ref(null)
  const movingTextId = ref(null)

  // 悬浮输入框挂在 .img-canvas-viewport 里，而 viewport 本身就是「缩放后的画布」，
  // 由外层 flex 居中。所以这里的坐标系原点已经是画布左上角，不能再补一次居中偏移。
  function getTextBoxPos(phys) {
    const z = zoomScale.value || 1
    return {
      left: phys.x * z,
      top: phys.y * z
    }
  }

  function handleTextPointerDown(pos) {
    // 已确认的文字已直接作为像素落笔（同 Windows 画图），点画布只提交当前草稿并开启新输入
    if (textDraft.value) commitText()
    selectedTextId.value = null
    textPos.value = pos
    const tp = getTextBoxPos(pos)
    textBoxLeft.value = tp.left
    textBoxTop.value = tp.top
    fontSize.value = 24
    textDraft.value = true
    nextTick(() => {
      if (textRef.value) {
        textRef.value.innerHTML = ''
        textRef.value.focus()
      }
    })
    return true
  }

  function handleTextPointerMove() {
    return false
  }

  function handleTextPointerUp() {
    return false
  }

  function cancelText() {
    textDraft.value = false
    selectedTextId.value = null
  }

  function commitText() {
    const t = readEditorText(textRef.value)
    if (!t.trim()) {
      textDraft.value = false
      return
    }
    const editCtx = typeof getEditCtx === 'function' ? getEditCtx() : null
    if (!editCtx) {
      textDraft.value = false
      return
    }
    pushStrokeSnapshot()
    renderTextObjects(editCtx, [{
      x: textPos.value.x,
      y: textPos.value.y,
      md: t,
      fontSize: fontSize.value,
      color: color.value
    }])
    selectedTextId.value = null
    dirty.value = true
    render()
    textDraft.value = false
  }

  function deleteSelectedText() {
    if (textDraft.value) cancelText()
  }

  return {
    textRef,
    textDraft,
    textPos,
    textBoxLeft,
    textBoxTop,
    fontSize,
    textObjects,
    selectedTextId,
    movingTextId,
    handleTextPointerDown,
    handleTextPointerMove,
    handleTextPointerUp,
    cancelText,
    commitText,
    deleteSelectedText,
    getTextBoxPos
  }
}
