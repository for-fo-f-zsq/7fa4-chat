import { ref, onMounted, onBeforeUnmount } from 'vue'
import { NARROW_ASPECT } from './constants.js'

/**
 * 窄窗口（手机比例）感知：窗口高/宽比 > NARROW_ASPECT 时为真。
 * 与 ChatView 的 isNarrowLayout 共用同一阈值，供各工具独立感知窄模式，
 * 避免从父级逐层传 prop，也确保 resize 实时响应。
 */
export function useNarrow() {
  const isNarrow = ref(false)

  function update() {
    isNarrow.value = window.innerHeight / Math.max(window.innerWidth, 1) > NARROW_ASPECT
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
  })

  return { isNarrow }
}
