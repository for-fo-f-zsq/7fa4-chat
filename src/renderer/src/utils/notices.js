// 站点通知数据归一化、接口路径构造与安全跳转 URL 解析（零 DOM / store 副作用）

export function normalizeNoticeFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function normalizeNoticeTimestamp(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
}

export function normalizeNotice(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = Number(raw.id)
  if (!Number.isInteger(id) || id <= 0) return null
  return {
    id,
    user_id: Number(raw.user_id ?? raw.userId ?? 0) || 0,
    date: normalizeNoticeTimestamp(raw.date),
    notice_text: String(raw.notice_text ?? raw.noticeText ?? ''),
    jump_url: String(raw.jump_url ?? raw.jumpUrl ?? '').trim(),
    checked: normalizeNoticeFlag(raw.checked),
    noticed: normalizeNoticeFlag(raw.noticed),
  }
}

export function sortNotices(list) {
  return [...list].sort((a, b) => (b.date - a.date) || (b.id - a.id))
}

export function parseNoticesPayload(data) {
  let rawList = null
  if (Array.isArray(data)) {
    rawList = data
  } else if (data && typeof data === 'object' && Array.isArray(data.notices) && data.success !== false) {
    rawList = data.notices
  }
  if (!rawList) return { ok: false, notices: [] }
  const dedup = new Map()
  for (const item of rawList) {
    const n = normalizeNotice(item)
    if (n) dedup.set(n.id, n)
  }
  return { ok: true, notices: sortNotices(dedup.values()) }
}

/**
 * 构造通知状态更新请求路径：
 * GET /notice/:id/checked/:result 或 /notice/:id/noticed/:result
 * result 为 '1' 或 ''（置为未读/未确认）。
 */
export function buildNoticeUpdateUrl(id, field, result) {
  const nid = Number(id)
  if (!Number.isInteger(nid) || nid <= 0) {
    throw new RangeError(`Invalid notice id: ${id}`)
  }
  if (field !== 'checked' && field !== 'noticed') {
    throw new RangeError(`Invalid notice field: ${field}`)
  }
  const flag = normalizeNoticeFlag(result) ? '1' : ''
  return `/notice/${nid}/${field}/${flag}`
}

/**
 * 将相对 jump_url（如 /problem/123）或完整 URL 规范化为安全的外链地址。
 * 非法协议（如 javascript:）或非法 URL 一律返回空串。
 */
export function resolveNoticeJumpUrl(jumpUrl, originBase = '') {
  const raw = String(jumpUrl || '').trim()
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return ''
  try {
    let target = raw
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      const base = String(originBase || '').trim().replace(/\/+$/, '')
      if (!base) return ''
      target = `${base}${raw}`
    }
    const parsed = new URL(target)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.href
  } catch {
    return ''
  }
}

function decodeBasicEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
}

function stripTags(html) {
  return decodeBasicEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
}

/**
 * 将可能含简单 HTML（如 <a href="...">）的通知正文拆成可安全渲染的文本/外链片段，避免 XSS。
 */
export function parseNoticeTextSegments(noticeText, originBase = '') {
  const source = String(noticeText || '')
  if (!source) return []
  const segments = []
  const linkRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi
  let lastIndex = 0
  let match

  const pushText = (txt) => {
    const cleaned = stripTags(txt)
    if (!cleaned) return
    const prev = segments[segments.length - 1]
    if (prev && prev.type === 'text') prev.text += cleaned
    else segments.push({ type: 'text', text: cleaned })
  }

  while ((match = linkRe.exec(source)) !== null) {
    if (match.index > lastIndex) pushText(source.slice(lastIndex, match.index))
    const rawHref = decodeBasicEntities(match[1] ?? match[2] ?? match[3] ?? '')
    const label = stripTags(match[4] || '') || rawHref
    const safeUrl = resolveNoticeJumpUrl(rawHref, originBase)
    if (safeUrl) {
      segments.push({ type: 'link', text: label, url: safeUrl })
    } else {
      pushText(label)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < source.length) pushText(source.slice(lastIndex))

  return segments.length ? segments : [{ type: 'text', text: stripTags(source) }]
}
