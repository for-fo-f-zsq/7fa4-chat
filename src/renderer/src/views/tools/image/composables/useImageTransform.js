import { measureTextObject } from '../imageTextRenderer.js'
import { MAX_EDIT_PIXELS, MAX_EDIT_SIDE } from '../imageConstants.js'

export function useImageTransform({
  width,
  height,
  textObjects,
  getBaseCanvas,
  getEditCanvas,
  setLayers,
  pushFullSnapshot,
  render,
  dirty,
  dialog
}) {
  /**
   * 顺时针旋转 90 度
   */
  async function rotate90CW() {
    const baseCanvas = getBaseCanvas()
    const editCanvas = getEditCanvas()
    if (!baseCanvas || !editCanvas) return

    pushFullSnapshot()

    const oldW = width.value
    const oldH = height.value
    const newW = oldH
    const newH = oldW

    const newBase = document.createElement('canvas')
    newBase.width = newW
    newBase.height = newH
    const bCtx = newBase.getContext('2d')
    bCtx.translate(newW, 0)
    bCtx.rotate(Math.PI / 2)
    bCtx.drawImage(baseCanvas, 0, 0)

    const newEdit = document.createElement('canvas')
    newEdit.width = newW
    newEdit.height = newH
    const eCtx = newEdit.getContext('2d')
    eCtx.translate(newW, 0)
    eCtx.rotate(Math.PI / 2)
    eCtx.drawImage(editCanvas, 0, 0)

    // 非破坏性更新文字对象坐标：保持水平排版，围绕旋转后中心重定位
    textObjects.value = textObjects.value.map((obj) => {
      const { w, h } = measureTextObject(obj, eCtx)
      const cx = obj.x + w / 2
      const cy = obj.y + h / 2
      const newCx = oldH - cy
      const newCy = cx
      return {
        ...obj,
        x: Math.round(newCx - w / 2),
        y: Math.round(newCy - h / 2)
      }
    })

    width.value = newW
    height.value = newH
    setLayers(newBase, newEdit)
    dirty.value = true
    render()
  }

  /**
   * 逆时针旋转 90 度
   */
  async function rotate90CCW() {
    const baseCanvas = getBaseCanvas()
    const editCanvas = getEditCanvas()
    if (!baseCanvas || !editCanvas) return

    pushFullSnapshot()

    const oldW = width.value
    const oldH = height.value
    const newW = oldH
    const newH = oldW

    const newBase = document.createElement('canvas')
    newBase.width = newW
    newBase.height = newH
    const bCtx = newBase.getContext('2d')
    bCtx.translate(0, newH)
    bCtx.rotate(-Math.PI / 2)
    bCtx.drawImage(baseCanvas, 0, 0)

    const newEdit = document.createElement('canvas')
    newEdit.width = newW
    newEdit.height = newH
    const eCtx = newEdit.getContext('2d')
    eCtx.translate(0, newH)
    eCtx.rotate(-Math.PI / 2)
    eCtx.drawImage(editCanvas, 0, 0)

    textObjects.value = textObjects.value.map((obj) => {
      const { w, h } = measureTextObject(obj, eCtx)
      const cx = obj.x + w / 2
      const cy = obj.y + h / 2
      const newCx = cy
      const newCy = oldW - cx
      return {
        ...obj,
        x: Math.round(newCx - w / 2),
        y: Math.round(newCy - h / 2)
      }
    })

    width.value = newW
    height.value = newH
    setLayers(newBase, newEdit)
    dirty.value = true
    render()
  }

  /**
   * 旋转 180 度
   */
  async function rotate180() {
    const baseCanvas = getBaseCanvas()
    const editCanvas = getEditCanvas()
    if (!baseCanvas || !editCanvas) return

    pushFullSnapshot()

    const W = width.value
    const H = height.value

    const newBase = document.createElement('canvas')
    newBase.width = W
    newBase.height = H
    const bCtx = newBase.getContext('2d')
    bCtx.translate(W, H)
    bCtx.rotate(Math.PI)
    bCtx.drawImage(baseCanvas, 0, 0)

    const newEdit = document.createElement('canvas')
    newEdit.width = W
    newEdit.height = H
    const eCtx = newEdit.getContext('2d')
    eCtx.translate(W, H)
    eCtx.rotate(Math.PI)
    eCtx.drawImage(editCanvas, 0, 0)

    textObjects.value = textObjects.value.map((obj) => {
      const { w, h } = measureTextObject(obj, eCtx)
      return {
        ...obj,
        x: Math.round(W - obj.x - w),
        y: Math.round(H - obj.y - h)
      }
    })

    setLayers(newBase, newEdit)
    dirty.value = true
    render()
  }

  /**
   * 水平翻转 (Flip Horizontal)
   */
  async function flipHorizontal() {
    const baseCanvas = getBaseCanvas()
    const editCanvas = getEditCanvas()
    if (!baseCanvas || !editCanvas) return

    pushFullSnapshot()

    const W = width.value
    const H = height.value

    const newBase = document.createElement('canvas')
    newBase.width = W
    newBase.height = H
    const bCtx = newBase.getContext('2d')
    bCtx.translate(W, 0)
    bCtx.scale(-1, 1)
    bCtx.drawImage(baseCanvas, 0, 0)

    const newEdit = document.createElement('canvas')
    newEdit.width = W
    newEdit.height = H
    const eCtx = newEdit.getContext('2d')
    eCtx.translate(W, 0)
    eCtx.scale(-1, 1)
    eCtx.drawImage(editCanvas, 0, 0)

    textObjects.value = textObjects.value.map((obj) => {
      const { w } = measureTextObject(obj, eCtx)
      return {
        ...obj,
        x: Math.round(W - obj.x - w)
      }
    })

    setLayers(newBase, newEdit)
    dirty.value = true
    render()
  }

  /**
   * 垂直翻转 (Flip Vertical)
   */
  async function flipVertical() {
    const baseCanvas = getBaseCanvas()
    const editCanvas = getEditCanvas()
    if (!baseCanvas || !editCanvas) return

    pushFullSnapshot()

    const W = width.value
    const H = height.value

    const newBase = document.createElement('canvas')
    newBase.width = W
    newBase.height = H
    const bCtx = newBase.getContext('2d')
    bCtx.translate(0, H)
    bCtx.scale(1, -1)
    bCtx.drawImage(baseCanvas, 0, 0)

    const newEdit = document.createElement('canvas')
    newEdit.width = W
    newEdit.height = H
    const eCtx = newEdit.getContext('2d')
    eCtx.translate(0, H)
    eCtx.scale(1, -1)
    eCtx.drawImage(editCanvas, 0, 0)

    textObjects.value = textObjects.value.map((obj) => {
      const { h } = measureTextObject(obj, eCtx)
      return {
        ...obj,
        y: Math.round(H - obj.y - h)
      }
    })

    setLayers(newBase, newEdit)
    dirty.value = true
    render()
  }

  /**
   * 调整画布尺寸 (Resize)
   * @param {number} targetW 目标宽
   * @param {number} targetH 目标高
   * @param {number} [offsetX] 内容在画布内的横向偏移（拖左边界时为正，等价于向左扩画布）
   * @param {number} [offsetY] 内容在画布内的纵向偏移（拖上边界时为正）
   */
  async function resizeCanvas(targetW, targetH, offsetX = 0, offsetY = 0) {
    const nw = Math.round(targetW)
    const nh = Math.round(targetH)
    const ox = Math.round(offsetX) || 0
    const oy = Math.round(offsetY) || 0
    if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw < 1 || nh < 1) {
      if (dialog) await dialog.alert('请输入有效的宽度和高度')
      return false
    }
    if (nw > MAX_EDIT_SIDE || nh > MAX_EDIT_SIDE || nw * nh > MAX_EDIT_PIXELS) {
      if (dialog) {
        await dialog.alert(`尺寸过大：单边不超过 ${MAX_EDIT_SIDE}px，像素总数不超过 ${MAX_EDIT_PIXELS / 1e6}MP`)
      }
      return false
    }
    if (nw === width.value && nh === height.value) return true

    const baseCanvas = getBaseCanvas()
    const editCanvas = getEditCanvas()
    if (!baseCanvas || !editCanvas) return false

    pushFullSnapshot()

    const newBase = document.createElement('canvas')
    newBase.width = nw
    newBase.height = nh
    newBase.getContext('2d').drawImage(baseCanvas, ox, oy)

    const newEdit = document.createElement('canvas')
    newEdit.width = nw
    newEdit.height = nh
    const newEditCtx = newEdit.getContext('2d')
    newEditCtx.drawImage(editCanvas, ox, oy)

    // 文字对象随内容平移，完全落在画布外的丢弃
    textObjects.value = textObjects.value
      .map((obj) => ({
        ...obj,
        x: Math.round(obj.x + ox),
        y: Math.round(obj.y + oy)
      }))
      .filter((obj) => {
        const { w, h } = measureTextObject(obj, newEditCtx)
        return obj.x + w > 0 && obj.y + h > 0 && obj.x < nw && obj.y < nh
      })

    width.value = nw
    height.value = nh
    setLayers(newBase, newEdit)
    dirty.value = true
    render()
    return true
  }

  return {
    rotate90CW,
    rotate90CCW,
    rotate180,
    flipHorizontal,
    flipVertical,
    resizeCanvas
  }
}
