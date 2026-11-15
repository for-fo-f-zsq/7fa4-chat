<template>
  <div class="md-outline-container">
    <div class="md-outline-header">
      <div class="md-outline-title-row">
        <i class="fas fa-list-ul md-outline-icon" aria-hidden="true"></i>
        <span class="md-outline-title">文档大纲</span>
        <span class="md-outline-badge">{{ headings.length }}</span>
      </div>
      <UiIconButton
        size="xs"
        icon="fas fa-times"
        title="关闭大纲"
        aria-label="关闭大纲"
        @click="$emit('close')"
      />
    </div>

    <div v-if="headings.length === 0" class="md-outline-empty">
      <i class="fas fa-heading md-outline-empty-icon" aria-hidden="true"></i>
      <span class="md-outline-empty-text">当前文档暂无标题</span>
      <span class="md-outline-empty-hint">输入 # 标题 即可自动生成目录导航</span>
    </div>

    <div v-else class="md-outline-list" role="list">
      <button
        v-for="item in headings"
        :key="item.id"
        type="button"
        class="md-outline-item"
        :class="'level-' + item.level"
        :style="{ paddingLeft: `${Math.max(8, (item.level - 1) * 12 + 8)}px` }"
        :title="`${item.text} (第 ${item.line} 行)`"
        @click="$emit('navigate', item)"
      >
        <span class="md-outline-tag">H{{ item.level }}</span>
        <span class="md-outline-label">{{ item.text }}</span>
        <span class="md-outline-line">L{{ item.line }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { UiIconButton } from '@/ui'
import { parseHeadings } from '../composables/useMdOutline.js'

const props = defineProps({
  content: { type: String, default: '' }
})

defineEmits(['navigate', 'close'])

const headings = computed(() => parseHeadings(props.content))
</script>

<style scoped>
.md-outline-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface-1);
  color: var(--fg);
  font-size: var(--text-sm);
  user-select: none;
}

.md-outline-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--border-width) solid var(--line-hairline);
  background: var(--surface-2);
}

.md-outline-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.md-outline-icon {
  font-size: var(--icon-sm);
  color: var(--brand);
}

.md-outline-title {
  font-weight: var(--weight-medium);
  color: var(--fg);
}

.md-outline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  min-width: 18px;
  height: 16px;
  border-radius: var(--radius-pill);
  background: var(--surface-3);
  color: var(--fg-muted);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

.md-outline-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--fg-placeholder);
}

.md-outline-empty-icon {
  font-size: var(--icon-2xl);
  opacity: 0.4;
}

.md-outline-empty-text {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.md-outline-empty-hint {
  font-size: var(--text-xs);
  color: var(--fg-placeholder);
  max-width: 180px;
  line-height: var(--leading-snug);
}

.md-outline-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: var(--space-2) var(--space-1);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.md-outline-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--fg);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    color var(--motion-dur-fast) var(--motion-ease-standard);
}

.md-outline-item:focus-visible {
  outline: 2px solid transparent;
  box-shadow: var(--focus-ring);
}

@media (hover: hover) {
  .md-outline-item:hover {
    background: var(--surface-hover);
    color: var(--brand);
  }
}

.md-outline-item:active {
  background: var(--surface-active);
}

.md-outline-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xs);
  font-weight: var(--weight-bold);
  font-family: var(--font-mono);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--fg-muted);
  line-height: 1;
}

.md-outline-item.level-1 .md-outline-tag {
  background: var(--brand-soft);
  color: var(--brand);
}

.md-outline-item.level-1 .md-outline-label {
  font-weight: var(--weight-semibold);
}

.md-outline-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.md-outline-line {
  flex-shrink: 0;
  font-size: var(--text-2xs);
  font-family: var(--font-mono);
  color: var(--fg-placeholder);
}
</style>
