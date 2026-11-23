import { ref, computed, nextTick } from 'vue'
import { renderTextObjects } from './imageTextRenderer.js'
import { MAX_EDIT_PIXELS, MAX_EDIT_SIDE, IMAGE_TOOLS, DEFAULT_COLOR_PALETTE } from './imageConstants.js'
import { useImageHistory } from './composables/useImageHistory.js'
import { useImageZoomPan } from './composables/useImageZoomPan.js'
import { useImageTransform } from './composables/useImageTransform.js'
import { useImageDrawing } from './composables/useImageDrawing.js'
import { useImageText } from './composables/useImageText.js'
import { useImageResize } from './composables/useImageResize.js'

export { IMAGE_TOOLS, DEFAULT_COLOR_PALETTE }

export function useImageCanvas({ dialog, dirty, currentName, saving }) {
  const canvasEl = ref(null)

  const tool = ref('brush')
  const color = ref(DEFAULT_COLOR_PALETTE[0])
  const size = ref(4)
  const loading = ref(false)
  const loadError = ref('')

  const width = ref(0)
  const height = ref(0)
  const resizeW = ref(0)
  const resizeH = ref(0)
  const mime = ref('image/png')

  const canvasReady = computed(() => width.value > 0 && height.value > 0)

  // 画布分层
  let displayCanvas = null
  let displayCtx = null
  let baseCanvas = null
  let editCanvas = null
  let editCtx = null

  // 1. 缩放与平移模块
  const zoomPan = useImageZoomPan()
  const { wrapEl, zoomScale, isPanning, isSpacePressed, zoomTo, zoomIn, zoomOut, zoomReset, zoomFit, onWheel, startPan, updatePan, endPan } = zoomPan

  const canvasStyleW = computed(() => Math.round(width.value * zoomScale.value))
  const canvasStyleH = computed(() => Math.round(height.value * zoomScale.value))

  // 2. 历史栈模块 (双栈 Undo + Redo)
  const history = useImageHistory(20)
  const { canUndo, canRedo, pushSnapshot, undo: historyUndo, redo: historyRedo, clearHistory, setUndoDepth } = history

  function initLayers() {
    baseCanvas = document.createElement('canvas')
    editCanvas = document.createElement('canvas')
    editCtx = editCanvas.getContext('2d')
  }

  function setLayers(newBase, newEdit) {
    baseCanvas = newBase
    editCanvas = newEdit
    editCtx = newEdit.getContext('2d')
    if (displayCanvas) {
      displayCanvas.width = width.value
      displayCanvas.height = height.value
    }
  }

  function render() {
    if (!displayCtx || !baseCanvas || !editCanvas) return
    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
    displayCtx.drawImage(baseCanvas, 0, 0)
    displayCtx.drawImage(editCanvas, 0, 0)
    renderTextObjects(displayCtx, text.textObjects.value)
  }

  function captureCurrentSnapshot(full = false) {
    if (!editCanvas || !editCtx) return null
    if (full && baseCanvas) {
      const bCtx = baseCanvas.getContext('2d')
      return {
        type: 'full',
        width: width.value,
        height: height.value,
        baseData: bCtx.getImageData(0, 0, width.value, height.value),
        editData: editCtx.getImageData(0, 0, width.value, height.value),
        textObjects: JSON.parse(JSON.stringify(text.textObjects.value))
      }
    }
    return {
      type: 'stroke',
      width: width.value,
      height: height.value,
      editData: editCtx.getImageData(0, 0, editCanvas.width, editCanvas.height),
      textObjects: JSON.parse(JSON.stringify(text.textObjects.value))
    }
  }

  function pushStrokeSnapshot() {
    const snap = captureCurrentSnapshot(false)
    pushSnapshot(snap)
  }

  function pushFullSnapshot() {
    const snap = captureCurrentSnapshot(true)
    pushSnapshot(snap)
  }

  function applyRestoredSnapshot(target) {
    if (!target) return
    if (target.type === 'full') {
      const nw = target.width
      const nh = target.height
      width.value = nw
      height.value = nh
      resizeW.value = nw
      resizeH.value = nh

      baseCanvas.width = nw
      baseCanvas.height = nh
      baseCanvas.getContext('2d').putImageData(target.baseData, 0, 0)

      editCanvas.width = nw
      editCanvas.height = nh
      editCtx.putImageData(target.editData, 0, 0)

      displayCanvas.width = nw
      displayCanvas.height = nh
    } else {
      if (editCanvas.width !== target.width || editCanvas.height !== target.height) {
        editCanvas.width = target.width
        editCanvas.height = target.height
      }
      editCtx.putImageData(target.editData, 0, 0)
    }

    text.textObjects.value = JSON.parse(JSON.stringify(target.textObjects || []))
    text.selectedTextId.value = null
    dirty.value = true
    render()
  }

  function undo() {
    if (!canUndo.value) return
    const current = captureCurrentSnapshot(true)
    const target = historyUndo(current)
    if (target) applyRestoredSnapshot(target)
  }

  function redo() {
    if (!canRedo.value) return
    const current = captureCurrentSnapshot(true)
    const target = historyRedo(current)
    if (target) applyRestoredSnapshot(target)
  }

  // 3. 文字图层管理模块（确认后直接光栅化落入 editCanvas 像素层）
  const text = useImageText({
    color,
    zoomScale,
    getEditCtx: () => editCtx,
    pushStrokeSnapshot,
    render,
    dirty
  })

  // 4. 变换模块 (旋转、翻转、调整画布尺寸)
  const transform = useImageTransform({
    width,
    height,
    textObjects: text.textObjects,
    getBaseCanvas: () => baseCanvas,
    getEditCanvas: () => editCanvas,
    setLayers,
    pushFullSnapshot,
    render,
    dirty,
    dialog
  })

  // 5. 画布尺寸拖拽（拖动四边/四角改画布大小，替代原来的尺寸弹窗）
  const resize = useImageResize({
    width,
    height,
    zoomScale,
    commit: (nw, nh, offsetX, offsetY) => transform.resizeCanvas(nw, nh, offsetX, offsetY)
  })

  // 6. 绘图模块 (画笔、橡皮、线条、箭头、矩形、椭圆、马赛克)
  const drawing = useImageDrawing({
    tool,
    color,
    size,
    width,
    height,
    getEditCanvas: () => editCanvas,
    getEditCtx: () => editCtx,
    getBaseCanvas: () => baseCanvas,
    pushStrokeSnapshot,
    render,
    dirty
  })

  function getPos(e) {
    if (!displayCanvas) return { x: 0, y: 0 }
    const rect = displayCanvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (displayCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (displayCanvas.height / rect.height)
    }
  }

  function onPointerDown(e) {
    if (loading.value || loadError.value || !canvasReady.value) return

    // 空格键平移或鼠标中键拖拽平移
    if (isSpacePressed.value || e.button === 1) {
      startPan(e)
      return
    }

    e.preventDefault()
    const pos = getPos(e)

    if (tool.value === 'text') {
      text.handleTextPointerDown(pos, editCtx || displayCtx)
      return
    }

    displayCanvas.setPointerCapture(e.pointerId)
    drawing.startDrawing(pos)
  }

  function onPointerMove(e) {
    if (isPanning.value) {
      updatePan(e)
      return
    }

    if (tool.value === 'text') {
      const pos = getPos(e)
      text.handleTextPointerMove(pos)
      return
    }

    if (!drawing.isDrawing.value) return
    e.preventDefault()
    const pos = getPos(e)
    drawing.continueDrawing(pos)
  }

  function onPointerUp(e) {
    if (isPanning.value) {
      endPan()
      return
    }

    if (tool.value === 'text') {
      text.handleTextPointerUp()
      return
    }

    if (!drawing.isDrawing.value) return
    drawing.stopDrawing()
    try {
      displayCanvas.releasePointerCapture(e.pointerId)
    } catch {}
  }

  async function clearCanvas() {
    if (!editCanvas || !editCtx) return
    const ok = await dialog.confirm('确定清除本次绘制的所有内容？（原图不受影响）')
    if (!ok) return
    pushStrokeSnapshot()
    editCtx.globalCompositeOperation = 'destination-out'
    editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height)
    editCtx.globalCompositeOperation = 'source-over'
    text.textObjects.value = []
    text.selectedTextId.value = null
    dirty.value = true
    render()
  }

  function loadImageData(base64Data, imgMime, name, blankW = 0, blankH = 0) {
    return new Promise((resolve) => {
      loading.value = true
      loadError.value = ''
      const img = new Image()
      img.onload = async () => {
        const pixels = img.naturalWidth * img.naturalHeight
        if (pixels > MAX_EDIT_PIXELS || img.naturalWidth > MAX_EDIT_SIDE || img.naturalHeight > MAX_EDIT_SIDE) {
          loadError.value = `图片过大（${img.naturalWidth}×${img.naturalHeight}），暂不支持编辑`
          loading.value = false
          return resolve(false)
        }
        const depth = pixels > 12e6 ? 5 : pixels > 4e6 ? 8 : pixels > 1e6 ? 15 : 25
        setUndoDepth(depth)

        mime.value = imgMime
        currentName.value = name
        width.value = img.naturalWidth
        height.value = img.naturalHeight
        resizeW.value = img.naturalWidth
        resizeH.value = img.naturalHeight

        const w = img.naturalWidth
        const h = img.naturalHeight
        await nextTick()

        displayCanvas = canvasEl.value
        displayCtx = displayCanvas?.getContext('2d')
        if (!displayCanvas) {
          loadError.value = '画布初始化失败'
          loading.value = false
          return resolve(false)
        }

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

        // 自动适配视口大小
        zoomFit(w, h)

        text.textObjects.value = []
        text.selectedTextId.value = null
        clearHistory()
        pushStrokeSnapshot()

        render()
        dirty.value = false
        saving.value = false
        loading.value = false
        resolve(true)
      }
      img.onerror = () => {
        saving.value = false
        loadError.value = '图片解析失败'
        loading.value = false
        resolve(false)
      }
      if (blankW > 0 && blankH > 0) {
        const tmp = document.createElement('canvas')
        tmp.width = blankW
        tmp.height = blankH
        img.src = tmp.toDataURL('image/png')
      } else {
        img.src = `data:${imgMime};base64,${base64Data}`
      }
    })
  }

  function flatten() {
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
    renderTextObjects(octx, text.textObjects.value)
    const dataUrl = out.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.92 : undefined)
    const base64 = dataUrl.split(',')[1]
    const name = (currentName.value || 'image').replace(/\.[^.]+$/, isJpeg ? '.jpg' : '.png')
    return { base64, mime: isJpeg ? 'image/jpeg' : 'image/png', name }
  }

  return {
    canvasEl,
    wrapEl,
    textRef: text.textRef,
    tool,
    color,
    size,
    loading,
    loadError,
    canUndo,
    canRedo,
    textDraft: text.textDraft,
    textBoxLeft: text.textBoxLeft,
    textBoxTop: text.textBoxTop,
    fontSize: text.fontSize,
    textObjects: text.textObjects,
    selectedTextId: text.selectedTextId,
    width,
    height,
    resizeW,
    resizeH,
    mime,
    zoomScale,
    canvasReady,
    canvasStyleW,
    canvasStyleH,
    isPanning,
    isSpacePressed,
    isDrawing: () => drawing.isDrawing.value,
    hasCanvas: () => !!displayCanvas,
    initLayers,
    onWheel,
    zoomTo,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomFit: () => zoomFit(width.value, height.value),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancelText: text.cancelText,
    commitText: text.commitText,
    undo,
    redo,
    clearCanvas,
    resizeCanvas: (nw, nh, offsetX, offsetY) => transform.resizeCanvas(nw, nh, offsetX, offsetY),
    resizeDragging: resize.dragging,
    resizeActiveHandle: resize.activeHandle,
    resizePreview: resize.preview,
    startResize: resize.startResize,
    cancelResize: resize.cancel,
    rotate90CW: () => transform.rotate90CW(),
    rotate90CCW: () => transform.rotate90CCW(),
    rotate180: () => transform.rotate180(),
    flipHorizontal: () => transform.flipHorizontal(),
    flipVertical: () => transform.flipVertical(),
    loadImageData,
    flatten
  }
}
