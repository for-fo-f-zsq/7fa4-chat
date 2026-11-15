<template>
  <div class="calc-keypad" :class="{ narrow }">
    <!-- 内存操作栏 (MC, MR, M+, M-, MS) -->
    <div class="calc-memory-bar">
      <div class="calc-memory-buttons">
        <button
          v-for="m in MEMORY_KEYS"
          :key="m.key"
          type="button"
          class="calc-mem-btn"
          :class="{ 'is-disabled': (m.key === 'MC' || m.key === 'MR') && !hasMemory }"
          :disabled="(m.key === 'MC' || m.key === 'MR') && !hasMemory"
          :title="m.title"
          :aria-label="m.title"
          @click="$emit('pressMemory', m.key)"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="calc-memory-indicator" :class="{ active: hasMemory }" :title="memoryTitle">
        <span class="calc-memory-badge">M</span>
        <span v-if="hasMemory" class="calc-memory-val">{{ formatMemory(memory) }}</span>
      </div>
    </div>

    <!-- 主键盘区 (5 列网格) -->
    <div class="calc-grid calc-grid--keys">
      <button
        v-for="k in PAD_KEYS"
        :key="k"
        type="button"
        class="calc-key"
        :class="[keyClass(k), { 'calc-key--eq-span2': k === '=' }]"
        :title="KEY_TIPS[k] || ''"
        :aria-label="KEY_TIPS[k] || k"
        @click="$emit('pressKey', k)"
      >
        {{ k }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { PAD_KEYS, KEY_TIPS, KEY_OP, KEY_ACT, MEMORY_KEYS } from '../calcConstants.js'

const props = defineProps({
  narrow: { type: Boolean, default: false },
  memory: { type: [Number, String, Object], default: null },
  hasMemory: { type: Boolean, default: false }
})

defineEmits(['pressKey', 'pressMemory'])

function keyClass(k) {
  if (k === '=') return 'calc-key--eq'
  if (k === 'AC') return 'calc-key--ac'
  if (k === 'Ans') return 'calc-key--ans'
  if (KEY_OP.includes(k)) return 'calc-key--op'
  if (KEY_ACT.includes(k)) return 'calc-key--act'
  return 'calc-key--num'
}

function formatMemory(mem) {
  if (mem == null) return ''
  let s = ''
  if (typeof mem === 'object' && 'n' in mem && 'd' in mem) {
    s = mem.d === 1n ? String(mem.n) : `${mem.n}/${mem.d}`
  } else {
    s = String(mem)
  }
  return s.length > 8 ? `${s.slice(0, 7)}…` : s
}

const memoryTitle = computed(() => {
  if (props.memory == null) return '当前无记忆值'
  if (typeof props.memory === 'object' && 'n' in props.memory && 'd' in props.memory) {
    const s = props.memory.d === 1n ? String(props.memory.n) : `${props.memory.n}/${props.memory.d}`
    return `当前记忆值：${s}`
  }
  return `当前记忆值：${props.memory}`
})
</script>

<style scoped>
.calc-keypad {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* 内存操作条 */
.calc-memory-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: var(--surface-1);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-md);
  box-shadow: var(--elev-1);
}

.calc-memory-buttons {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.calc-mem-btn {
  height: var(--control-h-sm);
  padding: 0 var(--space-2);
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    color var(--motion-dur-fast) var(--motion-ease-standard),
    border-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.calc-mem-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--brand);
  border-color: var(--brand-line);
}

.calc-mem-btn:disabled,
.calc-mem-btn.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.calc-memory-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-subtle);
  padding: 0 var(--space-1);
}

.calc-memory-indicator.active {
  color: var(--brand);
  font-weight: var(--weight-semibold);
}

.calc-memory-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: var(--text-2xs);
  font-weight: var(--weight-bold);
}

.calc-memory-indicator.active .calc-memory-badge {
  background: var(--brand-soft);
  color: var(--brand);
}

.calc-memory-val {
  font-variant-numeric: tabular-nums;
}

/* 主键盘 5 列网格 */
.calc-grid--keys {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-2);
}

.calc-key {
  min-height: var(--control-h-touch);
  height: 44px;
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-base);
  background: var(--surface-0);
  color: var(--fg);
  font-size: var(--text-xl);
  font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
  box-shadow: var(--elev-1);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    color var(--motion-dur-fast) var(--motion-ease-standard),
    box-shadow var(--motion-dur-fast) var(--motion-ease-standard),
    transform var(--motion-dur-fast) var(--motion-ease-out-expo);
}

.calc-key:focus-visible {
  outline: 2px solid transparent;
  box-shadow: var(--focus-ring);
}

.calc-key:hover {
  background: var(--surface-hover);
  border-color: var(--brand-line);
}

.calc-key:active {
  background: var(--surface-press);
  transform: scale(var(--press-scale));
}

/* 数字键 */
.calc-key--num {
  font-family: var(--font-mono);
}

/* 运算符键 */
.calc-key--op {
  background: var(--surface-2);
  color: var(--brand);
  font-weight: var(--weight-semibold);
  font-family: var(--font-mono);
}

/* 功能操作键 (⌫, (, )) */
.calc-key--act {
  background: var(--surface-1);
  color: var(--fg-muted);
  font-size: var(--text-lg);
}

/* AC 清空键（强调危险警示色） */
.calc-key--ac {
  background: var(--status-danger-bg);
  border-color: var(--status-danger-border);
  color: var(--status-danger-ink);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
}

.calc-key--ac:hover {
  background: var(--status-danger-bg);
  border-color: var(--status-danger-ink);
  color: var(--status-danger-ink);
}

/* Ans 键 */
.calc-key--ans {
  background: var(--surface-2);
  color: var(--brand);
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  font-family: var(--font-mono);
}

/* 等号键：主品牌色大块高亮 */
.calc-key--eq-span2 {
  grid-column: span 2;
  background: var(--brand-fill);
  border-color: transparent;
  color: var(--on-brand);
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  box-shadow: var(--elev-brand);
}

.calc-key--eq-span2:hover {
  background: var(--brand-fill-hover);
  border-color: transparent;
  color: var(--on-brand);
  box-shadow: var(--elev-brand-hover);
}

.calc-key--eq-span2:active {
  background: var(--brand-fill-active);
  box-shadow: var(--elev-brand-press);
  transform: scale(var(--press-scale));
}
</style>
