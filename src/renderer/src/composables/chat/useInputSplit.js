import { ref, watch, nextTick, onUnmounted } from 'vue'
import { createScrollSync } from '../../markdown/scroll-sync.js'

const SNAP = 56
const MIN_PANE_W = 120

/**
 * 输入区左源码/右预览双栏分割宽度拖拽、折叠与双向行锚点跟随滚动。
 */
export function useInputSplit({ inputEl, inputPreviewRef, inputText }) {
  const splitLeftWidth = ref(0)
  const collapseSide = ref('')
  const previewOpen = ref(false)

  const scrollSync = createScrollSync({
    getTextarea: () => inputEl.value,
    getPreview: () => inputPreviewRef.value,
  })

  function syncPreviewFromInput() {
    scrollSync.sync('editor')
  }

  function syncInputFromPreview() {
    scrollSync.sync('preview')
  }

  watch(inputText, () => {
    nextTick(() => {
      const ta = inputEl.value
      const pv = inputPreviewRef.value
      if (ta && (!pv || !previewOpen.value || collapseSide.value === 'right')) {
        ta.style.paddingBottom = ''
        return
      }
      if (!ta || !pv) return
      scrollSync.invalidate()
      scrollSync.syncEditorTailPadding()
      scrollSync.sync('editor')
    })
  })

  function togglePreview() {
    previewOpen.value = !previewOpen.value
    if (!previewOpen.value && collapseSide.value === 'right') collapseSide.value = ''
    nextTick(() => {
      const ta = inputEl.value
      const pv = inputPreviewRef.value
      if (!previewOpen.value) {
        if (ta) ta.style.paddingBottom = ''
        return
      }
      if (!ta || !pv) return
      scrollSync.invalidate()
      scrollSync.syncEditorTailPadding()
      scrollSync.sync('editor')
    })
  }

  function onSplitDragStart(e) {
    e.preventDefault()
    const splitEl = e.currentTarget?.parentElement
    if (!splitEl) return
    const splitRect = splitEl.getBoundingClientRect()
    const W = splitRect.width
    const onMove = (ev) => {
      const x = ev.clientX - splitRect.left
      if (W > 2 * SNAP && x < SNAP) { collapseSide.value = 'left'; return }
      if (W > 2 * SNAP && x > W - SNAP) { collapseSide.value = 'right'; return }
      if (collapseSide.value) collapseSide.value = ''
      splitLeftWidth.value = Math.max(MIN_PANE_W, Math.min(W - MIN_PANE_W, x))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  onUnmounted(() => {
    scrollSync.destroy()
  })

  return {
    splitLeftWidth,
    collapseSide,
    previewOpen,
    syncPreviewFromInput,
    syncInputFromPreview,
    togglePreview,
    onSplitDragStart,
  }
}
