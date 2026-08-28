import { ref, onMounted, onBeforeUnmount } from 'vue'
import { NARROW_ASPECT } from './constants.js'

/**
 * 窄窗口（手机比例）感知：窗口高/宽比 > NARROW_ASPECT 时为真。
 * 与 ChatView 的 isNarrowLayout 共用同一阈值，供各工具独立感知窄模式，
 * 避免从父级逐层传 prop，也确保 resize 实时响应。
 *
 * 键盘防护：Android 聚焦输入框弹出软键盘会把 window.innerHeight 顶起骤降
 * （宽基本不变），若按此重算会跌破阈值、误判为宽屏导致工具抽屉/布局错乱
 * （与搜索框同一根因）。识别"宽未变 + 高骤降(>150px)"并忽略；分屏/横屏等真实变化仍响应。
 */
export function useNarrow() {
  const isNarrow = ref(false)
  let lastH = 0
  let lastW = 0

  function update() {
    const nowH = window.innerHeight
    const nowW = window.innerWidth
    if (lastW && Math.abs(nowW - lastW) < 40 && (lastH - nowH) > 150) {
      lastH = nowH
      lastW = nowW
      return
    }
    lastH = nowH
    lastW = nowW
    isNarrow.value = nowH / Math.max(nowW, 1) > NARROW_ASPECT
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
