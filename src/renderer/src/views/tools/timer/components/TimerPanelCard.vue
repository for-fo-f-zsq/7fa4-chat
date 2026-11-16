<template>
  <section
    class="tm-panel"
    :class="{ done: panel.done, running: panel.running, picking: pickerOpen }"
    :style="{ '--c': color }"
  >
    <div class="tm-panel-head">
      <TimerUserPicker
        :panel="panel"
        :open="pickerOpen"
        @toggle="$emit('togglePicker')"
        @close="$emit('closePicker')"
      />

      <UiInput
        class="tm-task"
        size="md"
        :model-value="panel.task"
        maxlength="40"
        placeholder="任务（可选）"
        spellcheck="false"
        @update:model-value="panel.task = $event"
        @keydown.enter="onTaskEnter"
      />
    </div>

    <div class="tm-time" :class="{ 'motion-blink': panel.done }" :style="timeStyle">{{ formattedTime }}</div>

    <div class="tm-progress"><i :style="{ width: progressPct + '%' }"></i></div>

    <div class="tm-ctrl">
      <UiSegmented
        :model-value="panel.mode"
        :items="modeItems"
        size="sm"
        block
        aria-label="计时模式"
        @update:model-value="setMode(panel, $event)"
      />

      <div class="tm-fields">
        <template v-if="panel.mode === 'duration'">
          <UiInput
            class="tm-fld tm-fld-dur"
            size="sm"
            :model-value="panel.durationText"
            placeholder="时:分:秒"
            spellcheck="false"
            @update:model-value="onDurationUpdate"
            @keydown.enter="start(panel)"
          />
          <div class="tm-quick">
            <UiButton v-for="q in QUICK" :key="q" size="sm" variant="secondary" @click="setQuick(panel, q)">{{ q }}′</UiButton>
          </div>
        </template>
        <UiInput
          v-else
          class="tm-fld"
          size="sm"
          type="datetime-local"
          :model-value="panel.targetText"
          @update:model-value="onTargetUpdate"
        />
      </div>

      <div class="tm-acts">
        <UiButton
          size="sm"
          :variant="panel.running ? 'secondary' : 'soft'"
          :icon="panel.running ? 'fas fa-pause' : 'fas fa-play'"
          @click="toggle(panel)"
        >{{ toggleLabel(panel) }}</UiButton>
        <UiButton size="sm" variant="secondary" icon="fas fa-rotate-left" @click="reset(panel)">重置</UiButton>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { UiButton, UiInput, UiSegmented } from '@/ui'
import TimerUserPicker from './TimerUserPicker.vue'
import {
  QUICK,
  start,
  reset,
  toggle,
  toggleLabel,
  setMode,
  onDurationInput,
  onTargetChange,
  setQuick
} from '../timerStore.js'

const BASE_FONT = 11
const pad = (n) => String(n).padStart(2, '0')
const modeItems = [
  { value: 'duration', label: '时长' },
  { value: 'target', label: '目标时刻' }
]

const props = defineProps({
  panel: { type: Object, required: true },
  color: { type: String, required: true },
  pickerOpen: { type: Boolean, default: false }
})

defineEmits(['togglePicker', 'closePicker'])

const formattedTime = computed(() => {
  const total = Math.ceil(props.panel.remaining / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
})

const timeStyle = computed(() => (
  formattedTime.value.length > 8
    ? { fontSize: `${((BASE_FONT * 8) / formattedTime.value.length).toFixed(3)}cqw` }
    : {}
))

const progressPct = computed(() => {
  if (!props.panel.total || props.panel.total <= 0) return 0
  const used = Math.min(1, Math.max(0, 1 - props.panel.remaining / props.panel.total))
  return +(used * 100).toFixed(2)
})

function onTaskEnter(e) {
  if (e.isComposing) return
  e.target.blur()
}

function onDurationUpdate(value) {
  props.panel.durationText = value
  onDurationInput(props.panel)
}

function onTargetUpdate(value) {
  props.panel.targetText = value
  onTargetChange(props.panel)
}
</script>

<style scoped src="./timer-panel-card.css"></style>
