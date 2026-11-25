// 消息内容渲染、分类判定、@提及解析、摘要与复制/下载动作
import { store } from '../store.js'
import { QUANCODE, qqfaceUrl } from '../qqface-data.js'
import {
  renderMarkdown as renderLuoguMarkdown,
  renderMarkdownPreview as renderLuoguPreview,
} from '../markdown/index.js'
import { esc, formatSize, parseMsgContent } from './format.js'
import { mediaUrlFromData } from './media.js'
import { getUsername, usersJson } from './users.js'
import { parsePoll, pollPlainText } from './poll.js'

export function renderMarkdown(text) {
  return renderLuoguMarkdown(text)
}

export function renderMarkdownPreview(text) {
  return renderLuoguPreview(text)
}

export function isSingleEmoji(text) {
  const t = (text || '').replace(/\s+/g, '')
  if (!t) return false
  const m = t.match(/\p{Extended_Pictographic}(?:\u{200D}\p{Extended_Pictographic}|[\u{FE0F}\u{1F3FB}-\u{1F3FF}])*/gu)
  if (!m || m.length !== 1) return false
  return m[0] === t
}

export function extractMentions(text) {
  const uids = new Set()
  if (!text || typeof text !== 'string' || !text.includes('@')) return []
  const re = /@(\d+)(?![0-9])/g
  let m
  while ((m = re.exec(text)) !== null) {
    const uid = Number(m[1])
    if (store.users[uid]) uids.add(uid)
  }
  if (text.includes('@所有人')) uids.add('all')
  return [...uids]
}

const FILE_EXT_ICONS = {
  pdf: { icon: 'fa-file-pdf', color: '#e2574c' },
  doc: { icon: 'fa-file-word', color: '#2b579a' },
  docx: { icon: 'fa-file-word', color: '#2b579a' },
  xls: { icon: 'fa-file-excel', color: '#217346' },
  xlsx: { icon: 'fa-file-excel', color: '#217346' },
  csv: { icon: 'fa-file-excel', color: '#217346' },
  ppt: { icon: 'fa-file-powerpoint', color: '#d24726' },
  pptx: { icon: 'fa-file-powerpoint', color: '#d24726' },
  txt: { icon: 'fa-file-alt', color: '#8a8f98' },
  md: { icon: 'fa-file-alt', color: '#8a8f98' },
  rtf: { icon: 'fa-file-alt', color: '#8a8f98' },
  zip: { icon: 'fa-file-archive', color: '#c9a227' },
  rar: { icon: 'fa-file-archive', color: '#c9a227' },
  '7z': { icon: 'fa-file-archive', color: '#c9a227' },
  tar: { icon: 'fa-file-archive', color: '#c9a227' },
  gz: { icon: 'fa-file-archive', color: '#c9a227' },
  js: { icon: 'fa-file-code', color: '#e8a33d' },
  ts: { icon: 'fa-file-code', color: '#3178c6' },
  jsx: { icon: 'fa-file-code', color: '#e8a33d' },
  tsx: { icon: 'fa-file-code', color: '#3178c6' },
  html: { icon: 'fa-file-code', color: '#e44d26' },
  css: { icon: 'fa-file-code', color: '#264de4' },
  scss: { icon: 'fa-file-code', color: '#cd6799' },
  json: { icon: 'fa-file-code', color: '#5c8a3f' },
  py: { icon: 'fa-file-code', color: '#3572a5' },
  java: { icon: 'fa-file-code', color: '#e76f00' },
  c: { icon: 'fa-file-code', color: '#555555' },
  cpp: { icon: 'fa-file-code', color: '#f34b7d' },
  h: { icon: 'fa-file-code', color: '#555555' },
  hpp: { icon: 'fa-file-code', color: '#f34b7d' },
  sh: { icon: 'fa-terminal', color: '#4eaa25' },
  bash: { icon: 'fa-terminal', color: '#4eaa25' },
  sql: { icon: 'fa-database', color: '#e38c00' },
  yml: { icon: 'fa-file-code', color: '#8a8f98' },
  yaml: { icon: 'fa-file-code', color: '#8a8f98' },
  xml: { icon: 'fa-file-code', color: '#8a8f98' },
  mp3: { icon: 'fa-file-audio', color: '#e91e63' },
  wav: { icon: 'fa-file-audio', color: '#e91e63' },
  flac: { icon: 'fa-file-audio', color: '#e91e63' },
  aac: { icon: 'fa-file-audio', color: '#e91e63' },
  ogg: { icon: 'fa-file-audio', color: '#e91e63' },
  mp4: { icon: 'fa-file-video', color: '#9c27b0' },
  avi: { icon: 'fa-file-video', color: '#9c27b0' },
  mkv: { icon: 'fa-file-video', color: '#9c27b0' },
  mov: { icon: 'fa-file-video', color: '#9c27b0' },
  webm: { icon: 'fa-file-video', color: '#9c27b0' },
  wmv: { icon: 'fa-file-video', color: '#9c27b0' },
  exe: { icon: 'fa-cogs', color: '#4a4a4a' },
  msi: { icon: 'fa-cogs', color: '#4a4a4a' },
  deb: { icon: 'fa-cogs', color: '#a81c1c' },
  rpm: { icon: 'fa-cogs', color: '#a81c1c' },
  dmg: { icon: 'fa-cogs', color: '#8a8f98' },
  apk: { icon: 'fa-mobile-alt', color: '#3ddc84' },
  appimage: { icon: 'fa-cogs', color: '#8a8f98' },
  iso: { icon: 'fa-compact-disc', color: '#8a8f98' },
  log: { icon: 'fa-file-alt', color: '#8a8f98' },
}

function getFileIconInfo(name) {
  const ext = (String(name == null ? '' : name).split('.').pop() || '').toLowerCase()
  return FILE_EXT_ICONS[ext] || { icon: 'fa-file', color: '#8a8f98' }
}

const parseContentCache = new Map()
const PARSE_CACHE_MAX = 300
const PARSE_ID_CACHE_MAX = 240
// 大消息（含 base64 媒体的 content 常达几十 ~ 上百 KB）的缓存表：键是 msg.id，
// 条目里带原始串做精确校验，保证「同 id 内容被改写」时不会命中旧结果。
const parseContentIdCache = new Map()
const textKindCache = new Map()
const TEXT_KIND_CACHE_MAX = 600
// 超过这个长度的 content 不再参与「整串当 Map 键」的缓存（键本身就会长期占几十 KB），
// 改由调用方传 msg.id 走 id 缓存。
const PARSE_ID_THRESHOLD = 8192

const SOLO_IMAGE_LINE_RE = /^!\[[^\]]*\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)$/
const SAFE_IMG_SRC_RE = /^(?:https?:\/\/|data:image\/|file:\/\/|\/|\.\/)/i

function parseSoloImages(raw) {
  const lines = String(raw).split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const urls = []
  for (const line of lines) {
    const m = SOLO_IMAGE_LINE_RE.exec(line)
    if (!m || !SAFE_IMG_SRC_RE.test(m[1])) {
      urls.length = 0
      break
    }
    urls.push(m[1])
  }
  if (urls.length) return urls
  const flat = String(raw).replace(/[\r\n]+/g, '').trim()
  const one = SOLO_IMAGE_LINE_RE.exec(flat)
  if (one && SAFE_IMG_SRC_RE.test(one[1])) return [one[1]]
  return null
}

function computeTextLike(raw) {
  const s = String(raw)
  const head = s.trimStart()
  const c = head.charCodeAt(0)
  if (c !== 123 /* { */ && c !== 33 /* ! */) return true
  if (c === 33 && parseSoloImages(head)) return false
  const obj = parseMsgContent(s)
  if (!obj) return true
  if (obj.type === 'file' || obj.type === 'sticker' || obj.type === 'emoji' || obj.type === 'pat' || obj.type === 'poll') {
    return false
  }
  return true
}

export function isTextLikeContent(raw) {
  if (!raw) return false
  const s = String(raw)
  const cacheable = s.length <= 4096
  if (cacheable) {
    const cached = textKindCache.get(s)
    if (cached !== undefined) return cached
  }
  const result = computeTextLike(s)
  if (cacheable) {
    if (textKindCache.size >= TEXT_KIND_CACHE_MAX) {
      textKindCache.delete(textKindCache.keys().next().value)
    }
    textKindCache.set(s, result)
  }
  return result
}

function _parseContentImpl(raw, senderId, mediaCacheKey) {
  const soloImages = parseSoloImages(raw)
  if (soloImages) {
    return soloImages
      .map((u) => `<img class="chat-image" data-image-msg="1" src="${esc(u)}" data-media="${esc(u)}">`)
      .join('')
  }
  const obj = parseMsgContent(raw)
  if (!obj) {
    if (String(raw).trim().startsWith('{')) {
      const t = String(raw)
      return '<div class="unknown-msg">' + esc(t.length > 2000 ? t.slice(0, 2000) + '…' : t) + '</div>'
    }
    return renderMarkdown(raw)
  }
  if (obj.type === 'file') {
    const isImage = /^image\//.test(obj.mime || '') || /\.(jpg|jpeg|png|gif|bmp|webp|ico)$/i.test(obj.name || '')
    let fileHtml = ''
    if (isImage) {
      const src = mediaUrlFromData(obj.data || '', obj.mime || 'image/png', mediaCacheKey)
      fileHtml = `<img class="chat-image" data-image-msg="1" src="${esc(src)}" data-media="${esc(src)}" data-mime="${esc(obj.mime || '')}">`
    } else {
      const fi = getFileIconInfo(obj.name || '')
      const b64 = obj.data || ''
      fileHtml = `<div class="file-msg" draggable="true" data-file-b64="${esc(b64)}" data-name="${esc(obj.name)}" data-mime="${esc(obj.mime || '')}">
  <div class="file-msg-icon" style="color:${fi.color}"><i class="fas ${fi.icon}"></i></div>
  <div class="file-msg-info">
    <div class="file-msg-name">${esc(obj.name)}</div>
    <div class="file-msg-size">${formatSize(obj.size)}</div>
  </div>
</div>`
    }
    if (obj.content && obj.content.trim()) {
      fileHtml += '<div class="file-text-content luogu-md">' + renderMarkdown(obj.content) + '</div>'
    }
    return fileHtml
  }
  if (obj.type === 'sticker') {
    const src = mediaUrlFromData(obj.data || '', obj.mime || 'image/png', mediaCacheKey)
    return `<span class="sticker-msg"><img src="${esc(src)}" alt="${esc(obj.name || '')}" data-media="${esc(src)}" data-mime="${esc(obj.mime || '')}"></span>`
  }
  if (obj.type === 'emoji') {
    const emojiText = String(obj.content || '').trim()
    if (isSingleEmoji(emojiText)) {
      return '<span class="emoji-msg">' + esc(emojiText) + '</span>'
    }
    const qface = QUANCODE.get(emojiText.toLowerCase())
    if (qface) {
      return '<span class="emoji-msg"><img class="qqface" src="' + qqfaceUrl(qface.file) + '" alt="' + esc(qface.name) + '" data-code="' + esc(emojiText) + '"></span>'
    }
    return renderMarkdown(obj.content || '')
  }
  if (obj.type === 'pat') {
    const patTarget = obj.target
    if (patTarget == null || Array.isArray(patTarget) || !/^\d+$/.test(String(patTarget))) {
      return renderMarkdown(raw)
    }
    const senderName = senderId ? getUsername(senderId, store.users) : ''
    const targetName = getUsername(patTarget, store.users)
    const senderKnown = senderId ? !!(store.users?.[senderId] || usersJson?.[senderId]) : false
    const targetKnown = !!(store.users?.[patTarget] || usersJson?.[patTarget])
    const senderHtml = senderId
      ? senderKnown ? `<span class="pat-user" data-uid="${senderId}">${esc(senderName)}</span>` : esc(senderName)
      : ''
    const targetHtml = targetKnown
      ? `<span class="pat-user" data-uid="${patTarget}">${esc(targetName)}</span>`
      : esc(targetName)
    return '<div class="pat-msg">' + senderHtml + ' 拍了拍 ' + targetHtml + '</div>'
  }
  if (obj.type === 'poll') {
    const p = parsePoll(obj)
    if (p) {
      const lines = p.opts.length
        ? p.opts.map((o, i) => esc(i + 1 + '. ' + o)).join('<br>')
        : esc('（开放题：由投票者自拟答案）')
      return '<div class="poll-fallback">🗳️ ' + esc(p.q) + (lines ? '<br>' + lines : '') + '</div>'
    }
    return renderMarkdown(raw)
  }
  if (obj.type === 'text') {
    let html = ''
    if (obj.reply_to) {
      const replyContent = esc(obj.reply_content || '').slice(0, 80)
      const replyId = String(obj.reply_to)
      if (/^\d+$/.test(replyId)) {
        html += '<div class="reply-quote" data-reply-id="' + replyId + '"><i class="fas fa-quote-left reply-quote-icon"></i><span class="reply-quote-text">' + replyContent + '</span></div>'
      } else {
        html += '<div class="reply-quote"><i class="fas fa-quote-left reply-quote-icon"></i><span class="reply-quote-text">' + replyContent + '</span></div>'
      }
    }
    if (obj.fmt === 'txt') {
      html += '<div class="plain-msg">' + esc(obj.content || '') + '</div>'
    } else {
      html += renderMarkdown(obj.content || '')
    }
    if (Array.isArray(obj.mentions) && obj.mentions.length) {
      if (obj.mentions.includes('all')) {
        html = html.replace(/@所有人/g, '<span class="mention-tag mention-all" data-uid="all">@所有人</span>')
      }
      const ids = obj.mentions.filter((u) => u !== 'all' && /^\d+$/.test(String(u)))
      if (ids.length) {
        try {
          const pattern = new RegExp('@(' + ids.map(String).join('|') + ')(?![0-9])', 'g')
          html = html.replace(pattern, (_match, uid) => {
            return '<span class="mention-tag" data-uid="' + uid + '">@' + esc(getUsername(Number(uid), store.users)) + '</span>'
          })
        } catch {}
      }
    }
    return html
  }
  return '<div class="unknown-msg">[不支持的消息类型：' + esc(obj && obj.type ? String(obj.type) : '?') + ']</div>'
}

/**
 * 消息内容 → 气泡 HTML。
 *
 * @param raw       原始 content
 * @param senderId  发送者（拍拍乐等需要按发送者渲染）
 * @param cacheId   可选，建议传 msg.id。传入后：
 *                  - content 长度 > 8KB（含 base64 媒体的消息）走「按 id 缓存」，
 *                    避免把几十 KB 的 base64 串本身当成 Map 键长期驻留；
 *                  - 条目里同时保存原始串做精确校验，同 id 内容被改写（投票合并、
 *                    补同步覆盖）时不会命中旧 HTML。
 *                  不传则行为与以前完全一致（只按 raw+senderId 缓存）。
 */
export function parseContent(raw, senderId, cacheId) {
  if (!raw) return renderMarkdown(raw || '')
  const big = raw.length > PARSE_ID_THRESHOLD
  const useIdKey = big && cacheId != null && cacheId !== ''

  if (useIdKey) {
    const idKey = String(cacheId)
    const hit = parseContentIdCache.get(idKey)
    if (hit && hit.raw === raw && hit.senderId === senderId) return hit.html
    const html = _parseContentImpl(raw, senderId, idKey)
    if (parseContentIdCache.size >= PARSE_ID_CACHE_MAX) {
      parseContentIdCache.delete(parseContentIdCache.keys().next().value)
    }
    parseContentIdCache.set(idKey, { raw, senderId, html })
    return html
  }

  const cacheKey = senderId != null ? raw + '\u0001' + senderId : raw
  const cached = parseContentCache.get(cacheKey)
  if (cached != null) return cached
  const result = _parseContentImpl(raw, senderId)
  if (parseContentCache.size >= PARSE_CACHE_MAX) {
    parseContentCache.delete(parseContentCache.keys().next().value)
  }
  parseContentCache.set(cacheKey, result)
  return result
}

/** 提取单条消息的可读纯文本摘要（会话列表 / 搜索结果 / 回复引用 / 通知共用） */
export function getMessagePlainText(rawContent) {
  const parsed = parseMsgContent(rawContent)
  if (parsed) {
    if (parsed.type === 'text') return parsed.content || ''
    if (parsed.type === 'file') {
      let s = '📄 ' + (parsed.name || '')
      if (parsed.content) s += ': ' + parsed.content
      return s
    }
    if (parsed.type === 'sticker') return '🖼️ ' + (parsed.name || '表情')
    if (parsed.type === 'emoji') return (parsed.content || '') + ' '
    if (parsed.type === 'pat') return '👋 拍了拍'
    if (parsed.type === 'poll') return pollPlainText(parsed)
    if (parsed.type === 'vote') return '🗳️ 投票'
    return '[消息]'
  }
  const raw = String(rawContent || '')
  return raw.startsWith('{') ? '[消息]' : raw
}

export function getLastMessage(messageIds, messages) {
  if (!messageIds || messageIds.length === 0 || !messages) return ''
  let lastId = null
  let lastTime = -1
  for (const id of messageIds) {
    const msg = messages[id]
    if (msg && (msg.send_time || 0) > lastTime) {
      lastTime = msg.send_time || 0
      lastId = id
    }
  }
  if (!lastId) return ''
  return getMessagePlainText(messages[lastId].content)
}

export function getLastMessageTime(messageIds, messages) {
  if (!messageIds || messageIds.length === 0 || !messages) return 0
  let lastTime = 0
  for (const id of messageIds) {
    const msg = messages[id]
    if (msg) {
      const t = msg.send_time || msg.time || 0
      if (t > lastTime) lastTime = t
    }
  }
  return lastTime
}

export function getLastMessageSender(messageIds, messages) {
  if (!messageIds || messageIds.length === 0 || !messages) return ''
  let lastId = null
  let lastTime = -1
  for (const id of messageIds) {
    const msg = messages[id]
    if (msg && (msg.send_time || 0) > lastTime) {
      lastTime = msg.send_time || 0
      lastId = id
    }
  }
  if (!lastId) return ''
  const msg = messages[lastId]
  if (msg.sender) {
    const user = store.users?.[msg.sender]
    if (user) {
      const name = user.note || user.nickname || user.username || `User_${msg.sender}`
      return name + ': '
    }
  }
  return ''
}

/** 复制消息内容（文本 / 表情 / 文件 / 自定义表情），供消息列表与预览栏共用 */
export async function copyMsgContent(content) {
  const obj = parseMsgContent(content)
  if (obj && obj.type === 'file' && obj.data) {
    const isImage = /^image\//.test(obj.mime || '')
    if (isImage) {
      const r = await window.api.clipboardWriteImage(obj.data)
      if (!r.success) await window.api.clipboardWriteText(obj.name || '')
    } else {
      await window.api.clipboardWriteText(obj.name || '')
    }
    return
  }
  if (obj && obj.type === 'sticker' && obj.data) {
    const r = await window.api.clipboardWriteImage(obj.data)
    if (!r.success) await window.api.clipboardWriteText(obj.name || '')
    return
  }
  let text = ''
  if (obj) {
    if (obj.type === 'text' || obj.type === 'emoji') text = obj.content
    else text = content
  } else {
    text = content
  }
  await window.api.clipboardWriteText(text)
}

/** 下载消息内嵌的文件 / 图片，供消息列表与预览栏共用 */
export function downloadMsgContent(content) {
  const obj = parseMsgContent(content)
  if (obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data) {
    window.api.downloadFile(obj.data, obj.name || 'download', obj.mime)
  }
}
