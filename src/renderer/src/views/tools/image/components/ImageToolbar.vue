<template>
  <div class="p-toolbar img-toolbar">
    <!-- 1. 绘图与标注工具组 -->
    <div class="p-toolbar__group img-tools-group">
      <UiIconButton
        v-for="t in IMAGE_TOOLS"
        :key="t.id"
        size="sm"
        :icon="t.icon"
        :active="tool === t.id"
        :title="t.title"
        :aria-label="t.title"
        @click="$emit('update:tool', t.id)"
      />
    </div>

    <div class="img-tool-sep"></div>

    <!-- 2. 预设颜色调色板与自定义取色 -->
    <div class="img-palette-group" title="画笔颜色">
      <div class="img-swatches">
        <button
          v-for="c in DEFAULT_COLOR_PALETTE"
          :key="c"
          type="button"
          :class="['img-swatch', { active: color.toLowerCase() === c.toLowerCase() }]"
          :style="{ backgroundColor: c }"
          :aria-label="`选择颜色 ${c}`"
          @click="$emit('update:color', c)"
        >
          <span v-if="color.toLowerCase() === c.toLowerCase()" class="img-swatch-check"></span>
        </button>
      </div>

      <label class="img-color-picker-label" title="自定义颜色">
        <i class="fas fa-eye-dropper picker-icon" aria-hidden="true"></i>
        <input
          :value="color"
          type="color"
          class="img-color-picker-input"
          @input="$emit('update:color', $event.target.value)"
        />
      </label>
    </div>

    <div class="img-tool-sep"></div>

    <!-- 3. 线条与画笔粗细 -->
    <div class="img-brush-size" title="线条/画笔粗细">
      <div class="img-size-preview-wrap">
        <span
          class="img-size-dot"
          :style="{
            width: Math.min(20, Math.max(4, size)) + 'px',
            height: Math.min(20, Math.max(4, size)) + 'px',
            backgroundColor: color
          }"
        ></span>
      </div>
      <UiSlider
        class="img-brush-slider"
        :model-value="size"
        :min="1"
        :max="50"
        :step="1"
        :show-value="false"
        size="sm"
        aria-label="画笔粗细"
        @update:model-value="$emit('update:size', $event)"
      />
      <span class="img-size-val">{{ size }}</span>
    </div>

    <div class="img-tool-sep"></div>

    <!-- 4a. 历史撤销重做 -->
    <div class="p-toolbar__group img-actions-group">
      <UiIconButton
        size="sm"
        icon="fas fa-reply"
        title="撤销 (Ctrl+Z)"
        aria-label="撤销"
        :disabled="!canUndo"
        @click="$emit('undo')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-share"
        title="重做 (Ctrl+Y)"
        aria-label="重做"
        :disabled="!canRedo"
        @click="$emit('redo')"
      />
    </div>

    <div class="img-tool-sep"></div>

    <!-- 4b. 旋转与翻转 -->
    <div class="p-toolbar__group img-actions-group">
      <UiIconButton
        size="sm"
        icon="fas fa-rotate"
        title="顺时针旋转 90°"
        aria-label="顺时针旋转 90°"
        @click="$emit('rotateCW')"
      />
      <UiIconButton
        size="sm"
        title="逆时针旋转 90°"
        aria-label="逆时针旋转 90°"
        @click="$emit('rotateCCW')"
      >
        <template #icon><i class="fas fa-rotate img-icon-flip-x"></i></template>
      </UiIconButton>
      <UiIconButton
        size="sm"
        icon="fas fa-arrows-left-right"
        title="水平翻转"
        aria-label="水平翻转"
        @click="$emit('flipH')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-arrows-up-down"
        title="垂直翻转"
        aria-label="垂直翻转"
        @click="$emit('flipV')"
      />
    </div>

    <div class="img-tool-sep"></div>

    <!-- 4c. 清除 -->
    <div class="p-toolbar__group img-actions-group">
      <UiIconButton
        size="sm"
        icon="fas fa-trash-can"
        title="清除本次绘制"
        aria-label="清除本次绘制"
        @click="$emit('clear')"
      />
    </div>
  </div>
</template>

<script setup>
import { UiIconButton, UiSlider } from '@/ui'
import { IMAGE_TOOLS, DEFAULT_COLOR_PALETTE } from '../imageConstants.js'

defineProps({
  tool: { type: String, required: true },
  color: { type: String, required: true },
  size: { type: Number, required: true },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false }
})

defineEmits([
  'update:tool',
  'update:color',
  'update:size',
  'undo',
  'redo',
  'rotateCW',
  'rotateCCW',
  'flipH',
  'flipV',
  'clear'
])
</script>

<style scoped>
.img-toolbar {
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--border-width) solid var(--line-hairline);
  background: var(--surface-1);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  /* 工具多时换行而不是出横向滚动条 */
  overflow: visible;
}

.img-toolbar > * {
  flex-shrink: 0;
}

.img-tool-sep {
  width: 1px;
  height: 20px;
  background: var(--line-hairline);
  margin: 0 2px;
}

.img-palette-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.img-swatches {
  display: flex;
  align-items: center;
  gap: 4px;
}

.img-swatch {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(0, 0, 0, 0.15);
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: transform var(--duration-fast) var(--ease-out);
}

@media (hover: hover) {
  .img-swatch:hover {
    transform: scale(1.15);
  }
}

.img-swatch.active {
  box-shadow: 0 0 0 2px var(--surface-0), 0 0 0 3.5px var(--brand);
  transform: scale(1.1);
  z-index: 1;
}

.img-swatch-check {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.7);
}

.img-color-picker-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--elev-1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  margin-left: 2px;
}

.picker-icon {
  font-size: var(--text-2xs);
  color: var(--fg-muted);
}

.img-color-picker-input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.img-brush-size {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-muted);
}

.img-size-preview-wrap {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.img-size-dot {
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
  transition: width var(--duration-fast) var(--ease-out), height var(--duration-fast) var(--ease-out);
}

.img-brush-slider {
  width: 80px;
}

.img-size-val {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  min-width: 18px;
  text-align: center;
}

/* 逆时针旋转：镜像同一枚旋转图标，与顺时针形成左右对称 */
.img-icon-flip-x {
  transform: scaleX(-1);
}
</style>
