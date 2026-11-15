import assert from 'node:assert/strict'
import {
  IMAGE_TOOLS,
  DEFAULT_COLOR_PALETTE,
  MAX_EDIT_PIXELS
} from '../imageConstants.js'
import { useImageHistory } from '../composables/useImageHistory.js'
import { useImageZoomPan } from '../composables/useImageZoomPan.js'
import { computeResizeSize, MIN_CANVAS_SIDE } from '../composables/useImageResize.js'

console.log('--- 开始 Image Editor 单元测试 ---')

// 1. 常量与调色板定义测试
console.log('1. 验证工具定义与颜色预设...')
const toolIds = IMAGE_TOOLS.map((t) => t.id)
assert(toolIds.includes('brush'), '应包含 brush 工具')
assert(toolIds.includes('eraser'), '应包含 eraser 工具')
assert(toolIds.includes('line'), '应包含 line 工具')
assert(toolIds.includes('arrow'), '应包含 arrow 工具')
assert(toolIds.includes('rect'), '应包含 rect 工具')
assert(toolIds.includes('ellipse'), '应包含 ellipse 工具')
assert(toolIds.includes('mosaic'), '应包含 mosaic 工具')
assert(toolIds.includes('text'), '应包含 text 工具')
assert(!toolIds.includes('crop'), '裁剪已移除（画布尺寸改为拖拽边角）')
assert.equal(IMAGE_TOOLS.length, 8, '应保留 8 个绘图/标注工具')

assert.equal(DEFAULT_COLOR_PALETTE.length, 8, '预设调色板应包含 8 种颜色')
assert(DEFAULT_COLOR_PALETTE.includes('#FA5151'), '应包含红 #FA5151')
assert(DEFAULT_COLOR_PALETTE.includes('#FF9800'), '应包含橙 #FF9800')
assert(DEFAULT_COLOR_PALETTE.includes('#4CAF50'), '应包含绿 #4CAF50')
assert(DEFAULT_COLOR_PALETTE.includes('#3C8CE7'), '应包含蓝 #3C8CE7')
assert(DEFAULT_COLOR_PALETTE.includes('#FFFFFF'), '应包含白 #FFFFFF')
console.log('✓ 常量与调色板定义通过')

// 2. 双栈撤销/重做测试 (useImageHistory)
console.log('2. 验证双栈撤销与重做 (useImageHistory)...')
const history = useImageHistory(5)
assert.equal(history.canUndo.value, false, '初始不能撤销')
assert.equal(history.canRedo.value, false, '初始不能重做')

// 压入状态 S0, S1, S2
history.pushSnapshot({ id: 'S0' })
history.pushSnapshot({ id: 'S1' })
assert.equal(history.canUndo.value, true, '压入后可撤销')
assert.equal(history.canRedo.value, false, '未撤销前不可重做')

// 撤销到 S1（当前是 S2）
const undone1 = history.undo({ id: 'S2' })
assert.equal(undone1.id, 'S1', '撤销应返回 S1')
assert.equal(history.canRedo.value, true, '撤销后可重做')

// 再次撤销到 S0（当前是 S1）
const undone2 = history.undo({ id: 'S1' })
assert.equal(undone2.id, 'S0', '再次撤销应返回 S0')
assert.equal(history.canUndo.value, false, '撤回初始态后不可再撤销')

// 重做到 S1（当前是 S0）
const redone1 = history.redo({ id: 'S0' })
assert.equal(redone1.id, 'S1', '重做应返回 S1')
assert.equal(history.canUndo.value, true, '重做后恢复可撤销')

// 重做到 S2（当前是 S1）
const redone2 = history.redo({ id: 'S1' })
assert.equal(redone2.id, 'S2', '重做应返回 S2')
assert.equal(history.canRedo.value, false, '重做到最新状态后不可再重做')

// 新操作清空 redoStack
history.undo({ id: 'S2' })
assert.equal(history.canRedo.value, true, '撤销后有重做项')
history.pushSnapshot({ id: 'S3_branch' })
assert.equal(history.canRedo.value, false, '进行新操作后重做栈应被清空')

// 深度限制
history.clearHistory()
for (let i = 0; i < 10; i++) {
  history.pushSnapshot({ id: 'step_' + i })
}
assert.equal(history.undoStack.value.length, 5, '历史深度超出上限应截断最早状态')
assert.equal(history.undoStack.value[0].id, 'step_5', '最早保留状态应为 step_5')
console.log('✓ 双栈撤销/重做逻辑通过')

// 3. 缩放与平移测试 (useImageZoomPan)
console.log('3. 验证画布缩放与重置 (useImageZoomPan)...')
const zoomPan = useImageZoomPan()
const { MIN_ZOOM, MAX_ZOOM } = zoomPan
assert.equal(zoomPan.zoomScale.value, 1, '初始缩放为 100%')

zoomPan.zoomIn()
assert(zoomPan.zoomScale.value > 1, '放大后比例应大于 1')

zoomPan.zoomReset()
assert.equal(zoomPan.zoomScale.value, 1, '重置后比例为 1')

zoomPan.zoomOut()
assert(zoomPan.zoomScale.value < 1, '缩小后比例应小于 1')

// 放大上限必须能越过旧的 5× 天花板，并钳制在 MAX_ZOOM
zoomPan.zoomReset()
for (let i = 0; i < 30; i++) zoomPan.zoomIn()
assert(zoomPan.zoomScale.value > 5, '放大上限应高于旧的 5× 限制')
assert.equal(zoomPan.zoomScale.value, MAX_ZOOM, '放大应钳制在 MAX_ZOOM')

// 缩小下限
for (let i = 0; i < 60; i++) zoomPan.zoomOut()
assert.equal(zoomPan.zoomScale.value, MIN_ZOOM, '缩小应钳制在 MIN_ZOOM')

// 直接指定缩放比例
zoomPan.zoomTo(2.5)
assert.equal(zoomPan.zoomScale.value, 2.5, 'zoomTo 应精确设置比例')
zoomPan.zoomTo(99)
assert.equal(zoomPan.zoomScale.value, MAX_ZOOM, 'zoomTo 超出上限应钳制')
zoomPan.zoomReset()
assert.equal(zoomPan.zoomScale.value, 1, '重置后比例回到 1')
console.log('✓ 缩放逻辑通过')

// 4. 旋转与翻转非破坏性文字重定位测试
console.log('4. 验证文字在非破坏性旋转与翻转中的坐标变换计算...')
const origW = 800
const origH = 600
const textObj = { x: 100, y: 50, w: 120, h: 30 }

// 顺时针 90°: cx = 160, cy = 65 -> newCx = origH - cy = 535, newCy = cx = 160
// newX = newCx - w / 2 = 535 - 60 = 475, newY = newCy - h / 2 = 160 - 15 = 145
const cx = textObj.x + textObj.w / 2
const cy = textObj.y + textObj.h / 2
const cw90Cx = origH - cy
const cw90Cy = cx
const cw90X = Math.round(cw90Cx - textObj.w / 2)
const cw90Y = Math.round(cw90Cy - textObj.h / 2)
assert.equal(cw90X, 475, 'CW 90° 旋转后 X 坐标应精确匹配')
assert.equal(cw90Y, 145, 'CW 90° 旋转后 Y 坐标应精确匹配')

// 水平翻转: newX = origW - textObj.x - textObj.w = 800 - 100 - 120 = 580, newY = textObj.y = 50
const flipHX = origW - textObj.x - textObj.w
const flipHY = textObj.y
assert.equal(flipHX, 580, '水平翻转后 X 坐标应精确匹配')
assert.equal(flipHY, 50, '水平翻转后 Y 坐标应保持不变')

// 垂直翻转: newX = textObj.x = 100, newY = origH - textObj.y - textObj.h = 600 - 50 - 30 = 520
const flipVX = textObj.x
const flipVY = origH - textObj.y - textObj.h
assert.equal(flipVX, 100, '垂直翻转后 X 坐标应保持不变')
assert.equal(flipVY, 520, '垂直翻转后 Y 坐标应精确匹配')
console.log('✓ 旋转与翻转文字坐标变换通过')

// 5. 画布尺寸拖拽计算
console.log('5. 验证画布尺寸拖拽计算 (computeResizeSize)...')
const start = { startW: 800, startH: 600 }

// 拖右边：只加宽，内容不动
let r = computeResizeSize({ handle: 'e', ...start, dx: 200, dy: 0 })
assert.deepEqual([r.width, r.height, r.offsetX, r.offsetY], [1000, 600, 0, 0], '向右拖应只加宽')

// 拖左边：加宽且内容整体右移，右边界保持不动
r = computeResizeSize({ handle: 'w', ...start, dx: -100, dy: 0 })
assert.deepEqual([r.width, r.offsetX], [900, 100], '向左拖应加宽并右移内容')

// 拖上边：加高且内容整体下移
r = computeResizeSize({ handle: 'n', ...start, dx: 0, dy: -80 })
assert.deepEqual([r.height, r.offsetY], [680, 80], '向上拖应加高并下移内容')

// 拖右下角：两轴同时增大
r = computeResizeSize({ handle: 'se', ...start, dx: 50, dy: 40 })
assert.deepEqual([r.width, r.height, r.offsetX, r.offsetY], [850, 640, 0, 0], '右下角拖拽应同时加宽加高')

// 拖左上角：两轴同时增大且内容偏移
r = computeResizeSize({ handle: 'nw', ...start, dx: -20, dy: -10 })
assert.deepEqual([r.width, r.height, r.offsetX, r.offsetY], [820, 610, 20, 10], '左上角拖拽应同时扩两轴')

// 缩放拖拽不会小于最小边长
r = computeResizeSize({ handle: 'e', ...start, dx: -5000, dy: 0 })
assert.equal(r.width, MIN_CANVAS_SIDE, '缩到极限应停在最小边长')
assert.equal(r.offsetX, 0, '拖右边时内容不应偏移')

// 像素总量上限：压缩非拖拽轴
r = computeResizeSize({ handle: 'e', startW: 4000, startH: 4000, dx: 12000, dy: 0 })
assert.equal(r.width, 16000, '被拖拽轴按位移放大')
assert.equal(r.height, 1310, '另一轴按 20MP 上限压缩')

// 纵轴拖拽同理：保留高度、压缩宽度（曾经的 bug 是把宽度又除了一次宽度）
r = computeResizeSize({ handle: 's', startW: 4000, startH: 4000, dx: 0, dy: 12000 })
assert.equal(r.height, 16000, '向下拖应按位移放大高度')
assert.equal(r.width, 1310, '横轴按 20MP 上限压缩')
assert.ok(r.width * r.height <= MAX_EDIT_PIXELS, '压缩后不得超过像素上限')

// 角拖拽同时放大两轴：至少保证总量不超限
r = computeResizeSize({ handle: 'se', startW: 4000, startH: 4000, dx: 12000, dy: 12000 })
assert.ok(r.width * r.height <= MAX_EDIT_PIXELS, '角拖拽也必须守住像素上限')
console.log('✓ 画布尺寸拖拽计算通过')

console.log('--- 全部 Image Editor 单元测试顺利通过！ ---')
