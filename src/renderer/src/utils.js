import { reactive } from 'vue'
import { store } from './store.js';
import { QUANCODE, qqfaceUrl } from './qqface-data.js';
// 渲染引擎已整体切换到洛谷解析器（见 ./markdown/index.js）：支持洛谷全部扩展语法
// （折叠框 / 表格合并 / Tuack / 脚注 / B 站嵌入 / 行号与指定行高亮），
// 同时保留本项目原有的 QQ 表情快捷码与 .chat-image 图片档位。
import {
  renderMarkdown as renderLuoguMarkdown,
  renderMarkdownPreview as renderLuoguPreview,
} from './markdown/index.js'

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

// ========== 年级颜色系统 ==========
const COLOR_KEYS = ['x4', 'x5', 'x6', 'c1', 'c2', 'c3', 'g1', 'g2', 'g3', 'd1', 'd2', 'd3', 'd4', 'by', 'jl', 'uk']

const GRADE_LABELS = {
  x4: '小四', x5: '小五', x6: '小六',
  c1: '初一', c2: '初二', c3: '初三',
  g1: '高一', g2: '高二', g3: '高三',
  d1: '大一', d2: '大二', d3: '大三', d4: '大四',
  by: '毕业', jl: '教练', uk: '其他'
}

// 年级颜色全新设计（2026-09-06 彻底重做）：
// 学段 = 色系（小学 琥珀/橙棕 → 初中 青 → 高中 绿 → 大学 蓝靛 → 毕业 石板灰 → 教练 玫红），
// 同段内按年级逐级加深；本值为"浅色主题档"（中等明度、白底清晰），
// 深色主题在 css/themes/*.css 中用同色系更亮一档（--grade-* 覆盖）。
const DEFAULT_PALETTE = {
  x4: '#D97E24', x5: '#C16A15', x6: '#A5530C',
  c1: '#10A093', c2: '#0B8379', c3: '#076A62',
  g1: '#3FA45B', g2: '#2D8F48', g3: '#1E7A38',
  d1: '#4B7AE8', d2: '#3762CC', d3: '#284DB2', d4: '#1D3A96',
  by: '#8D96A7', jl: '#CE4E82', uk: '#828B98'
}

export { COLOR_KEYS, GRADE_LABELS, DEFAULT_PALETTE }

// ========== 消息长度限制 ==========
export const MAX_MSG_LENGTH = 102400;

// ========== 图片/表情 media URL 缓存（治本：避免 100KB+ base64 内联进 HTML/一次性解码） ==========
// 把 base64 → Blob objectURL，DOM 只挂一个短 URL。按 base64 字符串缓存，同一数据复用同一 URL，避免泄漏。
const mediaUrlCache = new Map()
const MEDIA_URL_MAX = 400  // 缓存上限，防内存无限增长
export function mediaUrlFromData(base64, mime) {
  if (!base64) return ''
  const hit = mediaUrlCache.get(base64)
  if (hit) return hit
  const mimeStr = mime && /^image\//.test(mime) ? mime : 'image/png'
  let url
  try {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    url = URL.createObjectURL(new Blob([bytes], { type: mimeStr }))
  } catch {
    url = `data:${mimeStr};base64,${base64}`
  }
  if (mediaUrlCache.size >= MEDIA_URL_MAX) {
    // 简单 FIFO 清理：删最早一条（Map 迭代序即插入序）
    const firstKey = mediaUrlCache.keys().next().value
    mediaUrlCache.delete(firstKey)
  }
  mediaUrlCache.set(base64, url)
  return url
}
// 供消息渲染层缓存解析结果（同一 content 字符串只解析一次，避免每次 v-html 重算超大 HTML）
const parseContentCache = new Map()
const PARSE_CACHE_MAX = 300

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

// 取色优先级：自定义 > 主题 CSS 变量 > 硬编码默认
function paletteColor(colorKey) {
  if (!colorKey) return ''
  const customPalette = store.setting?.gradeColors || {}
  if (customPalette[colorKey]) return customPalette[colorKey]
  const cssVar = getComputedStyle(document.documentElement).getPropertyValue(`--grade-${colorKey}`).trim()
  if (cssVar) return cssVar
  return DEFAULT_PALETTE[colorKey] || ''
}

export function getGradeColor(uid) {
  return paletteColor(colorKeyOf(uid))
}

// 无年级信息时的兜底分组键：只用色相差异大、亮度足够的键
// （避免落到 #284DB2 / #0B8379 这类深色上，小字号下看起来像没上色）
const FALLBACK_COLOR_KEYS = ['d1', 'g1', 'c1', 'x4', 'jl', 'x5']

/**
 * 轻量字符串哈希。
 * 注意：不能用 `uid % n` —— OJ 的 uid 存在等差规律（实测 1637 / 1013 / 1069 都 ≡ 5 mod 8），
 * 取模会让一大批用户撞进同一个键（当时全都变成 d3 深蓝，视觉上像"名字没颜色"）。
 */
function uidHash(uid) {
  const s = String(uid == null ? '' : uid)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003
  return h
}

/**
 * 远端用户（不在 store.users 中，如发现页推荐）的名字颜色。
 * 有年级 → 与好友列表一致的年级色；没有年级 → 按 uid 稳定派生一个协调色（不随刷新跳变）。
 * 注意：getAvatarInitial / getGradeColor 的参数是 uid（内部查 store.users），
 * 对远端对象必须用本函数，不能把对象直接传进去。
 */
export function getNameColorFor(uid, grade) {
  const byGrade = gradeToColorKey(grade || '')
  if (byGrade) return paletteColor(byGrade)
  return paletteColor(FALLBACK_COLOR_KEYS[uidHash(uid) % FALLBACK_COLOR_KEYS.length])
}

/**
 * 头像首字：基于对象自身的字段（远端对象不在 store.users 里，不能用 getAvatarInitial）。
 * 优先级与 getAvatarInitial 保持一致：真名 > 昵称 > 用户名 > uid。
 */
export function getInitialOfUser(u) {
  if (!u) return '?'
  // 逐个候选取首个非空白字符：空字符串 / 纯空白的字段要跳过，而不是原地失败
  for (const c of [u.realname, u.nickname, u.username, u.uid]) {
    const ch = String(c == null ? '' : c).trim().charAt(0)
    if (ch) return ch
  }
  return '?'
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
    // 检测到返回 HTML（通常会话失效被服务端重定向到登录页）：不再强制退出登录，
    // 改为标记网络异常（"未连接"横幅），由调用方/轮询层决定是否继续。历史消息仍可读。
    const _ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (_ctype.includes('text/html')) {
      store.netError = true
      return { json: async () => ({ success: false, _html: true, err: { message: '未连接，正在重新连接…' } }) }
    }
    if (!res.ok) return { json: async () => ({ success: false, err: { message: res.statusText } }) }
    try {
      const data = await res.json()
      store.netError = false
      store.online = navigator.onLine
      return { json: async () => data }
    } catch {
      // 非 JSON（即 HTML，会话失效）：标记网络异常，不退出登录
      store.netError = true
      return { json: async () => ({ success: false, _html: true, err: { message: '未连接，正在重新连接…' } }) }
    }
  } catch (e) {
    // 网络层错误（断网/超时）：标记网络异常，不退出登录；online 交由 navigator 事件
    store.netError = true
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

// ===== 消息持久化脏区（唯一保存通道的增量标记） =====
// 存储收敛为单一快照（storeSaveAll，定时器+退出时调用）。
// 任何让会话消息产生变化的操作只需标记 dirty，由快照统一按会话原子落库，
// 不再有散落的逐条入库/flush 逻辑，杜绝"id 已存、内容未存"的分裂状态。
const dirtyMsgKeys = new Set()

/** 标记某会话消息有变化（新消息/发送/自愈补回），快照保存时会带上 */
export function markMsgDirty(kind, cid) {
  dirtyMsgKeys.add(`${kind}:${cid}`)
}

/** 取出并清空全部脏会话标记（供 saveAll 组装消息快照） */
export function takeDirtyMsgKeys() {
  if (!dirtyMsgKeys.size) return null
  const keys = [...dirtyMsgKeys]
  dirtyMsgKeys.clear()
  return keys
}

// 将聊天接口返回的 chat 写入 store，返回解码后的内容与 token 信息
export function applyChatToStore(r, pageType, pageId) {
  const c = r.chat
  const target = pageType === 'user' ? store.users[pageId] : pageType === 'group' ? store.groups[pageId] : (store.users[pageId] || store.groups[pageId])
  if (target) {
    store.messages[c.id] = { id: c.id, sender: c.sender_id, send_time: c.send_time, content: c.content }
    target.message_ids.push(c.id)
    // 仅标记脏区，由统一快照（定时/退出）落库；不做即时入库
    markMsgDirty(pageType === 'group' ? 'group' : 'user', Number(pageId))
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
// 仅当窗口打开且聚焦时上报（最小化/隐藏/失焦时不打扰服务器），恢复可见聚焦时立即补报。
let _reporting = false
let _appVersion = null
async function _getAppVersion() {
  if (_appVersion !== null) return _appVersion
  try { _appVersion = (await window.api.getVersion()) || '' } catch { _appVersion = '' }
  return _appVersion
}
function _windowActive() {
  return document.visibilityState === 'visible' && document.hasFocus()
}
async function _reportVisit() {
  if (_reporting) return
  // 窗口未打开/未聚焦时不上报（minimize 到托盘时 visibility 变为 hidden，天然跳过）
  if (!_windowActive()) return
  const s = store.self
  if (!s || !s.uid) return
  _reporting = true
  try {
    if (!window.api?.reportVisit) return
    // 完整上报 OJ 档案（store.self）；服务端白名单落盘，敏感字段不入库。
    // grade 取 ranklist 快照（/chat/info 的 self 对象里没有该字段）。
    await window.api.reportVisit({
      ...s,
      grade: store.users?.[s.uid]?.grade || '',
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
  _reportVisit() // 立即上报一次（若当前未聚焦则跳过）
  _visitTimer = setInterval(_reportVisit, 60 * 1000) // 上报频率：1 分钟一次
  // 窗口重新可见/聚焦时补报一次，弥补最小化期间的漏报
  document.addEventListener('visibilitychange', _onVisitWindowActive)
  window.addEventListener('focus', _onVisitWindowActive)
}
function _onVisitWindowActive() {
  if (_windowActive()) _reportVisit()
}

// 退出登录：停止上报定时器，重新登录后 startVisitReport 可再次启动
export function stopVisitReport() {
  if (_visitTimer) {
    clearInterval(_visitTimer)
    _visitTimer = null
  }
  document.removeEventListener('visibilitychange', _onVisitWindowActive)
  window.removeEventListener('focus', _onVisitWindowActive)
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

// Markdown 渲染：引擎细节见 ./markdown/index.js。
// 对外只保留这两个签名，历史调用点（消息气泡、输入框预览、卡片消息）无需改动。
// 已被移除的旧实现包括：markdown-it 实例、自写 KaTeX 行内/行间规则、
// QQ 表情预处理占位符、以及给块级元素注入 data-line 的锚点逻辑——
// 这些能力现在由洛谷解析器原生提供（锚点改名为 data-src-line，覆盖也更完整）。
export function renderMarkdown(text) {
  return renderLuoguMarkdown(text)
}

// 输入框预览：与显示框统一使用 renderMarkdown（预览与消息显示完全一致）
export function renderMarkdownPreview(text) {
  return renderLuoguPreview(text)
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
  // 缓存：同一 content 只解析一次（大图片/表情消息尤为关键）
  const cacheKey = senderId != null ? raw + '\u0001' + senderId : raw
  const cached = parseContentCache.get(cacheKey)
  if (cached != null) return cached
  const result = _parseContentImpl(raw, senderId)
  if (parseContentCache.size >= PARSE_CACHE_MAX) {
    const firstKey = parseContentCache.keys().next().value
    parseContentCache.delete(firstKey)
  }
  parseContentCache.set(cacheKey, result)
  return result
}

// 整条消息只由图片语法构成时，按「图片消息」类型显示（点击看大图、不带气泡文字样式）。
// 文字里夹带的 ![]() 不算图片消息 —— 那是普通文本消息，Markdown 照常渲染。
const SOLO_IMAGE_LINE_RE = /^!\[[^\]]*\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)$/
const SAFE_IMG_SRC_RE = /^(?:https?:\/\/|data:image\/|file:\/\/|\/|\.\/)/i

/** 整条都是图片语法 → 返回图片地址数组；否则返回 null */
function parseSoloImages(raw) {
  const lines = String(raw).split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const urls = []
  for (const line of lines) {
    const m = SOLO_IMAGE_LINE_RE.exec(line)
    if (!m || !SAFE_IMG_SRC_RE.test(m[1])) return null
    urls.push(m[1])
  }
  return urls
}

function _parseContentImpl(raw, senderId) {
  // 仅 ![]() 的消息 = 图片类型；其余（含图文混排）走普通文本/Markdown 渲染
  const soloImages = parseSoloImages(raw)
  if (soloImages) {
    return soloImages
      // data-image-msg：CSS 用它区分「图片消息」与「带图的文本消息」（决定气泡样式）
      .map((u) => `<img class="chat-image" data-image-msg="1" src="${esc(u)}" data-media="${esc(u)}">`)
      .join('')
  }
  const obj = parseMsgContent(raw)
  if (!obj) return renderMarkdown(raw)
  if (obj.type === 'file') {
    const isImage = /^image\//.test(obj.mime || '') || /\.(jpg|jpeg|png|gif|bmp|webp|ico)$/i.test(obj.name || '')
    let fileHtml = ''
    if (isImage) {
      const src = mediaUrlFromData(obj.data || '', obj.mime || 'image/png')
      fileHtml = `<img class="chat-image" data-image-msg="1" src="${esc(src)}" data-media="${esc(src)}" data-mime="${esc(obj.mime || '')}">`
    } else {
      // 微信风格文件卡片：左侧后缀图标，右侧文件名 + 大小
      const fi = getFileIconInfo(obj.name || '')
      const b64 = obj.data || ''
      fileHtml = `<div class="file-msg" data-file-b64="${esc(b64)}" data-name="${esc(obj.name)}" data-mime="${esc(obj.mime || '')}">
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
    const src = mediaUrlFromData(obj.data || '', obj.mime || 'image/png')
    return `<span class="sticker-msg"><img src="${esc(src)}" alt="${esc(obj.name || '')}" data-media="${esc(src)}" data-mime="${esc(obj.mime || '')}"></span>`
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
    // 严格解析：pat 只接受单个目标 uid（数字或纯数字字符串）。
    // target 为数组/对象/空/非数字等非法形态时不做兼容，直接判为非法消息，显示原始 content。
    const patTarget = obj.target
    if (patTarget == null || Array.isArray(patTarget) || !/^\d+$/.test(String(patTarget))) {
      return renderMarkdown(raw)
    }
    const senderName = senderId ? getUsername(senderId, store.users) : ''
    const targetName = getUsername(patTarget, store.users)
    // 仅当用户信息可解析（store.users 或姓名库有记录）时才渲染可点击名字；
    // 解析失败显示 User_xxx 兜底名时不可点击（点开 userinfo 也没有意义）
    const senderKnown = senderId ? !!(store.users?.[senderId] || usersJson?.[senderId]) : false
    const targetKnown = !!(store.users?.[patTarget] || usersJson?.[patTarget])
    const senderHtml = senderId
      ? (senderKnown ? `<span class="pat-user" data-uid="${senderId}">${esc(senderName)}</span>` : esc(senderName))
      : ''
    const targetHtml = targetKnown
      ? `<span class="pat-user" data-uid="${patTarget}">${esc(targetName)}</span>`
      : esc(targetName)
    return '<div class="pat-msg">' + senderHtml + ' 拍了拍 ' + targetHtml + '</div>'
  }
  if (obj.type === 'text') {
    let html = ''
    if (obj.reply_to) {
      const replyContent = esc(obj.reply_content || '').slice(0, 80)
      html += '<div class="reply-quote" data-reply-id="' + obj.reply_to + '"><i class="fas fa-quote-left reply-quote-icon"></i><span class="reply-quote-text">' + replyContent + '</span></div>'
    }
    // fmt: 'txt' = 纯文本消息（只做转义与换行保留，不做任何 Markdown / 表情码渲染）；
    // 无 fmt 或 fmt: 'md' = Markdown（历史消息全部归 md）
    if (obj.fmt === 'txt') {
      html += '<div class="plain-msg">' + esc(obj.content || '') + '</div>'
    } else {
      html += renderMarkdown(obj.content || '')
    }
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

/**
 * 是否为「纯网页浏览器」环境。
 *
 * 注意 window.__7FA4_WEB__ 只表示「非 Electron」——Android App 走的也是同一套 platform/web-api.js
 * 适配层，所以 APK 里它同样是 true（曾导致安卓端冒出网页端专属的「下载」入口与
 * 「网页端不支持 GeoGebra」文案）。判断"是不是网页"一律走这里，别直接读 __7FA4_WEB__。
 */
export function isWebBrowser() {
  if (typeof window === 'undefined') return false;
  if (!window.__7FA4_WEB__) return false; // Electron 桌面端
  if (window.__7FA4_NATIVE__ === true) return false; // Android 原生外壳
  return window.__7FA4_PLATFORM__ !== 'android'; // 兜底：老版本注入的标记
}

/**
 * 「隐藏非双向好友」设置：单向关注（仅我关注 TA，或仅 TA 关注我）的好友被隐藏。
 * 只影响列表/未读展示，store 中的数据与消息历史完整保留，关掉开关即恢复。
 */
export function isUserHiddenBySetting(u) {
  if (store.setting?.hideNonMutual !== true) return false;
  return !(u?.watchee === true && u?.watcher === true);
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

// ========== 更新检查（非 Electron） ==========
/** 版本号比较：返回 1（a>b）/ 0 / -1 */
export function compareVersion(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * 静默检查更新，把结果写进 store.update，供 NavBar 红点与 UpdatePanel 复用。
 * 只在「非 Electron」（网页端 / 安卓端）执行 —— 桌面端由 electron-updater 自己查，
 * 且 preload 不提供 fetchVersionInfo。安卓端尤其需要：APK 没有自动更新通道，
 * 不做启动检查用户就永远不会知道有新版本。
 */
export async function checkAppUpdate() {
  if (!window.__7FA4_WEB__) return store.update;
  if (typeof window.api?.fetchVersionInfo !== 'function') return store.update;
  store.update.checking = true;
  try {
    const r = await window.api.fetchVersionInfo();
    if (r && r.success) {
      const latest = r.latestVersion || '';
      const cur = await window.api.getVersion().catch(() => '');
      store.update.current = cur || '';
      store.update.latest = latest;
      store.update.hasUpdate = !!latest && compareVersion(latest, cur) > 0;
      const apk = (r.artifacts || []).find(a => a && a.platform === 'android');
      store.update.apkUrl = (apk && apk.url) || '';
      store.update.apkSize = (apk && apk.size) || 0;
      store.update.error = '';
    } else {
      store.update.error = (r && r.error) || '获取最新版本失败';
    }
  } catch (e) {
    store.update.error = (e && e.message) || '网络错误';
  } finally {
    store.update.checking = false;
    store.update.checked = true;
  }
  return store.update;
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

// ========== 收藏结构归一化 ==========
// v2 起新增 tags / note / pinned。读取时补默认值但不写回（避免轮询期间频繁改动响应式数据），
// 由 saveAll 的自然落盘完成升级；旧客户端读到多余字段会忽略 → 新旧版本双向兼容。
export const FAVORITES_SCHEMA = 2

/**
 * 构造一条收藏记录（唯一入口）。
 * 各处收藏按钮都走这里，避免写入结构不一致 —— 曾出现 MessageList 与 ChatView 两处
 * 都只写旧 7 字段，导致新收藏缺 tags/note/pinned，每次渲染都要重新归一化。
 */
export function makeFavorite(msg, fromType, fromId) {
  return {
    id: msg.id ?? msg.mid,
    content: msg.content || '',
    sender: msg.sender,
    send_time: msg.send_time,
    fromType: fromType ?? null,
    fromId: fromId ?? null,
    savedAt: Date.now(),
    tags: [],
    note: '',
    pinned: false,
    schema: FAVORITES_SCHEMA
  }
}

export function normalizeFavorites(list) {
  if (!Array.isArray(list)) return []
  return list.map((f) => {
    if (!f || typeof f !== 'object' || f.schema === FAVORITES_SCHEMA) return f
    return {
      ...f,
      tags: Array.isArray(f.tags) ? f.tags : [],
      note: typeof f.note === 'string' ? f.note : '',
      pinned: f.pinned === true,
      schema: FAVORITES_SCHEMA
    }
  })
}

// ========== 全量消息检索（三端统一入口） ==========
// Electron: preload → 主进程 storage.searchMessages（逐条解密）
// 网页/安卓: platform/web-api.js 的同名实现（IndexedDB）
// senders：按发送者命中 —— 搜「某人」时带出他发出的消息（微信式搜索）
export async function searchAllMessages({ q, senders, kind, cid, after, before, limit = 50, offset = 0, scanCap } = {}) {
  const keyword = String(q || '').trim()
  const senderList = Array.isArray(senders)
    ? senders.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : []
  // 关键词与发送者至少要有一个，否则等同于全量扫描
  if (!keyword && !senderList.length) return { success: true, total: 0, scanned: 0, truncated: false, data: [] }
  const uid = store.self?.uid
  if (!uid) return { success: false, error: '未登录' }
  const fn = window.api?.storeSearchMessages
  if (typeof fn !== 'function') return { success: false, error: '当前平台不支持全量检索' }
  try {
    return await fn(uid, { q: keyword, senders: senderList, kind, cid, after, before, limit, offset, scanCap })
  } catch (e) {
    return { success: false, error: e.message || '检索失败' }
  }
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


