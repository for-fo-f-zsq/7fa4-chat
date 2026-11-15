<template>
  <div class="calc-display-card">
    <!-- 模数模式专属药丸配置栏（独立成行，避免挤压输入框） -->
    <div v-if="mode === 'mod'" class="calc-mod-bar">
      <div class="calc-mod-group">
        <UiBadge variant="brand" size="sm" pill class="calc-mod-badge">
          <i class="fas fa-hashtag" aria-hidden="true"></i> 模数 m
        </UiBadge>
        <UiDropdown
          :model-value="modPreset"
          :options="MOD_OPTIONS"
          size="sm"
          auto-width
          aria-label="模数预设"
          class="calc-mod-dropdown"
          @update:model-value="$emit('update:modPreset', $event)"
        />
        <UiInput
          v-if="modPreset === 'custom'"
          :model-value="modCustom"
          size="sm"
          monospace
          placeholder="正整数模数"
          title="自定义模数"
          class="calc-mod-input"
          @update:model-value="$emit('update:modCustom', $event)"
        />
      </div>
      <span class="calc-mod-hint">模 {{ modLabel }} 意义下运算</span>
    </div>

    <!-- 上一公式历史提示行 -->
    <div v-if="lastExpr" class="calc-last-expr" :title="'上一计算式：' + lastExpr">
      <span class="calc-last-expr-text">{{ lastExpr }} =</span>
    </div>

    <!-- 表达式输入框全宽卡片 -->
    <div class="calc-input-wrap">
      <input
        ref="inputRef"
        :value="exprText"
        class="calc-expr-input"
        placeholder="输入算式，例如 sin(30) 或 (1+2)*3…"
        spellcheck="false"
        aria-label="表达式输入"
        @input="$emit('update:exprText', $event.target.value)"
        @keydown.enter="$emit('evaluate')"
        @keydown.esc="$emit('clear')"
      />
      <button
        v-if="exprText"
        type="button"
        class="calc-input-clear-btn"
        title="清空表达式 (Esc)"
        aria-label="清空输入"
        @click="$emit('clear')"
      >
        <i class="fas fa-times-circle" aria-hidden="true"></i>
      </button>
    </div>

    <!-- 结果区域：大号等宽 tabular-nums 与操作按钮 -->
    <div class="calc-result-row">
      <div class="calc-result-actions">
        <UiButton
          v-if="copied"
          size="sm"
          variant="soft"
          icon="fas fa-check"
          class="calc-action-btn is-copied"
          disabled
        >
          已复制
        </UiButton>
        <template v-else>
          <UiButton
            size="sm"
            variant="ghost"
            icon="fas fa-copy"
            class="calc-action-btn"
            :disabled="!resultText || hasError"
            title="复制计算结果"
            aria-label="复制计算结果"
            @click="onCopyResult"
          >
            复制结果
          </UiButton>
          <UiButton
            size="sm"
            variant="ghost"
            icon="fas fa-reply"
            class="calc-action-btn"
            :disabled="ans == null"
            title="将上次结果 Ans 插入表达式"
            aria-label="代入 Ans"
            @click="$emit('insertAns')"
          >
            Ans
          </UiButton>
        </template>
      </div>

      <div
        class="calc-result"
        :class="{ error: hasError, 'has-val': !!resultText }"
        :title="resultText || ''"
      >
        <span v-if="resultText" class="calc-result-text">{{ resultText }}</span>
        <span v-else class="calc-result-placeholder">0</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { UiBadge, UiDropdown, UiInput, UiButton } from '@/ui'
import { MOD_OPTIONS } from '../calcConstants.js'

const props = defineProps({
  exprText: { type: String, default: '' },
  resultText: { type: String, default: '' },
  lastExpr: { type: String, default: '' },
  hasError: { type: Boolean, default: false },
  mode: { type: String, default: 'normal' },
  modPreset: { type: String, default: '' },
  modCustom: { type: String, default: '' },
  modLabel: { type: String, default: '' },
  ans: { type: [String, Number, Object], default: null }
})

const emit = defineEmits([
  'update:exprText',
  'update:modPreset',
  'update:modCustom',
  'evaluate',
  'clear',
  'insertAns',
  'copyResult',
  'copyExpr',
  'setRef'
])

const inputRef = ref(null)
const copied = ref(false)

onMounted(() => {
  if (inputRef.value) {
    emit('setRef', inputRef.value)
    inputRef.value.focus()
  }
})

function onCopyResult() {
  emit('copyResult')
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}
</script>

<style scoped>
.calc-display-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex-shrink: 0;
  padding: var(--space-4);
  background: var(--surface-1);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-xl);
  box-shadow: var(--elev-1);
  transition: border-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.calc-display-card:focus-within {
  border-color: var(--brand-line);
}

/* 模数独立配置栏 */
.calc-mod-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: var(--surface-2);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-base);
  font-size: var(--text-xs);
  flex-wrap: wrap;
}

.calc-mod-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.calc-mod-badge {
  font-family: var(--font-mono);
  font-weight: var(--weight-medium);
}

.calc-mod-dropdown {
  flex-shrink: 0;
}

.calc-mod-input {
  width: 140px;
}

.calc-mod-hint {
  color: var(--fg-muted);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}

/* 上一计算式提示 */
.calc-last-expr {
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: var(--fg-subtle);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calc-last-expr-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表达式输入框 */
.calc-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.calc-expr-input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-2) var(--space-6) var(--space-2) var(--space-3);
  font-size: var(--text-2xl);
  font-weight: var(--weight-medium);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  background: var(--surface-0);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-md);
  color: var(--fg);
  box-shadow: var(--elev-inset);
  transition:
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    box-shadow var(--motion-dur-fast) var(--motion-ease-standard);
}

.calc-expr-input::placeholder {
  color: var(--fg-placeholder);
  font-size: var(--text-base);
  font-weight: var(--weight-regular);
}

.calc-expr-input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--focus-halo);
}

.calc-input-clear-btn {
  position: absolute;
  right: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fg-subtle);
  font-size: var(--text-sm);
  cursor: pointer;
  border-radius: var(--radius-pill);
  transition: color var(--motion-dur-fast) var(--motion-ease-standard);
}

.calc-input-clear-btn:hover {
  color: var(--fg-muted);
}

/* 结果行 */
.calc-result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-1);
}

.calc-result-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.calc-action-btn {
  --btn-px: var(--space-2);
}

.calc-result {
  flex: 1;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
  text-align: right;
  word-break: break-all;
  line-height: var(--leading-tight);
}

.calc-result.has-val {
  color: var(--brand);
}

.calc-result.error {
  color: var(--status-danger-ink);
  font-size: var(--text-lg);
  font-weight: var(--weight-medium);
}

.calc-result-placeholder {
  opacity: 0.35;
}
</style>
