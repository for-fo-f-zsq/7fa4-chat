<template>
  <div class="md-find-bar" role="search" aria-label="查找与替换">
    <div class="md-find-row">
      <div class="md-find-input-wrap">
        <input
          ref="findInputRef"
          :value="findText"
          class="md-find-input"
          placeholder="查找..."
          spellcheck="false"
          @input="$emit('update:findText', $event.target.value)"
          @keydown.enter.exact="$emit('findNext')"
          @keydown.shift.enter="$emit('findPrev')"
          @keydown.esc="$emit('close')"
        />
        <span class="md-find-count">
          {{ matchesCount > 0 ? `${matchIndex + 1}/${matchesCount}` : (findText ? '无结果' : '') }}
        </span>
      </div>

      <button
        type="button"
        class="md-find-btn md-find-case"
        :class="{ active: caseSensitive }"
        title="区分大小写"
        aria-label="区分大小写"
        @click="$emit('update:caseSensitive', !caseSensitive)"
      >
        Aa
      </button>

      <div class="md-find-nav">
        <UiIconButton
          size="xs"
          icon="fas fa-chevron-up"
          title="上一个 (Shift+Enter)"
          aria-label="上一个匹配"
          :disabled="matchesCount === 0"
          @click="$emit('findPrev')"
        />
        <UiIconButton
          size="xs"
          icon="fas fa-chevron-down"
          title="下一个 (Enter)"
          aria-label="下一个匹配"
          :disabled="matchesCount === 0"
          @click="$emit('findNext')"
        />
      </div>

      <UiIconButton
        size="xs"
        icon="fas fa-times"
        title="关闭 (Esc)"
        aria-label="关闭查找栏"
        @click="$emit('close')"
      />
    </div>

    <div class="md-find-row md-replace-row">
      <div class="md-find-input-wrap">
        <input
          :value="replaceText"
          class="md-find-input"
          placeholder="替换为..."
          spellcheck="false"
          @input="$emit('update:replaceText', $event.target.value)"
          @keydown.enter.exact="$emit('replaceCurrent')"
          @keydown.esc="$emit('close')"
        />
      </div>

      <div class="md-replace-actions">
        <UiButton
          size="xs"
          variant="secondary"
          :disabled="matchesCount === 0"
          title="替换当前选中的匹配"
          @click="$emit('replaceCurrent')"
        >
          替换
        </UiButton>
        <UiButton
          size="xs"
          variant="secondary"
          :disabled="matchesCount === 0"
          title="全部替换所有匹配"
          @click="$emit('replaceAll')"
        >
          全部替换
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { UiButton, UiIconButton } from '@/ui'

defineProps({
  findText: { type: String, default: '' },
  replaceText: { type: String, default: '' },
  caseSensitive: { type: Boolean, default: false },
  matchIndex: { type: Number, default: -1 },
  matchesCount: { type: Number, default: 0 }
})

defineEmits([
  'update:findText',
  'update:replaceText',
  'update:caseSensitive',
  'findNext',
  'findPrev',
  'replaceCurrent',
  'replaceAll',
  'close'
])

const findInputRef = ref(null)

onMounted(() => {
  nextTick(() => {
    findInputRef.value?.focus()
    findInputRef.value?.select()
  })
})
</script>

<style scoped>
.md-find-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-1);
  border-bottom: var(--border-width) solid var(--line-hairline);
  box-shadow: var(--elev-1);
  z-index: 10;
}

.md-find-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.md-find-input-wrap {
  flex: 1;
  min-width: 140px;
  max-width: 320px;
  position: relative;
  display: flex;
  align-items: center;
}

.md-find-input {
  width: 100%;
  height: 26px;
  padding: 0 54px 0 var(--space-2);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--fg);
  font-size: var(--text-xs);
  outline: none;
  transition: border-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.md-find-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}

.md-find-count {
  position: absolute;
  right: var(--space-2);
  font-size: var(--text-2xs);
  color: var(--fg-muted);
  font-family: var(--font-mono);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}

.md-find-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 6px;
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--fg-muted);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  user-select: none;
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    color var(--motion-dur-fast) var(--motion-ease-standard),
    border-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.md-find-btn.active {
  background: var(--brand-soft);
  color: var(--brand);
  border-color: var(--brand-line);
}

@media (hover: hover) {
  .md-find-btn:hover {
    background: var(--surface-hover);
    color: var(--brand);
  }
}

.md-find-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.md-replace-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
