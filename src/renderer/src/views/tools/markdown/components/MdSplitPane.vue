<template>
  <div ref="workspaceEl" class="md-workspace" :class="'mode-' + viewMode">
    <section
      v-show="viewMode === 'split' || viewMode === 'editor-only'"
      class="md-pane md-pane-editor"
      :style="editorPaneStyle"
    >
      <textarea
        :ref="setTaEl"
        :value="content"
        class="md-source"
        placeholder="在此输入 Markdown 内容，右侧实时渲染……"
        spellcheck="false"
        @input="$emit('update:content', $event.target.value); $emit('input', $event)"
        @keydown="$emit('keydown', $event)"
        @scroll="$emit('editorScroll')"
      ></textarea>
      <div :ref="setGutterEl" class="md-gutter" aria-hidden="true"></div>
    </section>

    <div
      v-show="viewMode === 'split'"
      class="md-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整编辑区与预览区宽度"
      @pointerdown="onSplitPointerDown"
    ></div>

    <section
      v-show="viewMode !== 'editor-only'"
      class="md-pane md-pane-preview"
      :style="previewPaneStyle"
    >
      <div
        :ref="setPreviewEl"
        class="md-preview luogu-md"
        @scroll="$emit('previewScroll')"
        @click.capture="$emit('previewClick', $event)"
        @toggle.capture="$emit('previewToggle', $event)"
      ></div>
    </section>

    <ToolSideDrawer
      v-if="outlineOpen"
      :open="outlineOpen"
      :narrow="isNarrow"
      side="right"
      :width="260"
      :narrow-width="240"
      open-label="展开大纲"
      close-label="收起大纲"
      @update:open="$emit('update:outlineOpen', $event)"
    >
      <MdOutlineDrawer
        :content="content"
        @navigate="$emit('navigateHeading', $event)"
        @close="$emit('update:outlineOpen', false)"
      />
    </ToolSideDrawer>
  </div>

  <div class="p-status-bar md-statusbar">
    <span class="md-stats">{{ statsText }}</span>
    <ToolSaveBadge
      class="md-status-right"
      :has-file="!!savedName"
      :dirty="dirty"
      :saved-path="savedPath"
      :saved-name="savedName"
    />
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import ToolSaveBadge from '../../shared/ToolSaveBadge.vue'
import ToolSideDrawer from '../../shared/ToolSideDrawer.vue'
import MdOutlineDrawer from './MdOutlineDrawer.vue'

const props = defineProps({
  content: { type: String, required: true },
  viewMode: { type: String, required: true },
  statsText: { type: String, required: true },
  savedName: { type: String, default: '' },
  savedPath: { type: String, default: '' },
  dirty: { type: Boolean, default: false },
  outlineOpen: { type: Boolean, default: false },
  isNarrow: { type: Boolean, default: false },
  setTaEl: { type: Function, required: true },
  setPreviewEl: { type: Function, required: true },
  setGutterEl: { type: Function, required: true }
})

defineEmits([
  'update:content',
  'update:outlineOpen',
  'navigateHeading',
  'input',
  'keydown',
  'editorScroll',
  'previewScroll',
  'previewClick',
  'previewToggle'
])

const workspaceEl = ref(null)
const editorPct = ref(50)
const MIN_PANE_WIDTH = 200

const editorPaneStyle = computed(() => ({
  flex: props.viewMode === 'split' ? `0 0 ${editorPct.value}%` : '1 1 auto'
}))

const previewPaneStyle = computed(() => ({
  flex: props.viewMode === 'split' ? `0 0 ${100 - editorPct.value}%` : '1 1 auto'
}))

function applySplit(clientX) {
  const ws = workspaceEl.value
  if (!ws) return
  const rect = ws.getBoundingClientRect()
  const offsetX = clientX - rect.left
  if (offsetX > MIN_PANE_WIDTH && (rect.width - offsetX) > MIN_PANE_WIDTH) {
    editorPct.value = (offsetX / rect.width) * 100
  }
}

// 拖拽期间的 window 监听必须能撤销：拖到一半切走工具，body 会永久停在 col-resize。
let activeSplit = null

function endSplit() {
  if (!activeSplit) return
  const { onMove, onUp } = activeSplit
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  activeSplit = null
}

function onSplitPointerDown(e) {
  const handle = e.currentTarget
  endSplit()
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  try { handle.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  const onMove = (ev) => applySplit(ev.clientX)
  const onUp = () => endSplit()
  activeSplit = { onMove, onUp }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  e.preventDefault()
}

onBeforeUnmount(endSplit)
</script>

<style scoped src="./md-split-pane.css"></style>
