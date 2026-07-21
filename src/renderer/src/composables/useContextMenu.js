import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue'

export function useContextMenu(menuRef, getX, getY, getVisible) {
  const adjustedX = ref(getX())
  const adjustedY = ref(getY())

  const adjustPosition = () => {
    const el = menuRef.value
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const pad = 5
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = getX()
    let top = getY()
    if (left + w + pad > vw) left = vw - w - pad
    if (left < pad) left = pad
    if (top + h + pad > vh) top = vh - h - pad
    if (top < pad) top = pad
    adjustedX.value = left
    adjustedY.value = top
  }

  onMounted(() => nextTick(adjustPosition))

  if (getVisible) {
    watch(getVisible, (v) => {
      if (v) nextTick(adjustPosition)
    })
  }

  watch([getX, getY], () => nextTick(adjustPosition))

  window.addEventListener('resize', adjustPosition)
  onUnmounted(() => window.removeEventListener('resize', adjustPosition))

  return { adjustedX, adjustedY }
}
