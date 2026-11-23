import { ref, reactive, nextTick, getCurrentInstance, onUnmounted } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'
import { safeFetch, applyChatToStore, sendChatMessage } from '../../utils/chatSync.js'
import { compressImage, compressBase64Image } from '../../utils/media.js'
import { makeVoteContent } from '../../utils/poll.js'
import { copyMsgContent, downloadMsgContent } from '../../utils/message.js'
import { showToast } from '../useToast.js'
import { recordOwnVote, schedulePersistSave } from './useChatPersistence.js'

let activeToolImageHandler = null

export function dispatchToolSendImage(payload) {
  return activeToolImageHandler?.(payload)
}

function stripPollVotes(content) {
  if (!content || typeof content !== 'string' || content.trim()[0] !== '{') return content
  try {
    const obj = JSON.parse(content)
    if (!obj || obj.type !== 'poll') return content
    delete obj.votes
    delete obj.voteMeta
    delete obj.invalid
    delete obj.custom
    delete obj.customVotes
    return JSON.stringify(obj)
  } catch {
    return content
  }
}

/**
 * 会话内用户动作：转发/批量转发、图片工具发送、拖拽直发、拍一拍、投票、内容预览动作。
 */
export function useChatActions({
  getPage,
  getInputFooter,
  onExitMultiSelect,
  onOpenTool,
  openToolsPage,
}) {
  const forwardModalVisible = ref(false)
  const forwardMsgContent = ref('')
  const forwardModalRef = ref(null)
  const imageSendPending = ref(null)
  const previewData = reactive({
    show: false,
    type: '',
    title: '',
    src: '',
    text: '',
    rawContent: '',
    showActions: false,
    mediaData: '',
    mediaMime: '',
    gallery: [],
    galleryIndex: -1,
  })

  function setFooterError(msg) {
    const f = getInputFooter?.()
    if (f) f.errorMessage = msg
  }

  function applyTokenInfo(tokenInfo) {
    const f = getInputFooter?.()
    if (f) f.tokenInfo = tokenInfo
  }

  function startForward(msgContent) {
    forwardMsgContent.value = msgContent
    forwardModalVisible.value = true
  }

  async function forwardToTarget(type, targetId, msgContent) {
    if (!type || !targetId || !msgContent) return
    const payload = stripPollVotes(msgContent)
    try {
      const r = await (await safeFetch('/chat/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, target_id: targetId, content: payload }),
      })).json()
      if (!r.success) {
        setFooterError(r.err?.message || '转发失败')
      } else {
        setFooterError('')
        const { tokenInfo } = applyChatToStore(r, type, targetId)
        applyTokenInfo(tokenInfo)
        schedulePersistSave()
      }
    } catch {
      setFooterError('转发失败')
    }
  }

  async function doForward({ type, targetId, msgContent }) {
    let contents
    try {
      const parsed = JSON.parse(msgContent)
      contents = Array.isArray(parsed) ? parsed : null
    } catch {
      contents = null
    }
    if (contents) {
      for (const content of contents) await forwardToTarget(type, targetId, content)
    } else {
      await forwardToTarget(type, targetId, msgContent)
    }
    forwardModalVisible.value = false
  }

  async function onForwardConfirm({ type, targetId, msgContent }) {
    if (imageSendPending.value) {
      const msgObj = imageSendPending.value
      imageSendPending.value = null
      forwardModalVisible.value = false
      const r = await sendChatMessage({ type, targetId, msgObj })
      if (r.success) {
        setFooterError('')
        const { tokenInfo } = applyChatToStore(r, type, targetId)
        applyTokenInfo(tokenInfo)
        schedulePersistSave()
        const targetName = type === 'group'
          ? (store.groups?.[targetId]?.name || '群聊')
          : (store.users?.[targetId]?.nickname || store.users?.[targetId]?.realname || '对方')
        showToast('已发送到' + targetName, 'success')
      } else {
        const msg = r.err?.message || '发送失败'
        setFooterError(msg)
        showToast('发送失败：' + msg, 'error')
      }
      return
    }
    await doForward({ type, targetId, msgContent })
  }

  function closeForwardModal() {
    forwardModalVisible.value = false
    imageSendPending.value = null
  }

  async function onImageToolSend(payload = {}) {
    const normalized = typeof payload === 'string' ? { dataUrl: payload } : (payload || {})
    let { data, base64, mime, name, dataUrl } = normalized
    if (!data && !base64 && typeof dataUrl === 'string') {
      const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/)
      if (m) {
        mime = mime || m[1]
        data = m[2]
      } else {
        data = dataUrl
      }
    }
    const imgData = data || base64
    if (!imgData) return
    const finalName = (name || 'image').replace(/\.[^.]+$/, mime === 'image/jpeg' ? '.jpg' : '.png')
    imageSendPending.value = {
      type: 'file',
      name: finalName,
      size: Math.round(imgData.length * 3 / 4),
      data: imgData,
      mime: mime || 'image/png',
    }
    forwardModalVisible.value = true
    nextTick(() => forwardModalRef.value?.focus?.())
    try {
      if (mime && !/^image\/gif$/i.test(mime)) {
        const r = await compressBase64Image(imgData, mime)
        if (r && r.data && imageSendPending.value) {
          imageSendPending.value.data = r.data
          imageSendPending.value.mime = 'image/jpeg'
          imageSendPending.value.size = Math.round(r.data.length * 3 / 4)
        }
      }
    } catch {}
  }

  async function onDropFile({ targetType, targetId, file }) {
    if (!file) return
    setFooterError('')
    try {
      const result = await compressImage(file)
      if (!result) return
      const mime = file.type?.startsWith('image/') ? 'image/jpeg' : (file.type || 'application/octet-stream')
      const msgObj = { type: 'file', name: file.name, size: result.size, data: result.data, mime }
      const r = await sendChatMessage({ type: targetType, targetId, msgObj })
      if (!r.success) {
        setFooterError(r.err?.message || '发送失败')
      } else {
        setFooterError('')
        const { tokenInfo } = applyChatToStore(r, targetType, targetId)
        applyTokenInfo(tokenInfo)
        schedulePersistSave()
      }
    } catch {
      setFooterError('发送失败')
    }
  }

  async function sendPat(targetUid) {
    const footer = getInputFooter?.()
    if (footer?.sending) return
    if (footer) footer.sending = true
    const { pageType, pageId } = getPage()
    const msgObj = { type: 'pat', target: targetUid }
    try {
      const r = await sendChatMessage({ type: pageType, targetId: pageId, msgObj })
      if (r.success) {
        setFooterError('')
        const { tokenInfo } = applyChatToStore(r, pageType, pageId)
        applyTokenInfo(tokenInfo)
        schedulePersistSave()
      } else {
        setFooterError(r.err?.message || '拍一拍发送失败')
      }
    } catch {
      setFooterError('拍一拍发送失败')
    }
    const f2 = getInputFooter?.()
    if (f2) f2.sending = false
  }

  async function onPollVote({ poll, pick, custom, customPick }) {
    const footer = getInputFooter?.()
    if (footer?.sending) return
    if (footer) footer.sending = true
    const { pageType, pageId } = getPage()
    const msgObj = JSON.parse(makeVoteContent(poll, pick, custom, customPick))
    try {
      const r = await sendChatMessage({ type: pageType, targetId: pageId, msgObj })
      if (r.success) {
        setFooterError('')
        const { tokenInfo, free } = applyChatToStore(r, pageType, pageId)
        applyTokenInfo(tokenInfo)
        const chat = r.chat || {}
        recordOwnVote({
          id: chat.id ?? `vote_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          send_time: Number(chat.send_time) || Math.floor(Date.now() / 1000),
          free,
        })
      } else {
        setFooterError(r.err?.message || '投票失败')
      }
    } catch {
      setFooterError('投票失败')
    }
    const f2 = getInputFooter?.()
    if (f2) f2.sending = false
  }

  activeToolImageHandler = onImageToolSend
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (activeToolImageHandler === onImageToolSend) activeToolImageHandler = null
    })
  }

  function batchForward() {
    const selectedIds = [...store.selectedMsgIds]
    if (!selectedIds.length) return
    const contents = selectedIds.map((id) => store.messages[id]?.content).filter(Boolean)
    if (contents.length === 1) {
      startForward(contents[0])
    } else {
      forwardMsgContent.value = JSON.stringify(contents)
      forwardModalVisible.value = true
    }
    onExitMultiSelect?.()
  }

  function onOpenPreview(data) {
    previewData.type = data.type
    previewData.title = data.title
    previewData.src = data.src
    previewData.text = data.text
    previewData.rawContent = ''
    previewData.showActions = false
    previewData.mediaData = data.mediaData || ''
    previewData.mediaMime = data.mediaMime || ''
    previewData.gallery = Array.isArray(data.gallery) ? data.gallery : []
    previewData.galleryIndex = Number.isInteger(data.galleryIndex) ? data.galleryIndex : -1
    previewData.show = true
  }

  function onPreviewStep(delta) {
    const list = previewData.gallery
    if (!Array.isArray(list) || list.length <= 1) return
    const nextIdx = previewData.galleryIndex + delta
    if (nextIdx < 0 || nextIdx >= list.length) return
    const item = list[nextIdx]
    if (!item) return
    previewData.galleryIndex = nextIdx
    previewData.title = item.title || '图片'
    previewData.src = item.src || ''
    previewData.mediaData = item.mediaData || ''
    previewData.mediaMime = item.mediaMime || ''
  }

  function onPreviewCopy() {
    if (!previewData.rawContent) return
    copyMsgContent(previewData.rawContent)
  }

  function onPreviewForward() {
    if (!previewData.rawContent) return
    previewData.show = false
    startForward(previewData.rawContent)
  }

  async function resolvePreviewImagePayload() {
    let data = previewData.mediaData || ''
    let mime = previewData.mediaMime || ''
    const src = previewData.src || ''
    if (!data && src.startsWith('data:')) {
      const m = src.match(/^data:([^;,]+);base64,(.*)$/)
      if (m) { mime = m[1]; data = m[2] }
    }
    if (!data && src) {
      const candidates = [src]
      if (/^https?:\/\//i.test(src)) {
        candidates.push(`/image-proxy?url=${encodeURIComponent(src)}`)
      }
      for (const fetchUrl of candidates) {
        try {
          const res = await fetch(fetchUrl, { credentials: 'omit' })
          if (!res.ok) continue
          const blob = await res.blob()
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let bin = ''
          const CHUNK = 0x8000
          for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
          }
          data = btoa(bin)
          mime = mime || blob.type || 'image/png'
          if (data) break
        } catch {}
      }
    }
    let ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
    if (!mime && src) {
      const m = src.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{2,5})$/)
      if (m) ext = m[1].toLowerCase()
    }
    const name = /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(previewData.title || '')
      ? previewData.title
      : `${previewData.title || '图片'}.${ext}`
    return { data, mime: mime || 'image/png', name, src }
  }

  async function onPreviewDownload() {
    if (previewData.type === 'image') {
      const { data, mime, name, src } = await resolvePreviewImagePayload()
      if (!data && src && /^https?:\/\//i.test(src) && typeof window.api?.downloadUrl === 'function') {
        const r = await window.api.downloadUrl(src, name)
        if (r?.success || r?.canceled) return
      }
      if (!data) {
        showToast('该图片无法下载（缺少原始数据）', 'warning')
        return
      }
      window.api.downloadFile(data, name, mime)
      return
    }
    if (!previewData.rawContent) return
    downloadMsgContent(previewData.rawContent)
  }

  async function onPreviewEdit() {
    if (previewData.type !== 'image' || isWebBrowser()) return
    const { data, mime, name } = await resolvePreviewImagePayload()
    previewData.show = false
    if (!data) {
      showToast('无法读取该图片内容，请先下载后在图片编辑器中打开', 'warning')
      return
    }
    const api = window.api || {}
    if (typeof api.getToolEntryUrl !== 'function') {
      showToast('当前客户端暂不支持在此打开图片编辑器', 'warning')
      return
    }
    try {
      const entry = await api.getToolEntryUrl('image')
      if (!entry || !entry.success || !entry.url) {
        showToast('请先在「工具」页下载安装「图片编辑」工具', 'info')
        openToolsPage?.()
        return
      }
      const event = { name: 'openImage', data: { data, mime, name } }
      if (typeof api.openToolWindow === 'function') {
        const res = await api.openToolWindow({
          id: 'image',
          name: '图片编辑',
          url: entry.url,
          event,
        })
        if (res && res.success === false) {
          showToast(res.error || '打开图片编辑器失败', 'error')
        }
        return
      }
      onOpenTool?.({
        remote: true,
        id: 'image',
        name: '图片编辑',
        url: entry.url,
        pendingEvent: event,
      })
    } catch (e) {
      showToast('打开图片编辑器失败：' + ((e && e.message) || e), 'error')
    }
  }

  return {
    forwardModalVisible,
    forwardMsgContent,
    forwardModalRef,
    imageSendPending,
    previewData,
    startForward,
    onForwardConfirm,
    closeForwardModal,
    onImageToolSend,
    onDropFile,
    sendPat,
    onPollVote,
    batchForward,
    onOpenPreview,
    onPreviewStep,
    onPreviewCopy,
    onPreviewForward,
    onPreviewDownload,
    onPreviewEdit,
  }
}
