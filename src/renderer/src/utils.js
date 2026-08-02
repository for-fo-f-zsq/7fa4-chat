import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { reactive } from 'vue'
import { store } from './store.js';

// ========== 用户姓名数据库（加密存储） ==========
// 明文 users.json 已从仓库移除，改打包为 AES-256-GCM 加密的 users.7c，
// 由主进程直接读取解密（IPC），不再依赖 HTTP 静态服务。密钥随客户端分发，属"混淆级"防护，
// 目的是避免公开仓库直接包含实名映射；更强的方案是改为服务端按需下发。
export const usersJson = reactive({});

export async function loadUsersDb() {
  try {
    if (!window.api?.loadUsersDb) return false;
    const r = await window.api.loadUsersDb()
    if (!r.success) {
      console.error('[users-db] 加载失败:', r.error)
      return false
    }
    const obj = r.data
    for (const k of Object.keys(usersJson)) delete usersJson[k];
    Object.assign(usersJson, obj);
    return true;
  } catch (e) {
    console.error('[users-db] 加载失败:', e);
    return false;
  }
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// ========== 年级颜色系统 ==========
const COLOR_KEYS = ['x4', 'x5', 'x6', 'c1', 'c2', 'c3', 'g1', 'g2', 'g3', 'd1', 'd2', 'd3', 'd4', 'by', 'jl', 'uk']

const GRADE_LABELS = {
  x4: '小四', x5: '小五', x6: '小六',
  c1: '初一', c2: '初二', c3: '初三',
  g1: '高一', g2: '高二', g3: '高三',
  d1: '大一', d2: '大二', d3: '大三', d4: '大四',
  by: '毕业', jl: '教练', uk: '其他'
}

const DEFAULT_PALETTE = {
  x4: '#9a7240', x5: '#7d5a2e', x6: '#60421c',
  c1: '#2d8fa5', c2: '#1f7a92', c3: '#0f657f',
  g1: '#3d8a4e', g2: '#2a7538', g3: '#176025',
  d1: '#5568b0', d2: '#43549e', d3: '#32408c', d4: '#212c7a',
  by: '#777777', jl: '#c4587a', uk: '#666666'
}

export { COLOR_KEYS, GRADE_LABELS, DEFAULT_PALETTE }

// ========== 消息长度限制 ==========
export const MAX_MSG_LENGTH = 102400;

// ========== 图片压缩 (Canvas) ==========
export function compressImage(file) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith('image/')) {
      // 非图片：直接读 base64 不压缩
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result.split(',')[1];
        resolve({ data, size: file.size });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const MAX_DIM = 1920;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.6;
      const tryEncode = () => {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const data = dataUrl.split(',')[1];
        const compressedSize = Math.round(data.length * 3 / 4);
        if (data.length > 102200 && quality > 0.15) {
          quality -= 0.1;
          tryEncode();
        } else {
          resolve({ data, size: compressedSize });
        }
      };
      tryEncode();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result.split(',')[1];
        resolve({ data, size: file.size });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
}

// 从 base64 数据压缩图片（用于主进程返回的原始 base64）
export function compressBase64Image(base64Data, mime) {
  return new Promise((resolve) => {
    if (!mime?.startsWith('image/')) { resolve({ data: base64Data, size: Math.round(base64Data.length * 3 / 4) }); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const MAX_DIM = 1920;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.6;
      const tryEncode = () => {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const data = dataUrl.split(',')[1];
        const compressedSize = Math.round(data.length * 3 / 4);
        if (data.length > 102200 && quality > 0.15) {
          quality -= 0.1;
          tryEncode();
        } else {
          resolve({ data, size: compressedSize });
        }
      };
      tryEncode();
    };
    img.onerror = () => resolve(base64Data);
    img.src = `data:${mime};base64,${base64Data}`;
  });
}

export function getAvatarInitial(uid) {
  if (!uid) return '?'
  const user = store.users?.[uid]
  // 优先使用 realname（真名）
  if (user?.realname) return user.realname.charAt(0)
  const name = usersJson?.[uid]?.name
  if (name) return name.charAt(0)
  if (user?.nickname) return user.nickname.charAt(0)
  if (user?.username) return user.username.charAt(0)
  return String(uid).charAt(0)
}

export function getGradeColor(uid) {
  const colorKey = usersJson?.[uid]?.colorKey
  if (!colorKey) return ''
  // 优先级：自定义 > 主题CSS变量 > 硬编码默认
  const customPalette = store.setting?.gradeColors || {}
  if (customPalette[colorKey]) return customPalette[colorKey]
  const cssVar = getComputedStyle(document.documentElement).getPropertyValue(`--grade-${colorKey}`).trim()
  if (cssVar) return cssVar
  return DEFAULT_PALETTE[colorKey] || ''
}

export function getGradeLabel(uid) {
  const colorKey = usersJson?.[uid]?.colorKey
  if (!colorKey) return ''
  return GRADE_LABELS[colorKey] || ''
}

export async function safeFetch(url, options = {}, timeout = 0) {
  try {
    let res
    if (timeout > 0) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeout)
      try {
        res = await fetch(url, { ...options, signal: ctrl.signal })
      } finally {
        clearTimeout(timer)
      }
    } else {
      res = await fetch(url, options)
    }
    // 检测到返回 HTML（通常是会话失效被服务端重定向到登录页）：直接退出登录跳转到 login，不尝试重新登录
    const _ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (_ctype.includes('text/html')) {
      store.logined = false
      return { json: async () => ({ success: false, err: { message: '会话已失效，请重新登录' } }) }
    }
    if (!res.ok) return { json: async () => ({ success: false, err: { message: res.statusText } }) }
    try {
      const data = await res.json()
      return { json: async () => data }
    } catch {
      // 非 JSON（即 HTML，会话失效）：直接退出登录，不尝试重新登录，也不清空已保存的密码
      store.logined = false
      return { json: async () => ({ success: false, err: { message: '会话已失效，请重新登录' } }) }
    }
  } catch (e) {
    return { json: async () => ({ success: false, err: { message: e.message || '网络错误' } }) }
  }
}

export async function tryLogin(user, pwd) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: user, password: pwd }),
    credentials: 'include'
  })
  if (!res.ok) return { error_code: -1 }
  try { return await res.json() } catch { return { error_code: -1 } }
}

export function esc(s) {
  return s?.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) || ''
}

// 反转义 HTML 实体（消息内容存储前已转义，读取时需还原）
export function unescapeHtml(s) {
  if (!s) return ''
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

// 解析消息内容为对象，失败返回 null
export function parseMsgContent(content) {
  if (!content) return null
  try { return JSON.parse(unescapeHtml(content)) } catch { return null }
}

// 将聊天接口返回的 chat 写入 store，返回解码后的内容与 token 信息
export function applyChatToStore(r, pageType, pageId) {
  const c = r.chat
  const target = pageType === 'user' ? store.users[pageId] : pageType === 'group' ? store.groups[pageId] : (store.users[pageId] || store.groups[pageId])
  if (target) {
    store.messages[c.id] = { id: c.id, sender: c.sender_id, send_time: c.send_time, content: c.content }
    target.message_ids.push(c.id)
  }
  return { tokenInfo: { remain: r.remain_token_count, total: r.remain_token_count + r.used_token_count } }
}

// 统一发送聊天消息：封装 fetch，返回接口响应
export async function sendChatMessage({ type, targetId, msgObj }) {
  let content = JSON.stringify(msgObj);
  if (content.length > MAX_MSG_LENGTH) {
    if (msgObj.type === 'text') {
      // 文本消息截断
      msgObj.content = msgObj.content.slice(0, msgObj.content.length - (content.length - MAX_MSG_LENGTH) - 10);
      content = JSON.stringify(msgObj);
    }
    // 文件/sticker 消息不应截断 data，应该在进入前就压缩好了
    // 如果仍然超出，说明压缩不够，返回错误
    if (content.length > MAX_MSG_LENGTH) {
      return { success: false, err: { message: `消息过长 (${content.length}/${MAX_MSG_LENGTH})` } };
    }
  }
  return await (await safeFetch('/chat/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, target_id: targetId, content: content })
  })).json()
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

export function getRealname(user) {
  if (!user) return ''
  return user.realname || usersJson?.[user.uid]?.name || ''
}

export function getUsername(uid, users) {
  if (!uid) return ''
  const source = users || store.users
  if (!source) return 'User_' + uid
  const user = source[uid]
  if (!user) {
    const name = usersJson?.[uid]?.name
    return name || 'User_' + uid
  }
  const nickname = user.note || user.nickname || user.username
  const real = getRealname(user)
  return real ? nickname + '(' + real + ')' : nickname || uid
}

export function displayName(user) {
  if (!user) return ''
  const uid = user.uid
  const nick = user.note || user.nickname || user.username || (uid ? 'User_' + uid : '') || ''
  const real = getRealname(user)
  if (real) return `${nick}(${real})`
  if (uid && usersJson?.[uid]?.name) return usersJson[uid].name
  return nick
}

// ========== 用户信息爬取（ranklist） ==========
let _ranklistFetching = false
let _ranklistTimer = null
export const ranklistOrder = [] // 按 ranklist 顺序存储 uid

export function startRanklistFetch() {
  if (_ranklistTimer) return
  _doFetchRanklist()
  _ranklistTimer = setInterval(_doFetchRanklist, 10 * 60 * 1000)
}

async function _doFetchRanklist() {
  if (_ranklistFetching) return
  _ranklistFetching = true
  try {
    ranklistOrder.length = 0
    let page = 1
    let lastFirstUid = null
    while (true) {
      const res = await fetch(`/ranklist?page=${page}`)
      if (!res.ok) break
      const html = await res.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const rows = doc.querySelectorAll('tbody tr')
      if (rows.length === 0) break
      let firstUid = null
      for (const row of rows) {
        const tds = row.querySelectorAll('td')
        if (tds.length < 6) continue
        const link = tds[1].querySelector('a')
        if (!link) continue
        const uid = Number(link.getAttribute('href')?.replace('/user/', ''))
        if (!uid) continue
        if (firstUid === null) firstUid = uid
        const nickname = tds[2]?.textContent.trim() || ''
        const username = tds[3]?.textContent.trim() || ''
        if (!nickname && !username) continue
        ranklistOrder.push(uid)
        const old = store.users[uid]
        const newData = {
          uid,
          realname: old?.realname || '',
          username: username || old?.username || '',
          nickname: nickname || old?.nickname || '',
          grade: old?.grade || '',
          grade_class: old?.grade_class || '',
          seat: old?.seat || '',
          note: old?.note || '',
          message_ids: old?.message_ids || [],
          unread: old?.unread || false,
          pinned: old?.pinned || false,
          show: old ? old.show : false,
          _fetchedAt: new Date().toISOString()
        }
        if (old && old.username === newData.username && old.nickname === newData.nickname && old.seat === newData.seat && old._fetchedAt) {
          old._fetchedAt = newData._fetchedAt
          continue
        }
        store.users[uid] = newData
      }
      // 超出最大页数时返回最后一页，检测首行 uid 重复则停止
      if (firstUid !== null && firstUid === lastFirstUid) break
      lastFirstUid = firstUid
      page++
      await new Promise(r => setTimeout(r, 300))
    }
  } catch (e) { console.error('[ranklist] fetch error:', e) }
  _ranklistFetching = false
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
  const msg = messages[lastId]
  try {
    const parsed = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
    if (parsed.type === 'text') return parsed.content || ''
    if (parsed.type === 'file') {
      let s = '📄 ' + (parsed.name || '')
      if (parsed.content) s += ': ' + parsed.content
      return s
    }
    if (parsed.type === 'sticker') return '🖼️ ' + (parsed.name || '表情')
    if (parsed.type === 'emoji') return (parsed.content || '') + ' '
    if (parsed.type === 'pat') return '👋 拍了拍'
  } catch { return msg.content || '' }
  return msg.content || ''
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

const katexBlockRule = /^\$\$([\s\S]+?)\$\$/
const katexInlineRule = /\$\$([^\$\n]+?)\$\$|\$([^\$\n]+?)\$/

md.inline.ruler.after('escape', 'katex_inline', function (state, silent) {
  const match = katexInlineRule.exec(state.src.slice(state.pos))
  if (!match) return false
  if (!silent) {
    const token = state.push('katex_inline', 'math', 0)
    token.content = match[1] || match[2]
    token.markup = match[1] ? '$$' : '$'
    token.meta = { displayMode: !!match[1] }
  }
  state.pos += match[0].length
  return true
})

md.block.ruler.before('paragraph', 'katex_block', function (state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  const line = state.src.slice(pos, max)
  const match = katexBlockRule.exec(line)
  if (!match) return false
  if (!silent) {
    const token = state.push('katex_block', 'math_block', 0)
    token.content = match[1].trim()
    token.markup = '$$'
    token.map = [startLine, startLine + 1]
  }
  state.line = startLine + 1
  return true
})

md.renderer.rules.katex_inline = function (tokens, idx) {
  const displayMode = tokens[idx].meta && tokens[idx].meta.displayMode
  try { return katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode }) }
  catch { return esc(tokens[idx].content) }
}

md.renderer.rules.katex_block = function (tokens, idx) {
  try { return '<p>' + katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: true }) + '</p>' }
  catch { return '<p>' + esc(tokens[idx].content) + '</p>' }
}

function preprocessKatexBlock(text) {
  const lines = text.split('\n')
  const result = []
  let i = 0
  while (i < lines.length) {
    if (/^\s*\$\$\s*$/.test(lines[i])) {
      let content = ''
      let j = i + 1
      while (j < lines.length && !/^\s*\$\$\s*$/.test(lines[j])) {
        if (content) content += ' '
        content += lines[j].trim()
        j++
      }
      if (j < lines.length) {
        result.push('$$' + content + '$$')
        i = j + 1
        continue
      }
    }
    result.push(lines[i])
    i++
  }
  return result.join('\n')
}

export function parseMarkdown(text) {
  if (!text) return ''
  return md.render(preprocessKatexBlock(text)).replace(/\n+$/, '')
}

export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i]
}

export function parseContent(raw, senderId) {
  if (!raw) return parseMarkdown(raw || '')
  const obj = parseMsgContent(raw)
  if (!obj) return parseMarkdown(raw)
  if (obj.type === 'file') {
    const isImage = /^image\//.test(obj.mime || '') || /\.(jpg|jpeg|png|gif|bmp|webp|ico)$/i.test(obj.name || '')
    let dataUri = ''
    if (obj.data && obj.mime) dataUri = `data:${obj.mime};base64,${obj.data}`
    let fileHtml = isImage
      ? `<img class="chat-image" src="${esc(dataUri)}" data-base64="${esc(obj.data || '')}" data-mime="${esc(obj.mime || '')}">`
      : `<div class="file-msg" data-base64="${esc(obj.data || '')}" data-name="${esc(obj.name)}" data-mime="${esc(obj.mime || '')}">📄 ${esc(obj.name)} <span class="file-size">(${formatSize(obj.size)})</span></div>`
    if (obj.content && obj.content.trim()) {
      fileHtml += '<div class="file-text-content">' + parseMarkdown(obj.content) + '</div>'
    }
    return fileHtml
  }
  if (obj.type === 'sticker') {
    let dataUri = ''
    if (obj.data && obj.mime) dataUri = `data:${obj.mime};base64,${obj.data}`
    return `<span class="sticker-msg"><img src="${esc(dataUri)}" alt="${esc(obj.name || '')}" data-base64="${esc(obj.data || '')}" data-mime="${esc(obj.mime || '')}"></span>`
  }
  if (obj.type === 'emoji') return '<span class="emoji-msg">' + esc(obj.content || '') + '</span>'
  if (obj.type === 'pat') {
    const senderName = senderId ? getUsername(senderId, store.users) : ''
    const targetName = obj.target ? getUsername(obj.target, store.users) : ''
    return '<div class="pat-msg">' + esc(senderName) + ' 拍了拍 ' + esc(targetName) + '</div>'
  }
  if (obj.type === 'text') {
    let html = ''
    if (obj.reply_to) {
      const replyContent = esc(obj.reply_content || '').slice(0, 80)
      html += '<div class="reply-quote" data-reply-id="' + obj.reply_to + '"><i class="fas fa-quote-left reply-quote-icon"></i><span class="reply-quote-text">' + replyContent + '</span></div>'
    }
    html += parseMarkdown(obj.content || '')
    if (obj.mentions && obj.mentions.length) {
      for (const uid of obj.mentions) {
        if (uid === 'all') {
          html = html.replace(/@all(?![0-9])/g, '<span class="mention-tag mention-all" data-uid="all">@所有人</span>')
        } else {
          html = html.replace(new RegExp('@' + uid + '(?![0-9])', 'g'), '<span class="mention-tag" data-uid="' + uid + '">@' + uid + '</span>')
        }
      }
    }
    return html
  }
  return parseMarkdown(raw)
}

// ========== 会话标识与免打扰 ==========
export function getConvoKey(pageType, pageId) {
  return `${pageType}_${pageId}`;
}

export function isConvoMuted(pageType, pageId) {
  const key = getConvoKey(pageType, pageId);
  return !!store.mutedConvos?.[key];
}

export function isDndTime(setting) {
  return !!setting?.dndEnabled;
}

export function shouldNotify(pageType, pageId, setting) {
  if (isConvoMuted(pageType, pageId)) return false;
  if (isDndTime(setting)) return false;
  return true;
}

export function getNotifContent(content, setting) {
  if (setting?.notifPrivacy) return '收到一条新消息';
  return content;
}

// ========== 日期分组 ==========
export function formatDateSeparator(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (msgDate.getTime() === today.getTime()) return '今天';
  if (msgDate.getTime() === yesterday.getTime()) return '昨天';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (year === now.getFullYear()) return `${month}月${day}日`;
  return `${year}年${month}月${day}日`;
}

export function isSameDay(ts1, ts2) {
  if (!ts1 || !ts2) return false;
  const d1 = new Date(ts1 * 1000);
  const d2 = new Date(ts2 * 1000);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// ========== 搜索高亮 ==========
export function highlightKeyword(text, keyword) {
  if (!keyword) return esc(text);
  const escaped = esc(text);
  const re = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(re, '<mark class="search-highlight">$1</mark>');
}

// ========== 通知声音 ==========
let _audioCtx = null;
export function playNotificationSound(type = 'default') {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'mention' ? 880 : 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

// ========== 群聊最后消息发送者 ==========
export function getLastMessageSender(messageIds, messages) {
  if (!messageIds || messageIds.length === 0 || !messages) return '';
  let lastId = null;
  let lastTime = -1;
  for (const id of messageIds) {
    const msg = messages[id];
    if (msg && (msg.send_time || 0) > lastTime) { lastTime = msg.send_time || 0; lastId = id; }
  }
  if (!lastId) return '';
  const msg = messages[lastId];
  if (msg.sender) {
    const user = store.users?.[msg.sender];
    if (user) {
      const name = user.note || user.nickname || user.username || `User_${msg.sender}`;
      return name + ': ';
    }
  }
  return '';
}

// ========== 字体大小 ==========
export function applyFontSize(size) {
  const root = document.documentElement;
  root.style.setProperty('--font-size-base', size + 'px');
  root.style.setProperty('--font-size-small', (size - 2) + 'px');
  root.style.setProperty('--font-size-large', (size + 2) + 'px');
}


