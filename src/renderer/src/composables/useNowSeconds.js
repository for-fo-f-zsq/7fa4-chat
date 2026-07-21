import { ref, onMounted, onUnmounted } from 'vue'

const nowSeconds = ref(Math.floor(Date.now() / 1000))
let timer = null
let refCount = 0

function startTimer() {
  if (!timer) {
    timer = setInterval(() => {
      nowSeconds.value = Math.floor(Date.now() / 1000)
    }, 1000)
  }
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function useNowSeconds() {
  onMounted(() => {
    refCount++
    startTimer()
  })

  onUnmounted(() => {
    refCount--
    if (refCount <= 0) {
      refCount = 0
      stopTimer()
    }
  })

  return nowSeconds
}
