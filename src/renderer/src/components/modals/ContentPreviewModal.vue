<template>
  <!-- 图片预览：纯黑媒体层 + 图片，支持滚轮/按钮缩放 + 按住拖动平移（UiModal 的浅色遮罩会破坏沉浸式预览，此分支保留自定义外观，见 C2-adopt.md） -->
  <!-- M-5 特例（review-motion.md）：v-if 在 Transition 自身且运行期 type 不切换，永不触发 leave；图片分支由内部 v-show 承担退出，行为正常。 -->
  <Transition v-if="type === 'image'" name="overlay" appear @after-leave="$emit('close')">
    <div v-show="shown" class="preview-overlay">
      <div class="image-stage" ref="stageEl" @mousedown.self="requestClose" @wheel.prevent="onWheel">
        <img
          :src="src" class="preview-image-zoom" ref="imgEl"
          :class="{ 'is-dragging': dragging }"
          :style="imgStyle"
          draggable="false"
          @mousedown="onPanStart"
        />
      </div>
      <div class="image-toolbar">
        <UiIconButton icon="fas fa-search-minus" aria-label="缩小" title="缩小" @click="zoomStep(-0.25)" />
        <span class="image-zoom-label">{{ Math.round(scale * 100) }}%</span>
        <UiIconButton icon="fas fa-search-plus" aria-label="放大" title="放大" @click="zoomStep(0.25)" />
        <span class="image-toolbar-sep"></span>
        <UiIconButton icon="fas fa-redo-alt" aria-label="旋转 90°" title="旋转 90°" @click="rot = (rot + 90) % 360" />
        <span class="image-toolbar-sep"></span>
        <UiIconButton icon="fas fa-expand-arrows-alt" aria-label="重置视图" title="重置视图" @click="resetView" />
        <span class="image-toolbar-sep"></span>
        <UiIconButton
          :icon="downloading ? 'fas fa-spinner fa-spin' : 'fas fa-download'"
          aria-label="下载"
          title="下载"
          :disabled="downloading"
          @click="onDownloadClick"
        />
        <template v-if="showEdit">
          <span class="image-toolbar-sep"></span>
          <UiIconButton icon="fas fa-edit" aria-label="用图片编辑器打开" title="用图片编辑器打开" @click="$emit('edit')" />
        </template>
        <span class="image-toolbar-sep"></span>
        <UiIconButton class="preview-close" icon="fas fa-times" aria-label="关闭" title="关闭" @click="requestClose" />
      </div>
    </div>
  </Transition>
  <UiModal v-else v-model:open="open" size="lg" @closed="$emit('close')">
    <template #header>
      <div class="preview-header">
        <span class="preview-title">{{ title }}</span>
        <div class="preview-header-actions">
          <UiButton v-if="showActions" variant="ghost" size="sm" icon="fas fa-copy" aria-label="复制" @click="$emit('copy')" />
          <UiButton v-if="showActions" variant="ghost" size="sm" icon="fas fa-share" aria-label="转发" @click="$emit('forward')" />
          <UiButton v-if="canDownload" variant="ghost" size="sm" :icon="downloading ? 'fas fa-spinner fa-spin' : 'fas fa-download'" aria-label="下载" :disabled="downloading" @click="onDownloadClick" />
        </div>
      </div>
    </template>
    <div class="preview-body" @click="onBodyClick">
      <pre v-if="type === 'text'" class="preview-text">{{ text }}</pre>
      <div v-else-if="type === 'html'" class="preview-html" v-html="text"></div>
      <iframe v-else-if="type === 'pdf'" :src="src" class="preview-pdf" title="PDF 预览"></iframe>
      <div v-else class="preview-error">无法解析为图片或文字</div>
    </div>
  </UiModal>
</template>

<script setup>
import { computed, ref, watch, useAttrs, onMounted, nextTick } from 'vue'
import { parseMsgContent } from '../../utils.js'
import UiModal from '../../ui/UiModal/UiModal.vue'
import UiButton from '../../ui/UiButton/UiButton.vue'
import UiIconButton from '../../ui/UiIconButton/UiIconButton.vue'

const props = defineProps({
  type: String,
  title: String,
  src: String,
  text: String,
  rawContent: { type: String, default: '' },
  showActions: { type: Boolean, default: false },
  // 「用图片编辑器打开」按钮：聊天里的图片可跳图片工具，只读预览场景传 false 隐藏
  showEdit: { type: Boolean, default: true },
  // 远程图片地址（如聊天里收到的远程图 URL）：src 可能是远程 URL、也可能被外部改成 base64，
  // 单独传一份原始地址供「下载」使用。父级若自行监听 @download，则不会走到内置兜底分支。
  remoteSrc: { type: String, default: '' },
  // 下载文件名提示（不含扩展名也可，会按 mime 补全）
  downloadName: { type: String, default: '' }
})

const emit = defineEmits(['close', 'copy', 'forward', 'download', 'edit'])
// 用 useAttrs() 判断父级是否监听 @download：getCurrentInstance() 在事件回调里返回 null（取不到 onDownload）
const attrs = useAttrs()

// 关闭动效：图片分支播 overlay leave；文字分支交 UiModal 播离场，after-leave 再通知父级卸载
const shown = ref(true)
const open = ref(false)

// 父级 v-if 挂载后打开，让文字分支也有进入过渡（图片分支由 appear 负责）
onMounted(() => {
  if (props.type !== 'image') nextTick(() => { open.value = true })
})

function requestClose() {
  if (props.type === 'image') shown.value = false
  else open.value = false
}

const canDownload = computed(() => {
  // 远程图片（只读预览场景）：没有 rawContent，但有可下载的地址
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
 *   渲染进程源是本地服务端口，与图片所在站点不同源，
 *   而部分静态图片由服务器 nginx 静态规则伺服、响应**不带 access-control-allow-origin**，
 *   所以 renderer 里 fetch 必被 CORS 拦（表现为「下载失败: Failed to fetch」）；
 *   `<img>` 不受同源策略限制，因此图能正常显示却下不下来。主进程是 Node，无同源限制。
 * 无主进程时（网页端，站点与接口同源）回落到 renderer fetch。
 */
async function fallbackDownload() {
  const url = props.remoteSrc || props.src
  if (!url || downloading.value) return
  // 已有的 data: URL（内联图）无需再取一次
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
  // blob: URL（会话内图片等）：主进程无法抓取（不是 http(s)，会被判「地址无效」），
  // 但渲染进程与 blob 同源，fetch 可直接读到字节 → 转 base64 后再落盘。
  if (url.startsWith('blob:')) {
    if (!canInline) return
    downloading.value = true
    try {
      const { base64, mime } = await fetchAsBase64(url)
      window.api.downloadFile(base64, (props.downloadName || props.title || 'image') + '.' + extFromMime(mime), mime)
    } catch (e) {
      alert('下载失败：' + (e.message || '网络错误'))
    } finally {
      downloading.value = false
    }
    return
  }
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
// 没人监听时（只读预览这类场景）走内置的远程取图兜底。
function onDownloadClick() {
  if (typeof attrs.onDownload === 'function') emit('download')
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
const dragging = ref(null)

// 拖动中由 .is-dragging 关闭过渡（见 content-preview-modal.css）
const imgStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) rotate(${rot.value}deg) scale(${scale.value})`,
  cursor: scale.value > 1 ? 'grab' : 'zoom-in',
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
  dragging.value = { x: e.clientX - panX.value, y: e.clientY - panY.value }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', onPanEnd)
  document.body.style.userSelect = 'none'
}

function onPanMove(e) {
  if (!dragging.value) return
  panX.value = e.clientX - dragging.value.x
  panY.value = e.clientY - dragging.value.y
  clampPan()
}

function onPanEnd() {
  dragging.value = null
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

// 切换预览内容时复位视图，并同步文字分支的 UiModal 开关
watch(() => [props.type, props.src], () => {
  resetView()
  shown.value = true
  open.value = props.type !== 'image'
})

function onBodyClick(e) {
  const a = e.target.closest('a[href]')
  if (a) {
    e.preventDefault()
    e.stopPropagation()
    window.api.openExternal(a.href)
  }
}
</script>

<style scoped src="../../css/components/content-preview-modal.css"></style>
