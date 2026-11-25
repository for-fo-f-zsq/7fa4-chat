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
 *
 * 性能：
 * 1) 快速排除 —— JSON 对象必定以 `{` 开头，所以纯文本消息（绝大多数）连一次 JSON.parse
 *    都不用尝试。历史实现是无条件两次 JSON.parse（第二次还要先跑 unescapeHtml 的 5 条
 *    replace），几百条纯文本消息滚一遍就是几百次必然失败的异常抛出 + 字符串重写。
 * 2) 可选缓存 —— 只有调用方显式传入 cacheKey（建议用 msg.id）时才读写缓存，并把返回对象
 *    视为**只读共享对象**。不传 key 的老调用方每次拿到新对象，语义完全不变：像
 *    chatSync.js 里 `mobj.voteMeta = …` 这种会原地改结果的地方必须继续不传 key。
 */
const MSG_JSON_CACHE = new Map()
const MSG_JSON_CACHE_MAX = 400

export function parseMsgContent(content, cacheKey) {
  if (!content) return null
  if (typeof content === 'object') return Array.isArray(content) ? null : content
  const raw = String(content)
  // JSON 对象一定以 `{` 开头（允许前导空白）。首字符不是 `{` 且不是空白，
  // 就不可能解析出对象 —— 直接返回 null，省掉两次必然失败的 JSON.parse。
  const c0 = raw.charCodeAt(0)
  if (c0 !== 123 /* { */) {
    const isSpace = c0 === 32 || c0 === 10 || c0 === 9 || c0 === 13
    if (!isSpace || raw.trimStart().charCodeAt(0) !== 123) return null
  }

  const key = cacheKey == null ? null : '#' + cacheKey
  if (key !== null) {
    const hit = MSG_JSON_CACHE.get(key)
    // 缓存条目带原始串：同一个 id 的内容可能被改写（投票票数、编辑重发），
    // 只有 raw 完全一致才认命中，绝不会把旧解析结果当新内容。
    if (hit && hit.raw === raw) return hit.value
  }

  let result = null
  const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
  try {
    const v = JSON.parse(raw)
    if (asObject(v)) result = v
  } catch {}
  if (result === null) {
    try {
      const v = JSON.parse(unescapeHtml(raw))
      if (asObject(v)) result = v
    } catch {}
  }

  if (key !== null) {
    if (MSG_JSON_CACHE.size >= MSG_JSON_CACHE_MAX) {
      MSG_JSON_CACHE.delete(MSG_JSON_CACHE.keys().next().value)
    }
    MSG_JSON_CACHE.set(key, { raw, value: result })
  }
  return result
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
