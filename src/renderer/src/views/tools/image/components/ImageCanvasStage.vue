<template>
  <div
    :ref="setWrapEl"
    :class="[
      'img-canvas-wrap',
      {
        'is-space-pressed': isSpacePressed,
        'is-panning': isPanning,
        'is-resizing': resizePreview
      }
    ]"
  >
    <div
      class="img-canvas-viewport"
      :style="{ width: canvasStyleW + 'px', height: canvasStyleH + 'px' }"
    >
      <canvas
        :ref="setCanvasEl"
        class="img-canvas"
        :style="{ width: canvasStyleW + 'px', height: canvasStyleH + 'px' }"
        @pointerdown="$emit('pointerdown', $event)"
        @pointermove="$emit('pointermove', $event)"
        @pointerup="$emit('pointerup', $event)"
        @pointercancel="$emit('pointerup', $event)"
      ></canvas>

      <!-- 拖拽过程中的目标画布轮廓 -->
      <div v-if="resizePreview" class="img-resize-ghost" :style="ghostStyle" aria-hidden="true"></div>

      <!-- 画布尺寸拖拽手柄：拖动四边/四角改画布大小 -->
      <div v-if="resizable" class="img-resize-layer" aria-hidden="true">
        <span
          v-for="h in RESIZE_HANDLES"
          :key="h"
          :class="['img-resize-handle', `is-${h}`]"
          @pointerdown="$emit('resizeStart', { handle: h, event: $event })"
        ></span>
      </div>

      <!-- 文字输入悬浮层 -->
      <ImageTextOverlay
        v-if="textDraft"
        :left="textBoxLeft"
        :top="textBoxTop"
        :font-size="fontSize"
        :color="color"
        :set-text-ref="setTextRef"
        @update:font-size="$emit('update:fontSize', $event)"
        @update:color="$emit('update:color', $event)"
        @commit="$emit('commitText')"
        @cancel="$emit('cancelText')"
      />
    </div>

    <!-- 拖拽中的尺寸提示，跟随指针，不会被容器裁掉 -->
    <div v-if="resizePreview" class="img-resize-badge" :style="badgeStyle">
      {{ resizePreview.width }} × {{ resizePreview.height }}
    </div>

    <div v-if="loading" class="img-overlay">
      <UiSpinner size="sm" />
      <span>加载中…</span>
    </div>

    <div v-if="loadError" class="img-overlay">
      <UiBanner variant="danger">{{ loadError }}</UiBanner>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { UiBanner, UiSpinner } from '@/ui'
import ImageTextOverlay from './ImageTextOverlay.vue'
import { RESIZE_HANDLES } from '../composables/useImageResize.js'

const props = defineProps({
  setWrapEl: { type: Function, required: true },
  setCanvasEl: { type: Function, required: true },
  setTextRef: { type: Function, required: true },
  canvasStyleW: { type: Number, required: true },
  canvasStyleH: { type: Number, required: true },
  zoomScale: { type: Number, default: 1 },
  loading: { type: Boolean, default: false },
  loadError: { type: String, default: '' },
  textDraft: { type: Boolean, default: false },
  textBoxLeft: { type: Number, default: 0 },
  textBoxTop: { type: Number, default: 0 },
  fontSize: { type: Number, default: 24 },
  color: { type: String, required: true },
  isPanning: { type: Boolean, default: false },
  isSpacePressed: { type: Boolean, default: false },
  /** 是否显示画布尺寸拖拽手柄 */
  resizable: { type: Boolean, default: false },
  /** 拖拽中的目标尺寸：{ width, height, offsetX, offsetY, clientX, clientY } */
  resizePreview: { type: Object, default: null }
})

defineEmits([
  'pointerdown',
  'pointermove',
  'pointerup',
  'update:fontSize',
  'update:color',
  'commitText',
  'cancelText',
  'resizeStart'
])

const ghostStyle = computed(() => {
  const p = props.resizePreview
  if (!p) return {}
  const z = props.zoomScale || 1
  // 内容偏移反过来就是新画布左/上边相对旧画布的位置
  return {
    left: `${-p.offsetX * z}px`,
    top: `${-p.offsetY * z}px`,
    width: `${p.width * z}px`,
    height: `${p.height * z}px`
  }
})

const badgeStyle = computed(() => {
  const p = props.resizePreview
  if (!p) return {}
  return { left: `${p.clientX + 16}px`, top: `${p.clientY + 18}px` }
})
</script>

<style scoped>
.img-canvas-wrap {
  flex: 1;
  min-height: 0;
  display: block;
  overflow: auto;
  padding: var(--space-4);
  background: repeating-conic-gradient(var(--surface-2) 0% 25%, var(--surface-1) 0% 50%) 0 0 / 16px 16px;
  position: relative;
  user-select: none;
}

.img-canvas-wrap.is-space-pressed {
  cursor: grab !important;
}

.img-canvas-wrap.is-panning {
  cursor: grabbing !important;
}

.img-canvas-wrap.is-resizing {
  cursor: crosshair;
}

.img-canvas-viewport {
  position: relative;
  margin: 0 auto;
  box-shadow: var(--elev-3);
  border-radius: var(--radius-xs);
}

.img-canvas {
  display: block;
  background: var(--surface-0);
  border-radius: var(--radius-xs);
  cursor: crosshair;
  touch-action: none;
}

/* ---------- 画布尺寸拖拽 ---------- */
.img-resize-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.img-resize-handle {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
}

/* 四角：可见的小方块，提示拖拽入口 */
.img-resize-handle.is-nw,
.img-resize-handle.is-ne,
.img-resize-handle.is-sw,
.img-resize-handle.is-se {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-xs);
  background: var(--surface-0);
  border: var(--border-width) solid var(--brand);
  box-shadow: var(--elev-1);
  transition: background var(--duration-fast) var(--ease-out);
}

.img-resize-handle.is-nw {
  left: -5px;
  top: -5px;
  cursor: nwse-resize;
}

.img-resize-handle.is-ne {
  right: -5px;
  top: -5px;
  cursor: nesw-resize;
}

.img-resize-handle.is-sw {
  left: -5px;
  bottom: -5px;
  cursor: nesw-resize;
}

.img-resize-handle.is-se {
  right: -5px;
  bottom: -5px;
  cursor: nwse-resize;
}

@media (hover: hover) {
  .img-resize-handle.is-nw:hover,
  .img-resize-handle.is-ne:hover,
  .img-resize-handle.is-sw:hover,
  .img-resize-handle.is-se:hover {
    background: var(--brand);
  }
}

/* 四边：透明热区，悬停时显示一道色条 */
.img-resize-handle.is-n,
.img-resize-handle.is-s {
  left: 10px;
  right: 10px;
  height: 8px;
  cursor: ns-resize;
}

.img-resize-handle.is-n {
  top: -4px;
}

.img-resize-handle.is-s {
  bottom: -4px;
}

.img-resize-handle.is-w,
.img-resize-handle.is-e {
  top: 10px;
  bottom: 10px;
  width: 8px;
  cursor: ew-resize;
}

.img-resize-handle.is-w {
  left: -4px;
}

.img-resize-handle.is-e {
  right: -4px;
}

.img-resize-handle.is-n::after,
.img-resize-handle.is-s::after,
.img-resize-handle.is-w::after,
.img-resize-handle.is-e::after {
  content: '';
  position: absolute;
  border-radius: var(--radius-pill);
  background: var(--brand);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.img-resize-handle.is-n::after,
.img-resize-handle.is-s::after {
  left: 50%;
  width: 26px;
  height: 3px;
  transform: translateX(-50%);
}

.img-resize-handle.is-w::after,
.img-resize-handle.is-e::after {
  top: 50%;
  width: 3px;
  height: 26px;
  transform: translateY(-50%);
}

.img-resize-handle.is-n::after {
  top: 2px;
}

.img-resize-handle.is-s::after {
  bottom: 2px;
}

.img-resize-handle.is-w::after {
  left: 2px;
}

.img-resize-handle.is-e::after {
  right: 2px;
}

.img-resize-handle.is-n:hover::after,
.img-resize-handle.is-s:hover::after,
.img-resize-handle.is-w:hover::after,
.img-resize-handle.is-e:hover::after {
  opacity: 0.85;
}

/* 拖拽中的目标画布轮廓 */
.img-resize-ghost {
  position: absolute;
  pointer-events: none;
  border: 2px dashed var(--brand);
  border-radius: var(--radius-xs);
  background: var(--brand-soft);
}

.img-resize-badge {
  position: fixed;
  z-index: 40;
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-inverse, var(--surface-2));
  color: var(--fg-inverse, var(--fg));
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  box-shadow: var(--elev-2);
  pointer-events: none;
  white-space: nowrap;
}

.img-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: var(--surface-glass);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  color: var(--fg-muted);
  font-size: var(--text-base);
}
</style>
