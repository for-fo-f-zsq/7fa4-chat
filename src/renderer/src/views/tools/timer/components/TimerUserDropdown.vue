<template>
  <div
    ref="pickerRef"
    class="tm-picker"
    :class="{ up: pickerUp }"
    :data-placement="pickerUp ? 'top' : 'bottom'"
    :style="{ maxHeight: pickerMaxH + 'px' }"
    @click.stop
  >
    <div class="tm-picker-search">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input
        ref="pickerInputRef"
        v-model="pickerQuery"
        type="text"
        placeholder="搜索真名 / 昵称 / 用户名 / UID"
        spellcheck="false"
        @keydown.esc="$emit('close')"
      />
    </div>
    <div class="tm-picker-list">
      <button class="tm-picker-custom" type="button" @click="openCustomName">
        <i class="fas fa-pen" aria-hidden="true"></i>
        <span>{{ panel.customName ? '修改自定义名字' : '自定义名字…' }}</span>
        <span v-if="panel.customName" class="tm-picker-custom-cur">{{ panel.customName }}</span>
      </button>
      <div v-if="customEditing" class="tm-picker-custom-edit" @click.stop>
        <input
          ref="customInputRef"
          v-model="customDraft"
          type="text"
          maxlength="24"
          placeholder="输入名字后回车"
          spellcheck="false"
          @keydown.enter.prevent="commitCustomName"
          @keydown.esc.prevent="customEditing = false"
        />
        <UiIconButton size="sm" icon="fas fa-check" title="确定" aria-label="确定" @click="commitCustomName" />
      </div>
      <div v-if="!pickerResult.length && !panel.customName" class="tm-picker-empty">无匹配用户</div>
      <button
        v-for="u in pickerResult"
        :key="u.uid"
        type="button"
        class="tm-picker-item"
        :class="{ sel: panel.uid === u.uid && !panel.customName }"
        @click="selectUser(u)"
      >
        <span class="tm-picker-avatar" :style="{ color: u.gradeColor || 'var(--brand)' }">{{ u.initial }}</span>
        <span class="tm-picker-name" :style="{ color: u.gradeColor || 'var(--fg)' }">{{ u.realName }}</span>
        <span class="tm-picker-meta">{{ u.meta }}</span>
        <i v-if="panel.uid === u.uid && !panel.customName" class="fas fa-check tm-picker-check" aria-hidden="true"></i>
      </button>
    </div>
    <div class="tm-picker-foot">
      <UiButton size="sm" variant="text" @click="selectUser(null)">清空</UiButton>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { UiButton, UiIconButton } from '@/ui'
import { filterTimerUsers } from '../composables/useTimerUserSearch.js'

const PICKER_WANT = 380

const props = defineProps({
  panel: { type: Object, required: true },
  triggerEl: { type: Object, default: null }
})

const emit = defineEmits(['close'])

const pickerUp = ref(false)
const pickerMaxH = ref(Math.min(PICKER_WANT, Math.round(window.innerHeight * 0.5)))
const pickerRef = ref(null)
const pickerQuery = ref('')
const pickerInputRef = ref(null)

const customEditing = ref(false)
const customDraft = ref('')
const customInputRef = ref(null)

const pickerResult = computed(() => filterTimerUsers(pickerQuery.value))

function fitPicker(trigger) {
  const stage = trigger?.closest?.('.tm-stage')
  const box = pickerRef.value
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

onMounted(() => {
  nextTick(() => {
    pickerInputRef.value?.focus?.()
    fitPicker(props.triggerEl)
  })
})

function selectUser(u) {
  props.panel.uid = u ? u.uid : null
  props.panel.customName = ''
  customEditing.value = false
  emit('close')
}

function openCustomName() {
  customEditing.value = true
  customDraft.value = props.panel.customName || ''
  nextTick(() => customInputRef.value?.focus?.())
}

function commitCustomName() {
  const v = customDraft.value.trim().slice(0, 24)
  props.panel.customName = v
  if (v) props.panel.uid = null
  customEditing.value = false
  emit('close')
}
</script>

<style scoped src="./timer-user-dropdown.css"></style>
