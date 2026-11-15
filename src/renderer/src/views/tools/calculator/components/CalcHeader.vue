<template>
  <div class="calc-header-bar">
    <div class="calc-header-left">
      <i class="fas fa-calculator calc-header-icon" aria-hidden="true"></i>
      <span class="calc-header-title">计算器</span>
    </div>

    <div class="calc-header-center">
      <UiSegmented
        :model-value="mode"
        :items="MODES"
        size="sm"
        aria-label="计算模式"
        class="calc-header-modes"
        @update:model-value="$emit('update:mode', $event)"
      />
    </div>

    <div class="calc-header-right">
      <UiSegmented
        :model-value="angleUnit"
        :items="ANGLE_ITEMS"
        size="sm"
        aria-label="角度/弧度切换"
        class="calc-header-angle"
        @update:model-value="$emit('update:angleUnit', $event)"
      />

      <UiButton
        size="sm"
        :variant="historyOpen ? 'soft' : 'ghost'"
        icon="fas fa-history"
        class="calc-header-history-btn"
        :title="historyOpen ? '收起历史 (Ctrl+H)' : '展开历史'"
        aria-label="切换历史记录"
        @click="$emit('toggleHistory')"
      >
        <span v-if="!narrow" class="calc-header-btn-text">历史</span>
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import { UiSegmented, UiButton } from '@/ui'
import { MODES, ANGLE_ITEMS } from '../calcConstants.js'

defineProps({
  mode: { type: String, default: 'normal' },
  angleUnit: { type: String, default: 'deg' },
  historyOpen: { type: Boolean, default: false },
  narrow: { type: Boolean, default: false }
})

defineEmits(['update:mode', 'update:angleUnit', 'toggleHistory'])
</script>

<style scoped>
.calc-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: var(--space-3);
  min-width: 0;
}

.calc-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.calc-header-icon {
  font-size: var(--text-base);
  color: var(--brand);
}

.calc-header-title {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--fg);
  letter-spacing: var(--tracking-tight);
}

.calc-header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
}

.calc-header-modes {
  max-width: 100%;
}

.calc-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.calc-header-angle {
  flex-shrink: 0;
}

.calc-header-history-btn {
  flex-shrink: 0;
}

.calc-header-btn-text {
  margin-left: var(--space-1);
}
</style>
