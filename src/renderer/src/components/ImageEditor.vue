<template>
  <div class="img-editor">
    <div class="img-toolbar">
      <button
        v-for="t in tools"
        :key="t.id"
        class="img-tool-btn"
        :class="{ active: tool === t.id }"
        :title="t.title"
        @click="tool = t.id"
      ><i :class="t.icon"></i></button>
      <div class="img-tool-sep"></div>
      <label class="img-color-label" title="画笔颜色">
        <input type="color" v-model="color" />
      </label>
      <div class="img-brush-size" title="画笔粗细">
        <i class="fas fa-circle img-size-icon" :style="{ fontSize: Math.max(6, size) + 'px' }"></i>
        <input type="range" v-model.number="size" min="1" max="50" step="1" />
        <span class="img-size-val">{{ size }}</span>
      </div>
      <div class="img-tool-sep"></div>
      <button class="img-tool-btn" title="撤销" :disabled="!canUndo" @click="undo"><i class="fas fa-undo"></i></button>
      <button class="img-tool-btn" title="清除本次绘制" @click="clearCanvas"><i class="fas fa-trash"></i></button>
    </div>

    <div class="img-canvas-wrap">
      <canvas
        ref="canvasEl"
        class="img-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      ></canvas>
      <div v-if="loading" class="img-overlay"><i class="fas fa-spinner fa-spin"></i> 加载中…</div>
      <div v-if="loadError" class="img-overlay img-overlay-error">
        <i class="fas fa-exclamation-triangle"></i> {{ loadError }}
      </div>
    </div>

    <div class="img-footer">
      <span class="img-meta">{{ relPath }} · {{ width }} × {{ height }}px{{ mime === 'image/jpeg' ? ' · JPEG' : mime === 'image/png' ? '' : ' · 保存时将转为 PNG' }}</span>
      <button class="md-save-btn" :disabled="!dirty || !!loadError" @click="save"><i class="fas fa-save"></i> 保存</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  workspace: { type: String, required: true },
  relPath: { type: String, required: true }
})

const emit = defineEmits(['saved'])

const tools = [
  { id: 'brush', title: '画笔', icon: 'fas fa-pen' },
  { id: 'eraser', title: '橡皮（只擦除本次绘制）', icon: 'fas fa-eraser' },
  { id: 'line', title: '直线', icon: 'fas fa-minus' },
  { id: 'rect', title: '矩形', icon: 'fas fa-square' },
  { id: 'ellipse', title: '椭圆', icon: 'fas fa-circle' }
]

const MAX_EDIT_DIM = 2048 // 超过该尺寸的图片拒绝编辑，防内存爆炸
const UNDO_DEPTH = 10

const canvasEl = ref(null)
const tool = ref('brush')
const color = ref('#ff0000')
const size = ref(4)
const loading = ref(true)
const loadError = ref('')
const dirty = ref(false)
// 未保存状态上报给父组件（切换文件时统一提示）
watch(dirty, (v) => emit('dirty', v))
const canUndo = ref(false)
const width = ref(0)
const height = ref(0)
const mime = ref('image/png')

let displayCanvas = null // 显示用：底图 + 绘制层合成
let displayCtx = null
let baseCanvas = null // 原始图片层（橡皮不触碰）
let editCanvas = null // 本次绘制层（橡皮只擦这一层）
let editCtx = null
const undoStack = []
let drawing = false
let startPos = { x: 0, y: 0 }
let lastPos = { x: 0, y: 0 }

function getPos(e) {
  const rect = displayCanvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (displayCanvas.width / rect.width),
    y: (e.clientY - rect.top) * (displayCanvas.height / rect.height)
  }
}

function render() {
  displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
  displayCtx.drawImage(baseCanvas, 0, 0)
  displayCtx.drawImage(editCanvas, 0, 0)
}

function pushUndo() {
  undoStack.push(editCtx.getImageData(0, 0, editCanvas.width, editCanvas.height))
  if (undoStack.length > UNDO_DEPTH) undoStack.shift()
  canUndo.value = undoStack.length > 0
}

function drawShape(p0, p1) {
  editCtx.strokeStyle = color.value
  editCtx.lineWidth = size.value
  editCtx.lineCap = 'round'
  if (tool.value === 'line') {
    editCtx.beginPath()
    editCtx.moveTo(p0.x, p0.y)
    editCtx.lineTo(p1.x, p1.y)
    editCtx.stroke()
  } else if (tool.value === 'rect') {
    editCtx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y))
  } else if (tool.value === 'ellipse') {
    editCtx.beginPath()
    editCtx.ellipse((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, Math.abs(p1.x - p0.x) / 2, Math.abs(p1.y - p0.y) / 2, 0, 0, Math.PI * 2)
    editCtx.stroke()
  }
}

function onPointerDown(e) {
  if (loading.value || loadError.value) return
  e.preventDefault()
  displayCanvas.setPointerCapture(e.pointerId)
  drawing = true
  startPos = getPos(e)
  lastPos = startPos
  pushUndo()
  dirty.value = true
  // 绘制层上操作：橡皮用 destination-out 只擦编辑层
  editCtx.globalCompositeOperation = tool.value === 'eraser' ? 'destination-out' : 'source-over'
  editCtx.lineCap = 'round'
  editCtx.lineJoin = 'round'
  if (tool.value === 'brush' || tool.value === 'eraser') {
    editCtx.strokeStyle = color.value
    editCtx.lineWidth = size.value
    editCtx.beginPath()
    editCtx.moveTo(startPos.x, startPos.y)
  }
}

function onPointerMove(e) {
  if (!drawing) return
  e.preventDefault()
  const pos = getPos(e)
  if (tool.value === 'brush' || tool.value === 'eraser') {
    editCtx.lineTo(pos.x, pos.y)
    editCtx.stroke()
  } else {
    // 形状预览：恢复操作前快照再绘制
    const snap = undoStack[undoStack.length - 1]
    if (snap) editCtx.putImageData(snap, 0, 0)
    drawShape(startPos, pos)
  }
  render()
  lastPos = pos
}

function onPointerUp(e) {
  if (!drawing) return
  drawing = false
  editCtx.globalCompositeOperation = 'source-over'
  try { displayCanvas.releasePointerCapture(e.pointerId) } catch {}
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}

function undo() {
  const snap = undoStack.pop()
  if (!snap) return
  editCtx.putImageData(snap, 0, 0)
  canUndo.value = undoStack.length > 0
  dirty.value = true
  render()
}

function clearCanvas() {
  if (!editCanvas) return
  if (!confirm('确定清除本次绘制的所有内容？（原图不受影响）')) return
  pushUndo()
  editCtx.globalCompositeOperation = 'destination-out'
  editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height)
  editCtx.globalCompositeOperation = 'source-over'
  dirty.value = true
  render()
}

async function save() {
  if (!dirty.value || !displayCanvas) return
  const isJpeg = mime.value === 'image/jpeg'
  const isPng = mime.value === 'image/png'
  // 合成：白色底（仅 JPEG 需要）→ 底图 → 本次绘制
  const out = document.createElement('canvas')
  out.width = displayCanvas.width
  out.height = displayCanvas.height
  const octx = out.getContext('2d')
  if (isJpeg) {
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, out.width, out.height)
  }
  octx.drawImage(baseCanvas, 0, 0)
  octx.drawImage(editCanvas, 0, 0)
  const dataUrl = out.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.92 : undefined)
  const base64 = dataUrl.split(',')[1]

  let target = props.relPath
  let converted = false
  if (!isJpeg && !isPng) {
    // gif/webp/bmp/ico/svg 不支持直接写回，另存为 PNG
    target = props.relPath.replace(/\.[^.]+$/, '-edit.png')
    converted = true
  }

  const r = await window.api.toolSaveImage(props.workspace, target, base64)
  if (!r.success) {
    alert('保存失败：' + r.error)
    return
  }
  dirty.value = false
  emit('dirty', false)
  if (converted) alert(`原格式不支持直接保存，已另存为 ${target}`)
  emit('saved', converted ? target : props.relPath)
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  emit('dirty', false)
  displayCanvas = canvasEl.value
  displayCtx = displayCanvas.getContext('2d')
  baseCanvas = document.createElement('canvas')
  editCanvas = document.createElement('canvas')
  editCtx = editCanvas.getContext('2d')
  try {
    const r = await window.api.toolReadImageFile(props.workspace, props.relPath)
    if (!r.success) {
      loadError.value = r.error || '读取失败'
      return
    }
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth > MAX_EDIT_DIM || img.naturalHeight > MAX_EDIT_DIM) {
        loadError.value = `图片过大（${img.naturalWidth}×${img.naturalHeight}），暂不支持编辑`
        loading.value = false
        return
      }
      mime.value = r.mime
      width.value = img.naturalWidth
      height.value = img.naturalHeight
      const w = img.naturalWidth
      const h = img.naturalHeight
      displayCanvas.width = w
      displayCanvas.height = h
      baseCanvas.width = w
      baseCanvas.height = h
      editCanvas.width = w
      editCanvas.height = h
      baseCanvas.getContext('2d').drawImage(img, 0, 0)
      pushUndo()
      render()
      loading.value = false
    }
    img.onerror = () => {
      loadError.value = '图片解析失败'
      loading.value = false
    }
    img.src = `data:${r.mime};base64,${r.data}`
  } catch (e) {
    loadError.value = e.message || '读取失败'
    loading.value = false
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({ save })
</script>
