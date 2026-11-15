/**
 * 图片编辑工具常量定义
 */

export const MAX_EDIT_PIXELS = 20 * 1024 * 1024
export const MAX_EDIT_SIDE = 20000

export const IMAGE_TOOLS = [
  { id: 'brush', title: '画笔 (B)', icon: 'fas fa-pen', category: 'draw' },
  { id: 'eraser', title: '橡皮 (E)', icon: 'fas fa-eraser', category: 'draw' },
  { id: 'line', title: '直线 (L)', icon: 'fas fa-minus', category: 'shape' },
  { id: 'arrow', title: '箭头 (A)', icon: 'fas fa-long-arrow-alt-right', category: 'shape' },
  { id: 'rect', title: '矩形 (R)', icon: 'far fa-square', category: 'shape' },
  { id: 'ellipse', title: '椭圆 (O)', icon: 'far fa-circle', category: 'shape' },
  { id: 'mosaic', title: '马赛克 (M)', icon: 'fas fa-th', category: 'effect' },
  { id: 'text', title: '文字 (T)', icon: 'fas fa-font', category: 'annotate' }
]

export const DEFAULT_COLOR_PALETTE = [
  '#FA5151', // 红
  '#FF9800', // 橙
  '#FBC02D', // 黄
  '#4CAF50', // 绿
  '#3C8CE7', // 蓝
  '#9C27B0', // 紫
  '#1A1A2E', // 深黑
  '#FFFFFF'  // 纯白
]
