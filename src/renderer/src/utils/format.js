// 纯格式化与消息 JSON 解析工具（零 store/DOM 运行时副作用，供所有域与单测共用）

/**
 * HTML 转义。
 * 注意：s 可能不是字符串（content 来自服务端，字段类型不受控：{"type":"file","name":123}），
 * 先 String() 归一，避免在数字/对象上抛 TypeError。
 */
export function esc(s) {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/**
 * 反转义 HTML 实体（仅用于「历史脏数据」兜底，正常流程禁止先反转义再 JSON.parse）。
 */
export function unescapeHtml(s) {
  if (!s) return ''
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * 解析消息内容为 JSON 对象，失败返回 null。
 * 先按原样解析；仅失败时回退「先反转义再解析」。只认 JSON 对象，排除数字/null/布尔/数组。
 */
export function parseMsgContent(content) {
  if (!content) return null
  if (typeof content === 'object') return Array.isArray(content) ? null : content
  const raw = String(content)
  const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
  try {
    const v = JSON.parse(raw)
    if (asObject(v)) return v
  } catch {}
  try {
    const v = JSON.parse(unescapeHtml(raw))
    if (asObject(v)) return v
  } catch {}
  return null
}

export function gettime1(date) {
  const now = Date.now() / 1000
  const diff = now - date
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
  return Math.floor(diff / 86400) + '天前'
}

export function gettime2(date) {
  return new Date(date * 1000).toLocaleString()
}

export function getMutetime(muteUntil, nowSec) {
  if (!muteUntil || muteUntil === 0) return ''
  const remaining = muteUntil - (nowSec || Math.floor(Date.now() / 1000))
  if (remaining <= 0) return ''
  if (remaining < 60) return remaining + '秒'
  if (remaining < 3600) return Math.floor(remaining / 60) + '分钟'
  if (remaining < 86400) return Math.floor(remaining / 3600) + '小时'
  return Math.floor(remaining / 86400) + '天'
}

export function formatDateSeparator(timestamp) {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (msgDate.getTime() === today.getTime()) return '今天'
  if (msgDate.getTime() === yesterday.getTime()) return '昨天'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  if (year === now.getFullYear()) return `${month}月${day}日`
  return `${year}年${month}月${day}日`
}

export function isSameDay(ts1, ts2) {
  if (!ts1 || !ts2) return false
  const d1 = new Date(ts1 * 1000)
  const d2 = new Date(ts2 * 1000)
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

export function formatSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return (n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i]
}

export function highlightKeyword(text, keyword) {
  if (!keyword) return esc(text)
  const escaped = esc(text)
  const re = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return escaped.replace(re, '<mark class="search-highlight">$1</mark>')
}

/** 文本 → base64（UTF-8 安全）。工具类保存统一传 base64（与 downloadFile 同一载荷格式） */
export function textToBase64(text) {
  const bytes = new TextEncoder().encode(String(text == null ? '' : text))
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
