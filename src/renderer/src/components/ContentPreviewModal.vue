<template>
  <!-- 图片预览：纯黑遮罩 + 图片，支持滚轮/按钮缩放 + 按住拖动平移 -->
  <div v-if="type === 'image'" class="preview-overlay preview-overlay-image">
    <div class="image-stage" ref="stageEl" @mousedown.self="$emit('close')" @wheel.prevent="onWheel">
      <img
        :src="src" class="preview-image-zoom" ref="imgEl"
        :style="imgStyle"
        draggable="false"
        @mousedown="onPanStart"
      />
    </div>
    <div class="image-toolbar">
      <button title="缩小" @click="zoomStep(-0.25)"><i class="fas fa-search-minus"></i></button>
      <span class="image-zoom-label">{{ Math.round(scale * 100) }}%</span>
      <button title="放大" @click="zoomStep(0.25)"><i class="fas fa-search-plus"></i></button>
      <span class="image-toolbar-sep"></span>
      <button title="旋转 90°" @click="rot = (rot + 90) % 360"><i class="fas fa-redo-alt"></i></button>
      <span class="image-toolbar-sep"></span>
      <button title="重置视图" @click="resetView"><i class="fas fa-expand-arrows-alt"></i></button>
      <span class="image-toolbar-sep"></span>
      <button title="下载" :disabled="downloading" @click="onDownloadClick">
        <i :class="downloading ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
      </button>
      <template v-if="showEdit">
        <span class="image-toolbar-sep"></span>
        <button title="用图片编辑器打开" @click="$emit('edit')"><i class="fas fa-edit"></i></button>
      </template>
      <span class="image-toolbar-sep"></span>
      <button class="preview-close" title="关闭" @click="$emit('close')"><i class="fas fa-times"></i></button>
    </div>
  </div>
  <div v-else class="preview-overlay" @click.self="$emit('close')">
    <div class="preview-modal">
      <div class="preview-header">
        <span class="preview-title">{{ title }}</span>
        <div class="preview-header-actions">
          <button v-if="showActions" class="preview-action-btn" title="复制" @click="$emit('copy')"><i class="fas fa-copy"></i></button>
          <button v-if="showActions" class="preview-action-btn" title="转发" @click="$emit('forward')"><i class="fas fa-share"></i></button>
          <button v-if="canDownload" class="preview-action-btn" title="下载" :disabled="downloading" @click="onDownloadClick"><i :class="downloading ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i></button>
          <button class="preview-close" @click="$emit('close')"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="preview-body" @click="onBodyClick">
        <pre v-if="type === 'text'" class="preview-text">{{ text }}</pre>
        <div v-else-if="type === 'html'" class="preview-html" v-html="text"></div>
        <iframe v-else-if="type === 'pdf'" :src="src" class="preview-pdf" title="PDF 预览"></iframe>
        <div v-else class="preview-error">无法解析为图片或文字</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, getCurrentInstance } from 'vue'
import { parseMsgContent } from '../utils.js'

const props = defineProps({
  type: String,
  title: String,
  src: String,
  text: String,
  rawContent: { type: String, default: '' },
  showActions: { type: Boolean, default: false },
  // 「用图片编辑器打开」按钮：聊天里的图片可跳图片工具，海报墙等只读场景传 false 隐藏
  showEdit: { type: Boolean, default: true },
  // 远程图片地址（如海报 /api/posters/5.jpg）：src 可能是远程 URL、也可能被外部改成 base64，
  // 单独传一份原始地址供「下载」使用。父级若自行监听 @download，则不会走到内置兜底分支。
  remoteSrc: { type: String, default: '' },
  // 下载文件名提示（不含扩展名也可，会按 mime 补全）
  downloadName: { type: String, default: '' }
})

const emit = defineEmits(['close', 'copy', 'forward', 'download', 'edit'])

const canDownload = computed(() => {
  // 远程图片（海报墙等只读场景）：没有 rawContent，但有可下载的地址
  if (props.type === 'image' && (props.remoteSrc || props.src)) return true
  if (!props.showActions || !props.rawContent) return false
  const obj = parseMsgContent(props.rawContent)
  return obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data
})

// 下载中标记：远端取图期间禁用按钮，避免连点堆叠多次下载
const downloading = ref(false)

function extFromMime(mime) {
  const sub = String(mime || '').split('/')[1] || 'png'
  return sub.replace('jpeg', 'jpg').split(';')[0]
}

/** 远程 URL → base64（renderer 侧）。仅在无主进程通道时使用（网页端同源场景）。 */
async function fetchAsBase64(url) {
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const blob = await res.blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // 大图分块拼串，避免 String.fromCharCode(...arr) 参数过多爆栈
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return { base64: btoa(bin), mime: blob.type || 'image/png' }
}

/**
 * 下载远程图片。优先走主进程（Electron）：
 *   渲染进程源是 http://localhost:1145，与图片站 https://chat.forfof.cloud 不同源，
 *   而海报由 nginx 静态规则伺服、响应**不带 access-control-allow-origin**，
 *   所以 renderer 里 fetch 必被 CORS 拦（表现为「下载失败: Failed to fetch」）；
 *   `<img>` 不受同源策略限制，因此图能正常显示却下不下来。主进程是 Node，无同源限制。
 * 无主进程时（网页端，站点与接口同为 chat.forfof.cloud 属同源）回落到 renderer fetch。
 */
async function fallbackDownload() {
  const url = props.remoteSrc || props.src
  if (!url || downloading.value) return
  // 已有的 data: URL（内联图 / 截图）无需再取一次
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+);base64,(.*)$/)
    if (m) {
      const name = (props.downloadName || props.title || 'image') + '.' + extFromMime(m[1])
      window.api.downloadFile(m[2], name, m[1])
    }
    return
  }
  const canMain = typeof window.api?.downloadUrl === 'function'
  const canInline = typeof window.api?.downloadFile === 'function'
  if (!canMain && !canInline) return
  downloading.value = true
  try {
    // 主进程通道：Node 抓取，无同源限制。平台不支持时返回 unsupported，
    // 继续往下走 renderer fetch（网页端与站点同源，能成）。
    if (canMain) {
      const name = (props.downloadName || props.title || 'image') + '.jpg'
      const r = await window.api.downloadUrl(url, name)
      if (r && r.success) return
      if (r && r.canceled) return
      if (r && !r.unsupported) { alert('下载失败：' + (r.error || '未知错误')); return }
    }
    if (!canInline) return
    const { base64, mime } = await fetchAsBase64(url)
    const name = (props.downloadName || props.title || 'image') + '.' + extFromMime(mime)
    window.api.downloadFile(base64, name, mime)
  } catch (e) {
    alert('下载失败：' + (e.message || '网络错误'))
  } finally {
    downloading.value = false
  }
}

// 父级若自行监听 @download（聊天里需带原始 base64 等特殊处理），由父级全权接管；
// 没人监听时（海报墙/开屏海报这类只读预览）走内置的远程取图兜底。
function onDownloadClick() {
  if (getCurrentInstance()?.vnode.props?.onDownload) emit('download')
  else fallbackDownload()
}

// ---- 图片预览：缩放 + 平移 ----
const MIN_SCALE = 1
const MAX_SCALE = 8
const scale = ref(1)
const rot = ref(0)
const panX = ref(0)
const panY = ref(0)
const stageEl = ref(null)
const imgEl = ref(null)
let dragging = null

// 动画过渡仅在非拖动时开启
const imgStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) rotate(${rot.value}deg) scale(${scale.value})`,
  cursor: scale.value > 1 ? 'grab' : 'zoom-in',
  transition: dragging ? 'none' : 'transform 0.12s ease-out',
}))

function clampPan() {
  const stage = stageEl.value
  if (!stage) return
  // 平移越界软钳制：以缩放后的画面大小减视口为界（多留 40px 余量便于拖回）
  const sw = stage.clientWidth
  const sh = stage.clientHeight
  const img = imgEl.value
  if (!img) return
  const iw = img.clientWidth
  const ih = img.clientHeight
  const maxX = Math.max(0, (iw * scale.value - sw) / 2 + 40)
  const maxY = Math.max(0, (ih * scale.value - sh) / 2 + 40)
  panX.value = Math.max(-maxX, Math.min(maxX, panX.value))
  panY.value = Math.max(-maxY, Math.min(maxY, panY.value))
}

function zoomStep(delta) {
  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round((scale.value + delta) * 100) / 100))
  clampPan()
}

function onWheel(e) {
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * factor))
  clampPan()
}

function onPanStart(e) {
  if (e.button !== 0) return
  e.preventDefault()
  dragging = { x: e.clientX - panX.value, y: e.clientY - panY.value }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', onPanEnd)
  document.body.style.userSelect = 'none'
}

function onPanMove(e) {
  if (!dragging) return
  panX.value = e.clientX - dragging.x
  panY.value = e.clientY - dragging.y
  clampPan()
}

function onPanEnd() {
  dragging = null
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
  document.body.style.userSelect = ''
}

function resetView() {
  scale.value = 1
  rot.value = 0
  panX.value = 0
  panY.value = 0
}

// 切换预览内容时复位视图
watch(() => [props.type, props.src], () => resetView())

function onBodyClick(e) {
  const a = e.target.closest('a[href]')
  if (a) {
    e.preventDefault()
    e.stopPropagation()
    window.api.openExternal(a.href)
  }
}
</script>
