/**
 * 画布尺寸拖拽：拖动图片的四边 / 四角改变画布大小，内容锚定对边。
 * 只改变画布范围，图像本身不会被缩放或裁切重绘。
 */
import { ref } from 'vue'
import { MAX_EDIT_PIXELS, MAX_EDIT_SIDE } from '../imageConstants.js'

/** 画布最小边长（像素），避免拖成 0 宽 */
export const MIN_CANVAS_SIDE = 8

/** 手柄顺序：四边 + 四角 */
export const RESIZE_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

function clampSide(value) {
  if (!Number.isFinite(value)) return MIN_CANVAS_SIDE
  return Math.max(MIN_CANVAS_SIDE, Math.min(MAX_EDIT_SIDE, Math.round(value)))
}

/**
 * 由拖拽方向与位移推导目标画布尺寸。
 * 拖动左 / 上边时内容整体平移（offsetX / offsetY 为正），保持对边在屏幕上不动。
 * @param {{ handle: string, startW: number, startH: number, dx: number, dy: number }} input 位移单位为图片像素
 * @returns {{ width: number, height: number, offsetX: number, offsetY: number }}
 */
export function computeResizeSize({ handle, startW, startH, dx, dy }) {
  const name = String(handle || '')
  let width = startW
  let height = startH
  if (name.includes('e')) width = startW + dx
  if (name.includes('w')) width = startW - dx
  if (name.includes('s')) height = startH + dy
  if (name.includes('n')) height = startH - dy

  width = clampSide(width)
  height = clampSide(height)

  // 像素总量上限：保留被拖拽的那一轴，压缩另一轴
  if (width * height > MAX_EDIT_PIXELS) {
    const dragWide = name.includes('e') || name.includes('w')
    if (dragWide) height = Math.max(MIN_CANVAS_SIDE, Math.floor(MAX_EDIT_PIXELS / width))
    else width = Math.max(MIN_CANVAS_SIDE, Math.floor(MAX_EDIT_PIXELS / height))
  }

  return {
    width,
    height,
    offsetX: name.includes('w') ? width - startW : 0,
    offsetY: name.includes('n') ? height - startH : 0
  }
}

/**
 * @param {object} options
 * @param {import('vue').Ref<number>} options.width 当前画布宽（图片像素）
 * @param {import('vue').Ref<number>} options.height 当前画布高（图片像素）
 * @param {import('vue').Ref<number>} options.zoomScale 当前画布缩放
 * @param {(w: number, h: number, offsetX: number, offsetY: number) => void} options.commit 松手后提交尺寸
 */
export function useImageResize({ width, height, zoomScale, commit }) {
  const dragging = ref(false)
  const activeHandle = ref('')
  /** 拖拽中的预览：{ width, height, offsetX, offsetY, clientX, clientY } */
  const preview = ref(null)

  let startW = 0
  let startH = 0
  let startX = 0
  let startY = 0
  let pointerId = null
  let captureEl = null

  function unbind() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    if (captureEl && pointerId != null) {
      try {
        captureEl.releasePointerCapture(pointerId)
      } catch {}
    }
    captureEl = null
    pointerId = null
    dragging.value = false
    activeHandle.value = ''
  }

  function startResize(handle, event) {
    if (!width.value || !height.value) return
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    startW = width.value
    startH = height.value
    startX = event.clientX
    startY = event.clientY
    captureEl = event.currentTarget || event.target || null
    pointerId = event.pointerId ?? null
    if (captureEl?.setPointerCapture && pointerId != null) {
      try {
        captureEl.setPointerCapture(pointerId)
      } catch {}
    }

    dragging.value = true
    activeHandle.value = handle
    preview.value = {
      width: startW,
      height: startH,
      offsetX: 0,
      offsetY: 0,
      clientX: startX,
      clientY: startY
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function onMove(event) {
    if (!dragging.value) return
    const scale = zoomScale.value || 1
    const next = computeResizeSize({
      handle: activeHandle.value,
      startW,
      startH,
      dx: (event.clientX - startX) / scale,
      dy: (event.clientY - startY) / scale
    })
    preview.value = { ...next, clientX: event.clientX, clientY: event.clientY }
  }

  function onUp() {
    if (!dragging.value) return
    const result = preview.value
    const changed = !!result && (result.width !== startW || result.height !== startH)
    unbind()
    preview.value = null
    if (changed) commit(result.width, result.height, result.offsetX, result.offsetY)
  }

  /** 取消本次拖拽（Esc 或失焦） */
  function cancel() {
    if (!dragging.value) return
    unbind()
    preview.value = null
  }

  return { dragging, activeHandle, preview, startResize, cancel }
}
