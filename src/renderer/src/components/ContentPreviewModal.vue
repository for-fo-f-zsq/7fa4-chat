<template>
  <!-- 图片预览：纯黑遮罩 + 图片，支持滚轮/按钮缩放 + 按住拖动平移 -->
  <div v-if="type === 'image'" class="preview-overlay preview-overlay-image">
    <div class="image-stage" ref="stageEl" @mousedown.self="$emit('close')" @wheel.prevent="onWheel">
      <img
        :src="src" class="preview-image-zoom" ref="imgEl"
        :style="imgStyle"
        draggable="false"
        @mousedown="onPanStart"
      />
    </div>
    <div class="image-toolbar">
      <button title="缩小" @click="zoomStep(-0.25)"><i class="fas fa-search-minus"></i></button>
      <span class="image-zoom-label">{{ Math.round(scale * 100) }}%</span>
      <button title="放大" @click="zoomStep(0.25)"><i class="fas fa-search-plus"></i></button>
      <span class="image-toolbar-sep"></span>
      <button title="旋转 90°" @click="rot = (rot + 90) % 360"><i class="fas fa-redo-alt"></i></button>
      <span class="image-toolbar-sep"></span>
      <button title="重置视图" @click="resetView"><i class="fas fa-expand-arrows-alt"></i></button>
      <span class="image-toolbar-sep"></span>
      <button title="用图片编辑器打开" @click="$emit('edit')"><i class="fas fa-edit"></i></button>
      <span class="image-toolbar-sep"></span>
      <button class="preview-close" title="关闭" @click="$emit('close')"><i class="fas fa-times"></i></button>
    </div>
  </div>
  <div v-else class="preview-overlay" @click.self="$emit('close')">
    <div class="preview-modal">
      <div class="preview-header">
        <span class="preview-title">{{ title }}</span>
        <div class="preview-header-actions">
          <button v-if="showActions" class="preview-action-btn" title="复制" @click="$emit('copy')"><i class="fas fa-copy"></i></button>
          <button v-if="showActions" class="preview-action-btn" title="转发" @click="$emit('forward')"><i class="fas fa-share"></i></button>
          <button v-if="canDownload" class="preview-action-btn" title="下载" @click="$emit('download')"><i class="fas fa-download"></i></button>
          <button class="preview-close" @click="$emit('close')"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="preview-body" @click="onBodyClick">
        <pre v-if="type === 'text'" class="preview-text">{{ text }}</pre>
        <div v-else-if="type === 'html'" class="preview-html" v-html="text"></div>
        <iframe v-else-if="type === 'pdf'" :src="src" class="preview-pdf" title="PDF 预览"></iframe>
        <div v-else class="preview-error">无法解析为图片或文字</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { parseMsgContent } from '../utils.js'

const props = defineProps({
  type: String,
  title: String,
  src: String,
  text: String,
  rawContent: { type: String, default: '' },
  showActions: { type: Boolean, default: false }
})

defineEmits(['close', 'copy', 'forward', 'download', 'edit'])

const canDownload = computed(() => {
  if (!props.showActions || !props.rawContent) return false
  const obj = parseMsgContent(props.rawContent)
  return obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data
})

// ---- 图片预览：缩放 + 平移 ----
const MIN_SCALE = 1
const MAX_SCALE = 8
const scale = ref(1)
const rot = ref(0)
const panX = ref(0)
const panY = ref(0)
const stageEl = ref(null)
const imgEl = ref(null)
let dragging = null

// 动画过渡仅在非拖动时开启
const imgStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) rotate(${rot.value}deg) scale(${scale.value})`,
  cursor: scale.value > 1 ? 'grab' : 'zoom-in',
  transition: dragging ? 'none' : 'transform 0.12s ease-out',
}))

function clampPan() {
  const stage = stageEl.value
  if (!stage) return
  // 平移越界软钳制：以缩放后的画面大小减视口为界（多留 40px 余量便于拖回）
  const sw = stage.clientWidth
  const sh = stage.clientHeight
  const img = imgEl.value
  if (!img) return
  const iw = img.clientWidth
  const ih = img.clientHeight
  const maxX = Math.max(0, (iw * scale.value - sw) / 2 + 40)
  const maxY = Math.max(0, (ih * scale.value - sh) / 2 + 40)
  panX.value = Math.max(-maxX, Math.min(maxX, panX.value))
  panY.value = Math.max(-maxY, Math.min(maxY, panY.value))
}

function zoomStep(delta) {
  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round((scale.value + delta) * 100) / 100))
  clampPan()
}

function onWheel(e) {
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * factor))
  clampPan()
}

function onPanStart(e) {
  if (e.button !== 0) return
  e.preventDefault()
  dragging = { x: e.clientX - panX.value, y: e.clientY - panY.value }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', onPanEnd)
  document.body.style.userSelect = 'none'
}

function onPanMove(e) {
  if (!dragging) return
  panX.value = e.clientX - dragging.x
  panY.value = e.clientY - dragging.y
  clampPan()
}

function onPanEnd() {
  dragging = null
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
  document.body.style.userSelect = ''
}

function resetView() {
  scale.value = 1
  rot.value = 0
  panX.value = 0
  panY.value = 0
}

// 切换预览内容时复位视图
watch(() => [props.type, props.src], () => resetView())

function onBodyClick(e) {
  const a = e.target.closest('a[href]')
  if (a) {
    e.preventDefault()
    e.stopPropagation()
    window.api.openExternal(a.href)
  }
}
</script>
