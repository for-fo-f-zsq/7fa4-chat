import { reactive, onUpdated, onUnmounted } from 'vue'
import { store } from '../../store.js'
import {
  parseMsgContent,
  renderMarkdown,
  compressBase64Image,
  copyMsgContent,
  downloadMsgContent,
} from '../../utils.js'
import { showToast } from '../useToast.js'

/**
 * 处理文件消息卡片（.file-msg）的拖出保存：
 * 桌面端调用 window.api.startFileDrag({ name, dataB64 })；
 * 网页端设置 DataTransfer DownloadURL；
 * 内嵌图片预览（.msg-img / .chat-image / .sticker-msg / img）不误触发。
 */
export function handleFileDragStart(e) {
  if (!e || store.multiSelectMode) return false
  const rawTarget = e.target
  const target = rawTarget?.nodeType === 3 ? rawTarget.parentElement : rawTarget
  if (!target || typeof target.closest !== 'function') return false
  if (target.closest('.msg-img, .chat-image, .sticker-msg, img')) return false
  const fileEl = target.closest('.file-msg')
  if (!fileEl) return false
  const dataB64 = fileEl.dataset?.fileB64 || ''
  if (!dataB64) return false
  const name = fileEl.dataset?.name || 'download'
  const mime = fileEl.dataset?.mime || 'application/octet-stream'

  if (typeof window !== 'undefined' && typeof window.api?.startFileDrag === 'function') {
    e.preventDefault()
    try {
      Promise.resolve(window.api.startFileDrag({ name, dataB64 })).catch(() => {})
    } catch {}
    return true
  }

  if (e.dataTransfer && typeof e.dataTransfer.setData === 'function') {
    const safeMime = mime || 'application/octet-stream'
    const safeName = String(name).replace(/:/g, '_')
    const dataUrl = `data:${safeMime};base64,${dataB64}`
    try {
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData('DownloadURL', `${safeMime}:${safeName}:${dataUrl}`)
    } catch {}
    return true
  }
  return false
}

/**
 * 消息右键菜单、多选、代码块复制按钮注入及点击事件代理（预览/链接/提及/引用）。
 */
export function useMessageActions({
  messageAreaEl,
  selfUid,
  onForward,
  onOpenPreview,
  onOpenUserInfo,
  onSendPat,
  onJumpToMessage,
}) {
  const msgCtx = reactive({
    show: false,
    x: 0,
    y: 0,
    msgId: null,
    msgContent: '',
    canDownload: false,
    canCollect: false,
    isOwn: false,
  })

  let avatarClickTimer = null
  onUnmounted(() => {
    if (avatarClickTimer) clearTimeout(avatarClickTimer)
  })

  function onAvatarSingleClick(uid) {
    clearTimeout(avatarClickTimer)
    avatarClickTimer = setTimeout(() => {
      avatarClickTimer = null
      if (uid != null) onOpenUserInfo(Number(uid))
    }, 250)
  }

  function onAvatarDoubleClick(uid) {
    clearTimeout(avatarClickTimer)
    avatarClickTimer = null
    if (uid != null) onSendPat(Number(uid))
  }

  function injectCodeCopyButtons() {
    const area = messageAreaEl.value
    if (!area) return
    const pres = area.querySelectorAll('pre:not(.code-copy-injected)')
    for (const pre of pres) {
      pre.classList.add('code-copy-injected')
      const wrap = document.createElement('div')
      wrap.className = 'code-block-wrap'
      pre.parentNode.insertBefore(wrap, pre)
      wrap.appendChild(pre)
      const btn = document.createElement('button')
      btn.className = 'code-copy-btn'
      btn.innerHTML = '<i class="fas fa-copy"></i> 复制'
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const code = pre.querySelector('code')
        const text = code ? code.textContent : pre.textContent
        await window.api.clipboardWriteText(text)
        btn.innerHTML = '<i class="fas fa-check"></i> 已复制'
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> 复制' }, 1500)
      })
      wrap.appendChild(btn)
    }
  }

  onUpdated(injectCodeCopyButtons)

  function isPatMsg(msg) {
    const obj = parseMsgContent(msg.content)
    return !!(obj && obj.type === 'pat')
  }

  function enterMultiSelect() {
    msgCtx.show = false
    store.multiSelectMode = true
    store.selectedMsgIds = []
  }

  function exitMultiSelect() {
    store.multiSelectMode = false
    store.selectedMsgIds = []
  }

  function toggleMsgSelect(msgId) {
    const idx = store.selectedMsgIds.indexOf(msgId)
    if (idx >= 0) store.selectedMsgIds.splice(idx, 1)
    else store.selectedMsgIds.push(msgId)
  }

  function onMsgMenu(e, msg) {
    e.preventDefault()
    const obj = parseMsgContent(msg.content)
    if (obj && obj.type === 'pat') return
    const isFile = obj && obj.type === 'file'
    const isSticker = obj && obj.type === 'sticker'
    const isImage = isFile && /^image\//.test(obj.mime || '')
    msgCtx.show = false
    msgCtx.x = e.clientX
    msgCtx.y = e.clientY
    msgCtx.msgId = msg.id
    msgCtx.msgContent = msg.content
    msgCtx.canDownload = !!(isFile || isSticker)
    msgCtx.canCollect = !!(isSticker || isImage)
    msgCtx.isOwn = msg.sender == selfUid()
    setTimeout(() => { msgCtx.show = true }, 1)
  }

  async function copyMsg() {
    const content = msgCtx.msgContent
    msgCtx.show = false
    await copyMsgContent(content)
    showToast('已复制到剪贴板', 'success')
  }

  function downloadMsg() {
    downloadMsgContent(msgCtx.msgContent)
    msgCtx.show = false
  }

  async function collectMsg() {
    const obj = parseMsgContent(msgCtx.msgContent)
    msgCtx.show = false
    if (!obj || !obj.data || !obj.mime) return
    const isSticker = obj.type === 'sticker'
    const isImage = obj.type === 'file' && /^image\//.test(obj.mime)
    if (!isSticker && !isImage) return
    if (!store.stickers.some((s) => s.name === obj.name)) {
      let data = obj.data
      let mime = obj.mime
      if (!/^image\/gif$/i.test(mime)) {
        const r = await compressBase64Image(data, mime)
        if (r) { data = r.data; mime = 'image/jpeg' }
      }
      store.stickers.push({ name: obj.name || '表情', data, mime })
      showToast('已添加到自定义表情', 'success')
    } else {
      showToast('该表情已在收藏中', 'info')
    }
  }

  function startForward() {
    onForward(msgCtx.msgContent)
    msgCtx.show = false
  }

  function openPreview(obj) {
    if (obj.type === 'image') {
      const src = obj.data && obj.mime ? `data:${obj.mime};base64,${obj.data}` : (obj.src || '')
      onOpenPreview({
        type: 'image',
        title: obj.name || '图片预览',
        src,
        text: '',
        mediaData: obj.data || '',
        mediaMime: obj.mime || '',
        gallery: Array.isArray(obj.gallery) ? obj.gallery : [],
        galleryIndex: Number.isInteger(obj.galleryIndex) ? obj.galleryIndex : -1,
      })
      return
    }
    if (obj.type === 'file' && obj.data) {
      if (/^image\//.test(obj.mime || '')) {
        onOpenPreview({
          type: 'image',
          title: obj.name || '图片预览',
          src: `data:${obj.mime};base64,${obj.data}`,
          text: '',
          mediaData: obj.data,
          mediaMime: obj.mime || '',
        })
      } else if (/\.pdf$/i.test(obj.name || '')) {
        onOpenPreview({
          type: 'pdf',
          title: obj.name || 'PDF 预览',
          src: `data:application/pdf;base64,${obj.data}`,
          text: '',
          mediaData: obj.data,
          mediaMime: 'application/pdf',
        })
      } else if (/\.(txt|md|json|js|ts|css|html|xml|csv|log|py|java|c|cpp|h|sh|bat|yaml|yml|ini|cfg|conf|toml)$/i.test(obj.name || '')) {
        try {
          const binary = atob(obj.data)
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
          const decoded = new TextDecoder('utf-8').decode(bytes)
          const isMd = /\.md$/i.test(obj.name || '')
          onOpenPreview({
            type: isMd ? 'html' : 'text',
            title: obj.name || '文本预览',
            src: '',
            text: isMd ? renderMarkdown(decoded) : decoded,
          })
        } catch {
          onOpenPreview({ type: 'error', title: '', src: '', text: '' })
        }
      } else {
        window.api.downloadFile(obj.data, obj.name || 'download', obj.mime)
      }
      return
    }
    onOpenPreview({ type: 'error', title: '', src: '', text: '' })
  }

  function onMessageAreaClick(e) {
    if (store.multiSelectMode) {
      const row = e.target.closest('.msg-row')
      if (row) {
        const msgId = Number(row.dataset.msgId)
        const msg = store.messages[msgId]
        if (msgId && msg && !isPatMsg(msg)) toggleMsgSelect(msgId)
      }
      return
    }
    const a = e.target.closest('a[href]')
    if (a) {
      e.preventDefault()
      e.stopPropagation()
      window.api.openExternal(a.href)
      return
    }
    const mentionEl = e.target.closest('.mention-tag')
    if (mentionEl) {
      const uid = mentionEl.dataset.uid
      if (uid && uid !== 'all') onOpenUserInfo(Number(uid))
      return
    }
    const patUserEl = e.target.closest('.pat-user')
    if (patUserEl) {
      const uid = patUserEl.dataset.uid
      if (uid) onOpenUserInfo(Number(uid))
      return
    }
    const replyEl = e.target.closest('.reply-quote')
    if (replyEl) {
      const msgId = Number(replyEl.dataset.replyId)
      if (msgId) onJumpToMessage(msgId)
      return
    }
    const fileEl = e.target.closest('.file-msg')
    if (fileEl) {
      e.preventDefault()
      e.stopPropagation()
      openPreview({ type: 'file', data: fileEl.dataset.fileB64, name: fileEl.dataset.name, mime: fileEl.dataset.mime })
      return
    }
    const imgEl = e.target.closest('.chat-image')
    if (imgEl) {
      e.preventDefault()
      e.stopPropagation()
      const src = imgEl.src
      const chatImgs = messageAreaEl?.value
        ? Array.from(messageAreaEl.value.querySelectorAll('.chat-image'))
        : [imgEl]
      const gallery = chatImgs.map((el) => {
        const elSrc = el.src
        return {
          type: 'image',
          title: '图片',
          src: elSrc,
          mediaData: elSrc.startsWith('blob:') ? '' : (el.dataset.media || ''),
          mediaMime: el.dataset.mime || '',
        }
      })
      const galleryIndex = Math.max(0, chatImgs.indexOf(imgEl))
      openPreview({
        type: 'image',
        src,
        name: '图片',
        data: src.startsWith('blob:') ? '' : imgEl.dataset.media,
        mime: imgEl.dataset.mime,
        gallery,
        galleryIndex,
      })
      return
    }
    const stickerEl = e.target.closest('.sticker-msg img')
    if (stickerEl) {
      e.preventDefault()
      e.stopPropagation()
      const src = stickerEl.src
      openPreview({ type: 'image', src, name: '表情', data: src.startsWith('blob:') ? '' : stickerEl.dataset.media, mime: stickerEl.dataset.mime })
    }
  }

  function onMessageAreaDragStart(e) {
    return handleFileDragStart(e)
  }

  return {
    msgCtx,
    onAvatarSingleClick,
    onAvatarDoubleClick,
    isPatMsg,
    enterMultiSelect,
    exitMultiSelect,
    toggleMsgSelect,
    onMsgMenu,
    copyMsg,
    downloadMsg,
    collectMsg,
    startForward,
    onMessageAreaClick,
    onMessageAreaDragStart,
  }
}
