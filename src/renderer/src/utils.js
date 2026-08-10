import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { reactive } from 'vue'
import { store } from './store.js';
import { QUANCODE, qqfaceUrl } from './qqface-data.js';

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

// 年级文本（ranklist 同步）→ colorKey（年级分组键）。users.7c 的 colorKey 仅作兜底，
// 年级信息以 ranklist 实时同步为准（getGradeColor / getGradeLabel 优先使用）。
function gradeToColorKey(grade) {
  const map = {
    '小四': 'x4', '小五': 'x5', '小六': 'x6',
    '初一': 'c1', '初二': 'c2', '初三': 'c3',
    '高一': 'g1', '高二': 'g2', '高三': 'g3',
    '大一': 'd1', '大二': 'd2', '大三': 'd3', '大四': 'd4',
    '毕业': 'by', '教练': 'jl'
  }
  return map[grade] || ''
}

function colorKeyOf(uid) {
  let colorKey = usersJson?.[uid]?.colorKey
  // ranklist 同步的年级优先（用户要求年级直接在 ranklist 中获取）
  const g = store.users?.[uid]?.grade
  if (g) {
    const derived = gradeToColorKey(g)
    if (derived) colorKey = derived
  }
  return colorKey || ''
}

export function getGradeColor(uid) {
  const colorKey = colorKeyOf(uid)
  if (!colorKey) return ''
  // 优先级：自定义 > 主题CSS变量 > 硬编码默认
  const customPalette = store.setting?.gradeColors || {}
  if (customPalette[colorKey]) return customPalette[colorKey]
  const cssVar = getComputedStyle(document.documentElement).getPropertyValue(`--grade-${colorKey}`).trim()
  if (cssVar) return cssVar
  return DEFAULT_PALETTE[colorKey] || ''
}

export function getGradeLabel(uid) {
  const colorKey = colorKeyOf(uid)
  if (!colorKey) return ''
  return GRADE_LABELS[colorKey] || ''
}

export async function safeFetch(url, options = {}, timeout = 10000) {
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
  const res = await safeFetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: user, password: pwd }),
    credentials: 'include'
  }, 10000)
  const data = await res.json()
  // 登录接口正常响应必带 error_code（1=成功，1001~1004=各类失败）；
  // 缺省说明是 fetch 层失败（会话失效/网络错误），回落到 -1。不再依赖 success 字段。
  if (!data || data.error_code === undefined) return { error_code: -1 }
  return data
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
  }, 60000)).json()
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

/**
 * 判断文本是否为「单个」emoji（恰好一个 emoji 字符/组合，不含其它文本）。
 * 微信风格放大仅限单表情；发送端与渲染端共用（渲染端用于防 API 伪造多字符）。
 */
export function isSingleEmoji(text) {
  const t = (text || '').replace(/\s+/g, '')
  if (!t) return false
  // 匹配完整 emoji 单元（含 ZWJ 组合、变体选择符 \uFE0F、肤色修饰符 \u1F3FB-\u1F3FF）
  const m = t.match(/\p{Extended_Pictographic}(?:\u{200D}\p{Extended_Pictographic}|[\u{FE0F}\u{1F3FB}-\u{1F3FF}])*/gu)
  if (!m || m.length !== 1) return false
  return m[0] === t
}

/**
 * 发送时从文本解析被 @ 的用户 uid 列表（含 'all'）。
 * 输入框插入的是 @UID（昵称可能重名，用 uid 唯一标识），发送时直接提取数字 uid；
 * 与拍一拍同模式：发送/存储用 uid，渲染时再补全为昵称+姓名。
 */
export function extractMentions(text) {
  const uids = new Set()
  if (!text || typeof text !== 'string' || !text.includes('@')) return []
  const re = /@(\d+)(?![0-9])/g
  let m
  while ((m = re.exec(text)) !== null) {
    const uid = Number(m[1])
    // 仅保留存在的用户（输入框只能选列表内用户；防 @12 误收 @123 的前缀）
    if (store.users[uid]) uids.add(uid)
  }
  if (text.includes('@所有人')) uids.add('all')
  return [...uids]
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

// ========== 访问统计上报（chat.forfof.cloud/info） ==========
// 上报用户公开信息（ranklist 页公开字段），供服务器按 uid 记录最近访问时间与个人信息，
// 用于分析使用情况；纯统计用途，失败静默，不影响主流程。
// 载荷经主进程 AES-256-GCM 加密后发出（密钥不进渲染进程），防止第三方 POST 伪造。
let _reporting = false
let _appVersion = null
async function _getAppVersion() {
  if (_appVersion !== null) return _appVersion
  try { _appVersion = (await window.api.getVersion()) || '' } catch { _appVersion = '' }
  return _appVersion
}
async function _reportVisit() {
  if (_reporting) return
  const s = store.self
  if (!s || !s.uid) return
  _reporting = true
  try {
    if (!window.api?.reportVisit) return
    await window.api.reportVisit({
      uid: s.uid,
      username: s.username || '',
      nickname: s.nickname || '',
      realname: s.realname || '',
      school: s.school || '',
      seat: s.seat || '',
      version: await _getAppVersion() // 上报应用版本，供 /dev 分析页展示
    })
  } catch (e) {
    console.error('[visit] 上报失败:', e)
  }
  _reporting = false
}

// 独立上报定时器：登录成功后启动（update 中调用），与 ranklist 轮询完全解耦——
// 即使 ranklist 抓取挂起/失败，访问统计上报也不会漏。
let _visitTimer = null
export function startVisitReport() {
  if (_visitTimer) return
  _reportVisit() // 立即上报一次
  _visitTimer = setInterval(_reportVisit, 10 * 60 * 1000)
}

// 退出登录：停止上报定时器，重新登录后 startVisitReport 可再次启动
export function stopVisitReport() {
  if (_visitTimer) {
    clearInterval(_visitTimer)
    _visitTimer = null
  }
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

// 退出登录：停止 ranklist 轮询，重新登录后 startRanklistFetch 可再次启动
export function stopRanklistFetch() {
  if (_ranklistTimer) {
    clearInterval(_ranklistTimer)
    _ranklistTimer = null
  }
  _ranklistFetching = false
}

async function _doFetchRanklist() {
  if (_ranklistFetching) return
  _ranklistFetching = true
  try {
    ranklistOrder.length = 0
    let page = 1
    let lastFirstUid = null
    while (true) {
      // ranklist 用原生 fetch + 10s 超时（学校网络无法访问时快速失败，避免卡住）
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      let res
      try {
        res = await fetch(`/ranklist?page=${page}`, { signal: ctrl.signal })
      } catch {
        clearTimeout(timer)
        break
      }
      clearTimeout(timer)
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
        // 年级列：tds[5]（如"高二"），tds[4] 为入学年份
        const gradeText = tds[5]?.textContent.trim() || ''
        ranklistOrder.push(uid)
        const old = store.users[uid]
        const newData = {
          uid,
          realname: old?.realname || '',
          username: username || old?.username || '',
          nickname: nickname || old?.nickname || '',
          grade: gradeText || old?.grade || '',
          grade_class: old?.grade_class || '',
          seat: old?.seat || '',
          note: old?.note || '',
          message_ids: old?.message_ids || [],
          unread: old?.unread || false,
          pinned: old?.pinned || false,
          show: old ? old.show : false,
          watchee: old?.watchee === true,
          watcher: old?.watcher === true,
          _fetchedAt: new Date().toISOString()
        }
        if (old && old.username === newData.username && old.nickname === newData.nickname && old.seat === newData.seat && old.grade === newData.grade && old._fetchedAt) {
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
  // 关键：仅在当前位置就是 $ 时才尝试公式匹配，
  // 否则会从当前位置向后误匹配后面的 $...$，导致中间文本（如 **最小**）被错误跳过
  if (state.src[state.pos] !== '$') return false
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

// QQ 表情快捷码（/微笑 /wx /jy 等）：/xx → <img class="qqface">
// 必须注册在 text 之前：'/' 不是 markdown-it text 规则的终止符，
// 若 after('escape')（text 之后）则整段 /xx 已被 text 当作纯文本消费，规则无机会触发
md.inline.ruler.before('text', 'qqface_inline', function (state, silent) {
  if (state.src[state.pos] !== '/') return false
  const prev = state.pos > 0 ? state.src[state.pos - 1] : ''
  if (prev === ':' || prev === '/' || prev === '\\') return false
  const m = /^\/([a-zA-Z\u4e00-\u9fa5]{1,12})/.exec(state.src.slice(state.pos))
  if (!m) return false
  const face = QUANCODE.get(m[0].toLowerCase())
  if (!face) return false
  if (!silent) {
    const token = state.push('qqface_inline', 'img', 0)
    token.attrSet('class', 'qqface')
    token.attrSet('src', qqfaceUrl(face.file))
    token.attrSet('data-code', m[0])
    token.attrSet('alt', face.name)
  }
  state.pos += m[0].length
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
  // output:'html'：仅输出视觉层，避免 KaTeX 默认 MathML+HTML 双份导致复制/转 markdown 时文本重复
  try { return katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode, output: 'html' }) }
  catch { return esc(tokens[idx].content) }
}

// QQ 表情快捷码渲染（/微笑 /wx /jy 等）：/xx → <img>
// 前置字符守卫：避免误匹配 URL 协议 (https://、file://) 与转义 (\/)
md.renderer.rules.qqface_inline = function (tokens, idx) {
  const t = tokens[idx]
  const src = t.attrGet('src')
  const code = t.attrGet('data-code')
  const alt = t.attrGet('alt') || ''
  return '<img class="qqface" src="' + esc(src) + '" data-code="' + esc(code) + '" alt="' + esc(alt) + '">'
}

md.renderer.rules.katex_block = function (tokens, idx) {
  try { return '<p>' + katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: true, output: 'html' }) + '</p>' }
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

// 给块级元素注入 data-line（markdown 源码行号，1-based），供分屏同步滚动按顶部行对齐
const LINE_MAP_BLOCK_TYPES = new Set([
  'paragraph_open', 'heading_open', 'bullet_list_open', 'ordered_list_open',
  'list_item_open', 'blockquote_open', 'fence', 'table_open', 'hr', 'code_block'
])
for (const type of LINE_MAP_BLOCK_TYPES) {
  const orig = md.renderer.rules[type]
  md.renderer.rules[type] = function (tokens, idx, options, env, self) {
    const html = orig ? orig(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
    const t = tokens[idx]
    if (t.map && typeof html === 'string') {
      const line = t.map[0] + 1
      return html.replace(/^<([a-zA-Z][^ >]*)/, (m, tag) => `<${tag} data-line="${line}"`)
    }
    return html
  }
}

export function renderMarkdown(text) {
  if (!text) return ''
  return md.render(preprocessKatexBlock(text)).replace(/\n+$/, '')
}

export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + units[i]
}

// 文件后缀 → 图标 + 颜色（微信风格文件卡片）
// 注意：本项目 Font Awesome 5，fa-file-alt/fa-file-archive/fa-cogs/fa-mobile-alt
const FILE_EXT_ICONS = {
  // 文档
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
  // 压缩包
  zip: { icon: 'fa-file-archive', color: '#c9a227' },
  rar: { icon: 'fa-file-archive', color: '#c9a227' },
  '7z': { icon: 'fa-file-archive', color: '#c9a227' },
  tar: { icon: 'fa-file-archive', color: '#c9a227' },
  gz: { icon: 'fa-file-archive', color: '#c9a227' },
  // 代码
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
  // 多媒体
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
  // 安装包
  exe: { icon: 'fa-cogs', color: '#4a4a4a' },
  msi: { icon: 'fa-cogs', color: '#4a4a4a' },
  deb: { icon: 'fa-cogs', color: '#a81c1c' },
  rpm: { icon: 'fa-cogs', color: '#a81c1c' },
  dmg: { icon: 'fa-cogs', color: '#8a8f98' },
  apk: { icon: 'fa-mobile-alt', color: '#3ddc84' },
  appimage: { icon: 'fa-cogs', color: '#8a8f98' },
  // 其他
  iso: { icon: 'fa-compact-disc', color: '#8a8f98' },
  log: { icon: 'fa-file-alt', color: '#8a8f98' }
}
function getFileIconInfo(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return FILE_EXT_ICONS[ext] || { icon: 'fa-file', color: '#8a8f98' }
}

export function parseContent(raw, senderId) {
  if (!raw) return renderMarkdown(raw || '')
  const obj = parseMsgContent(raw)
  if (!obj) return renderMarkdown(raw)
  if (obj.type === 'file') {
    const isImage = /^image\//.test(obj.mime || '') || /\.(jpg|jpeg|png|gif|bmp|webp|ico)$/i.test(obj.name || '')
    let dataUri = ''
    if (obj.data && obj.mime) dataUri = `data:${obj.mime};base64,${obj.data}`
    let fileHtml = ''
    if (isImage) {
      fileHtml = `<img class="chat-image" src="${esc(dataUri)}" data-base64="${esc(obj.data || '')}" data-mime="${esc(obj.mime || '')}">`
    } else {
      // 微信风格文件卡片：左侧后缀图标，右侧文件名 + 大小
      const fi = getFileIconInfo(obj.name || '')
      fileHtml = `<div class="file-msg" data-base64="${esc(obj.data || '')}" data-name="${esc(obj.name)}" data-mime="${esc(obj.mime || '')}">
  <div class="file-msg-icon" style="color:${fi.color}"><i class="fas ${fi.icon}"></i></div>
  <div class="file-msg-info">
    <div class="file-msg-name">${esc(obj.name)}</div>
    <div class="file-msg-size">${formatSize(obj.size)}</div>
  </div>
</div>`
    }
    if (obj.content && obj.content.trim()) {
      fileHtml += '<div class="file-text-content">' + renderMarkdown(obj.content) + '</div>'
    }
    return fileHtml
  }
  if (obj.type === 'sticker') {
    let dataUri = ''
    if (obj.data && obj.mime) dataUri = `data:${obj.mime};base64,${obj.data}`
    return `<span class="sticker-msg"><img src="${esc(dataUri)}" alt="${esc(obj.name || '')}" data-base64="${esc(obj.data || '')}" data-mime="${esc(obj.mime || '')}"></span>`
  }
  if (obj.type === 'emoji') {
    const emojiText = String(obj.content || '').trim()
    // 渲染时再次校验：仅单个 emoji 才放大显示，否则按普通文本 content 处理（防 API 伪造多字符）
    if (isSingleEmoji(emojiText)) {
      return '<span class="emoji-msg">' + esc(emojiText) + '</span>'
    }
    // QQ 表情快捷码单条放大（/微笑 /wx 等）：与 Unicode 单表情一致，去气泡框
    const qface = QUANCODE.get(emojiText.toLowerCase())
    if (qface) {
      return '<span class="emoji-msg"><img class="qqface" src="' + qqfaceUrl(qface.file) + '" alt="' + esc(qface.name) + '" data-code="' + esc(emojiText) + '"></span>'
    }
    return renderMarkdown(obj.content || '')
  }
  if (obj.type === 'pat') {
    const senderName = senderId ? getUsername(senderId, store.users) : ''
    const targetName = obj.target ? getUsername(obj.target, store.users) : ''
    // 仅当用户信息可解析（store.users 或姓名库有记录）时才渲染可点击名字；
    // 解析失败显示 User_xxx 兜底名时不可点击（点开 userinfo 也没有意义）
    const senderKnown = senderId ? !!(store.users?.[senderId] || usersJson?.[senderId]) : false
    const targetKnown = obj.target ? !!(store.users?.[obj.target] || usersJson?.[obj.target]) : false
    const senderHtml = senderId
      ? (senderKnown ? `<span class="pat-user" data-uid="${senderId}">${esc(senderName)}</span>` : esc(senderName))
      : ''
    const targetHtml = obj.target
      ? (targetKnown ? `<span class="pat-user" data-uid="${obj.target}">${esc(targetName)}</span>` : esc(targetName))
      : ''
    return '<div class="pat-msg">' + senderHtml + ' 拍了拍 ' + targetHtml + '</div>'
  }
  if (obj.type === 'text') {
    let html = ''
    if (obj.reply_to) {
      const replyContent = esc(obj.reply_content || '').slice(0, 80)
      html += '<div class="reply-quote" data-reply-id="' + obj.reply_to + '"><i class="fas fa-quote-left reply-quote-icon"></i><span class="reply-quote-text">' + replyContent + '</span></div>'
    }
    html += renderMarkdown(obj.content || '')
    // @提及 渲染：文本中是 @UID（输入框插入），渲染时补全为 昵称(姓名) 标签
    if (obj.mentions && obj.mentions.length) {
      if (obj.mentions.includes('all')) {
        html = html.replace(/@所有人/g, '<span class="mention-tag mention-all" data-uid="all">@所有人</span>')
      }
      const ids = obj.mentions.filter((u) => u !== 'all')
      if (ids.length) {
        const pattern = new RegExp('@(' + ids.map(String).join('|') + ')(?![0-9])', 'g')
        html = html.replace(pattern, (match, uid) => {
          return '<span class="mention-tag" data-uid="' + uid + '">@' + getUsername(Number(uid), store.users) + '</span>'
        })
      }
    }
    return html
  }
  return renderMarkdown(raw)
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


