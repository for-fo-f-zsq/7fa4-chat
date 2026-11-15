<template>
  <ToolWorkspaceShell
    class="img-tool-wrap"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <template #header>
      <ImageHeaderBar
        :current-name="currentName"
        :width="width"
        :height="height"
        :mime="mime"
        :dirty="dirty"
        :saved-name="savedName"
        :saved-path="savedPath"
        :saving="saving"
        :loading="loading"
        :canvas-ready="canvasReady"
        @open="openImage"
        @new="newCanvas"
        @save="save"
        @send="sendToChat"
      />
    </template>

    <UiEmptyState
      v-if="!canvasReady"
      :class="['img-tool-empty', { 'is-drag-over': isDragOver }]"
      icon="fas fa-image"
      title="打开一张图片进行编辑"
      description="支持拖拽图片到此、粘贴剪贴板图片 (Ctrl+V)，或新建空白画布"
    >
      <template #action>
        <div class="empty-actions">
          <UiButton variant="primary" size="sm" icon="fas fa-folder-open" @click="openImage">
            打开图片
          </UiButton>
          <UiButton variant="secondary" size="sm" icon="fas fa-plus-square" @click="newCanvas">
            新建画布
          </UiButton>
        </div>
      </template>
    </UiEmptyState>

    <div v-else class="img-editor">
      <ImageToolbar
        v-model:tool="tool"
        v-model:color="color"
        v-model:size="size"
        :can-undo="canUndo"
        :can-redo="canRedo"
        @undo="undo"
        @redo="redo"
        @rotate-c-w="rotate90CW"
        @rotate-c-c-w="rotate90CCW"
        @flip-h="flipHorizontal"
        @flip-v="flipVertical"
        @clear="clearCanvas"
      />

      <ImageCanvasStage
        :set-wrap-el="(el) => { wrapEl = el }"
        :set-canvas-el="(el) => { canvasEl = el }"
        :set-text-ref="(el) => { textRef = el }"
        :canvas-style-w="canvasStyleW"
        :canvas-style-h="canvasStyleH"
        :zoom-scale="zoomScale"
        :loading="loading"
        :load-error="loadError"
        :text-draft="textDraft"
        :text-box-left="textBoxLeft"
        :text-box-top="textBoxTop"
        v-model:font-size="fontSize"
        v-model:color="color"
        :is-panning="isPanning"
        :is-space-pressed="isSpacePressed"
        :resizable="canvasReady"
        :resize-preview="resizePreview"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @resize-start="onResizeStart"
        @commit-text="commitText"
        @cancel-text="cancelText"
      />
    </div>

    <template v-if="canvasReady" #footer>
      <div class="p-status-bar img-footer">
        <span class="img-meta">
          {{ currentName || '未命名' }} · {{ width }} × {{ height }}px{{ mime === 'image/jpeg' ? ' · JPEG' : mime === 'image/png' ? ' · PNG' : ' · 保存时将转为 PNG' }}
        </span>
        <div class="img-footer-zoom" title="缩放画布（5% - 800%）">
          <UiIconButton
            size="sm"
            icon="fas fa-search-minus"
            title="缩小"
            aria-label="缩小"
            @click="zoomOut"
          />
          <UiSlider
            class="img-zoom-slider"
            :model-value="Math.round(zoomScale * 100)"
            :min="5"
            :max="800"
            :step="5"
            :show-value="false"
            size="sm"
            aria-label="缩放比例"
            @update:model-value="zoomTo($event / 100)"
          />
          <UiIconButton
            size="sm"
            icon="fas fa-search-plus"
            title="放大"
            aria-label="放大"
            @click="zoomIn"
          />
          <UiButton
            size="sm"
            variant="text"
            class="img-zoom-value"
            title="点击恢复 100%"
            @click="zoomReset"
          >
            {{ Math.round(zoomScale * 100) }}%
          </UiButton>
          <UiIconButton
            size="sm"
            icon="fas fa-expand"
            title="适配窗口"
            aria-label="适配窗口"
            @click="zoomFit"
          />
        </div>
        <span class="img-footer-hint">拖动四边/四角调整画布 · Ctrl+滚轮 / Ctrl+± 缩放 · 空格拖拽平移</span>
      </div>
    </template>
  </ToolWorkspaceShell>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { UiButton, UiEmptyState, UiIconButton, UiSlider } from '@/ui'
import { useDialog } from '../../../composables/useDialog.js'
import { useToast } from '../../../composables/useToast.js'
import ToolWorkspaceShell from '../shared/ToolWorkspaceShell.vue'
import { useToolFile } from '../shared/useToolFile.js'
import { useImageCanvas } from './useImageCanvas.js'
import ImageHeaderBar from './components/ImageHeaderBar.vue'
import ImageToolbar from './components/ImageToolbar.vue'
import ImageCanvasStage from './components/ImageCanvasStage.vue'

const emit = defineEmits(['back', 'dirty-change', 'sendImage'])

const dialog = useDialog()
const toast = useToast()

const dirty = ref(false)
const currentName = ref('')
const isDragOver = ref(false)

const {
  savedName,
  savedPath,
  saving,
  setSavedMeta,
  resetMeta,
  saveBase64File
} = useToolFile({
  defaultName: '未命名.png',
  dirtyRef: dirty,
  onDirtyChange: (v) => emit('dirty-change', v)
})

const {
  canvasEl,
  wrapEl,
  textRef,
  tool,
  color,
  size,
  loading,
  loadError,
  canUndo,
  canRedo,
  textDraft,
  textBoxLeft,
  textBoxTop,
  fontSize,
  width,
  height,
  mime,
  zoomScale,
  canvasReady,
  canvasStyleW,
  canvasStyleH,
  isPanning,
  isSpacePressed,
  isDrawing,
  hasCanvas,
  initLayers,
  onWheel,
  zoomTo,
  zoomIn,
  zoomOut,
  zoomReset,
  zoomFit,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  cancelText,
  commitText,
  undo,
  redo,
  clearCanvas,
  resizePreview,
  startResize,
  cancelResize,
  rotate90CW,
  rotate90CCW,
  flipHorizontal,
  flipVertical,
  loadImageData,
  flatten
} = useImageCanvas({ dialog, dirty, currentName, saving })

async function openImage() {
  const r = await window.api.selectImage()
  if (!r || !r.success) return
  setSavedMeta({ name: r.name || '', path: r.path || '' })
  const ok = await loadImageData(r.data, r.mime, r.name)
  if (ok) dirty.value = false
}

async function newCanvas() {
  if (dirty.value) {
    const ok = await dialog.confirm('当前有未保存的绘制，确定新建并丢弃？')
    if (!ok) return
  }
  resetMeta('未命名.png')
  loadImageData(null, 'image/png', '未命名.png', 800, 600)
}

async function save() {
  if (saving.value) return
  if (!canvasReady.value || !hasCanvas()) {
    toast.showToast('还没有可保存的画面：请先打开图片或新建画布', 'info', 2000)
    return
  }
  if (!dirty.value && savedPath.value) {
    toast.showToast('没有需要保存的改动', 'info', 1800)
    return
  }
  const { base64, mime: outMime, name } = flatten()
  await saveBase64File({
    base64,
    name,
    mime: outMime,
    onSuccess: (r) => {
      dirty.value = false
      if (r && r.path) currentName.value = r.path.split(/[\\/]/).pop()
    }
  })
}

async function sendToChat() {
  if (loading.value) return
  if (!canvasReady.value) {
    await dialog.alert('请先打开图片或新建画布，再进行发送')
    return
  }
  const f = flatten()
  emit('sendImage', { data: f.base64, mime: f.mime, name: f.name })
}

async function imageOpen(base64Data, imgMime, name) {
  if (dirty.value) {
    const ok = await dialog.confirm('当前有未保存的绘制，确定丢弃并载入新图片？')
    if (!ok) return false
  }
  resetMeta(name || '未命名.png')
  saving.value = false
  loadImageData(base64Data, imgMime, name)
  return true
}

function onResizeStart({ handle, event }) {
  startResize(handle, event)
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const commaIdx = dataUrl.indexOf(',')
      const base64 = dataUrl.slice(commaIdx + 1)
      const mime = file.type || 'image/png'
      resolve({ base64, mime, name: file.name })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function onDragOver(e) {
  if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
    isDragOver.value = true
  }
}

function onDragLeave() {
  isDragOver.value = false
}

async function onDrop(e) {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const file = files[0]
  if (!file.type.startsWith('image/')) {
    toast.showToast('请拖入有效的图片文件', 'warning', 2000)
    return
  }
  try {
    const { base64, mime: fileMime, name } = await readFileAsBase64(file)
    await imageOpen(base64, fileMime, name)
  } catch (err) {
    toast.showToast('载入图片失败: ' + (err?.message || err), 'danger', 2500)
  }
}

async function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        try {
          const { base64, mime: fileMime } = await readFileAsBase64(file)
          const name = '剪贴板图片_' + new Date().toLocaleTimeString().replace(/:/g, '') + '.png'
          await imageOpen(base64, fileMime, name)
          toast.showToast('已从剪贴板粘贴图片', 'info', 1800)
        } catch (err) {
          toast.showToast('粘贴图片失败', 'danger', 2000)
        }
        break
      }
    }
  }
}

function onKeydown(e) {
  const activeEl = document.activeElement
  const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)

  // 拖拽调整画布尺寸时，Esc 取消本次拖拽
  if (e.key === 'Escape' && resizePreview.value) {
    e.preventDefault()
    cancelResize()
    return
  }

  // 全局快捷键
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    openImage()
    return
  }

  // 撤销 / 重做快捷键
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) {
      if (!isDrawing() && canvasReady.value && canRedo.value) redo()
    } else {
      if (!isDrawing() && canvasReady.value && canUndo.value) undo()
    }
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    if (!isDrawing() && canvasReady.value && canRedo.value) redo()
    return
  }

  // 画布缩放快捷键：Ctrl+= 放大、Ctrl+- 缩小、Ctrl+0 复位
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_' || e.key === '0')) {
    e.preventDefault()
    if (!canvasReady.value) return
    if (e.key === '0') zoomReset()
    else if (e.key === '-' || e.key === '_') zoomOut()
    else zoomIn()
    return
  }

  // 绘图工具单键热键（非输入焦点时有效）
  if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = e.key.toLowerCase()
    const toolMap = {
      b: 'brush',
      e: 'eraser',
      l: 'line',
      a: 'arrow',
      r: 'rect',
      o: 'ellipse',
      m: 'mosaic',
      t: 'text'
    }
    if (toolMap[k]) {
      e.preventDefault()
      tool.value = toolMap[k]
    }
  }
}

onMounted(() => {
  emit('dirty-change', false)
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('paste', onPaste)
  document.addEventListener('wheel', onWheel, { capture: true, passive: false })
  initLayers()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('wheel', onWheel, true)
})

defineExpose({ save, imageOpen })
</script>

<style scoped src="./image-tool.css"></style>
