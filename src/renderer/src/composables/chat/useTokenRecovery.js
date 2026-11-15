import { ref, watch, onUnmounted } from 'vue'
import { store } from '../../store.js'

/**
 * 发言 Token 滑动窗口恢复倒计时统计。
 */
export function useTokenRecovery() {
  const tokenInfo = ref(null)
  const tokenTipVisible = ref(false)
  const tokenRecovery = ref([])
  let tokenTipTimer = null

  function refreshRecovery() {
    const sec = (tokenInfo.value && tokenInfo.value.recoverySeconds) || store.tokenLimit?.time_limit || 2400
    const now = Date.now()
    const uid = store.self && store.self.uid
    const pending = []
    if (uid != null) {
      for (const m of Object.values(store.messages)) {
        if (!m || m.sender != uid) continue
        const t = Number(m.send_time) * 1000
        if (!t || now - t > sec * 1000) continue
        pending.push({ time: t, left: Math.max(0, (t + sec * 1000 - now) / 1000) })
      }
      pending.sort((a, b) => a.time - b.time)
      if (pending.length > 50) pending.length = 50
    }
    tokenRecovery.value = pending
  }

  function onTokenHover(show) {
    tokenTipVisible.value = show
    clearInterval(tokenTipTimer)
    if (show) {
      refreshRecovery()
      tokenTipTimer = setInterval(refreshRecovery, 1000)
    }
  }

  function fmtLeft(sec) {
    const s = Math.max(0, Math.ceil(sec))
    const m = Math.floor(s / 60)
    const ss = s % 60
    return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
  }

  watch(tokenInfo, (v) => {
    if (!v) return
    if (store.tokenLimit?.count_limit) v.total = store.tokenLimit.count_limit
    if (!v.recoverySeconds) v.recoverySeconds = store.tokenLimit?.time_limit || 2400
  })

  onUnmounted(() => {
    clearInterval(tokenTipTimer)
  })

  return {
    tokenInfo,
    tokenTipVisible,
    tokenRecovery,
    onTokenHover,
    fmtLeft,
  }
}
