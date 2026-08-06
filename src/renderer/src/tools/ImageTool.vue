<template>
  <div class="md-tool">
    <div class="md-tool-header">
      <div class="md-tool-title">
        <button class="md-back-btn" title="返回工具列表" @click="onBack"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-paint-brush"></i> 工具
        <span class="md-tool-sep">/</span>
        图片编辑
      </div>
      <div class="md-workspace-bar">
        <i class="fas fa-image"></i>
        <span class="md-workspace-path" :title="currentName || '未打开图片'">{{ currentName || '未打开图片' }}</span>
        <button class="md-ws-btn" title="打开图片" @click="openImage"><i class="fas fa-folder-open"></i> 打开图片</button>
        <button class="md-ws-btn" title="新建空白画布" @click="newCanvas"><i class="fas fa-square-plus"></i> 新建画布</button>
        <button class="md-ws-btn" title="保存到文件" :disabled="!canvasReady || saving" @click="save"><i class="fas fa-save"></i> 保存</button>
      </div>
    </div>

    <div class="md-tool-body">
      <div v-if="!canvasReady" class="img-tool-empty">
        <i class="fas fa-image" style="font-size: 40px; opacity: 0.4;"></i>
        <span>打开一张图片进行编辑，或新建空白画布涂鸦</span>
        <button @click="openImage">打开图片</button>
      </div>
      <div v-else class="img-editor">
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
          <button class="img-tool-btn" title="撤销 (Ctrl+Z)" :disabled="!canUndo" @click="undo"><i class="fas fa-undo"></i></button>
          <button class="img-tool-btn" title="清除本次绘制" @click="clearCanvas"><i class="fas fa-trash"></i></button>
          <div class="img-tool-sep"></div>
          <div class="img-resize" title="调整画布尺寸（宽 × 高）">
            <i class="fas fa-expand-arrows-alt"></i>
            <input type="number" v-model.number="resizeW" min="1" :max="MAX_EDIT_SIDE" class="img-resize-input" />
            <span class="img-resize-x">×</span>
            <input type="number" v-model.number="resizeH" min="1" :max="MAX_EDIT_SIDE" class="img-resize-input" />
            <button class="img-resize-btn" title="应用新尺寸（原图内容保留在左上角）" @click="resizeCanvas">应用</button>
          </div>
          <div class="img-tool-sep"></div>
          <div class="img-zoom" title="缩放画布（Ctrl+滚轮也可）">
            <button class="img-zoom-btn" title="缩小" @click="zoomOut"><i class="fas fa-search-minus"></i></button>
            <button class="img-zoom-pct" title="重置为 100%" @click="zoomReset">{{ Math.round(zoomScale * 100) }}%</button>
            <button class="img-zoom-btn" title="放大" @click="zoomIn"><i class="fas fa-search-plus"></i></button>
            <button class="img-zoom-btn" title="适配窗口" @click="zoomFit"><i class="fas fa-expand"></i></button>
          </div>
        </div>
        <div ref="wrapEl" class="img-canvas-wrap">
          <canvas
            ref="canvasEl"
            class="img-canvas"
            :style="{ width: canvasStyleW + 'px', height: canvasStyleH + 'px' }"
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
          <span class="img-meta">{{ currentName || '未命名' }} · {{ width }} × {{ height }}px{{ mime === 'image/jpeg' ? ' · JPEG' : mime === 'image/png' ? '' : ' · 保存时将转为 PNG' }}</span>
          <button class="md-save-btn" :disabled="!dirty || !!loadError" @click="save"><i class="fas fa-save"></i> 保存</button>
        </div>
      </div>
    </div>
  </div>
  <SaveConfirmModal
    v-model:visible="saveConfirmVisible"
    title="未保存的绘制"
    message="当前画布有未保存的修改，是否保存后再离开？"
    @save="onSaveThenLeave"
    @discard="leaveNow"
  />
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import SaveConfirmModal from '../components/SaveConfirmModal.vue'
import './ide/ide-tool.css'

const emit = defineEmits(['back', 'dirty-change'])

const tools = [
  { id: 'brush', title: '画笔', icon: 'fas fa-pen' },
  { id: 'eraser', title: '橡皮（只擦除本次绘制）', icon: 'fas fa-eraser' },
  { id: 'line', title: '直线', icon: 'fas fa-minus' },
  { id: 'rect', title: '矩形', icon: 'fas fa-square' },
  { id: 'ellipse', title: '椭圆', icon: 'fas fa-circle' }
]

const MAX_EDIT_PIXELS = 20 * 1024 * 1024
const MAX_EDIT_SIDE = 20000

const canvasEl = ref(null)
const wrapEl = ref(null)
const tool = ref('brush')
const color = ref('#ff0000')
const size = ref(4)
const loading = ref(false)
const loadError = ref('')
const dirty = ref(false)
const canUndo = ref(false)
const width = ref(0)
const height = ref(0)
const resizeW = ref(0)
const resizeH = ref(0)
const mime = ref('image/png')
const zoomScale = ref(1)
const currentName = ref('')
const saving = ref(false)
const saveConfirmVisible = ref(false)

// dirty 变化上报父级（用于切换页面/工具时的未保存拦截）
watch(dirty, (v) => emit('dirty-change', v))

// 返回工具列表：未保存时先弹保存确认
function onBack() {
  if (dirty.value) {
    saveConfirmVisible.value = true
    return
  }
  emit('back')
}

async function onSaveThenLeave() {
  saveConfirmVisible.value = false
  await save()
  if (!dirty.value) emit('back')
}

function leaveNow() {
  saveConfirmVisible.value = false
  emit('back')
}

const canvasReady = computed(() => width.value > 0 && height.value > 0)
const canvasStyleW = computed(() => Math.round(width.value * zoomScale.value))
const canvasStyleH = computed(() => Math.round(height.value * zoomScale.value))

let displayCanvas = null
let displayCtx = null
let baseCanvas = null
let editCanvas = null
let editCtx = null
const undoStack = []
let undoDepth = 10
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

function onWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  const f = e.deltaY < 0 ? 1.1 : 0.9
  zoomScale.value = Math.max(0.2, Math.min(4, zoomScale.value * f))
}

function zoomIn() {
  zoomScale.value = Math.max(0.2, Math.min(4, Math.round(zoomScale.value * 1.25 * 100) / 100))
}

function zoomOut() {
  zoomScale.value = Math.max(0.2, Math.min(4, Math.round(zoomScale.value / 1.25 * 100) / 100))
}

function zoomReset() {
  zoomScale.value = 1
}

function zoomFit() {
  const wrap = wrapEl.value
  if (!wrap || !canvasReady.value) { zoomScale.value = 1; return }
  const cw = wrap.clientWidth || 800
  const ch = wrap.clientHeight || 600
  zoomScale.value = Math.max(0.1, Math.min(cw / width.value, ch / height.value, 1))
}

function render() {
  displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
  displayCtx.drawImage(baseCanvas, 0, 0)
  displayCtx.drawImage(editCanvas, 0, 0)
}

function pushUndo() {
  undoStack.push(editCtx.getImageData(0, 0, editCanvas.width, editCanvas.height))
  if (undoStack.length > undoDepth) undoStack.shift()
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
  if (loading.value || loadError.value || !canvasReady.value) return
  e.preventDefault()
  displayCanvas.setPointerCapture(e.pointerId)
  drawing = true
  startPos = getPos(e)
  lastPos = startPos
  pushUndo()
  dirty.value = true
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
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (!drawing && canvasReady.value && canUndo.value) undo()
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

function resizeCanvas() {
  const nw = Math.round(resizeW.value)
  const nh = Math.round(resizeH.value)
  if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw < 1 || nh < 1) {
    alert('请输入有效的宽度和高度')
    return
  }
  if (nw > MAX_EDIT_SIDE || nh > MAX_EDIT_SIDE || nw * nh > MAX_EDIT_PIXELS) {
    alert(`尺寸过大：单边不超过 ${MAX_EDIT_SIDE}px，像素总数不超过 ${MAX_EDIT_PIXELS / 1e6}MP`)
    return
  }
  if (nw === width.value && nh === height.value) return
  if (!baseCanvas || !editCanvas) return
  // 新画布（原内容保留在左上角，超出部分裁剪；透明区域保持透明）
  const nb = document.createElement('canvas')
  nb.width = nw
  nb.height = nh
  nb.getContext('2d').drawImage(baseCanvas, 0, 0)
  const ne = document.createElement('canvas')
  ne.width = nw
  ne.height = nh
  ne.getContext('2d').drawImage(editCanvas, 0, 0)
  baseCanvas = nb
  editCanvas = ne
  editCtx = ne.getContext('2d')
  displayCanvas.width = nw
  displayCanvas.height = nh
  width.value = nw
  height.value = nh
  // 旧撤销快照尺寸与画布不一致，清空重记（resize 本身不可撤销）
  undoStack.length = 0
  canUndo.value = false
  pushUndo()
  dirty.value = true
  render()
}

async function openImage() {
  const r = await window.api.selectImage()
  if (!r.success) return
  loadImageData(r.data, r.mime, r.name)
}

function newCanvas() {
  if (dirty.value && !confirm('当前有未保存的绘制，确定新建并丢弃？')) return
  // 空白画布：透明背景
  loadImageData(null, 'image/png', '未命名.png', 800, 600)
}

function loadImageData(base64Data, imgMime, name, blankW = 0, blankH = 0) {
  loading.value = true
  loadError.value = ''
  const img = new Image()
  img.onload = async () => {
    const pixels = img.naturalWidth * img.naturalHeight
    if (pixels > MAX_EDIT_PIXELS || img.naturalWidth > MAX_EDIT_SIDE || img.naturalHeight > MAX_EDIT_SIDE) {
      loadError.value = `图片过大（${img.naturalWidth}×${img.naturalHeight}），暂不支持编辑`
      loading.value = false
      return
    }
    // 撤销深度：按像素分级，相比旧版整体提高（旧 10/5/3 → 30/15/8/5），内存峰值约 240-400MB
    undoDepth = pixels > 12e6 ? 5 : pixels > 4e6 ? 8 : pixels > 1e6 ? 15 : 30
    mime.value = imgMime
    currentName.value = name
    width.value = img.naturalWidth
    height.value = img.naturalHeight
    resizeW.value = img.naturalWidth
    resizeH.value = img.naturalHeight
    const w = img.naturalWidth
    const h = img.naturalHeight
    // 等待画布挂载后再初始化
    await nextTick()
    displayCanvas = canvasEl.value
    displayCtx = displayCanvas?.getContext('2d')
    if (!displayCanvas) { loadError.value = '画布初始化失败'; loading.value = false; return }
    displayCanvas.width = w
    displayCanvas.height = h
    baseCanvas.width = w
    baseCanvas.height = h
    editCanvas.width = w
    editCanvas.height = h
    if (imgMime === 'image/jpeg') {
      const bctx = baseCanvas.getContext('2d')
      bctx.fillStyle = '#ffffff'
      bctx.fillRect(0, 0, w, h)
    }
    baseCanvas.getContext('2d').drawImage(img, 0, 0)
    const wrap = wrapEl.value
    if (wrap) {
      const cw = wrap.clientWidth || 800
      const ch = wrap.clientHeight || 600
      zoomScale.value = Math.max(0.1, Math.min(cw / w, ch / h, 1))
    }
    pushUndo()
    render()
    loading.value = false
  }
  img.onerror = () => {
    loadError.value = '图片解析失败'
    loading.value = false
  }
  if (blankW > 0 && blankH > 0) {
    const tmp = document.createElement('canvas')
    tmp.width = blankW
    tmp.height = blankH
    img.src = tmp.toDataURL('image/png')
  } else {
    img.src = `data:${imgMime};base64,${base64Data}`
  }
}

async function save() {
  if (!dirty.value || !displayCanvas || saving.value) return
  saving.value = true
  try {
    const isJpeg = mime.value === 'image/jpeg'
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
    const name = (currentName.value || 'image').replace(/\.[^.]+$/, isJpeg ? '.jpg' : '.png')
    const r = await window.api.downloadFile(base64, name, isJpeg ? 'image/jpeg' : 'image/png')
    if (!r.success) {
      if (!r.canceled) alert('保存失败：' + (r.error || '未知错误'))
      return
    }
    dirty.value = false
    if (r.path) currentName.value = r.path.split(/[\\/]/).pop()
    alert('已保存')
  } catch (e) {
    alert('保存失败：' + e.message)
  }
  saving.value = false
}

onMounted(() => {
  // 新实例必然无未保存内容，重置父级拦截标记（防止上次离开时残留 true 导致误拦截）
  emit('dirty-change', false)
  document.addEventListener('keydown', onKeydown)
  // wheel 事件不冒泡且画布是条件渲染（打开图片后才出现），须用 document 捕获阶段监听；
  // onWheel 内部仅 Ctrl+滚轮才 preventDefault/缩放，不影响其他滚动
  document.addEventListener('wheel', onWheel, { capture: true, passive: false })
  baseCanvas = document.createElement('canvas')
  editCanvas = document.createElement('canvas')
  editCtx = editCanvas.getContext('2d')
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('wheel', onWheel, true)
})

defineExpose({ save })
</script>
