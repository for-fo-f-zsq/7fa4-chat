import { ref, reactive, nextTick } from 'vue'
import { store } from '../../store.js'
import { safeFetch, applyChatToStore, sendChatMessage } from '../../utils/chatSync.js'
import { compressImage, compressBase64Image } from '../../utils/media.js'
import { makeVoteContent } from '../../utils/poll.js'
import { copyMsgContent, downloadMsgContent } from '../../utils/message.js'
import { showToast } from '../useToast.js'

function stripPollVotes(content) {
  if (!content || typeof content !== 'string' || content.trim()[0] !== '{') return content
  try {
    const obj = JSON.parse(content)
    if (!obj || obj.type !== 'poll') return content
    delete obj.votes
    delete obj.voteMeta
    delete obj.invalid
    delete obj.custom
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

  async function onImageToolSend({ data, base64, mime, name } = {}) {
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
      } else {
        setFooterError(r.err?.message || '拍一拍发送失败')
      }
    } catch {
      setFooterError('拍一拍发送失败')
    }
    const f2 = getInputFooter?.()
    if (f2) f2.sending = false
  }

  async function onPollVote({ poll, pick, custom }) {
    const footer = getInputFooter?.()
    if (footer?.sending) return
    if (footer) footer.sending = true
    const { pageType, pageId } = getPage()
    const msgObj = JSON.parse(makeVoteContent(poll, pick, custom))
    try {
      const r = await sendChatMessage({ type: pageType, targetId: pageId, msgObj })
      if (r.success) {
        setFooterError('')
        const { tokenInfo } = applyChatToStore(r, pageType, pageId)
        applyTokenInfo(tokenInfo)
      } else {
        setFooterError(r.err?.message || '投票失败')
      }
    } catch {
      setFooterError('投票失败')
    }
    const f2 = getInputFooter?.()
    if (f2) f2.sending = false
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
    previewData.show = true
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

  async function onPreviewDownload() {
    if (previewData.type === 'image') {
      let data = previewData.mediaData || ''
      let mime = previewData.mediaMime || ''
      const src = previewData.src || ''
      if (!data && src.startsWith('data:')) {
        const m = src.match(/^data:([^;,]+);base64,(.*)$/)
        if (m) { mime = m[1]; data = m[2] }
      }
      if (!data && src) {
        try {
          const res = await fetch(src, { credentials: 'omit' })
          if (res.ok) {
            const blob = await res.blob()
            const bytes = new Uint8Array(await blob.arrayBuffer())
            let bin = ''
            const CHUNK = 0x8000
            for (let i = 0; i < bytes.length; i += CHUNK) {
              bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
            }
            data = btoa(bin)
            mime = mime || blob.type || 'image/png'
          }
        } catch {}
      }
      if (!data && src && /^https?:\/\//i.test(src) && typeof window.api?.downloadUrl === 'function') {
        const urlExtMatch = src.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{2,5})$/)
        const fallbackExt = urlExtMatch ? urlExtMatch[1].toLowerCase() : 'png'
        const targetName = /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(previewData.title || '')
          ? previewData.title
          : `${previewData.title || '图片'}.${fallbackExt}`
        const r = await window.api.downloadUrl(src, targetName)
        if (r?.success || r?.canceled) return
      }
      if (!data) {
        showToast('该图片无法下载（缺少原始数据）', 'warning')
        return
      }
      const name = /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(previewData.title || '')
        ? previewData.title
        : `${previewData.title || '图片'}.${(mime.split('/')[1] || 'png').replace('jpeg', 'jpg')}`
      window.api.downloadFile(data, name, mime || 'image/png')
      return
    }
    if (!previewData.rawContent) return
    downloadMsgContent(previewData.rawContent)
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
    onPreviewCopy,
    onPreviewForward,
    onPreviewDownload,
  }
}
