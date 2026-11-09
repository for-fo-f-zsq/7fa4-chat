// 主题清单：default 为浅蓝（雾蓝）默认主题，其余 5 套由设计子智能体产出；
// 顺序即主题面板展示顺序，cache 键（html.theme-<value>）不可随意改名。
export const THEMES = [
  { value: 'default', label: '雾蓝（Default）', color: '#7C9CD0', original: true },
  { value: 'sand', label: '暖沙（Sand）', color: '#D8C3A5' },
  { value: 'sage', label: '鼠尾草（Sage）', color: '#A3B79B' },
  { value: 'midnight', label: '暗夜（Midnight）', color: '#6F86A8' },
  { value: 'graphite', label: '石墨（Graphite）', color: '#9AA0A6' },
  { value: 'contrast', label: '高对比（Contrast）', color: '#2F5FA8' }
]

// 窄窗口（手机比例）判定阈值：高/宽比超过此值即进入窄（单列）布局。
// 与 ChatView 的 isNarrowLayout 共用，供各工具独立感知窄模式。
export const NARROW_ASPECT = 1.4
