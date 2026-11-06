/**
 * Markdown 工具入口。
 *
 * 顺序很重要：
 *   1) bridge-client 必须第一个 import（它会把 window.api / window.__toolBridge 装到 window 上，
 *      MarkdownTool.vue 的依赖链在模块求值阶段就可能访问 window.api）；
 *   2) tool-base.css 提供与宿主一致的基础 reset / 主题变量 / Font Awesome 图标字体；
 *   3) 组件沿用现有渲染层实现，后续迁移任务会把它改造成完全不依赖宿主模块。
 */
import '../../shared/bridge-client.js'
import '../../shared/tool-base.css'
// 独立包不经过主窗口 main.js，须自行引入 KaTeX 排版样式（此前缺失导致公式错位）
import 'katex/dist/katex.min.css'

import { createApp } from 'vue'
import MarkdownTool from '../../../src/renderer/src/views/tools/MarkdownTool.vue'

createApp(MarkdownTool).mount('#app')
