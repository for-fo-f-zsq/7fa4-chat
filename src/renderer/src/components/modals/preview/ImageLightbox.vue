<template>
  <div
    v-show="shown"
    ref="overlayEl"
    class="preview-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="图片预览"
    tabindex="-1"
  >
    <div ref="stageEl" class="image-stage" @mousedown.self="emit('requestClose')" @wheel.prevent="onWheel">
      <img
        ref="imgEl"
        :src="src"
        alt="图片预览"
        class="preview-image-zoom"
        :class="{ 'is-dragging': !!dragging }"
        :style="imgStyle"
        draggable="false"
        @mousedown="onPanStart"
        @dblclick="toggleZoom"
      />
    </div>
    <div class="image-toolbar motion-fade-up-in">
      <UiIconButton variant="overlay" round icon="fas fa-search-minus" aria-label="缩小" title="缩小" :disabled="scale <= MIN_SCALE" @click="zoomStep(-0.25)" />
      <span class="image-zoom-label u-tabular-nums">{{ Math.round(scale * 100) }}%</span>
      <UiIconButton variant="overlay" round icon="fas fa-search-plus" aria-label="放大" title="放大" :disabled="scale >= MAX_SCALE" @click="zoomStep(0.25)" />
      <span class="image-toolbar-sep" aria-hidden="true"></span>
      <UiIconButton variant="overlay" round icon="fas fa-redo-alt" aria-label="旋转 90°" title="旋转 90°" @click="rotateStep" />
      <span class="image-toolbar-sep" aria-hidden="true"></span>
      <UiIconButton variant="overlay" round icon="fas fa-expand-arrows-alt" aria-label="重置视图" title="重置视图" @click="resetView" />
      <span class="image-toolbar-sep" aria-hidden="true"></span>
      <UiIconButton
        variant="overlay"
        round
        :icon="downloading ? 'fas fa-spinner fa-spin' : 'fas fa-download'"
        aria-label="下载"
        title="下载"
        :disabled="downloading"
        @click="emit('download')"
      />
      <template v-if="showEdit">
        <span class="image-toolbar-sep" aria-hidden="true"></span>
        <UiIconButton variant="overlay" round icon="fas fa-edit" aria-label="用图片编辑器打开" title="用图片编辑器打开" @click="emit('edit')" />
      </template>
      <span class="image-toolbar-sep" aria-hidden="true"></span>
      <UiIconButton variant="overlay" round class="preview-close" icon="fas fa-times" aria-label="关闭" title="关闭" @click="emit('requestClose')" />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { UiIconButton } from '@/ui'

const props = defineProps({
  src: { type: String, default: '' },
  shown: { type: Boolean, default: true },
  downloading: { type: Boolean, default: false },
  showEdit: { type: Boolean, default: true },
})

const emit = defineEmits(['requestClose', 'download', 'edit'])

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const scale = ref(1)
const rot = ref(0)
const panX = ref(0)
const panY = ref(0)
const overlayEl = ref(null)
const stageEl = ref(null)
const imgEl = ref(null)
const dragging = ref(null)
let restoreEl = null

const imgStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) rotate(${rot.value}deg) scale(${scale.value})`,
  cursor: dragging.value ? 'grabbing' : scale.value > 1 ? 'grab' : 'zoom-in',
}))

function clampPan() {
  const stage = stageEl.value
  const img = imgEl.value
  if (!stage || !img) return
  const rotated = rot.value % 180 !== 0
  const visualW = (rotated ? img.clientHeight : img.clientWidth) * scale.value
  const visualH = (rotated ? img.clientWidth : img.clientHeight) * scale.value
  const cs = getComputedStyle(stage)
  const availW = Math.max(0, stage.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0))
  const availH = Math.max(0, stage.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0))
  const maxX = Math.max(0, (visualW - availW) / 2 + 40)
  const maxY = Math.max(0, (visualH - availH) / 2 + 40)
  panX.value = Math.max(-maxX, Math.min(maxX, panX.value))
  panY.value = Math.max(-maxY, Math.min(maxY, panY.value))
}

function zoomStep(delta) {
  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round((scale.value + delta) * 100) / 100))
  clampPan()
}

function rotateStep() {
  rot.value = (rot.value + 90) % 360
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
  dragging.value = { x: e.clientX - panX.value, y: e.clientY - panY.value }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', onPanEnd)
  document.body.style.userSelect = 'none'
}

function onPanMove(e) {
  if (!dragging.value) return
  panX.value = e.clientX - dragging.value.x
  panY.value = e.clientY - dragging.value.y
  clampPan()
}

function onPanEnd() {
  dragging.value = null
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

function toggleZoom() {
  if (scale.value !== 1) {
    resetView()
  } else {
    scale.value = 2
    clampPan()
  }
}

function onKeydown(e) {
  if (!props.shown) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('requestClose')
    return
  }
  if (e.key !== 'Tab' || !overlayEl.value) return
  const focusables = Array.from(overlayEl.value.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter((el) => el.getClientRects().length > 0)
  if (!focusables.length) {
    e.preventDefault()
    overlayEl.value.focus({ preventScroll: true })
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (!overlayEl.value.contains(active)) {
    e.preventDefault()
    first.focus({ preventScroll: true })
  } else if (e.shiftKey && (active === first || active === overlayEl.value)) {
    e.preventDefault()
    last.focus({ preventScroll: true })
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus({ preventScroll: true })
  }
}

function focusOnOpen() {
  restoreEl = document.activeElement
  nextTick(() => {
    const closeBtn = overlayEl.value?.querySelector('.preview-close')
    ;(closeBtn || overlayEl.value)?.focus({ preventScroll: true })
  })
}

watch(() => props.src, resetView)
watch(() => props.shown, (open) => {
  if (open) focusOnOpen()
  else if (restoreEl && document.contains(restoreEl) && typeof restoreEl.focus === 'function') {
    restoreEl.focus({ preventScroll: true })
    restoreEl = null
  }
})
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (props.shown) focusOnOpen()
})
onUnmounted(() => {
  onPanEnd()
  window.removeEventListener('keydown', onKeydown)
  if (restoreEl && document.contains(restoreEl) && typeof restoreEl.focus === 'function') {
    restoreEl.focus({ preventScroll: true })
  }
  restoreEl = null
})
</script>
