import { ref, nextTick } from 'vue'
import { store } from '../../store.js'
import {
  applyChatToStore,
  sendChatMessage,
  compressImage,
  compressBase64Image,
} from '../../utils.js'
import { QUANCODE, qqfaceShortCode } from '../../qqface-data.js'

function isImageFile(name) {
  return /\.(jpg|jpeg|png|gif|bmp|webp|ico)$/i.test(name || '')
}

/**
 * 输入区附件/图片粘贴/拖拽文件/系统相机拍照/自定义表情管理。
 */
export function useInputMedia({
  pageType,
  pageId,
  sending,
  errorMessage,
  tokenInfo,
  pendingFiles,
  focusInput,
  insertAtCaret,
  onOpenPreview,
}) {
  const cameraBusy = ref(false)

  function addPendingFile(name, size, data, mime) {
    const isImage = isImageFile(name)
    const thumbUrl = isImage && data && mime ? `data:${mime};base64,${data}` : ''
    pendingFiles.value.push({ name, size, data, mime, isImage, thumbUrl })
    nextTick(() => focusInput?.())
  }

  function removePendingFile(idx) {
    pendingFiles.value.splice(idx, 1)
  }

  function previewPendingFile(pf) {
    if (pf.isImage) {
      onOpenPreview({ type: 'image', title: pf.name, src: pf.thumbUrl, text: '' })
    } else if (pf.data) {
      window.api.downloadFile(pf.data, pf.name, pf.mime)
    }
  }

  async function sendFileMessage() {
    if (sending.value) return
    sending.value = true
    try {
      const sel = await window.api.selectFile()
      if (!sel.success) return
      let data = sel.data
      let size = sel.size
      let mime = sel.mime
      if (mime?.startsWith('image/')) {
        const result = await compressBase64Image(data, mime)
        if (result) { data = result.data; size = result.size }
        mime = 'image/jpeg'
      }
      addPendingFile(sel.name, size, data, mime)
    } catch {
      errorMessage.value = '发送失败'
    } finally {
      sending.value = false
    }
  }

  async function onPaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    const codeText = (e.clipboardData.getData('text/plain') || '').trim()
    if (codeText && /^\/[\p{L}\p{N}_]+$/u.test(codeText) && QUANCODE.has(codeText.toLowerCase())) return
    let imgItem = null
    for (const item of items) {
      if (item.type.startsWith('image/')) { imgItem = item; break }
    }
    if (!imgItem) return
    e.preventDefault()
    const file = imgItem.getAsFile()
    if (!file) return
    sending.value = true
    try {
      const result = await compressImage(file)
      if (!result) return
      addPendingFile(`pasted_${Date.now()}.png`, result.size, result.data, 'image/jpeg')
    } catch {
      errorMessage.value = '粘贴图片发送失败'
    } finally {
      sending.value = false
    }
  }

  async function sendDroppedFile(file) {
    if (sending.value || !file) return
    sending.value = true
    try {
      const result = await compressImage(file)
      if (!result) return
      const mime = file.type?.startsWith('image/') ? 'image/jpeg' : (file.type || 'application/octet-stream')
      addPendingFile(file.name || 'unnamed_file', result.size, result.data, mime)
    } catch (e) {
      console.error('[sendDroppedFile] 上传失败:', e)
      errorMessage.value = '上传失败: ' + (e.message || String(e))
    } finally {
      sending.value = false
    }
  }

  function onEmojiSelect(face) {
    insertAtCaret(qqfaceShortCode(face) + ' ')
  }

  async function onStickerSelect(sticker) {
    const msgObj = { type: 'sticker', data: sticker.data, mime: sticker.mime, name: sticker.name }
    try {
      const r = await sendChatMessage({ type: pageType(), targetId: pageId(), msgObj })
      if (!r.success) {
        errorMessage.value = r.err?.message || '发送失败'
      } else {
        errorMessage.value = ''
        const { tokenInfo: info } = applyChatToStore(r, pageType(), pageId())
        tokenInfo.value = info
      }
    } catch {
      errorMessage.value = '发送失败'
    }
  }

  function previewSticker(sticker) {
    if (!sticker || !sticker.data) return
    const src = sticker.mime ? `data:${sticker.mime};base64,${sticker.data}` : ''
    onOpenPreview({ type: 'image', title: sticker.name || '表情', src, text: '' })
  }

  async function addSticker() {
    if (sending.value) return
    sending.value = true
    try {
      const sel = await window.api.selectImage()
      if (!sel.success) return
      let data = sel.data
      let mime = sel.mime
      if (sel.mime && !/^image\/gif$/i.test(sel.mime)) {
        const result = await compressBase64Image(data, mime)
        if (result) { data = result.data; mime = 'image/jpeg' }
      }
      store.stickers.push({ name: sel.name, data, mime })
    } catch {
      errorMessage.value = '添加表情失败'
    } finally {
      sending.value = false
    }
  }

  function removeSticker(index) {
    store.stickers.splice(index, 1)
  }

  async function cancelPhoto() {
    try { await window.api.cancelCamera() } catch {}
  }

  async function takePhoto() {
    if (cameraBusy.value) { await cancelPhoto(); return }
    cameraBusy.value = true
    errorMessage.value = ''
    try {
      const r = await window.api.launchCamera()
      if (!r || !r.success) {
        if (!r?.canceled) errorMessage.value = (r && r.error) || '打开相机失败'
        return
      }
      let data = r.data
      let size = r.size
      const compressed = await compressBase64Image(data, r.mime || 'image/jpeg')
      if (compressed) { data = compressed.data; size = compressed.size }
      addPendingFile(r.name, size, data, 'image/jpeg')
    } catch {
      errorMessage.value = '拍照失败'
    } finally {
      cameraBusy.value = false
    }
  }

  return {
    cameraBusy,
    removePendingFile,
    previewPendingFile,
    sendFileMessage,
    onPaste,
    sendDroppedFile,
    onEmojiSelect,
    onStickerSelect,
    previewSticker,
    addSticker,
    removeSticker,
    takePhoto,
  }
}
