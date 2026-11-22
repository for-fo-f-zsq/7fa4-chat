<template>
  <div :ref="setWrapRef" class="graph-canvas-wrap">
    <canvas
      :ref="setCanvasRef"
      @mousedown="$emit('mousedown', $event)"
      @mousemove="$emit('mousemove', $event)"
      @mouseup="$emit('mouseup', $event)"
      @mouseleave="$emit('mouseleave')"
      @dblclick="$emit('dblclick', $event)"
      @contextmenu.prevent
    ></canvas>

    <!-- Floating Mode Toolbar Pill -->
    <GraphFloatingBar
      :mode="mode"
      :locked="locked"
      :tree-mode="treeMode"
      @update:mode="$emit('update:mode', $event)"
      @toggle-lock="$emit('toggleLock')"
      @restart-layout="$emit('restartLayout')"
      @toggle-tree-mode="$emit('toggleTreeMode')"
      @zoom-in="$emit('zoomIn')"
      @zoom-out="$emit('zoomOut')"
      @fit-view="$emit('fitView')"
    />

    <!-- Direct Inline Edit Popover -->
    <div
      v-if="inlineEdit"
      class="graph-inline-popover"
      :style="inlineEditStyle"
      @mousedown.stop
      @dblclick.stop
    >
      <div class="graph-inline-header">
        <i :class="inlineEdit.type === 'node' ? 'fas fa-weight-hanging' : 'fas fa-arrows-split-up-and-left'"></i>
        <span>{{ inlineEdit.type === 'node' ? `编辑节点 ${inlineEdit.target.id} 点权` : '编辑边属性' }}</span>
      </div>
      <div class="graph-inline-input-group">
        <input
          ref="inlineInputRef"
          v-model="draftText"
          class="graph-inline-input"
          :placeholder="inlineEdit.type === 'node' ? '输入数字点权 (留空或 _ 清除)...' : '输入边权重 (数字或留空)...'"
          @keydown.enter.prevent="submitInline"
          @keydown.esc.prevent="$emit('cancelInlineEdit')"
        />
        <button
          type="button"
          class="graph-inline-btn is-confirm"
          title="确认修改 (Enter)"
          @click="submitInline"
        >
          <i class="fas fa-check"></i>
        </button>
        <button
          type="button"
          class="graph-inline-btn is-cancel"
          title="取消修改 (Esc)"
          @click="$emit('cancelInlineEdit')"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div v-if="inlineEdit.type === 'edge'" class="graph-inline-spring-row">
        <label class="graph-inline-spring-cell">
          <span>原长 Lₑ</span>
          <input
            v-model="draftRestLength"
            type="number"
            class="graph-inline-input is-compact"
            placeholder="默认"
            @keydown.enter.prevent="submitInline"
            @keydown.esc.prevent="$emit('cancelInlineEdit')"
          />
        </label>
        <label class="graph-inline-spring-cell">
          <span>劲度 kₑ</span>
          <input
            v-model="draftStiffness"
            type="number"
            step="0.1"
            class="graph-inline-input is-compact"
            placeholder="默认"
            @keydown.enter.prevent="submitInline"
            @keydown.esc.prevent="$emit('cancelInlineEdit')"
          />
        </label>
      </div>
      <div class="graph-inline-hint">按 Enter 确定 · 按 Esc 取消</div>
    </div>
  </div>

  <div class="graph-hint">
    <i class="fas fa-info-circle" aria-hidden="true"></i>
    <span>{{ hint }}</span>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import GraphFloatingBar from './GraphFloatingBar.vue'
import { edgeGeometry } from '../graphRenderer.js'

const props = defineProps({
  hint: { type: String, required: true },
  setWrapRef: { type: Function, required: true },
  setCanvasRef: { type: Function, required: true },
  mode: { type: String, required: true },
  locked: { type: Boolean, required: true },
  treeMode: { type: Boolean, required: true },
  inlineEdit: { type: Object, default: null },
  view: { type: Object, default: () => ({ x: 0, y: 0, scale: 1 }) },
  edges: { type: Array, default: () => [] },
  byId: { type: Function, default: () => null }
})

const emit = defineEmits([
  'mousedown',
  'mousemove',
  'mouseup',
  'mouseleave',
  'dblclick',
  'update:mode',
  'toggleLock',
  'restartLayout',
  'toggleTreeMode',
  'zoomIn',
  'zoomOut',
  'fitView',
  'commitInlineEdit',
  'cancelInlineEdit'
])

const inlineInputRef = ref(null)
const draftText = ref('')
const draftRestLength = ref('')
const draftStiffness = ref('')

watch(
  () => props.inlineEdit,
  (val) => {
    if (val) {
      draftText.value = val.text || ''
      draftRestLength.value = val.restLength || ''
      draftStiffness.value = val.stiffness || ''
      nextTick(() => {
        inlineInputRef.value?.focus()
        inlineInputRef.value?.select()
      })
    }
  },
  { immediate: true }
)

const inlineEditStyle = computed(() => {
  if (!props.inlineEdit || !props.view) return { display: 'none' }
  const v = props.view
  let wx = 0
  let wy = 0
  if (props.inlineEdit.type === 'node') {
    wx = props.inlineEdit.target.x
    wy = props.inlineEdit.target.y
  } else if (props.inlineEdit.type === 'edge') {
    const g = edgeGeometry(props.inlineEdit.target, props.edges || [], props.byId)
    if (g) {
      wx = g.cx
      wy = g.cy
    }
  }
  const sx = v.x + wx * v.scale
  const sy = v.y + wy * v.scale - (props.inlineEdit.type === 'node' ? 24 * v.scale + 16 : 14)
  return {
    left: `${sx}px`,
    top: `${sy}px`
  }
})

function submitInline() {
  if (props.inlineEdit?.type === 'edge') {
    emit('commitInlineEdit', {
      text: draftText.value,
      restLength: draftRestLength.value,
      stiffness: draftStiffness.value
    })
  } else {
    emit('commitInlineEdit', draftText.value)
  }
}
</script>

<style scoped>
.graph-canvas-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: var(--surface-0);
}

.graph-canvas-wrap canvas {
  position: absolute;
  top: 0;
  left: 0;
  touch-action: none;
}

.graph-inline-popover {
  position: absolute;
  transform: translate(-50%, -100%);
  background: var(--surface-raised);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-4);
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  z-index: 20;
  min-width: 210px;
  max-width: 280px;
  animation: inlineFadeIn var(--motion-dur-fast) var(--motion-ease-out-expo);
}

.graph-inline-popover::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--surface-raised);
  border-right: var(--border-width) solid var(--line-hairline);
  border-bottom: var(--border-width) solid var(--line-hairline);
}

@keyframes inlineFadeIn {
  from {
    opacity: 0;
    transform: translate(-50%, -92%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -100%) scale(1);
  }
}

.graph-inline-header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--fg);
}

.graph-inline-header i {
  color: var(--brand);
}

.graph-inline-input-group {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.graph-inline-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--fg);
  background: var(--surface-0);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.graph-inline-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}

.graph-inline-input.is-compact {
  height: 24px;
  font-size: var(--text-2xs);
}

.graph-inline-spring-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
}

.graph-inline-spring-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: var(--fg-muted);
}

.graph-inline-btn {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--text-xs);
  transition: background-color var(--motion-dur-fast) var(--motion-ease-standard),
              transform var(--motion-dur-fast) var(--motion-ease-standard);
}

.graph-inline-btn:active {
  transform: scale(var(--press-scale));
}

.graph-inline-btn.is-confirm {
  background: var(--brand);
  color: var(--on-brand, #ffffff);
}

.graph-inline-btn.is-confirm:hover {
  background: var(--brand-hover);
}

.graph-inline-btn.is-cancel {
  background: var(--surface-2);
  color: var(--fg-muted);
}

.graph-inline-btn.is-cancel:hover {
  background: var(--surface-hover);
  color: var(--fg);
}

.graph-inline-hint {
  font-size: 10px;
  color: var(--fg-muted);
  user-select: none;
}

.graph-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px var(--space-3);
  font-size: var(--text-xs);
  color: var(--fg-muted);
  background: var(--surface-1);
  border-top: var(--border-width) solid var(--line-hairline);
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.graph-hint i {
  color: var(--brand);
  flex-shrink: 0;
}
</style>
