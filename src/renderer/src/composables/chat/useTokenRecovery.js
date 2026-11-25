import { ref, watch, onUnmounted } from 'vue'
import { store } from '../../store.js'
import { normalizeFree } from '../../utils/chatSync.js'

// 悬浮提示里最多列 50 行
const MAX_ROWS = 50
// 全量扫描的最小间隔：提示条每秒刷新一次「剩余秒数」，但那只是对已收集到的时间戳做减法，
// 不需要每秒把整个消息库再扫一遍。
const RESCAN_INTERVAL_MS = 2000

/**
 * 发言 Token 滑动窗口恢复倒计时统计。
 *
 * 性能约定（语义与原来完全一致）：
 *   - 全量收集（遍历 store.messages + ownVotes）只在「打开提示 / 距上次收集 ≥2s / 切账号」时做一次；
 *   - 每秒的刷新只对缓存的时间戳算 left，不做 store 读取、不做排序、不建 Set；
 *   - 遍历改用 for..in 避免 Object.values 建大数组。
 */
export function useTokenRecovery() {
  const tokenInfo = ref(null)
  const tokenTipVisible = ref(false)
  const tokenRecovery = ref([])
  let tokenTipTimer = null

  // 已收集的候选时间戳（只存 number，按时间升序），null 表示需要重新收集
  let candidates = null
  let lastScanAt = 0
  let lastScanUid = null
  let lastScanWindowSec = 0

  function recoverySeconds() {
    return (tokenInfo.value && tokenInfo.value.recoverySeconds) || store.tokenLimit?.time_limit || 2400
  }

  function scan() {
    const now = Date.now()
    const sec = recoverySeconds()
    const windowMs = sec * 1000
    const uid = store.self && store.self.uid
    const times = []
    if (uid != null) {
      const seenIds = new Set()
      const messages = store.messages || {}
      for (const key in messages) {
        const m = messages[key]
        if (!m || m.sender != uid) continue
        if (normalizeFree(m.free ?? m.token_free)) continue
        if (m.id != null) seenIds.add(String(m.id))
        const t = Number(m.send_time) * 1000
        if (!t || now - t > windowMs) continue
        times.push(t)
      }
      for (const v of Array.isArray(store.ownVotes) ? store.ownVotes : []) {
        if (!v || normalizeFree(v.free ?? v.token_free)) continue
        if (v.id != null && seenIds.has(String(v.id))) continue
        const t = Number(v.send_time) * 1000
        if (!t || now - t > windowMs) continue
        if (v.id != null) seenIds.add(String(v.id))
        times.push(t)
      }
      times.sort((a, b) => a - b)
      if (times.length > MAX_ROWS) times.length = MAX_ROWS
    }
    candidates = times
    lastScanAt = now
    lastScanUid = uid == null ? null : uid
    lastScanWindowSec = sec
  }

  function refreshRecovery() {
    const now = Date.now()
    const uid = store.self && store.self.uid
    const sec = recoverySeconds()
    if (
      candidates === null
      || now - lastScanAt >= RESCAN_INTERVAL_MS
      || lastScanUid !== (uid == null ? null : uid)
      || lastScanWindowSec !== sec
    ) {
      scan()
    }
    const windowMs = sec * 1000
    const rows = []
    for (const t of candidates) {
      const leftMs = t + windowMs - now
      if (leftMs < 0) continue
      rows.push({ time: t, left: leftMs / 1000 })
    }
    tokenRecovery.value = rows
  }

  function onTokenHover(show) {
    tokenTipVisible.value = show
    clearInterval(tokenTipTimer)
    tokenTipTimer = null
    if (show) {
      // 打开时立刻用最新数据算一次（把 candidates 置空强制重扫）
      candidates = null
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

  // 换账号时丢弃上一个账号的缓存，避免把别人的待恢复时间当成自己的
  watch(
    () => store.self?.uid,
    () => { candidates = null },
  )

  onUnmounted(() => {
    clearInterval(tokenTipTimer)
    tokenTipTimer = null
    candidates = null
  })

  return {
    tokenInfo,
    tokenTipVisible,
    tokenRecovery,
    onTokenHover,
    fmtLeft,
  }
}
