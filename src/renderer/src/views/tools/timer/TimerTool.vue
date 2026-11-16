<template>
  <ToolWorkspaceShell flush :narrow="isNarrow" class="tm-tool">
    <template #header>
      <TimerHeaderBar />
    </template>

    <div class="tm-body">
      <div class="tm-actions">
        <UiButton
          size="md"
          :variant="anyRunning ? 'secondary' : 'primary'"
          :icon="anyRunning ? 'fas fa-pause' : 'fas fa-play'"
          @click="toggleAll"
        >{{ anyRunning ? '全部暂停' : '全部开始' }}</UiButton>
        <UiButton size="md" variant="secondary" icon="fas fa-rotate-left" @click="resetAll">全部重置</UiButton>
        <span v-if="!isNarrow" class="tm-hint">输入框回车即开始</span>
      </div>

      <div class="tm-stage" :class="`layout-${timer.layout}`">
        <TimerPanelCard
          v-for="cell in shownPanels"
          :key="cell.i"
          :panel="cell.p"
          :color="PALETTE[cell.i]"
          :picker-open="pickerOpen === cell.i"
          @toggle-picker="pickerOpen = pickerOpen === cell.i ? null : cell.i"
          @close-picker="pickerOpen = null"
        />
      </div>
    </div>
  </ToolWorkspaceShell>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { UiButton } from '@/ui'
import { useNarrow } from '../../../composables/useNarrow.js'
import ToolWorkspaceShell from '../shared/ToolWorkspaceShell.vue'
import TimerHeaderBar from './components/TimerHeaderBar.vue'
import TimerPanelCard from './components/TimerPanelCard.vue'
import { timer, PALETTE, toggleAll, resetAll, saveConfig } from './timerStore.js'

defineEmits(['back'])

const { isNarrow } = useNarrow()
const pickerOpen = ref(null)

const shownPanels = computed(() => timer.panels.slice(0, timer.layout).map((p, i) => ({ p, i })))
const anyRunning = computed(() => timer.panels.some((p) => p.running))

function onDocMouseDown(e) {
  if (pickerOpen.value === null) return
  if (e.target?.closest?.('.tm-panel-head')) return
  pickerOpen.value = null
}

function onKeydown(e) {
  if (e.key === 'Escape' && pickerOpen.value !== null) pickerOpen.value = null
}

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  saveConfig()
  document.removeEventListener('mousedown', onDocMouseDown)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped src="./timer-tool.css"></style>
