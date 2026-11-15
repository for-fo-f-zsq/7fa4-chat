import { ref, computed, watch, onUnmounted } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'

/**
 * 顶部状态横幅（服务端拒绝 / 断线计时 / 游客登录引导）及登录跳转。
 */
export function useNetworkBanners() {
  const isWeb = isWebBrowser()
  const netBannerMuted = ref(false)
  const serverNotice = ref('')
  const serverNoticeMuted = ref(false)
  const guestBannerMuted = ref(false)
  const netDownAt = ref(0)
  const nowTick = ref(Date.now())
  let downTicker = null

  const netDownText = computed(() => {
    if (!netDownAt.value) return ''
    const s = Math.max(0, Math.floor((nowTick.value - netDownAt.value) / 1000))
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m`
    return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
  })

  watch(
    () => store.netError,
    (v, old) => {
      if (v && !old) {
        netDownAt.value = Date.now()
        netBannerMuted.value = false
      }
      if (!v) netDownAt.value = 0
      if (v && !downTicker) downTicker = setInterval(() => { nowTick.value = Date.now() }, 1000)
      if (!v && downTicker) {
        clearInterval(downTicker)
        downTicker = null
      }
    },
    { immediate: true },
  )

  watch(
    () => store.logined,
    () => {
      guestBannerMuted.value = false
    },
  )

  function noteServerFailure(r) {
    if (!r || r.success) return false
    const msg = (r.err && r.err.message) || ''
    if (!msg) return false
    if (/禁止使用聊天|被禁言|已被封禁/.test(msg)) {
      serverNotice.value = msg
      return true
    }
    return false
  }

  function gotoLogin() {
    if (isWeb) {
      const here = location.pathname + location.search
      location.href = '/login?url=' + encodeURIComponent(here)
      return
    }
    if (store.logined) return
    store.guestMode = false
    store.logined = false
  }

  onUnmounted(() => {
    if (downTicker) {
      clearInterval(downTicker)
      downTicker = null
    }
  })

  return {
    netBannerMuted,
    serverNotice,
    serverNoticeMuted,
    guestBannerMuted,
    netDownText,
    noteServerFailure,
    gotoLogin,
  }
}
