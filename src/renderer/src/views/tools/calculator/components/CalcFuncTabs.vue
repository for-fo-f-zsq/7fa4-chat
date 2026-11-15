<template>
  <div class="calc-func-tabs-wrap">
    <UiTabs
      v-model="activeCategory"
      :items="FUNC_CATEGORIES"
      size="sm"
      variant="pill"
      class="calc-func-tabs"
    >
      <div class="calc-func-grid" :class="{ narrow }">
        <UiButton
          v-for="f in currentFuncs"
          :key="f"
          size="sm"
          variant="secondary"
          class="calc-func-btn"
          :title="FUNC_TIPS[f] || f"
          :aria-label="FUNC_TIPS[f] || f"
          @click="$emit('pressFunc', f)"
        >
          {{ f }}
        </UiButton>
      </div>
    </UiTabs>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { UiTabs, UiButton } from '@/ui'
import { FUNC_CATEGORIES, CATEGORY_FUNCS, FUNC_TIPS } from '../calcConstants.js'

defineProps({
  narrow: { type: Boolean, default: false }
})

defineEmits(['pressFunc'])

const activeCategory = ref('basic')
const currentFuncs = computed(() => CATEGORY_FUNCS[activeCategory.value] || [])
</script>

<style scoped>
.calc-func-tabs-wrap {
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-xl);
  padding: var(--space-2) var(--space-3) var(--space-3);
  box-shadow: var(--elev-1);
  flex-shrink: 0;
}

.calc-func-tabs :deep(.ui-tabs__list) {
  margin-bottom: var(--space-2);
  border-bottom: 0;
}

.calc-func-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--space-2);
}

.calc-func-grid.narrow {
  grid-template-columns: repeat(4, 1fr);
}

.ui-btn.calc-func-btn {
  --btn-px: var(--space-1);
  --btn-fs: var(--text-xs);
  --btn-bg: var(--surface-0);
  --btn-border: var(--line-hairline);
  font-family: var(--font-mono);
  font-weight: var(--weight-medium);
  height: var(--control-h-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    box-shadow var(--motion-dur-fast) var(--motion-ease-standard),
    transform var(--motion-dur-fast) var(--motion-ease-out-expo);
}

.ui-btn.calc-func-btn:hover {
  border-color: var(--brand-line);
  background-color: var(--surface-hover);
}

.ui-btn.calc-func-btn:active {
  transform: scale(var(--press-scale));
}
</style>
