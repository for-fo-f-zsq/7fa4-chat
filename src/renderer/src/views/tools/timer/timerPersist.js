export const STORAGE_KEY = '7fa4-timer-v1'
export const LAYOUTS = [1, 2, 4]
export const FLOAT_POS = [
  { key: 'tl', label: '左上角', short: '↖' },
  { key: 'tr', label: '右上角', short: '↗' },
  { key: 'bl', label: '左下角', short: '↙' },
  { key: 'br', label: '右下角', short: '↘' }
]

const BREAK_TIMES = [
  [12, 0],
  [17, 30],
  [22, 0]
]

export const pad = (n) => String(n).padStart(2, '0')

export function toLocalInput(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 最近的下课时刻（今天剩下的第一个；都过了则取明天 12:00）——「目标时刻」的默认值 */
export function nextBreakTarget(from = Date.now()) {
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

/** 时长解析：支持 "1:30:00"、"05:00"、"90"(分钟)、"0.5"(分钟) */
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

export function saveTimerConfig(timer) {
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
          running: p.running,
          deadline: p.deadline,
          total: p.total,
          remaining: p.remaining
        })),
        float: { pos: timer.float.pos, onTop: timer.float.onTop, x: timer.float.x, y: timer.float.y }
      })
    )
  } catch { /* 忽略：隐私模式等存储不可用 */ }
}

export function restoreTimerConfig(timer, loadFromInput) {
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
      if (Number.isFinite(f.x) && Number.isFinite(f.y)) {
        timer.float.x = f.x
        timer.float.y = f.y
      }
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
    if (s?.running === true && Number.isFinite(s.deadline) && s.deadline > Date.now()) {
      p.total = savedTotal
      p.deadline = s.deadline
      p.remaining = s.deadline - Date.now()
      p.running = true
      p.done = false
      return
    }
    if (s?.running === true && Number.isFinite(s.deadline)) {
      p.total = savedTotal
      p.remaining = 0
      p.running = false
      p.done = true
      return
    }
    loadFromInput(p)
    if (p.mode === 'duration' && savedTotal > 0 && savedRemaining > 0 && savedRemaining < savedTotal) {
      p.total = savedTotal
      p.remaining = savedRemaining
    }
  })
  const now = Date.now()
  for (const p of timer.panels) {
    const t = new Date(p.targetText).getTime()
    if (!p.targetText || !Number.isFinite(t) || (t < now && !p.done)) {
      p.targetText = toLocalInput(nextBreakTarget(now))
    }
  }
}
