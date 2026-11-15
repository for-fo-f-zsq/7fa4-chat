import { onBeforeUnmount, ref } from 'vue'

/**
 * 浮窗 / 小组件标题栏自由拖拽（带视口边界钳制）。
 * @param {{ initialX?: number, initialY?: number, margin?: number, elRef?: import('vue').Ref<HTMLElement|null>, onMove?: (pos: {x:number,y:number}) => void, onEnd?: (pos: {x:number,y:number}) => void }} [options]
 */
export function useFloatingDrag(options = {}) {
  const margin = options.margin ?? 8
  const x = ref(options.initialX ?? 0)
  const y = ref(options.initialY ?? 0)
  const isDragging = ref(false)

  let startClientX = 0
  let startClientY = 0
  let startX = 0
  let startY = 0

  function clampPos(nextX, nextY) {
    if (typeof window === 'undefined') return { x: nextX, y: nextY }
    const el = options.elRef?.value
    const rect = el ? el.getBoundingClientRect() : null
    const w = rect ? rect.width : 0
    const h = rect ? rect.height : 0
    const maxX = Math.max(margin, window.innerWidth - w - margin)
    const maxY = Math.max(margin, window.innerHeight - h - margin)
    return {
      x: Math.min(maxX, Math.max(margin, nextX)),
      y: Math.min(maxY, Math.max(margin, nextY)),
    }
  }

  function onMouseMove(event) {
    if (!isDragging.value) return
    const next = clampPos(startX + (event.clientX - startClientX), startY + (event.clientY - startClientY))
    x.value = next.x
    y.value = next.y
    if (typeof options.onMove === 'function') options.onMove(next)
  }

  function stopDrag() {
    if (!isDragging.value) return
    isDragging.value = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopDrag)
      window.removeEventListener('blur', stopDrag)
    }
    if (typeof options.onEnd === 'function') options.onEnd({ x: x.value, y: y.value })
  }

  function startDrag(event) {
    if (event?.button !== undefined && event.button !== 0) return
    event?.preventDefault?.()
    startClientX = event.clientX
    startClientY = event.clientY
    startX = x.value
    startY = y.value
    isDragging.value = true
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', stopDrag)
      window.addEventListener('blur', stopDrag)
    }
  }

  onBeforeUnmount(stopDrag)

  return {
    x,
    y,
    isDragging,
    startDrag,
    stopDrag,
  }
}
