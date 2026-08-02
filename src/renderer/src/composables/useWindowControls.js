import { ref, onMounted, onUnmounted } from 'vue'

export function useWindowControls() {
  const isMaximized = ref(false)

  async function windowMinimize() {
    await window.api.windowMinimize()
  }

  async function windowMaximize() {
    await window.api.windowMaximize()
    isMaximized.value = await window.api.windowIsMaximized()
  }

  async function windowClose() {
    await window.api.windowClose()
  }

  let unsubscribe = null

  onMounted(async () => {
    // 初始状态（页面加载时窗口可能已是最大化，如重启后恢复）
    isMaximized.value = await window.api.windowIsMaximized()
    // 订阅主进程推送：点击按钮、Aero Snap、双击标题栏、快捷键等所有方式都会同步图标
    unsubscribe = window.api.onWindowMaximized((val) => {
      isMaximized.value = !!val
    })
  })

  onUnmounted(() => {
    if (unsubscribe) unsubscribe()
  })

  return { isMaximized, windowMinimize, windowMaximize, windowClose }
}
