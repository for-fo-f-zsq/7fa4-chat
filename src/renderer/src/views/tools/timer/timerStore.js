// 计时器引擎（模块级单例）
// 状态活得比「计时器」页面久：点返回 / 切到别的工具页时计时继续走、悬浮窗继续刷新，
// 只有用户在悬浮窗上点 ✕、关掉悬浮窗开关、或退出应用，计时才会结束。
// 视图（TimerTool.vue）只是这份状态的一个门面；悬浮窗上的按钮也回到这里执行，保持单一数据源。
import { reactive, watch } from 'vue'
import { store } from '../../../store.js'
import { getAvatarInitial, getGradeColor, usersJson } from '../../../utils.js'
import endSoundSrc from '../../../assets/timer-end.mp3'

export const STORAGE_KEY = '7fa4-timer-v1'
export const PANEL_COUNT = 4
export const LAYOUTS = [1, 2, 4]
export const QUICK = [1, 3, 5, 10]
// 每格配色：取自主题色板 `css/themes/palette.css`（每套主题一组 --palette-1..4）
export const PALETTE = ['var(--palette-1)', 'var(--palette-2)', 'var(--palette-3)', 'var(--palette-4)']
// 下课时间：12:00 / 17:30 / 22:00
const BREAK_TIMES = [
  [12, 0],
  [17, 30],
  [22, 0]
]

const pad = (n) => String(n).padStart(2, '0')

function toLocalInput(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 最近的下课时刻（今天剩下的第一个；都过了则取明天 12:00）——「目标时刻」的默认值
function nextBreakTarget(from = Date.now()) {
  const base = new Date(from)
  for (const [h, m] of BREAK_TIMES) {
    const t = new Date(base)
    t.setHours(h, m, 0, 0)
    if (t.getTime() > from) return t.getTime()
  }
  const t = new Date(base)
  t.setDate(t.getDate() + 1)
  t.setHours(BREAK_TIMES[0][0], BREAK_TIMES[0][1], 0, 0)
  return t.getTime()
}

/* 时长解析：支持 "1:30:00"、"05:00"、"90"(分钟)、"0.5"(分钟) */
export function parseDuration(str) {
  if (str == null) return 0
  const s = String(str).trim()
  if (!s) return 0
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60000)
  const parts = s.split(':').map((p) => Number(p.trim()))
  if (parts.some((n) => !Number.isFinite(n))) return 0
  let sec = 0
  for (const p of parts) sec = sec * 60 + p
  return Math.max(0, Math.round(sec * 1000))
}

function createPanel() {
  return {
    uid: null,
    // 自定义名字：未登录或名单外的人用它计时（与 uid 互斥，存 localStorage）
    customName: '',
    // 任务：与名字拼成「姓名-任务」显示（含悬浮窗），纯展示、不参与计时
    task: '',
    mode: 'duration',
    durationText: '00:05:00',
    targetText: toLocalInput(nextBreakTarget()),
    total: 0,        // 本轮计时总时长（进度条用）
    remaining: 5 * 60 * 1000,
    running: false,
    done: false,
    deadline: 0
  }
}

/* ---------- 状态（单一数据源，视图与悬浮窗都读它） ---------- */
export const timer = reactive({
  panels: Array.from({ length: PANEL_COUNT }, createPanel),
  layout: 4,
  soundOn: true,
  // 悬浮窗：on 是运行态（不落盘）；pos/onTop/x/y 随计时器配置一起落盘
  float: { on: false, pos: 'br', onTop: true, x: null, y: null },
  floatPanelOpen: false,
  // 悬浮窗是独立 file:// 页面，无主题 CSS / localStorage，状态全由本模块经主进程推
  floatSupported: !window.__7FA4_WEB__ && typeof window.api?.openTimerFloat === 'function'
})

export const FLOAT_POS = [
  { key: 'tl', label: '左上角', short: '↖' },
  { key: 'tr', label: '右上角', short: '↗' },
  { key: 'bl', label: '左下角', short: '↙' },
  { key: 'br', label: '右下角', short: '↘' }
]

export function anyRunning() {
  return timer.panels.some((p) => p.running)
}

/** 把主题色变量解析成具体颜色值（悬浮窗没有主题 CSS，`var(--x)` 在那边解析不出来） */
function resolveColor(c) {
  const s = String(c || '').trim()
  if (!s) return '#3C8CE7'
  if (s.startsWith('var(')) {
    const name = s.slice(4, s.indexOf(')')).trim()
    const v = name ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : ''
    return v || '#3C8CE7'
  }
  return s
}

export function panelUser(p) {
  // 自定义名字优先：未登录 / 名单里没有的人也能计时（且不依赖任何远端数据）
  const custom = String(p.customName || '').trim()
  if (custom) {
    return { name: custom, initial: custom.charAt(0), color: 'var(--accent)' }
  }
  if (!p.uid) return null
  const u = store.users ? store.users[p.uid] : null
  const info = usersJson?.[p.uid]
  const name = info?.name || u?.realname || u?.nickname || u?.username || `User_${p.uid}`
  return { name, initial: getAvatarInitial(p.uid), color: getGradeColor(p.uid) }
}

export function floatPayload() {
  return {
    layout: timer.layout,
    panels: timer.panels.map((p, i) => ({
      // 下标要带上：悬浮窗有「每格自己的开始/暂停」，点哪格得知道是哪格
      index: i,
      // 没选人的格也照样显示（显示「未选择」）——「几格」就该看到几行
      name: panelUser(p)?.name || '未选择',
      // 任务：悬浮窗按「姓名-任务」拼起来显示（空则只显示名字）
      task: String(p.task || '').trim(),
      color: resolveColor(PALETTE[i]),
      running: p.running,
      done: p.done,
      deadline: p.deadline,
      remaining: p.remaining,
      total: p.total
    }))
  }
}

export function pushFloatState() {
  if (!timer.floatSupported || !timer.float.on) return
  window.api.updateTimerFloat(floatPayload())
}

export function pushFloatConfig() {
  if (!timer.floatSupported || !timer.float.on) return
  window.api.updateTimerFloatConfig({ pos: timer.float.pos, onTop: timer.float.onTop, x: timer.float.x, y: timer.float.y })
}

export function openFloat() {
  if (!timer.floatSupported) return
  window.api.openTimerFloat({
    pos: timer.float.pos,
    onTop: timer.float.onTop,
    x: timer.float.x,
    y: timer.float.y
  })
  pushFloatState()
}

export function toggleFloat() {
  if (!timer.floatSupported) return
  timer.float.on = !timer.float.on
  if (timer.float.on) openFloat()
  else window.api.closeTimerFloat()
}

/** 选预设角落：丢弃手动拖拽坐标，回到预设位置 */
export function setFloatPos(key) {
  timer.float.pos = key
  timer.float.x = null
  timer.float.y = null
  pushFloatConfig()
}

export function toggleFloatPanel() {
  timer.floatPanelOpen = !timer.floatPanelOpen
}

/* ---------- 计时 ---------- */
export function loadFromInput(p) {
  p.done = false
  if (p.mode === 'target') {
    const t = new Date(p.targetText).getTime()
    p.remaining = Number.isFinite(t) ? Math.max(0, t - Date.now()) : 0
  } else {
    p.remaining = parseDuration(p.durationText)
  }
  p.total = p.remaining
}

// 编辑时长时若未在运行，实时刷新显示（运行中不打断）
export function onDurationInput(p) {
  if (!p.running) loadFromInput(p)
}

export function setMode(p, mode) {
  if (p.mode === mode) return
  p.mode = mode
  p.running = false
  p.done = false
  loadFromInput(p)
}

export function onTargetChange(p) {
  if (!p.running) loadFromInput(p)
}

export function setQuick(p, minutes) {
  p.mode = 'duration'
  p.durationText = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`
  p.done = false
  p.running = false
  loadFromInput(p)
}

export function start(p) {
  if (p.running) return
  p.done = false
  if (p.mode === 'target') {
    // 目标时刻：每次以「距目标的时长」为整段
    const t = new Date(p.targetText).getTime()
    if (Number.isFinite(t)) p.remaining = Math.max(0, t - Date.now())
    p.total = p.remaining
  } else if (p.remaining <= 0) {
    // 已归零（或尚未载入）：按输入框时长重新整段
    loadFromInput(p)
  }
  // 注意：中途暂停后继续时**不要**改写 total，否则进度条会从 0 重算
  if (p.remaining <= 0) return
  p.running = true
  p.deadline = Date.now() + p.remaining
  primeEndAudio()
  saveConfig()
}

export function pause(p) {
  if (!p.running) return
  p.remaining = Math.max(0, p.deadline - Date.now())
  p.running = false
  saveConfig()
}

export function reset(p) {
  p.running = false
  p.done = false
  loadFromInput(p)
  saveConfig()
}

// 开始/暂停合并为一个按钮：运行中→暂停；中途停下过→继续；否则→开始
export function toggleLabel(p) {
  if (p.running) return '暂停'
  return p.total > 0 && p.remaining > 0 && p.remaining < p.total ? '继续' : '开始'
}

export function toggle(p) {
  if (p.running) pause(p)
  else start(p)
}

export function startAll() {
  for (const p of timer.panels) start(p)
}

export function pauseAll() {
  for (const p of timer.panels) pause(p)
}

export function resetAll() {
  for (const p of timer.panels) reset(p)
}

export function toggleAll() {
  if (anyRunning()) pauseAll()
  else startAll()
}

/* 结束音效文件：用户提供的素材，已裁掉原文件开头 1.3s 的无声段（4.18s → 2.88s）。
   走 vite 静态资源导入，生成的 URL 在 Electron / web / Android 三端都成立。 */
let endAudioPrimed = false
/* 预热：首次点击（开始/切音效开关）时就把音频拉进缓存，归零那刻才能立刻响 */
function primeEndAudio() {
  if (endAudioPrimed || !timer.soundOn) return
  endAudioPrimed = true
  try { new Audio(endSoundSrc).load() } catch { /* 忽略：无音频能力时静默降级 */ }
}

let lastChimeAt = 0
/* 结束提示音：播放音效文件。
   1.2s 节流：多格几乎同时归零时不叠成一团噪音。
   每次新建 audio 元素 —— 前一次尚未播完时允许叠加重放（同 URL 命中缓存，起播延迟可忽略）。 */
function playChime() {
  if (!timer.soundOn) return
  const now = Date.now()
  if (now - lastChimeAt < 1200) return
  lastChimeAt = now
  try {
    const a = new Audio(endSoundSrc)
    a.volume = 1
    const p = a.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch { /* 忽略：无音频能力时静默无声 */ }
}

/* ---------- 心跳（只在有计时在跑时开，避免常态占用） ---------- */
let timerId = null
function tick() {
  const now = Date.now()
  for (const p of timer.panels) {
    if (!p.running) continue
    p.remaining = Math.max(0, p.deadline - now)
    if (p.remaining === 0) {
      p.running = false
      p.done = true
      playChime()
    }
  }
}

function syncTick() {
  if (anyRunning() && !timerId) timerId = setInterval(tick, 100)
  else if (!anyRunning() && timerId) { clearInterval(timerId); timerId = null }
}

/* ---------- 持久化 ---------- */
export function saveConfig() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        layout: timer.layout,
        soundOn: timer.soundOn,
        panels: timer.panels.map((p) => ({
          uid: p.uid,
          customName: p.customName,
          task: p.task,
          mode: p.mode,
          durationText: p.durationText,
          targetText: p.targetText,
          // 运行态一并落盘：离开工具页再回来（或重启应用）时接着走，而不是重置
          running: p.running,
          deadline: p.deadline,
          total: p.total,
          remaining: p.remaining
        })),
        // 悬浮窗外观（开启状态不落盘：窗口只在本进程存活）
        float: { pos: timer.float.pos, onTop: timer.float.onTop, x: timer.float.x, y: timer.float.y }
      })
    )
  } catch { /* 忽略：隐私模式等存储不可用 */ }
}

export function restoreConfig() {
  let cfg = null
  try {
    cfg = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch { cfg = null }
  const saved = Array.isArray(cfg?.panels) ? cfg.panels : []
  if (cfg) {
    if (LAYOUTS.includes(cfg.layout)) timer.layout = cfg.layout
    if (typeof cfg.soundOn === 'boolean') timer.soundOn = cfg.soundOn
    const f = cfg.float
    if (f && typeof f === 'object') {
      if (FLOAT_POS.some((o) => o.key === f.pos)) timer.float.pos = f.pos
      if (typeof f.onTop === 'boolean') timer.float.onTop = f.onTop
      if (Number.isFinite(f.x) && Number.isFinite(f.y)) { timer.float.x = f.x; timer.float.y = f.y }
    }
  }
  timer.panels.forEach((p, i) => {
    const s = saved[i]
    if (s) {
      p.uid = s.uid ?? null
      p.customName = typeof s.customName === 'string' ? s.customName : ''
      p.task = typeof s.task === 'string' ? s.task : ''
      p.mode = s.mode === 'target' ? 'target' : 'duration'
      if (typeof s.durationText === 'string') p.durationText = s.durationText
      if (typeof s.targetText === 'string' && s.targetText) p.targetText = s.targetText
    }
    const savedTotal = Number.isFinite(s?.total) ? s.total : 0
    const savedRemaining = Number.isFinite(s?.remaining) ? s.remaining : 0
    // 1) 上次离开时正在计时且未到点：接着走
    if (s?.running === true && Number.isFinite(s.deadline) && s.deadline > Date.now()) {
      p.total = savedTotal
      p.deadline = s.deadline
      p.remaining = s.deadline - Date.now()
      p.running = true
      p.done = false
      return
    }
    // 2) 上次离开时在计时但已过点：显示归零（不补响铃）
    if (s?.running === true && Number.isFinite(s.deadline)) {
      p.total = savedTotal
      p.remaining = 0
      p.running = false
      p.done = true
      return
    }
    // 3) 未运行：按输入框重算；但若是「中途暂停」，保留原有进度（进度条不回退到 0）
    loadFromInput(p)
    if (p.mode === 'duration' && savedTotal > 0 && savedRemaining > 0 && savedRemaining < savedTotal) {
      p.total = savedTotal
      p.remaining = savedRemaining
    }
  })
  // 目标时刻兜底：缺失/非法、或上次存的时刻已经过去（且该格未处于归零态）→ 重置为最近的下课时间
  const now = Date.now()
  for (const p of timer.panels) {
    const t = new Date(p.targetText).getTime()
    if (!p.targetText || !Number.isFinite(t) || (t < now && !p.done)) {
      p.targetText = toLocalInput(nextBreakTarget(now))
    }
  }
}

// 仅配置字段变化时落盘（剩余时间每 100ms 变化，不能进 watch）
watch(
  () => JSON.stringify({
    layout: timer.layout,
    soundOn: timer.soundOn,
    panels: timer.panels.map((p) => [p.uid, p.customName, p.task, p.mode, p.durationText, p.targetText]),
    float: [timer.float.pos, timer.float.onTop, timer.float.x, timer.float.y]
  }),
  saveConfig
)

watch(() => timer.soundOn, (v) => { if (v) primeEndAudio() })

// 只在结构性变化时推给悬浮窗（运行态 remaining 归一为 0，否则每 100ms 推一次）
watch(
  () => JSON.stringify({
    layout: timer.layout,
    panels: timer.panels.map((p) => [
      panelUser(p)?.name || '',
      String(p.task || '').trim(),
      p.running,
      p.done,
      p.deadline,
      p.running ? 0 : p.remaining,
      p.total
    ])
  }),
  () => pushFloatState()
)

// 有计时在跑才开心跳
watch(() => anyRunning(), syncTick)

/* ---------- 启动：恢复上次状态 + 接上悬浮窗（只接一次，不随页面卸载断开） ---------- */
restoreConfig()
syncTick()

if (timer.floatSupported) {
  // 悬浮窗上的按钮 → 回到本模块执行（保持单一数据源）
  window.api.onTimerFloatCommand?.((payload) => {
    const t = payload && payload.type
    if (t === 'toggle-all') toggleAll()
    else if (t === 'reset-all') resetAll()
    // 每格自己的开始/暂停（悬浮窗的主要操作）
    else if (t === 'toggle-one') {
      const p = timer.panels[Number(payload.index)]
      if (p) toggle(p)
    } else if (t === 'toggle-pin') { timer.float.onTop = !timer.float.onTop; pushFloatConfig() }
  })
  // 用户在悬浮窗上点了 ✕ → 同步开关状态
  window.api.onTimerFloatClosed?.(() => { timer.float.on = false })
  window.api.onTimerFloatMoved?.((b) => {
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) { timer.float.x = b.x; timer.float.y = b.y }
  })
  // 本窗口可能刚重载过（窗口本身是主进程持有的，不会跟着重载销毁）：
  // 问一句悬浮窗还在不在，若在就把开关对齐、状态补推一次，避免「窗口还开着但按钮显示关着」。
  window.api.isTimerFloatOpen?.().then((open) => {
    if (open) { timer.float.on = true; pushFloatState() }
  }).catch(() => { /* 忽略 */ })
}
