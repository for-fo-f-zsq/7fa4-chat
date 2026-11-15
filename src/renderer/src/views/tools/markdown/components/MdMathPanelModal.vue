<template>
  <UiModal
    v-if="open"
    :open="open"
    title="数学公式面板"
    size="lg"
    :scrollable="true"
    :teleport="false"
    modal-class="mdm-dialog mdm-dialog-wide"
    @update:open="$emit('update:open', $event)"
  >
    <div class="mdm-math-body">
      <div class="mdm-math-tabs">
        <UiButton
          v-for="(cat, idx) in mathLibrary"
          :key="idx"
          size="sm"
          :variant="mathActiveTab === idx ? 'primary' : 'secondary'"
          @click="mathActiveTab = idx"
        >{{ cat.category }}</UiButton>
      </div>
      <div class="mdm-math-grid" :class="{ wide: mathItems.some((it) => it.wide) }">
        <button
          v-for="(item, i) in mathItems"
          :key="i"
          type="button"
          class="mdm-math-card"
          :class="{ wide: item.wide }"
          :title="item.desc || item.label"
          @click="insertSymbol(item.code)"
        >
          <span class="mdm-math-preview" v-html="item.html"></span>
          <span class="mdm-math-label">{{ item.label }}</span>
        </button>
      </div>
    </div>
    <template #footer>
      <div class="p-modal-footer mdm-footer mdm-math-footer">
        <span class="mdm-hint">点击任意公式插入光标处</span>
        <UiButton size="sm" variant="secondary" @click="$emit('update:open', false)">关闭</UiButton>
      </div>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { katex, LuoguMathLibrary } from '../../../../markdown/index.js'
import { UiButton, UiModal } from '@/ui'

defineProps({
  open: { type: Boolean, default: false }
})

const emit = defineEmits(['update:open', 'insert'])

const mathActiveTab = ref(0)
const mathPanels = {}
const mathLibrary = LuoguMathLibrary || []

const mathItems = computed(() => {
  const cat = mathLibrary[mathActiveTab.value]
  if (!cat) return []
  if (!mathPanels[mathActiveTab.value]) {
    const opts = { throwOnError: false, displayMode: false, output: 'html' }
    mathPanels[mathActiveTab.value] = cat.items.map((item) => {
      let html = ''
      try {
        const clean = String(item.code).replace(/^\$\$\n?|\n?\$\$$|^\$|\$$/g, '')
        html = katex.renderToString(clean, opts)
      } catch { html = '' }
      return { code: item.code, label: item.label || '', desc: item.desc || '', wide: !!item.isWide, html }
    })
  }
  return mathPanels[mathActiveTab.value]
})

function insertSymbol(code) {
  emit('insert', code)
  emit('update:open', false)
}
</script>

<style scoped>
.mdm-math-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.mdm-math-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mdm-math-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: var(--space-2);
}

.mdm-math-grid.wide {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.mdm-math-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-base);
  background: var(--surface-1);
  padding: var(--space-2) 6px;
  cursor: pointer;
  min-height: 62px;
  transition:
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    box-shadow var(--motion-dur-fast) var(--motion-ease-standard),
    transform var(--motion-dur-fast) var(--motion-ease-out-expo);
}

.mdm-math-card:focus-visible {
  outline: 2px solid transparent;
  box-shadow: var(--focus-ring);
}

@media (hover: hover) {
  .mdm-math-card:hover {
    border-color: var(--brand-line);
    background: var(--brand-soft);
    box-shadow: var(--elev-1);
  }
}

.mdm-math-card:active {
  transform: scale(var(--press-scale));
}

.mdm-math-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  color: var(--fg);
  overflow: hidden;
}

.mdm-math-preview :deep(.katex) {
  font-size: 0.95rem;
}

.mdm-math-label {
  font-size: var(--text-xs);
  color: var(--fg-muted);
  text-align: center;
}

.mdm-math-footer {
  width: 100%;
}

.mdm-hint {
  margin-right: auto;
  font-size: var(--text-xs);
  color: var(--fg-placeholder);
}
</style>
