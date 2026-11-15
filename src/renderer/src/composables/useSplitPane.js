import { onBeforeUnmount, ref } from 'vue'

/**
 * 双向分栏/侧栏拖拽缩放。
 * @param {{ initial?: number, min?: number, max?: number, axis?: 'x'|'y', reverse?: boolean, storageKey?: string, onChange?: (size: number) => void }} [options]
 */
export function useSplitPane(options = {}) {
  const min = options.min ?? 180
  const max = options.max ?? 600
  const axis = options.axis === 'y' ? 'y' : 'x'
  const reverse = Boolean(options.reverse)
  const storageKey = options.storageKey || ''

  function clampSize(val) {
    return Math.min(max, Math.max(min, Math.round(val)))
  }

  let startInitial = options.initial ?? min
  if (storageKey && typeof localStorage !== 'undefined') {
    const saved = Number(localStorage.getItem(storageKey))
    if (!Number.isNaN(saved) && saved > 0) startInitial = saved
  }

  const size = ref(clampSize(startInitial))
  const isResizing = ref(false)

  let startCoord = 0
  let startSize = size.value

  function onMove(event) {
    if (!isResizing.value) return
    const clientCoord = axis === 'y' ? event.clientY : event.clientX
    const delta = (clientCoord - startCoord) * (reverse ? -1 : 1)
    const next = clampSize(startSize + delta)
    if (next !== size.value) {
      size.value = next
      if (typeof options.onChange === 'function') options.onChange(next)
    }
  }

  function stopResize() {
    if (!isResizing.value) return
    isResizing.value = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stopResize)
      window.removeEventListener('blur', stopResize)
    }
    if (storageKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(storageKey, String(size.value))
      } catch {}
    }
  }

  function startResize(event) {
    if (event?.button !== undefined && event.button !== 0) return
    event?.preventDefault?.()
    startCoord = axis === 'y' ? event.clientY : event.clientX
    startSize = size.value
    isResizing.value = true
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', stopResize)
      window.addEventListener('blur', stopResize)
    }
  }

  onBeforeUnmount(stopResize)

  return {
    size,
    isResizing,
    startResize,
    stopResize,
  }
}
