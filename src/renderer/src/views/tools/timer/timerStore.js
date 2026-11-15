// 计时器引擎（模块级单例，视图与悬浮窗共用单一数据源）
import { reactive, watch } from 'vue'
import { store } from '../../../store.js'
import { getAvatarInitial, getGradeColor, usersJson } from '../../../utils.js'
import endSoundSrc from '../../../assets/timer-end.mp3'
import {
  STORAGE_KEY,
  LAYOUTS,
  FLOAT_POS,
  pad,
  toLocalInput,
  nextBreakTarget,
  parseDuration,
  saveTimerConfig,
  restoreTimerConfig
} from './timerPersist.js'
import {
  buildFloatPayload,
  pushTimerFloatState,
  pushTimerFloatConfig,
  openTimerFloat,
  initFloatBridge
} from './timerFloatSync.js'

export { STORAGE_KEY, LAYOUTS, FLOAT_POS, parseDuration }

export const PANEL_COUNT = 4
export const QUICK = [1, 3, 5, 10]
export const PALETTE = [
  'var(--palette-1, #6D93C9)',
  'var(--palette-2, #7FA98D)',
  'var(--palette-3, #CFA06A)',
  'var(--palette-4, #B98BA8)'
]

function createPanel() {
  return {
    uid: null,
    customName: '',
    task: '',
    mode: 'duration',
    durationText: '00:05:00',
    targetText: toLocalInput(nextBreakTarget()),
    total: 0,
    remaining: 5 * 60 * 1000,
    running: false,
    done: false,
    deadline: 0
  }
}

export const timer = reactive({
  panels: Array.from({ length: PANEL_COUNT }, createPanel),
  layout: 4,
  soundOn: true,
  float: { on: false, pos: 'br', onTop: true, x: null, y: null },
  floatPanelOpen: false,
  floatSupported: !window.__7FA4_WEB__ && typeof window.api?.openTimerFloat === 'function'
})

export function anyRunning() {
  return timer.panels.some((p) => p.running)
}

export function panelUser(p) {
  const custom = String(p.customName || '').trim()
  if (custom) return { name: custom, initial: custom.charAt(0), color: 'var(--brand)' }
  if (!p.uid) return null
  const u = store.users ? store.users[p.uid] : null
  const info = usersJson?.[p.uid]
  const name = info?.name || u?.realname || u?.nickname || u?.username || `User_${p.uid}`
  return { name, initial: getAvatarInitial(p.uid), color: getGradeColor(p.uid) }
}

export const floatPayload = () => buildFloatPayload(timer, panelUser, PALETTE)
export const pushFloatState = () => pushTimerFloatState(timer, floatPayload)
export const pushFloatConfig = () => pushTimerFloatConfig(timer)
export const openFloat = () => openTimerFloat(timer, pushFloatState)

export function toggleFloat() {
  if (!timer.floatSupported) return
  timer.float.on = !timer.float.on
  if (timer.float.on) openFloat()
  else window.api.closeTimerFloat()
}

export function setFloatPos(key) {
  timer.float.pos = key
  timer.float.x = null
  timer.float.y = null
  pushFloatConfig()
}

export function toggleFloatPanel() {
  timer.floatPanelOpen = !timer.floatPanelOpen
}

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

let endAudioPrimed = false
function primeEndAudio() {
  if (endAudioPrimed || !timer.soundOn) return
  endAudioPrimed = true
  try { new Audio(endSoundSrc).load() } catch { /* ignore */ }
}

let lastChimeAt = 0
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
  } catch { /* ignore */ }
}

export function start(p) {
  if (p.running) return
  p.done = false
  if (p.mode === 'target') {
    const t = new Date(p.targetText).getTime()
    if (Number.isFinite(t)) p.remaining = Math.max(0, t - Date.now())
    p.total = p.remaining
  } else if (p.remaining <= 0) {
    loadFromInput(p)
  }
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

export function toggleLabel(p) {
  if (p.running) return '暂停'
  return p.total > 0 && p.remaining > 0 && p.remaining < p.total ? '继续' : '开始'
}

export function toggle(p) {
  if (p.running) pause(p)
  else start(p)
}

export function startAll() { for (const p of timer.panels) start(p) }
export function pauseAll() { for (const p of timer.panels) pause(p) }
export function resetAll() { for (const p of timer.panels) reset(p) }
export function toggleAll() { if (anyRunning()) pauseAll(); else startAll() }

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

export const saveConfig = () => saveTimerConfig(timer)
export const restoreConfig = () => restoreTimerConfig(timer, loadFromInput)

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

watch(() => anyRunning(), syncTick)

restoreConfig()
syncTick()
initFloatBridge(timer, {
  toggleAll,
  resetAll,
  toggle,
  pushConfig: pushFloatConfig,
  pushState: pushFloatState
})
