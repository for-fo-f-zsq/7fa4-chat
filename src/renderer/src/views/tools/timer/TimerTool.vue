<template>
  <div class="tm-tool" :class="{ narrow: isNarrow }">
    <div class="tm-header">
      <button class="tm-back-btn" title="返回" @click="$emit('back')"><i class="fas fa-arrow-left"></i></button>
      <i class="fas fa-toolbox"></i>
      <span>工具</span>
      <span class="tm-sep">/</span>
      <i class="fas fa-stopwatch"></i>
      <span>计时器</span>

      <div class="tm-header-right">
        <div class="tm-seg tm-layout-seg" title="显示格数">
          <button v-for="n in LAYOUTS" :key="n" :class="{ on: layout === n }" @click="layout = n">{{ n }} 格</button>
        </div>
        <button
          class="tm-icon-btn"
          :class="{ on: soundOn }"
          :title="soundOn ? '提示音：开' : '提示音：关'"
          @click="soundOn = !soundOn"
        >
          <i :class="soundOn ? 'fas fa-volume-high' : 'fas fa-volume-xmark'"></i>
        </button>
      </div>
    </div>

    <div class="tm-actions">
      <button class="tm-act" :class="anyRunning ? 'hold' : 'go'" @click="toggleAll">
        <i :class="anyRunning ? 'fas fa-pause' : 'fas fa-play'"></i> {{ anyRunning ? '全部暂停' : '全部开始' }}
      </button>
      <button class="tm-act rst" @click="resetAll"><i class="fas fa-rotate-left"></i> 全部重置</button>
      <span class="tm-hint" v-if="!isNarrow">输入框回车即开始</span>
    </div>

    <div class="tm-stage" :class="`layout-${layout}`">
      <section
        v-for="cell in shownPanels"
        :key="cell.i"
        class="tm-panel"
        :class="{ done: cell.p.done, running: cell.p.running, picking: pickerOpen === cell.i }"
        :style="{ '--c': PALETTE[cell.i] }"
      >
        <div class="tm-panel-head">
          <button class="tm-who" :class="{ open: pickerOpen === cell.i }" @click="togglePicker(cell.i, $event)">
            <span v-if="panelUser(cell.p)" class="tm-who-avatar" :style="{ color: panelUser(cell.p).color || 'var(--accent)' }">
              {{ panelUser(cell.p).initial }}
            </span>
            <i v-else class="fas fa-user tm-who-none"></i>
            <span class="tm-who-name">{{ panelUser(cell.p)?.name || '选择用户' }}</span>
            <i class="fas fa-chevron-down tm-who-caret"></i>
          </button>

          <div
            v-if="pickerOpen === cell.i"
            ref="pickerRef"
            class="tm-picker"
            :class="{ up: pickerUp }"
            :style="{ maxHeight: pickerMaxH + 'px' }"
            @click.stop
          >
            <div class="tm-picker-search">
              <i class="fas fa-magnifying-glass"></i>
              <input
                ref="pickerInputRef"
                v-model="pickerQuery"
                type="text"
                placeholder="搜索真名 / 昵称 / 用户名 / UID"
                spellcheck="false"
                @keydown.esc="closePicker"
              />
            </div>
            <div class="tm-picker-list">
              <div v-if="!pickerResult.length" class="tm-picker-empty">无匹配用户</div>
              <button
                v-for="u in pickerResult"
                :key="u.uid"
                class="tm-picker-item"
                :class="{ sel: cell.p.uid === u.uid }"
                @click="selectUser(cell.i, u)"
              >
                <span class="tm-picker-avatar" :style="{ color: u.gradeColor || 'var(--accent)' }">{{ u.initial }}</span>
                <span class="tm-picker-name" :style="{ color: u.gradeColor || 'var(--text-primary)' }">{{ u.realName }}</span>
                <span class="tm-picker-meta">{{ u.meta }}</span>
                <i v-if="cell.p.uid === u.uid" class="fas fa-check tm-picker-check"></i>
              </button>
            </div>
            <div class="tm-picker-foot">
              <button class="tm-picker-clear" @click="selectUser(cell.i, null)">清空</button>
            </div>
          </div>
        </div>

        <div class="tm-time" :style="timeStyle(cell.p)">{{ timeText(cell.p) }}</div>

        <div class="tm-progress"><i :style="{ width: progressPct(cell.p) + '%' }"></i></div>

        <div class="tm-ctrl">
          <div class="tm-seg">
            <button :class="{ on: cell.p.mode === 'duration' }" @click="setMode(cell.p, 'duration')">时长</button>
            <button :class="{ on: cell.p.mode === 'target' }" @click="setMode(cell.p, 'target')">目标时刻</button>
          </div>

          <div class="tm-fields">
            <template v-if="cell.p.mode === 'duration'">
              <input
                v-model="cell.p.durationText"
                class="tm-fld tm-fld-dur"
                type="text"
                placeholder="时:分:秒"
                spellcheck="false"
                @input="onDurationInput(cell.p)"
                @keydown.enter="start(cell.p)"
              />
              <div class="tm-quick">
                <button v-for="q in QUICK" :key="q" @click="setQuick(cell.p, q)">{{ q }}′</button>
              </div>
            </template>
            <input
              v-else
              v-model="cell.p.targetText"
              class="tm-fld"
              type="datetime-local"
              @change="onTargetChange(cell.p)"
            />
          </div>

          <div class="tm-acts">
            <button :class="cell.p.running ? 'hold' : 'go'" @click="toggle(cell.p)">
              <i :class="cell.p.running ? 'fas fa-pause' : 'fas fa-play'"></i> {{ toggleLabel(cell.p) }}
            </button>
            <button class="rst" @click="reset(cell.p)"><i class="fas fa-rotate-left"></i> 重置</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { store } from '../../../store.js'
import { getAvatarInitial, getGradeColor, ranklistOrder, usersJson } from '../../../utils.js'
import { useNarrow } from '../../../composables/useNarrow.js'
import endSoundSrc from '../../../assets/timer-end.mp3'
import './timer-tool.css'

defineEmits(['back'])

const { isNarrow } = useNarrow()

const STORAGE_KEY = '7fa4-timer-v1'
const PANEL_COUNT = 4
const LAYOUTS = [1, 2, 4]
const QUICK = [1, 3, 5, 10]
// 用户选择下拉的高度上限（与 timer-tool.css 的 max-height 对应）
const PICKER_WANT = 380
const BASE_FONT = 11 // cqw，与 CSS 中 .tm-time 的 min() 首项一致（超长时按位数折算）
// 下课时间：12:00 / 17:30 / 22:00
const BREAK_TIMES = [
  [12, 0],
  [17, 30],
  [22, 0]
]

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

// 每格配色：取自主题色板 `css/themes/palette.css`（每套主题一组 --palette-1..4，
// 均为该主题色系下适度提纯的鲜艳色；缺失时回落 :root 的 default 组）
const PALETTE = ['var(--palette-1)', 'var(--palette-2)', 'var(--palette-3)', 'var(--palette-4)']

const pad = (n) => String(n).padStart(2, '0')

function toLocalInput(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* 时长解析：支持 "1:30:00"、"05:00"、"90"(分钟)、"0.5"(分钟) */
function parseDuration(str) {
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

const panels = reactive(Array.from({ length: PANEL_COUNT }, createPanel))
const layout = ref(4)
const soundOn = ref(true)
const pickerOpen = ref(null)
const pickerUp = ref(false)
const pickerMaxH = ref(380)
const pickerRef = ref(null)
const pickerQuery = ref('')
const pickerInputRef = ref(null)

/* ---------- 展示 ---------- */
const shownPanels = computed(() => panels.slice(0, layout.value).map((p, i) => ({ p, i })))

function timeText(p) {
  const total = Math.ceil(p.remaining / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// 时数超长（>99 小时）时按位数折算字号，保证不溢出
function timeStyle(p) {
  const t = timeText(p)
  return t.length > 8 ? { fontSize: `${((BASE_FONT * 8) / t.length).toFixed(3)}cqw` } : {}
}

function progressPct(p) {
  if (!p.total || p.total <= 0) return 0
  const used = Math.min(1, Math.max(0, 1 - p.remaining / p.total))
  return +(used * 100).toFixed(2)
}

/* ---------- 用户选择 ---------- */
function panelUser(p) {
  if (!p.uid) return null
  const u = store.users[p.uid]
  const info = usersJson?.[p.uid]
  const name = info?.name || u?.realname || u?.nickname || u?.username || `User_${p.uid}`
  return { name, initial: getAvatarInitial(p.uid), color: getGradeColor(p.uid) }
}

const pickerResult = computed(() => {
  const q = pickerQuery.value.trim().toLowerCase()
  const out = []
  const seen = new Set()
  const push = (uid, user) => {
    if (!uid || seen.has(uid)) return
    seen.add(uid)
    const info = usersJson?.[uid]
    const realName = info?.name || user?.realname || user?.nickname || user?.username || `User_${uid}`
    const nickname = user?.nickname || ''
    const username = user?.username || ''
    if (q) {
      const hay = [info?.name, user?.realname, nickname, username, String(uid)].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return
    }
    const meta = [String(uid), nickname, username].filter(Boolean).join(' / ')
    out.push({
      uid,
      realName,
      meta: uid === store.self?.uid ? `（我）${meta}` : meta,
      initial: getAvatarInitial(uid),
      gradeColor: getGradeColor(uid)
    })
  }
  // ranklist 顺序优先，其余用户补在末尾（与「添加好友」同一口径）
  for (const uid of ranklistOrder) {
    if (store.users[uid]) push(uid, store.users[uid])
  }
  for (const [uidStr, user] of Object.entries(store.users || {})) push(Number(uidStr), user)
  return out.slice(0, 300)
})

function togglePicker(i, evt) {
  if (pickerOpen.value === i) {
    closePicker()
    return
  }
  const trigger = evt?.currentTarget || null
  pickerUp.value = false
  pickerMaxH.value = Math.min(PICKER_WANT, Math.round(window.innerHeight * 0.5))
  pickerOpen.value = i
  pickerQuery.value = ''
  nextTick(() => {
    refEl(pickerInputRef.value)?.focus?.()
    fitPicker(trigger)
  })
}

/* v-for 作用域里的 ref 会收集成数组，统一取第一个 */
function refEl(r) {
  return Array.isArray(r) ? r[0] : r
}

/* 下拉默认向下展开；舞台（overflow:hidden）下方放不下时，若上方更宽裕就翻转向上，
   并按该方向的实际可用高度夹住 max-height，保证整框始终可见、不被裁切。 */
function fitPicker(trigger) {
  const stage = trigger?.closest?.('.tm-stage')
  const box = refEl(pickerRef.value)
  if (!stage || !box) return
  const sr = stage.getBoundingClientRect()
  const tr = trigger.getBoundingClientRect()
  const pr = box.getBoundingClientRect()
  const gap = 6
  const below = sr.bottom - tr.bottom - gap
  const above = tr.top - sr.top - gap
  if (pr.bottom > sr.bottom && pr.height > below && above > below) pickerUp.value = true
  const avail = pickerUp.value ? above : below
  pickerMaxH.value = Math.max(150, Math.min(pickerMaxH.value, Math.floor(avail)))
}

function closePicker() {
  pickerOpen.value = null
  pickerQuery.value = ''
}

function selectUser(i, u) {
  panels[i].uid = u ? u.uid : null
  closePicker()
}

function onDocMouseDown(e) {
  if (pickerOpen.value === null) return
  if (e.target?.closest?.('.tm-panel-head')) return
  closePicker()
}

/* ---------- 计时 ---------- */
function loadFromInput(p) {
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
function onDurationInput(p) {
  if (!p.running) loadFromInput(p)
}

function setMode(p, mode) {
  if (p.mode === mode) return
  p.mode = mode
  p.running = false
  p.done = false
  loadFromInput(p)
}

function onTargetChange(p) {
  if (!p.running) loadFromInput(p)
}

function setQuick(p, minutes) {
  p.mode = 'duration'
  p.durationText = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`
  p.done = false
  p.running = false
  loadFromInput(p)
}

/* 结束音效文件：用户提供的素材，已裁掉原文件开头 1.3s 的无声段（4.18s → 2.88s）。
   走 vite 静态资源导入，生成的 URL 在 Electron / web / Android 三端都成立。 */
let endAudioPrimed = false
/* 预热：首次点击（开始/切音效开关）时就把音频拉进缓存，归零那刻才能立刻响 */
function primeEndAudio() {
  if (endAudioPrimed || !soundOn.value) return
  endAudioPrimed = true
  try { new Audio(endSoundSrc).load() } catch { /* 忽略：无音频能力时静默降级 */ }
}

let lastChimeAt = 0
/* 结束提示音：播放音效文件。
   1.2s 节流：多格几乎同时归零时不叠成一团噪音。
   每次新建 audio 元素 —— 前一次尚未播完时允许叠加重放（同 URL 命中缓存，起播延迟可忽略）。 */
function playChime() {
  if (!soundOn.value) return
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

function start(p) {
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

function pause(p) {
  if (!p.running) return
  p.remaining = Math.max(0, p.deadline - Date.now())
  p.running = false
  saveConfig()
}

function reset(p) {
  p.running = false
  p.done = false
  loadFromInput(p)
  saveConfig()
}

// 开始/暂停合并为一个按钮：运行中→暂停；中途停下过→继续；否则→开始
function toggleLabel(p) {
  if (p.running) return '暂停'
  return p.total > 0 && p.remaining > 0 && p.remaining < p.total ? '继续' : '开始'
}

function toggle(p) {
  if (p.running) pause(p)
  else start(p)
}

const anyRunning = computed(() => panels.some((p) => p.running))

function toggleAll() {
  if (anyRunning.value) pauseAll()
  else startAll()
}

function startAll() {
  for (const p of panels) start(p)
}

function pauseAll() {
  for (const p of panels) pause(p)
}

function resetAll() {
  for (const p of panels) reset(p)
}

/* ---------- 心跳 ---------- */
let timerId = null
function tick() {
  const now = Date.now()
  for (const p of panels) {
    if (!p.running) continue
    p.remaining = Math.max(0, p.deadline - now)
    if (p.remaining === 0) {
      p.running = false
      p.done = true
      playChime()
    }
  }
}

/* ---------- 持久化 ---------- */
function saveConfig() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        layout: layout.value,
        soundOn: soundOn.value,
        panels: panels.map((p) => ({
          uid: p.uid,
          mode: p.mode,
          durationText: p.durationText,
          targetText: p.targetText,
          // 运行态一并落盘：离开工具页再回来（组件重建）时接着走，而不是重置
          running: p.running,
          deadline: p.deadline,
          total: p.total,
          remaining: p.remaining
        }))
      })
    )
  } catch { /* 忽略：隐私模式等存储不可用 */ }
}

function restoreConfig() {
  let cfg = null
  try {
    cfg = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch { cfg = null }
  const saved = Array.isArray(cfg?.panels) ? cfg.panels : []
  if (cfg) {
    if (LAYOUTS.includes(cfg.layout)) layout.value = cfg.layout
    if (typeof cfg.soundOn === 'boolean') soundOn.value = cfg.soundOn
  }
  panels.forEach((p, i) => {
    const s = saved[i]
    if (s) {
      p.uid = s.uid ?? null
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
}

// 仅配置字段变化时落盘（剩余时间每 100ms 变化，不能进 watch）
const configSnapshot = computed(() =>
  JSON.stringify({
    layout: layout.value,
    soundOn: soundOn.value,
    panels: panels.map((p) => [p.uid, p.mode, p.durationText, p.targetText])
  })
)
watch(configSnapshot, saveConfig)
watch(soundOn, (v) => { if (v) primeEndAudio() })

function onKeydown(e) {
  if (e.key === 'Escape' && pickerOpen.value !== null) closePicker()
}

onMounted(() => {
  restoreConfig()
  timerId = setInterval(tick, 100)
  document.addEventListener('mousedown', onDocMouseDown)
  window.addEventListener('keydown', onKeydown)
  // 目标时刻兜底：缺失/非法、或上次存的时刻已经过去（且该格未处于归零态）→ 重置为最近的下课时间
  const now = Date.now()
  for (const p of panels) {
    const t = new Date(p.targetText).getTime()
    if (!p.targetText || !Number.isFinite(t) || (t < now && !p.done)) {
      p.targetText = toLocalInput(nextBreakTarget(now))
    }
  }
})

onBeforeUnmount(() => {
  // 离开工具页时把当前运行态落盘（下次进入据此续算）
  saveConfig()
  if (timerId) clearInterval(timerId)
  timerId = null
  document.removeEventListener('mousedown', onDocMouseDown)
  window.removeEventListener('keydown', onKeydown)
})
</script>
