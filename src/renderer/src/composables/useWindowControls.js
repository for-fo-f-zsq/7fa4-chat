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

  return { isMaximized, windowMinimize, windowMaximize, windowClose }
}
