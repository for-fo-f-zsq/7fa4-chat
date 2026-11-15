<template>
  <div class="calc-history-wrap">
    <!-- 头部工具栏 -->
    <div class="calc-history-header">
      <div class="calc-history-title-group">
        <span class="calc-history-title">计算历史</span>
        <UiBadge v-if="validHistory.length" size="sm" variant="neutral" pill>
          {{ validHistory.length }}
        </UiBadge>
      </div>

      <div class="calc-history-header-actions">
        <UiButton
          size="sm"
          variant="ghost"
          icon="fas fa-trash-alt"
          class="calc-history-clear-btn"
          :disabled="!validHistory.length"
          title="清空全部历史记录"
          aria-label="清空历史"
          @click="$emit('clear')"
        >
          清空
        </UiButton>
        <UiIconButton
          size="sm"
          variant="ghost"
          icon="fas fa-times"
          title="收起历史侧栏"
          aria-label="收起历史"
          @click="$emit('close')"
        />
      </div>
    </div>

    <!-- 历史记录列表 -->
    <div class="calc-history-list">
      <div v-if="!validHistory.length" class="calc-history-empty">
        <i class="fas fa-history calc-history-empty-icon" aria-hidden="true"></i>
        <span>暂无计算历史</span>
      </div>

      <div
        v-for="h in validHistory"
        :key="h.id"
        class="calc-history-card"
      >
        <div class="calc-history-top" @click="$emit('pick', h.expr)">
          <span class="calc-history-expr" :title="h.expr">{{ h.expr }}</span>
          <UiBadge v-if="h.mode === 'mod'" size="sm" variant="neutral" class="calc-history-mode-tag">
            mod {{ h.modInfo }}
          </UiBadge>
          <UiBadge v-else-if="h.mode === 'frac'" size="sm" variant="neutral" class="calc-history-mode-tag">
            分数
          </UiBadge>
        </div>

        <div class="calc-history-result-row" @click="$emit('pick', h.expr)">
          <span class="calc-history-eq">=</span>
          <span class="calc-history-result" :title="h.result">{{ h.result }}</span>
        </div>

        <!-- 悬浮或常驻快捷操作栏 -->
        <div class="calc-history-actions">
          <button
            type="button"
            class="calc-hist-action-btn"
            title="回填此算式"
            @click="$emit('pick', h.expr)"
          >
            <i class="fas fa-edit" aria-hidden="true"></i> 填入
          </button>
          <button
            type="button"
            class="calc-hist-action-btn"
            title="复制结果值"
            @click="$emit('copyResult', h.result)"
          >
            <i class="fas fa-copy" aria-hidden="true"></i> 结果
          </button>
          <button
            type="button"
            class="calc-hist-action-btn"
            title="代入此结果为 Ans"
            @click="$emit('insertAns', h.result)"
          >
            <i class="fas fa-reply" aria-hidden="true"></i> Ans
          </button>
          <button
            type="button"
            class="calc-hist-action-btn calc-hist-action-btn--danger"
            title="删除此条记录"
            @click="$emit('remove', h.id)"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { UiButton, UiIconButton, UiBadge } from '@/ui'

const props = defineProps({
  history: { type: Array, default: () => [] }
})

defineEmits(['pick', 'insertAns', 'copyExpr', 'copyResult', 'remove', 'clear', 'close'])

const validHistory = computed(() => {
  return Array.isArray(props.history)
    ? props.history.filter((item) => item && typeof item === 'object' && item.id)
    : []
})
</script>

<style scoped>
.calc-history-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-3);
  background: var(--surface-1);
}

.calc-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-2);
  border-bottom: var(--border-width) solid var(--line-hairline);
  flex-shrink: 0;
}

.calc-history-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.calc-history-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide);
  color: var(--fg);
}

.calc-history-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.calc-history-clear-btn {
  --btn-px: var(--space-2);
  font-size: var(--text-xs);
}

.calc-history-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-2) 0;
}

.calc-history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-2);
  color: var(--fg-subtle);
  font-size: var(--text-sm);
}

.calc-history-empty-icon {
  font-size: var(--text-3xl);
  opacity: 0.4;
}

.calc-history-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-0);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-md);
  box-shadow: var(--elev-1);
  transition:
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    background-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.calc-history-card:hover {
  border-color: var(--brand-line);
}

.calc-history-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  cursor: pointer;
}

.calc-history-expr {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--fg-muted);
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calc-history-mode-tag {
  flex-shrink: 0;
  font-size: var(--text-2xs);
}

.calc-history-result-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  cursor: pointer;
}

.calc-history-eq {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--brand);
  flex-shrink: 0;
}

.calc-history-result {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--brand);
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calc-history-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: var(--border-width) solid var(--line-hairline);
}

.calc-hist-action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--fg-muted);
  font-size: var(--text-2xs);
  cursor: pointer;
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    color var(--motion-dur-fast) var(--motion-ease-standard);
}

.calc-hist-action-btn:hover {
  background: var(--surface-hover);
  color: var(--brand);
}

.calc-hist-action-btn--danger:hover {
  background: var(--status-danger-bg);
  color: var(--status-danger-ink);
}
</style>
