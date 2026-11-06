<template>
  <div class="tm-tool" :class="{ narrow: isNarrow }">
    <div class="tm-header">
      <div class="tm-header-right">
        <div class="tm-seg tm-layout-seg" title="显示格数">
          <UiButton
            v-for="n in LAYOUTS"
            :key="n"
            size="sm"
            :variant="timer.layout === n ? 'primary' : 'secondary'"
            @click="timer.layout = n"
          >{{ n }} 格</UiButton>
        </div>
        <UiIconButton
          size="sm"
          :icon="timer.soundOn ? 'fas fa-volume-high' : 'fas fa-volume-xmark'"
          :active="timer.soundOn"
          :title="timer.soundOn ? '提示音：开' : '提示音：关'"
          :aria-label="timer.soundOn ? '关闭提示音' : '开启提示音'"
          @click="timer.soundOn = !timer.soundOn"
        />

        <!-- 计时器悬浮窗：独立置顶小窗，开了就一直留着（由计时引擎托管），只有点 ✕ 才关（桌面端专属） -->
        <div v-if="timer.floatSupported" class="tm-float-wrap">
          <div class="tm-float-group">
            <UiIconButton
              size="sm"
              icon="fas fa-window-restore"
              :active="timer.float.on"
              :title="timer.float.on ? '关闭计时器悬浮窗' : '打开计时器悬浮窗（置顶显示，随时瞄一眼）'"
              aria-label="计时器悬浮窗"
              @click="toggleFloat"
            />
            <UiIconButton
              size="sm"
              class="tm-float-caret"
              icon="fas fa-chevron-down"
              :active="timer.float.on"
              title="悬浮窗设置（位置 / 置顶）"
              aria-label="悬浮窗设置"
              @click.stop="toggleFloatPanel"
            />
          </div>
          <div v-if="timer.floatPanelOpen" class="tm-float-pop" @click.stop>
            <div class="tm-float-title">计时器悬浮窗</div>
            <div class="tm-float-row">
              <span class="tm-float-label">位置</span>
              <div class="tm-float-pos">
                <UiButton
                  v-for="opt in FLOAT_POS"
                  :key="opt.key"
                  size="sm"
                  :variant="timer.float.pos === opt.key ? 'primary' : 'secondary'"
                  :title="opt.label"
                  @click="setFloatPos(opt.key)"
                >{{ opt.short }}</UiButton>
              </div>
            </div>
            <UiSwitch
              :model-value="timer.float.onTop"
              size="sm"
              label="窗口置顶"
              @update:model-value="timer.float.onTop = $event"
              @change="pushFloatConfig"
            />
            <p class="tm-float-tip">直接拖动悬浮窗可自由移动，位置会被记住；切换「位置」则回到预设角落。</p>
          </div>
        </div>
      </div>
    </div>

    <div class="tm-actions">
      <UiButton
        size="md"
        :variant="anyRunning ? 'secondary' : 'primary'"
        :icon="anyRunning ? 'fas fa-pause' : 'fas fa-play'"
        @click="toggleAll"
      >{{ anyRunning ? '全部暂停' : '全部开始' }}</UiButton>
      <UiButton size="md" variant="secondary" icon="fas fa-rotate-left" @click="resetAll">全部重置</UiButton>
      <span class="tm-hint" v-if="!isNarrow">输入框回车即开始</span>
    </div>

    <div class="tm-stage" :class="`layout-${timer.layout}`">
      <section
        v-for="cell in shownPanels"
        :key="cell.i"
        class="tm-panel"
        :class="{ done: cell.p.done, running: cell.p.running, picking: pickerOpen === cell.i }"
        :style="{ '--c': PALETTE[cell.i] }"
      >
        <div class="tm-panel-head">
          <button class="tm-who" :class="{ open: pickerOpen === cell.i }" @click="togglePicker(cell.i, $event)">
            <span v-if="panelUser(cell.p)" class="tm-who-avatar" :style="{ color: panelUser(cell.p).color || 'var(--brand)' }">
              {{ panelUser(cell.p).initial }}
            </span>
            <i v-else class="fas fa-user tm-who-none"></i>
            <span class="tm-who-name" :class="{ custom: !!(cell.p.customName && !cell.p.uid) }">{{ panelUser(cell.p)?.name || '选择用户' }}</span>
            <i class="fas fa-chevron-down tm-who-caret"></i>
          </button>

          <UiInput
            class="tm-task"
            size="sm"
            :model-value="cell.p.task"
            maxlength="40"
            placeholder="任务（可选）"
            spellcheck="false"
            @update:model-value="cell.p.task = $event"
            @keydown.enter="onTaskEnter"
          />

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
              <!-- 自定义名字：未登录时 store.users 为空、名单也拉不到，没有任何候选；
                   即使是登录态，也可能要给外校/本班临时同学计时。故始终置顶一个自定义入口。 -->
              <button class="tm-picker-custom" @click="openCustomName(cell.i)">
                <i class="fas fa-pen"></i>
                <span>{{ cell.p.customName ? '修改自定义名字' : '自定义名字…' }}</span>
                <span v-if="cell.p.customName" class="tm-picker-custom-cur">{{ cell.p.customName }}</span>
              </button>
              <div v-if="customEditing === cell.i" class="tm-picker-custom-edit" @click.stop>
                <input
                  ref="customInputRef"
                  v-model="customDraft"
                  type="text"
                  maxlength="24"
                  placeholder="输入名字后回车"
                  spellcheck="false"
                  @keydown.enter.prevent="commitCustomName(cell.i)"
                  @keydown.esc.prevent="customEditing = null"
                />
                <UiIconButton size="sm" icon="fas fa-check" title="确定" aria-label="确定" @click="commitCustomName(cell.i)" />
              </div>
              <div v-if="!pickerResult.length && !cell.p.customName" class="tm-picker-empty">无匹配用户</div>
              <button
                v-for="u in pickerResult"
                :key="u.uid"
                class="tm-picker-item"
                :class="{ sel: cell.p.uid === u.uid && !cell.p.customName }"
                @click="selectUser(cell.i, u)"
              >
                <span class="tm-picker-avatar" :style="{ color: u.gradeColor || 'var(--brand)' }">{{ u.initial }}</span>
                <span class="tm-picker-name" :style="{ color: u.gradeColor || 'var(--fg)' }">{{ u.realName }}</span>
                <span class="tm-picker-meta">{{ u.meta }}</span>
                <i v-if="cell.p.uid === u.uid && !cell.p.customName" class="fas fa-check tm-picker-check"></i>
              </button>
            </div>
            <div class="tm-picker-foot">
              <UiButton size="sm" variant="text" @click="selectUser(cell.i, null)">清空</UiButton>
            </div>
          </div>
        </div>

        <div class="tm-time" :class="{ 'motion-blink': cell.p.done }" :style="timeStyle(cell.p)">{{ timeText(cell.p) }}</div>

        <div class="tm-progress"><i :style="{ width: progressPct(cell.p) + '%' }"></i></div>

        <div class="tm-ctrl">
          <div class="tm-seg">
            <UiButton size="sm" :variant="cell.p.mode === 'duration' ? 'primary' : 'secondary'" @click="setMode(cell.p, 'duration')">时长</UiButton>
            <UiButton size="sm" :variant="cell.p.mode === 'target' ? 'primary' : 'secondary'" @click="setMode(cell.p, 'target')">目标时刻</UiButton>
          </div>

          <div class="tm-fields">
            <template v-if="cell.p.mode === 'duration'">
              <UiInput
                class="tm-fld tm-fld-dur"
                size="sm"
                :model-value="cell.p.durationText"
                placeholder="时:分:秒"
                spellcheck="false"
                @update:model-value="onDurationUpdate(cell.p, $event)"
                @keydown.enter="start(cell.p)"
              />
              <div class="tm-quick">
                <UiButton v-for="q in QUICK" :key="q" size="sm" variant="secondary" @click="setQuick(cell.p, q)">{{ q }}′</UiButton>
              </div>
            </template>
            <UiInput
              v-else
              class="tm-fld"
              size="sm"
              type="datetime-local"
              :model-value="cell.p.targetText"
              @update:model-value="onTargetUpdate(cell.p, $event)"
            />
          </div>

          <div class="tm-acts">
            <UiButton
              size="sm"
              :variant="cell.p.running ? 'secondary' : 'primary'"
              :icon="cell.p.running ? 'fas fa-pause' : 'fas fa-play'"
              @click="toggle(cell.p)"
            >{{ toggleLabel(cell.p) }}</UiButton>
            <UiButton size="sm" variant="secondary" icon="fas fa-rotate-left" @click="reset(cell.p)">重置</UiButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { store } from '../../../store.js'
import { getAvatarInitial, getGradeColor, ranklistOrder, usersJson } from '../../../utils.js'
import { useNarrow } from '../../../composables/useNarrow.js'
import {
  timer, LAYOUTS, QUICK, PALETTE, FLOAT_POS,
  panelUser, start, reset, toggle, toggleLabel, setMode,
  onDurationInput, onTargetChange, setQuick, toggleAll, resetAll,
  toggleFloat, setFloatPos, pushFloatConfig, toggleFloatPanel, saveConfig
} from './timerStore.js'
import { UiButton, UiIconButton, UiInput, UiSwitch } from '@/ui'

defineEmits(['back'])

const { isNarrow } = useNarrow()

// 用户选择下拉的高度上限（与 timer-tool.css 的 max-height 对应）
const PICKER_WANT = 380
const BASE_FONT = 11 // cqw，与 CSS 中 .tm-time 的 min() 首项一致（超长时按位数折算）

const pad = (n) => String(n).padStart(2, '0')

/* ---------- 展示 ---------- */
const shownPanels = computed(() => timer.panels.slice(0, timer.layout).map((p, i) => ({ p, i })))
const anyRunning = computed(() => timer.panels.some((p) => p.running))

const pickerOpen = ref(null)
const pickerUp = ref(false)
const pickerMaxH = ref(380)
const pickerRef = ref(null)
const pickerQuery = ref('')
const pickerInputRef = ref(null)

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
  customEditing.value = null
  customDraft.value = ''
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
  timer.panels[i].uid = u ? u.uid : null
  timer.panels[i].customName = ''
  customEditing.value = null
  closePicker()
}

/* ---------- 自定义名字 ---------- */
const customEditing = ref(null)
const customDraft = ref('')
const customInputRef = ref(null)

function openCustomName(i) {
  customEditing.value = i
  customDraft.value = timer.panels[i].customName || ''
  nextTick(() => refEl(customInputRef.value)?.focus?.())
}

function commitCustomName(i) {
  const v = customDraft.value.trim().slice(0, 24)
  timer.panels[i].customName = v
  if (v) timer.panels[i].uid = null // 与名单用户互斥，避免出现「有 uid 又顶着别的名字」
  customEditing.value = null
  closePicker()
}

/* 任务框回车 = 结束编辑（中文组词时的回车不误触）。
   任务经 v-model 实时写进 store（watch 自动落盘 + 推悬浮窗），无需额外保存动作。 */
function onTaskEnter(e) {
  if (e.isComposing) return
  e.target.blur()
}

/* UiInput 不回写原生 v-model，这里先同步到面板对象再走 store 的既有刷新逻辑 */
function onDurationUpdate(p, value) {
  p.durationText = value
  onDurationInput(p)
}

function onTargetUpdate(p, value) {
  p.targetText = value
  onTargetChange(p)
}

function onDocMouseDown(e) {
  // 悬浮窗设置气泡：点外部即收起
  if (timer.floatPanelOpen && !e.target?.closest?.('.tm-float-wrap')) timer.floatPanelOpen = false
  if (pickerOpen.value === null) return
  if (e.target?.closest?.('.tm-panel-head')) return
  closePicker()
}

/* 开始/暂停/重置/落盘/心跳/悬浮窗桥接 全在 timerStore.js —— 那份状态活得比本页久，
   点返回不会把计时和悬浮窗一起带走。本组件只负责这一页的交互与展示。 */

function onKeydown(e) {
  if (e.key === 'Escape' && pickerOpen.value !== null) closePicker()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  // 落一次盘，保证刚改的配置在下次进入时还在
  saveConfig()
  // 注意：这里**不关**悬浮窗、也不拆悬浮窗的事件监听 —— 都归 timerStore.js 管，
  // 否则返回后窗口还在、按钮却没人响应（僵尸窗口）。
  document.removeEventListener('mousedown', onDocMouseDown)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped src="./timer-tool.css"></style>
