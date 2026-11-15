<template>
  <div class="ob-layer">
    <UiCard ref="tipEl" class="ob-tip" :class="{ 'ob-dragging': isDragging }" size="sm" :style="tipStyle">
      <div class="ob-tip-head" title="按住可拖动气泡" @mousedown="startDrag">
        <UiBadge class="ob-step" variant="neutral" size="sm">第 {{ stepIndex + 1 }} / {{ STEPS.length }} 步</UiBadge>
        <UiButton class="ob-skip" variant="text" size="sm" @click="emit('close')">跳过引导</UiButton>
      </div>
      <div class="ob-tip-title">
        <i class="fas" :class="step.icon"></i> {{ step.title }}
      </div>
      <div class="ob-tip-text">{{ step.text }}</div>
      <div v-if="step.actionLabel" class="ob-tip-actions">
        <UiButton variant="primary" size="sm" @click="runAction">{{ step.actionLabel }}</UiButton>
      </div>
      <div v-if="isFree" class="ob-tip-hint">随便试，玩一会儿会自动进入下一步</div>
    </UiCard>

    <div v-show="ready" class="ob-hole" data-ambient :style="holeStyle"></div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { UiBadge, UiButton, UiCard } from '@/ui'
import { store } from '@/store.js'
import { useFloatingDrag } from '@/composables/useFloatingDrag.js'
import { FREE_HOLD, createOnboardingSteps } from './onboardingSteps.js'

const emit = defineEmits(['close'])

const baseline = { msgs: new Set() }
let baselineReady = false
function sampleBaseline() {
  if (baselineReady || store.initializing || !store.self.uid) return
  baseline.msgs = new Set(Object.keys(store.messages || {}).map(Number))
  baselineReady = true
}

const STEPS = createOnboardingSteps(baseline)
const stepIndex = ref(0)
const step = computed(() => STEPS[stepIndex.value] || STEPS[STEPS.length - 1])
const isFree = computed(() => step.value.type === 'free')

const ready = ref(false)
const tipEl = ref(null)
const tipNode = computed(() => tipEl.value?.$el || tipEl.value)
const hole = reactive({ x: 0, y: 0, w: 0, h: 0 })
const domDone = reactive({})
const latched = new Set()
let tipMoved = false

const { x: tipX, y: tipY, isDragging, startDrag } = useFloatingDrag({
  margin: 12,
  elRef: tipNode,
  onMove: () => {
    tipMoved = true
  },
})

function markDone(id, d) {
  if (d) latched.add(id)
  const v = latched.has(id)
  if (domDone[id] !== v) domDone[id] = v
}

const holeStyle = computed(() => ({
  left: `${hole.x}px`,
  top: `${hole.y}px`,
  width: `${hole.w}px`,
  height: `${hole.h}px`,
}))
const tipStyle = computed(() => ({ left: `${tipX.value}px`, top: `${tipY.value}px` }))

function placeTip(hr, TW, TH) {
  if (tipMoved) return
  const W = window.innerWidth
  const H = window.innerHeight
  const overlap = (x, y) => {
    const l = Math.max(x, hr.left)
    const r2 = Math.min(x + TW, hr.right)
    const t = Math.max(y, hr.top)
    const b = Math.min(y + TH, hr.bottom)
    return r2 > l && b > t ? (r2 - l) * (b - t) : 0
  }
  const cx = hr.left + hr.width / 2 - TW / 2
  const cy = hr.top + hr.height / 2 - TH / 2
  const cands = [
    { x: cx, y: hr.bottom + 12 },
    { x: cx, y: hr.top - TH - 12 },
    { x: hr.right + 12, y: cy },
    { x: hr.left - TW - 12, y: cy },
    { x: cx, y: 12 },
  ]
  let best = cands[0]
  let bestScore = Infinity
  for (const c0 of cands) {
    const c = {
      x: Math.max(12, Math.min(c0.x, W - TW - 12)),
      y: Math.max(12, Math.min(c0.y, H - TH - 12)),
    }
    const drift = Math.abs(c.x - c0.x) + Math.abs(c.y - c0.y)
    const score = overlap(c.x, c.y) + drift
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  tipX.value = best.x
  tipY.value = best.y
}

const doneNow = computed(() => !!domDone[step.value.id])

let timer = 0
let autoTimer = 0
let baseFallback = 0
let holdTimer = 0

function clearHold() {
  clearTimeout(holdTimer)
  holdTimer = 0
}

function locate() {
  const s = step.value
  sampleBaseline()
  const el = s.resolve()
  const r0 = el ? el.getBoundingClientRect() : null
  if (!el || r0.width < 2 || r0.height < 2) {
    ready.value = false
    clearHold()
    if (!tipMoved) {
      tipX.value = Math.max(12, (window.innerWidth - 330) / 2)
      tipY.value = Math.max(12, window.innerHeight * 0.28)
    }
    if (s.type !== 'free') markDone(s.id, !!s.done?.())
    return
  }
  const r = el.getBoundingClientRect()
  const pad = 6
  hole.x = r.left - pad
  hole.y = r.top - pad
  hole.w = r.width + pad * 2
  hole.h = r.height + pad * 2

  const TW = 330
  const TH = (tipNode.value?.offsetHeight || 150) + 4
  placeTip(r, TW, TH)
  ready.value = true

  if (s.type === 'free') {
    if (!domDone[s.id] && !holdTimer) {
      holdTimer = setTimeout(() => {
        holdTimer = 0
        markDone(s.id, true)
      }, FREE_HOLD)
    }
    return
  }
  markDone(s.id, !!s.done?.())
}

function next() {
  clearTimeout(autoTimer)
  clearHold()
  if (stepIndex.value >= STEPS.length - 1) {
    emit('close')
    return
  }
  stepIndex.value++
  ready.value = false
  tipMoved = false
  locate()
  if (doneNow.value) autoTimer = setTimeout(next, 400)
}

function runAction() {
  step.value.action?.()
  setTimeout(locate, 350)
}

watch(doneNow, (v) => {
  clearTimeout(autoTimer)
  if (v) autoTimer = setTimeout(next, 1000)
})

function onResize() {
  locate()
}

onMounted(() => {
  locate()
  timer = setInterval(locate, 150)
  window.addEventListener('resize', onResize)
  baseFallback = setTimeout(() => {
    if (baselineReady) return
    baseline.msgs = new Set(Object.keys(store.messages || {}).map(Number))
    baselineReady = true
  }, 5000)
  if (doneNow.value) autoTimer = setTimeout(next, 600)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(autoTimer)
  clearTimeout(baseFallback)
  clearHold()
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped src="../../css/components/onboarding.css"></style>
