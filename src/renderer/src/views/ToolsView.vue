<template>
  <div class="tools-page">
    <div class="tools-header">
      <h2 class="page-title"><i class="fas fa-toolbox"></i> 工具</h2>
    </div>
    <div class="tools-grid">
      <div v-if="!isWeb" class="tool-card" @click="startCapture">
        <i class="fas fa-crop-alt"></i>
        <div class="tool-card-name">截图</div>
        <div class="tool-card-desc">{{ captureDesc }}</div>
      </div>
      <div class="tool-card" @click="$emit('openTool', 'markdown')">
        <i class="fas fa-file-alt"></i>
        <div class="tool-card-name">Markdown 编辑</div>
        <div class="tool-card-desc">Markdown 编写与预览；打开文件 / 新建 / 保存到文件 / 导出为图片</div>
      </div>
      <div class="tool-card" @click="$emit('openTool', 'image')">
        <i class="fas fa-paint-brush"></i>
        <div class="tool-card-name">图片编辑</div>
        <div class="tool-card-desc">画笔/橡皮/直线/矩形/椭圆；撤销；新建画布；保存到文件</div>
      </div>
      <div class="tool-card" @click="$emit('openTool', 'graph_editor')">
        <i class="fas fa-project-diagram"></i>
        <div class="tool-card-name">Graph Editor</div>
        <div class="tool-card-desc">交互式图编辑器：点击建点、拖拽连边、力导向布局、连通分量/桥/MST/二分图高亮</div>
      </div>
      <div class="tool-card" @click="$emit('openTool', 'calculator')">
        <i class="fas fa-calculator"></i>
        <div class="tool-card-name">计算器</div>
        <div class="tool-card-desc">科学计算器：表达式求值、阶乘、快速幂、对数、组合排列、gcd/lcm、质因数分解、模逆元</div>
      </div>
      <div class="tool-card" @click="$emit('openTool', 'timer')">
        <i class="fas fa-stopwatch"></i>
        <div class="tool-card-name">计时器</div>
        <div class="tool-card-desc">四宫格倒计时：每格可选一名用户并搜索，按「时长」或「目标时刻」计时；支持 1/2/4 格切换、全部开始/暂停、快捷时长、归零提示音</div>
      </div>
      <div class="tool-card" @click="$emit('openTool', 'math')">
        <i class="fas fa-chart-line"></i>
        <div class="tool-card-name">GeoGebra</div>
        <div class="tool-card-desc">{{ isWeb ? '网页端不支持 GeoGebra，请下载本地版使用' : 'GeoGebra 官方绘图计算器（本地离线版）：函数图像、几何画板、滑动条动画、测量、变换、轨迹、CAS 等全部二维功能' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { isWebBrowser } from '../utils.js'

// 纯入口列表：各工具由外层（ChatView）直接渲染，便于按打开来源控制返回逻辑
defineEmits(['openTool'])

// 纯网页浏览器端：GeoGebra 离线包体积过大（49MB），仅提示下载本地版。
// 必须用 isWebBrowser()：Android 端已把 GeoGebra 打进 APK（scripts/build-web.mjs 复制到 /geogebra/），
// 直接读 window.__7FA4_WEB__ 会把安卓误判成网页、把工具描述写错。
const isWeb = isWebBrowser()

// 截图：Win+Shift+S 全局快捷键的等价入口（快捷键被系统占用、或不记得按键时用）。
// 主进程弹出全屏框选遮罩，框选完成后自动跳进图片编辑器打开截图。
function startCapture() {
  window.api.captureScreen?.()
}

// 主进程会按候选列表自动降级注册，这里如实展示「实际生效的键」：
// 否则用户按 Win+Shift+S 没反应，完全不知道发生了什么（曾经的坑：只在控制台 warn）。
const hotkey = ref({ accelerator: null, registered: true, fallback: false, skipped: false })

onMounted(async () => {
  try {
    const r = await window.api.getScreenshotHotkey?.()
    if (r) hotkey.value = r
  } catch {}
})

// Electron accelerator 名对用户不友好：Super+Shift+S → Win + Shift + S
function prettyAccelerator(acc) {
  if (!acc) return ''
  return acc.split('+').map((k) => {
    const s = k.trim().toLowerCase()
    if (s === 'super' || s === 'meta' || s === 'cmd' || s === 'command') return 'Win'
    if (s === 'control' || s === 'ctrl') return 'Ctrl'
    if (s === 'alt' || s === 'option') return 'Alt'
    if (s === 'shift') return 'Shift'
    return k.trim().toUpperCase()
  }).join(' + ')
}

const captureDesc = computed(() => {
  const h = hotkey.value
  if (h.skipped) return '点击本卡片框选屏幕任意区域，截图后自动在图片编辑器中打开'
  if (!h.registered) return '点击本卡片框选屏幕任意区域 · 全局快捷键已被系统或其他程序占用，未能注册'
  const now = prettyAccelerator(h.accelerator)
  if (h.fallback) return `按 ${now} 框选屏幕任意区域（点击本卡片等效）· Win + Shift + S 被系统截图占用，已自动改用此键`
  return `按 ${now} 框选屏幕任意区域（点击本卡片等效），截图后自动在图片编辑器中打开`
})
</script>
