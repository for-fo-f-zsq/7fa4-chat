// 渲染层通知策略的唯一实现处：会话标识、免打扰判断、通知内容/payload 构造与提示音。
// 只做「纯判断 + 纯构造」，不碰 IPC；真正发通知的路径在 composables/chat/useUnreadNotifications.js。
import { store } from '../store.js'

const DND_DEFAULT_START = '22:00'
const DND_DEFAULT_END = '07:00'
const NOTIF_POSITIONS = ['br', 'tr', 'bl', 'tl']
const NOTIF_DURATION_DEFAULT = 6000
const NOTIF_DURATION_MIN = 3000
const NOTIF_DURATION_MAX = 20000
const NOTIF_FONT_SIZE_DEFAULT = 14

/** 会话唯一键：所有免打扰/未读映射表都以它作为 key。 */
export function getConvoKey(pageType, pageId) {
  return `${pageType}_${pageId}`
}

/** 单个会话的「消息免打扰」始终生效，优先于全局 DND。 */
export function isConvoMuted(pageType, pageId) {
  return !!store.mutedConvos?.[getConvoKey(pageType, pageId)]
}

/**
 * 'HH:mm' → 当天第几分钟（0..1440）。
 * '<input type="time">' 带秒时会给出 'HH:MM:SS'，末段秒数直接丢弃；
 * '24:00' 是合法输入，语义为「当天结束」= 1440，否则像 22:00→24:00 这种时段会被判非法而静默失效。
 * 其它非法输入一律 null（调用方据此视为「未配置」，不能当成 0 点）。
 */
export function parseHHMM(str) {
  if (typeof str !== 'string') return null
  const m = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(str.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h === 24 && mi === 0) return 24 * 60
  if (h > 23) return null
  return h * 60 + mi
}

/**
 * 是否落在 [start, end) 免打扰时段内。
 * 跨零点（22:00→07:00）自动识别；start === end 视为未配置，非法格式返回 false。
 */
export function isWithinQuietHours(startStr, endStr, now = new Date()) {
  const start = parseHHMM(startStr)
  const end = parseHHMM(endStr)
  if (start === null || end === null) return false
  if (start === end) return false
  const d = now instanceof Date ? now : new Date(now)
  if (!d || Number.isNaN(d.getTime())) return false
  const cur = d.getHours() * 60 + d.getMinutes()
  if (start < end) return cur >= start && cur < end
  // 跨零点：区间是 [start, 24:00) ∪ [00:00, end)
  return cur >= start || cur < end
}

/** 全局免打扰：手动开关优先，其次才是定时时段。 */
export function isDndActive(setting, now = new Date()) {
  if (!setting) return false
  if (setting.dndEnabled === true) return true
  if (setting.dndSchedule === true) {
    return isWithinQuietHours(
      setting.dndStart || DND_DEFAULT_START,
      setting.dndEnd || DND_DEFAULT_END,
      now,
    )
  }
  return false
}

/** 兼容旧导出名（历史调用点只认 isDndTime）。 */
export function isDndTime(setting, now = new Date()) {
  return isDndActive(setting, now)
}

/**
 * 通知闸门（带原因，便于调试与埋点）。
 * 顺序：会话免打扰 → 全局 DND → 仅提醒提及我的（只影响群聊，私聊照常）。
 */
export function shouldNotifyDetailed(pageType, pageId, setting, opts = {}) {
  if (isConvoMuted(pageType, pageId)) return { ok: false, reason: 'muted' }
  if (isDndActive(setting)) return { ok: false, reason: 'dnd' }
  // 只看显式 opts.chatType：旧签名不传 opts 时行为必须仍是「仅免打扰 && DND」。
  if (opts.chatType === 'group' && !opts.mention && setting?.notifMentionOnly === true) {
    return { ok: false, reason: 'mention-only' }
  }
  return { ok: true, reason: '' }
}

/** 兼容旧签名：不传 opts 时等价于「非会话免打扰 && 非 DND」。 */
export function shouldNotify(pageType, pageId, setting, opts = {}) {
  return shouldNotifyDetailed(pageType, pageId, setting, opts).ok
}

/** 隐私模式：只告诉用户「有新消息」，不泄露正文。 */
export function getNotifContent(content, setting) {
  if (setting?.notifPrivacy) return '收到一条新消息'
  return content
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizePosition(value) {
  return NOTIF_POSITIONS.includes(value) ? value : 'br'
}

function normalizeAccent(value) {
  if (typeof value !== 'string') return ''
  const v = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : ''
}

/** 头像文字：标题首字（按字符而非字节切，兼容中文/emoji），大写化。 */
function avatarOf(title) {
  const chars = Array.from(String(title || '').trim())
  if (!chars.length) return '?'
  return chars[0].toUpperCase()
}

/**
 * 通知 payload 契约（desktop-notify 托盘卡片 与 popup-ui 应用内弹窗共用，改字段必须同步两边）。
 * id 对同一会话稳定：弹窗据此替换而不是堆叠。
 */
export function buildNotificationPayload({
  chatType,
  targetId,
  title,
  subtitle,
  body,
  avatar,
  accent,
  mention,
  count,
  setting,
  timestamp,
} = {}) {
  const s = setting || {}
  const type = chatType === 'group' ? 'group' : 'user'
  const safeTitle = String(title || (type === 'group' ? '群聊' : '新消息'))
  const safeCount = Math.max(1, Math.floor(Number(count) || 1))
  return {
    id: `${type}_${targetId}`,
    title: safeTitle,
    subtitle: String(subtitle || ''),
    body: String(body || ''),
    avatar: avatar ? String(avatar) : avatarOf(safeTitle),
    accent: normalizeAccent(accent),
    chatType: type,
    targetId,
    mention: !!mention,
    count: safeCount,
    timestamp: Number(timestamp) || Date.now(),
    position: normalizePosition(s.notifPosition),
    duration: clampNumber(
      s.notifDuration || NOTIF_DURATION_DEFAULT,
      NOTIF_DURATION_MIN,
      NOTIF_DURATION_MAX,
      NOTIF_DURATION_DEFAULT,
    ),
    privacy: !!s.notifPrivacy,
    theme: s.theme || 'default',
    fontSize: Number(s.fontSize) || NOTIF_FONT_SIZE_DEFAULT,
  }
}

// ---------- 提示音（Web Audio 合成，不打包音频资源） ----------
let _audioCtx = null

function getAudioContext() {
  try {
    if (typeof window === 'undefined') return null
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    if (!_audioCtx) _audioCtx = new Ctor()
    return _audioCtx
  } catch {
    return null
  }
}

/** 浏览器要求首次用户手势后才能出声：pointerdown 时一次性解锁。 */
export function unlockNotificationAudio() {
  try {
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'suspended') {
      const p = ctx.resume()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
  } catch {}
}

// 模块加载即布防；无 document（Node 单测）时跳过。
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  try {
    document.addEventListener('pointerdown', () => unlockNotificationAudio(), { once: true })
  } catch {}
}

/**
 * 双音提示：default 660→880Hz，mention 880→1174.66Hz；整体衰减 0.45s。
 * 音量 = clamp(0,100)/100 * 0.18 峰值；异常一律吞掉（声音失败不能影响消息流）。
 */
export function playNotificationSound(type = 'default', volumePercent = 60) {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      const p = ctx.resume()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }
    const volume = Math.min(100, Math.max(0, Number(volumePercent) || 0)) / 100
    const peak = volume * 0.18
    if (peak <= 0) return // 静音档：不建振荡器，避免无意义的音频调度
    const [freq1, freq2] = type === 'mention' ? [880, 1174.66] : [660, 880]
    const start = ctx.currentTime
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)

    const tone = (freq, at, dur) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, at)
      // 极短起音后再指数衰减：从 0 起 exponentialRamp 会失效。
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(gain)
      gain.connect(master)
      osc.start(at)
      osc.stop(at + dur + 0.02)
    }

    tone(freq1, start, 0.2)
    tone(freq2, start + 0.2, 0.25)
  } catch {}
}

/** 设置页「提示音量」试听：与 notifSound 开关无关，用户此刻就想听见。 */
export function previewNotificationSound(volumePercent = 60) {
  playNotificationSound('default', volumePercent)
}

const TEST_NOTIF_BODY = '这是一条测试通知，收到说明通知已正常工作。'

/**
 * 测试通知的 payload：故意用示例群聊（而不是 user/test），
 * 这样「群名 → 副标题(发送者) → 正文」三层与隐私脱敏都能一次看清。
 * targetId 用空串：`group_` 不会撞任何真实会话（会话 id 都是数字），
 * 且主进程的 `if (chatType && targetId)` 会直接放过 —— 点测试卡只会把主窗拉到前台，不会切到不存在的会话。
 */
export function buildTestNotificationPayload(setting) {
  const s = setting || {}
  return buildNotificationPayload({
    chatType: 'group',
    targetId: '',
    title: '7FA4 Chat 测试群',
    subtitle: '7FA4 小助手',
    // 与真实消息同一条脱敏路径，隐私口径不允许出现第二套文案
    body: getNotifContent(TEST_NOTIF_BODY, s),
    mention: false,
    count: 1,
    setting: s,
    timestamp: Date.now(),
  })
}

/**
 * 设置页「发送测试通知」：走与真实消息同一条 window.api.notify 通道，
 * 让用户当场验证权限/位置/时长/隐私效果，再播放一次提示音并 toast 反馈结果。
 */
export async function sendTestNotification(setting) {
  const s = setting || {}
  let ok = false
  let permission = ''
  try {
    if (typeof window !== 'undefined' && window.api) {
      if (window.api.requestNotificationPermission) {
        try {
          permission = await window.api.requestNotificationPermission()
        } catch {}
      }
      if (window.api.notify) {
        // test 标记：web-api 据此主动弹出授权请求，而不是静默失败。
        await window.api.notify({ ...buildTestNotificationPayload(s), test: true })
        ok = true
      }
    }
  } catch {
    ok = false
  }

  // 用户主动点了「发送测试」，就要听见效果：这里无视 notifSound 开关（真实消息才受它约束）。
  playNotificationSound('default', s.notifSoundVolume ?? 60)

  try {
    const { showToast } = await import('../composables/useToast.js')
    if (ok) {
      showToast(
        s.notifDesktop === false ? '测试提示已发出（桌面弹窗已关闭，仅声音）' : '测试通知已发送',
        { type: 'success', duration: 3000 },
      )
    } else if (permission === 'denied') {
      showToast('通知权限被拒绝，请在系统设置中允许本站通知', { type: 'warning', duration: 3600 })
    } else {
      showToast('当前环境不支持通知', { type: 'warning', duration: 3600 })
    }
  } catch {}

  return ok
}
