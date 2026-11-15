import { ref, nextTick } from 'vue'
import { hitTextObject, readEditorText } from '../imageTextRenderer.js'

export function useImageText({
  color,
  zoomScale,
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

  let textSeq = 0
  let lastTextClick = 0
  let dragGrab = null
  let dragSnapped = false

  // 悬浮输入框挂在 .img-canvas-viewport 里，而 viewport 本身就是「缩放后的画布」，
  // 由外层 flex 居中。所以这里的坐标系原点已经是画布左上角，不能再补一次居中偏移。
  function getTextBoxPos(phys) {
    const z = zoomScale.value || 1
    return {
      left: phys.x * z,
      top: phys.y * z
    }
  }

  function handleTextPointerDown(pos, ctx) {
    const hit = hitTextObject(textObjects.value, pos, ctx)
    if (hit) {
      selectedTextId.value = hit.id
      movingTextId.value = hit.id
      // 记住抓取点与文字原点的差值，拖动时文字才不会瞬移到光标下
      dragGrab = { dx: pos.x - hit.x, dy: pos.y - hit.y }
      dragSnapped = false
      textDraft.value = false
      return true
    } else {
      // 点到空白时先把正在输入的草稿提交，别让已打的字凭空消失
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
  }

  function handleTextPointerMove(pos) {
    if (movingTextId.value != null && !textDraft.value) {
      const obj = textObjects.value.find((o) => o.id === movingTextId.value)
      if (obj) {
        // 第一次真正移动才入历史，纯点击不产生空快照
        if (!dragSnapped) {
          pushStrokeSnapshot()
          dragSnapped = true
        }
        const grab = dragGrab || { dx: 0, dy: 0 }
        obj.x = Math.max(0, pos.x - grab.dx)
        obj.y = Math.max(0, pos.y - grab.dy)
        dirty.value = true
        render()
      }
      return true
    }
    return false
  }

  function handleTextPointerUp() {
    if (movingTextId.value != null) {
      movingTextId.value = null
      dragGrab = null
      const now = Date.now()
      // 双击已选中的文字对象触发就地编辑
      if (selectedTextId.value != null && now - (lastTextClick || 0) < 400) {
        const obj = textObjects.value.find((o) => o.id === selectedTextId.value)
        if (obj && !textDraft.value) {
          fontSize.value = obj.fontSize || 24
          color.value = obj.color || '#FA5151'
          textPos.value = { x: obj.x, y: obj.y }
          const tp = getTextBoxPos({ x: obj.x, y: obj.y })
          textBoxLeft.value = tp.left
          textBoxTop.value = tp.top
          textDraft.value = true
          nextTick(() => {
            if (textRef.value) {
              // 用户文本先转义再拼 <br>，否则文字里带 < > 会被当成标签
              textRef.value.innerHTML = String(obj.md || '')
                .split('\n')
                .map((l) => l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]))
                .join('<br>')
              textRef.value.focus()
            }
          })
        }
      }
      lastTextClick = now
      return true
    }
    return false
  }

  function cancelText() {
    textDraft.value = false
    if (selectedTextId.value != null && !textObjects.value.some((o) => o.id === selectedTextId.value)) {
      selectedTextId.value = null
    }
  }

  function commitText() {
    const t = readEditorText(textRef.value)
    if (!t.trim()) {
      textDraft.value = false
      return
    }
    pushStrokeSnapshot()
    if (selectedTextId.value != null) {
      const obj = textObjects.value.find((o) => o.id === selectedTextId.value)
      if (obj) {
        obj.md = t
        obj.fontSize = fontSize.value
        obj.color = color.value
      }
    } else {
      textObjects.value.push({
        id: ++textSeq,
        x: textPos.value.x,
        y: textPos.value.y,
        md: t,
        fontSize: fontSize.value,
        color: color.value
      })
    }
    dirty.value = true
    render()
    textDraft.value = false
  }

  function deleteSelectedText() {
    if (selectedTextId.value == null) return
    pushStrokeSnapshot()
    textObjects.value = textObjects.value.filter((o) => o.id !== selectedTextId.value)
    selectedTextId.value = null
    textDraft.value = false
    dirty.value = true
    render()
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
