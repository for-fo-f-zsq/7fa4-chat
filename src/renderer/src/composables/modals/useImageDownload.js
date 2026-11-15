import { computed, getCurrentInstance, ref } from 'vue'
import { parseMsgContent } from '../../utils.js'
import { showToast } from '../useToast.js'

function extFromMime(mime) {
  const sub = (String(mime || '').split('/')[1] || 'png').split(';')[0]
  return sub.replace('jpeg', 'jpg').replace('svg+xml', 'svg')
}

function extFromUrl(url) {
  try {
    const pathname = new URL(String(url), 'https://placeholder.invalid').pathname
    const m = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)
    if (m) return m[1].toLowerCase()
  } catch { /* ignore */ }
  return 'png'
}

async function fetchAsBase64(url) {
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const blob = await res.blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return { base64: btoa(bin), mime: blob.type || 'image/png' }
}

/**
 * 预览弹窗下载逻辑（主进程免 CORS 下载与同源 fetch 兜底）。
 */
export function useImageDownload(props, emit) {
  const instance = getCurrentInstance()
  const downloading = ref(false)

  const canDownload = computed(() => {
    if (props.type === 'image' && (props.remoteSrc || props.src)) return true
    if (!props.showActions || !props.rawContent) return false
    const obj = parseMsgContent(props.rawContent)
    return obj && (obj.type === 'file' || obj.type === 'sticker') && obj.data
  })

  async function fallbackDownload() {
    const url = props.remoteSrc || props.src
    if (!url || downloading.value) return
    if (url.startsWith('data:')) {
      const m = url.match(/^data:([^;,]+);base64,(.*)$/)
      if (!m) {
        showToast('暂不支持导出此格式图片', 'warning')
        return
      }
      downloading.value = true
      try {
        const name = (props.downloadName || props.title || 'image') + '.' + extFromMime(m[1])
        await window.api.downloadFile(m[2], name, m[1])
      } catch (e) {
        showToast('下载失败：' + (e?.message || '未知错误'), 'error')
      } finally {
        downloading.value = false
      }
      return
    }
    const canMain = typeof window.api?.downloadUrl === 'function'
    const canInline = typeof window.api?.downloadFile === 'function'
    if (!canMain && !canInline) return
    if (url.startsWith('blob:')) {
      if (!canInline) return
      downloading.value = true
      try {
        const { base64, mime } = await fetchAsBase64(url)
        await window.api.downloadFile(base64, (props.downloadName || props.title || 'image') + '.' + extFromMime(mime), mime)
      } catch (e) {
        showToast('下载失败：' + (e.message || '网络错误'), 'error')
      } finally {
        downloading.value = false
      }
      return
    }
    downloading.value = true
    try {
      if (canMain) {
        const name = (props.downloadName || props.title || 'image') + '.' + extFromUrl(url)
        const r = await window.api.downloadUrl(url, name)
        if (r && r.success) return
        if (r && r.canceled) return
        if (r && !r.unsupported) {
          showToast('下载失败：' + (r.error || '未知错误'), 'error')
          return
        }
      }
      if (!canInline) return
      const { base64, mime } = await fetchAsBase64(url)
      const name = (props.downloadName || props.title || 'image') + '.' + extFromMime(mime)
      await window.api.downloadFile(base64, name, mime)
    } catch (e) {
      showToast('下载失败：' + (e.message || '网络错误'), 'error')
    } finally {
      downloading.value = false
    }
  }

  function onDownloadClick() {
    if (typeof instance?.vnode?.props?.onDownload === 'function') emit('download')
    else fallbackDownload()
  }

  return {
    canDownload,
    downloading,
    onDownloadClick,
  }
}
