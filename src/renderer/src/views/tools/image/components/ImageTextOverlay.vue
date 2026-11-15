<template>
  <div
    class="img-text-overlay"
    :style="{ left: left + 'px', top: top + 'px' }"
    @mousedown.stop
    @pointerdown.stop
    @click.stop
  >
    <div class="img-text-toolbar motion-pop-in">
      <UiInput
        class="img-text-size"
        type="number"
        size="sm"
        title="字号 (px)"
        :min="12"
        :max="120"
        :model-value="fontSize"
        @update:model-value="$emit('update:fontSize', Number($event) || 16)"
      />
      <label class="img-text-color-label" title="选择文字颜色">
        <input
          :value="color"
          type="color"
          class="img-text-color-input"
          @input="$emit('update:color', $event.target.value)"
        />
      </label>
      <UiIconButton
        size="sm"
        variant="solid"
        icon="fas fa-check"
        title="确认应用 (Ctrl+Enter)"
        aria-label="确认应用"
        @click="$emit('commit')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-times"
        title="取消 (Esc)"
        aria-label="取消"
        @click="$emit('cancel')"
      />
    </div>
    <div
      :ref="setTextRef"
      class="img-text-editor"
      contenteditable="true"
      :style="{ fontSize: fontSize + 'px', color, minWidth: '120px', minHeight: '36px' }"
      @keydown="onEditorKeyDown"
    ></div>
  </div>
</template>

<script setup>
import { UiIconButton, UiInput } from '@/ui'

defineProps({
  left: { type: Number, required: true },
  top: { type: Number, required: true },
  fontSize: { type: Number, required: true },
  color: { type: String, required: true },
  setTextRef: { type: Function, required: true }
})

const emit = defineEmits(['update:fontSize', 'update:color', 'commit', 'cancel'])

function onEditorKeyDown(e) {
  e.stopPropagation()
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    emit('commit')
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}
</script>

<style scoped>
.img-text-overlay {
  position: absolute;
  z-index: var(--z-modal);
}

.img-text-toolbar {
  position: absolute;
  bottom: 100%;
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-glass);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-base);
  box-shadow: var(--elev-3);
  padding: 4px;
  margin-bottom: var(--space-2);
  width: max-content;
}

.img-text-size {
  width: 58px;
}

.img-text-color-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  cursor: pointer;
  overflow: hidden;
}

.img-text-color-input {
  width: 32px;
  height: 32px;
  border: none;
  padding: 0;
  background: none;
  cursor: pointer;
}

.img-text-editor {
  background: color-mix(in srgb, var(--surface-0) 50%, transparent);
  border: 1.5px dashed var(--brand);
  border-radius: var(--radius-xs);
  padding: var(--space-1) var(--space-2);
  outline: none;
  min-width: 120px;
  min-height: 36px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: var(--elev-1);
}
</style>
