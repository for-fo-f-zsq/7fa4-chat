/**
 * 通用工具：时间格式化、字节、确认框、轻提示
 */

/** 时间戳（毫秒）→ 相对时间 */
export function relTime(ts) {
  if (!ts) return '—'
  const d = Date.now() - Number(ts)
  if (!Number.isFinite(d)) return '—'
  if (d < 0) return fmtTime(ts)
  const sec = Math.floor(d / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo} 个月前`
  return `${Math.floor(mo / 12)} 年前`
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/** 时间戳 → YYYY-MM-DD HH:mm */
export function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 时间戳 → YYYY-MM-DD */
export function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 时间戳 → YYYY-MM-DD HH:mm:ss */
export function fmtTimeFull(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  return `${fmtTime(ts)}:${pad(d.getSeconds())}`
}

/** 字节 → 可读 */
export function fmtBytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return v + ' B'
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB'
  return (v / 1024 / 1024).toFixed(2) + ' MB'
}

/** 角色文案 */
export function roleLabel(role) {
  return role === 'super' ? '超级管理员' : role === 'ops' ? '运营' : role || '—'
}

/** 状态文案 */
export function statusLabel(s) {
  return s === 'active' ? '启用' : s === 'disabled' ? '停用' : s || '—'
}

/** 把后端错误翻译成人话 */
export function errText(e) {
  if (!e) return '未知错误'
  return e.message || String(e)
}

// ==================== 轻提示 ====================

import { reactive } from 'vue'

const toasts = reactive([])
let seq = 0

export const toastState = toasts

export function toast(message, type = 'info', ms = 3200) {
  const id = ++seq
  toasts.push({ id, message, type })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, ms)
}

toast.ok = (m, ms) => toast(m, 'ok', ms)
toast.error = (m, ms) => toast(m, 'error', ms || 4600)
toast.info = (m, ms) => toast(m, 'info', ms)
