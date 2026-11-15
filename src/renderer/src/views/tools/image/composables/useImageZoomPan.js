import { ref, onMounted, onUnmounted, nextTick } from 'vue'

/** 画布可视缩放区间：既支持缩小整体预览，也支持放大到像素级检查 */
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
/** “适配窗口”允许把小图放大到的上限（避免 16×16 图标被拉成糊屏） */
const MAX_FIT_ZOOM = 4
const ZOOM_STEP = 1.25

function clampZoom(value) {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 1000) / 1000))
}

export function useImageZoomPan() {
  const wrapEl = ref(null)
  const zoomScale = ref(1)
  const isPanning = ref(false)
  const isSpacePressed = ref(false)

  let panStartX = 0
  let panStartY = 0
  let initialScrollLeft = 0
  let initialScrollTop = 0

  /**
   * 变更缩放并保持锚点（默认视口中心）下方的画面内容不动。
   * @param {number} next 目标缩放比例
   * @param {{ clientX?: number, clientY?: number }} [anchor] 视口坐标系锚点
   */
  function zoomTo(next, anchor = {}) {
    const wrap = wrapEl.value
    const prev = zoomScale.value
    const clamped = clampZoom(next)
    if (!wrap || clamped === prev) {
      zoomScale.value = clamped
      return
    }
    const rect = wrap.getBoundingClientRect()
    const px = Number.isFinite(anchor.clientX) ? anchor.clientX - rect.left : wrap.clientWidth / 2
    const py = Number.isFinite(anchor.clientY) ? anchor.clientY - rect.top : wrap.clientHeight / 2
    const ratio = clamped / prev
    const keepX = (wrap.scrollLeft + px) * ratio
    const keepY = (wrap.scrollTop + py) * ratio
    zoomScale.value = clamped
    nextTick(() => {
      if (!wrapEl.value) return
      wrapEl.value.scrollLeft = Math.max(0, keepX - px)
      wrapEl.value.scrollTop = Math.max(0, keepY - py)
    })
  }

  function zoomIn(anchor) {
    zoomTo(zoomScale.value * ZOOM_STEP, anchor)
  }

  function zoomOut(anchor) {
    zoomTo(zoomScale.value / ZOOM_STEP, anchor)
  }

  function zoomReset() {
    zoomTo(1)
  }

  /** 适配窗口：比视口大时缩小，比视口小时放大（上限 MAX_FIT_ZOOM），始终铺满可视区域 */
  function zoomFit(imgW, imgH) {
    const wrap = wrapEl.value
    if (!wrap || !imgW || !imgH) {
      zoomTo(1)
      return
    }
    const padding = 32
    const cw = Math.max(100, wrap.clientWidth - padding)
    const ch = Math.max(100, wrap.clientHeight - padding)
    zoomTo(Math.min(cw / imgW, ch / imgH, MAX_FIT_ZOOM))
  }

  function onWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    zoomTo(zoomScale.value * factor, { clientX: e.clientX, clientY: e.clientY })
  }

  function startPan(e) {
    if (!wrapEl.value) return
    isPanning.value = true
    panStartX = e.clientX
    panStartY = e.clientY
    initialScrollLeft = wrapEl.value.scrollLeft
    initialScrollTop = wrapEl.value.scrollTop
  }

  function updatePan(e) {
    if (!isPanning.value || !wrapEl.value) return
    const dx = e.clientX - panStartX
    const dy = e.clientY - panStartY
    wrapEl.value.scrollLeft = initialScrollLeft - dx
    wrapEl.value.scrollTop = initialScrollTop - dy
  }

  function endPan() {
    isPanning.value = false
  }

  function onKeyDown(e) {
    if (e.code === 'Space') {
      const activeEl = document.activeElement
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)
      if (!isInput) {
        isSpacePressed.value = true
      }
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') {
      isSpacePressed.value = false
      if (isPanning.value) endPan()
    }
  }

  function onWindowBlur() {
    isSpacePressed.value = false
    isPanning.value = false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onWindowBlur)
  })

  return {
    wrapEl,
    zoomScale,
    isPanning,
    isSpacePressed,
    zoomTo,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomFit,
    onWheel,
    startPan,
    updatePan,
    endPan,
    MIN_ZOOM,
    MAX_ZOOM
  }
}
