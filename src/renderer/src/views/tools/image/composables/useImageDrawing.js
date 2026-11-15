import { ref } from 'vue'

export function useImageDrawing({
  tool,
  color,
  size,
  width,
  height,
  getEditCanvas,
  getEditCtx,
  getBaseCanvas,
  pushStrokeSnapshot,
  render,
  dirty
}) {
  const isDrawing = ref(false)
  let startPos = { x: 0, y: 0 }
  let lastPos = { x: 0, y: 0 }
  let activeStrokeSnapshot = null

  // 马赛克绘制状态
  let mosaicSource = null
  let mosaicVisitedBlocks = new Set()

  function drawShape(ctx, p0, p1) {
    ctx.strokeStyle = color.value
    ctx.fillStyle = color.value
    ctx.lineWidth = size.value
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (tool.value === 'line') {
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    } else if (tool.value === 'arrow') {
      drawArrow(ctx, p0, p1, color.value, size.value)
    } else if (tool.value === 'rect') {
      const rx = Math.min(p0.x, p1.x)
      const ry = Math.min(p0.y, p1.y)
      const rw = Math.abs(p1.x - p0.x)
      const rh = Math.abs(p1.y - p0.y)
      ctx.strokeRect(rx, ry, rw, rh)
    } else if (tool.value === 'ellipse') {
      const cx = (p0.x + p1.x) / 2
      const cy = (p0.y + p1.y) / 2
      const rx = Math.abs(p1.x - p0.x) / 2
      const ry = Math.abs(p1.y - p0.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  /**
   * 绘制带三角箭头的方向线 (Trigonometric Arrow)
   */
  function drawArrow(ctx, p0, p1, arrowColor, strokeWidth) {
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.hypot(dx, dy)
    if (len < 1) return

    ctx.save()
    ctx.strokeStyle = arrowColor
    ctx.fillStyle = arrowColor
    ctx.lineWidth = strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 箭头尺寸计算
    const headLength = Math.max(12, Math.min(42, strokeWidth * 3.6))
    const headAngle = Math.PI / 6 // 30度
    const angle = Math.atan2(dy, dx)

    // 绘制主体线条（稍微退后一点，防止粗线条顶穿箭头尖端）
    const shaftEndLen = Math.max(0, len - headLength * 0.4)
    const shaftEndX = p0.x + (dx / len) * shaftEndLen
    const shaftEndY = p0.y + (dy / len) * shaftEndLen

    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(shaftEndX, shaftEndY)
    ctx.stroke()

    // 计算箭头头部三角形顶点
    const leftX = p1.x - headLength * Math.cos(angle - headAngle)
    const leftY = p1.y - headLength * Math.sin(angle - headAngle)
    const rightX = p1.x - headLength * Math.cos(angle + headAngle)
    const rightY = p1.y - headLength * Math.sin(angle + headAngle)

    // 内凹弧度让箭头更加精致现代
    const backIndentX = p1.x - headLength * 0.75 * Math.cos(angle)
    const backIndentY = p1.y - headLength * 0.75 * Math.sin(angle)

    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(leftX, leftY)
    ctx.lineTo(backIndentX, backIndentY)
    ctx.lineTo(rightX, rightY)
    ctx.closePath()
    ctx.fill()

    ctx.restore()
  }

  /**
   * 应用局部马赛克像素块
   */
  function applyMosaicAt(px, py) {
    if (!mosaicSource) return
    const editCtx = getEditCtx()
    const w = width.value
    const h = height.value
    const blockSize = Math.max(6, Math.min(24, Math.round(size.value * 1.2) || 8))
    const radius = Math.max(8, size.value * 1.6)

    const minX = Math.floor(Math.max(0, px - radius) / blockSize) * blockSize
    const maxX = Math.ceil(Math.min(w, px + radius) / blockSize) * blockSize
    const minY = Math.floor(Math.max(0, py - radius) / blockSize) * blockSize
    const maxY = Math.ceil(Math.min(h, py + radius) / blockSize) * blockSize

    editCtx.save()
    for (let bx = minX; bx < maxX; bx += blockSize) {
      for (let by = minY; by < maxY; by += blockSize) {
        const key = `${bx},${by}`
        if (mosaicVisitedBlocks.has(key)) continue

        const cx = bx + blockSize / 2
        const cy = by + blockSize / 2
        if (Math.hypot(cx - px, cy - py) > radius + blockSize / 2) continue

        mosaicVisitedBlocks.add(key)

        // 采样中心像素颜色
        const sampleX = Math.min(w - 1, Math.max(0, Math.floor(cx)))
        const sampleY = Math.min(h - 1, Math.max(0, Math.floor(cy)))
        const offset = (sampleY * w + sampleX) * 4

        const r = mosaicSource[offset]
        const g = mosaicSource[offset + 1]
        const b = mosaicSource[offset + 2]
        const a = mosaicSource[offset + 3] / 255

        const bw = Math.min(blockSize, w - bx)
        const bh = Math.min(blockSize, h - by)

        editCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`
        editCtx.fillRect(bx, by, bw, bh)
      }
    }
    editCtx.restore()
  }

  /**
   * 沿轨迹平滑插值绘制马赛克
   */
  function applyMosaicPath(p0, p1) {
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    const step = Math.max(3, size.value / 2)
    const steps = Math.ceil(dist / step)
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 1 : i / steps
      const x = p0.x + (p1.x - p0.x) * t
      const y = p0.y + (p1.y - p0.y) * t
      applyMosaicAt(x, y)
    }
  }

  function startDrawing(pos) {
    const editCanvas = getEditCanvas()
    const editCtx = getEditCtx()
    const baseCanvas = getBaseCanvas()
    if (!editCanvas || !editCtx) return

    isDrawing.value = true
    startPos = pos
    lastPos = pos

    // 压入历史栈以备撤销
    pushStrokeSnapshot()
    dirty.value = true

    // 留存当前图层作为移动预览快照
    activeStrokeSnapshot = editCtx.getImageData(0, 0, editCanvas.width, editCanvas.height)

    if (tool.value === 'eraser') {
      editCtx.globalCompositeOperation = 'destination-out'
      editCtx.lineCap = 'round'
      editCtx.lineJoin = 'round'
      editCtx.lineWidth = size.value
      editCtx.beginPath()
      editCtx.moveTo(pos.x, pos.y)
    } else if (tool.value === 'brush') {
      editCtx.globalCompositeOperation = 'source-over'
      editCtx.strokeStyle = color.value
      editCtx.lineWidth = size.value
      editCtx.lineCap = 'round'
      editCtx.lineJoin = 'round'
      editCtx.beginPath()
      editCtx.moveTo(pos.x, pos.y)
    } else if (tool.value === 'mosaic') {
      // 预先合成底图与绘制层，作为马赛克的高速采样源
      const offscreen = document.createElement('canvas')
      offscreen.width = width.value
      offscreen.height = height.value
      const offCtx = offscreen.getContext('2d')
      if (baseCanvas) offCtx.drawImage(baseCanvas, 0, 0)
      offCtx.drawImage(editCanvas, 0, 0)
      mosaicSource = offCtx.getImageData(0, 0, width.value, height.value).data
      mosaicVisitedBlocks.clear()
      applyMosaicAt(pos.x, pos.y)
      render()
    }
  }

  function continueDrawing(pos) {
    if (!isDrawing.value) return
    const editCtx = getEditCtx()

    if (tool.value === 'brush' || tool.value === 'eraser') {
      editCtx.lineTo(pos.x, pos.y)
      editCtx.stroke()
    } else if (tool.value === 'mosaic') {
      applyMosaicPath(lastPos, pos)
      lastPos = pos
    } else {
      // 矢量形状工具（直线、箭头、矩形、椭圆）：恢复快照并实时预览
      if (activeStrokeSnapshot) {
        editCtx.putImageData(activeStrokeSnapshot, 0, 0)
      }
      drawShape(editCtx, startPos, pos)
    }
    render()
  }

  function stopDrawing() {
    if (!isDrawing.value) return
    isDrawing.value = false
    const editCtx = getEditCtx()
    if (editCtx) {
      editCtx.globalCompositeOperation = 'source-over'
    }
    activeStrokeSnapshot = null
    mosaicSource = null
    mosaicVisitedBlocks.clear()
    render()
  }

  return {
    isDrawing,
    startDrawing,
    continueDrawing,
    stopDrawing,
    drawArrow
  }
}
