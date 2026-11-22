<template>
  <div
    class="input-footer"
    :class="{ sending: sending, disabled: inputDisabled, 'drag-over': inputDragOver, 'emoji-open': emojiVisible }"
    v-if="pageType === 'group' || (pageType === 'user' && targetUser)"
    v-bind="dropZoneProps"
  >
    <ReplyQuoteBar :replyTo="replyTo" @clear="replyTo = null" />
    <PendingAttachmentsBar :files="pendingFiles" @preview="previewPendingFile" @remove="removePendingFile" />

    <div class="composer-card" :class="{ 'has-preview': previewOpen }">
      <div
        class="input-split"
        :class="{ 'collapse-left': collapseSide === 'left', 'collapse-right': collapseSide === 'right', 'preview-collapsed': !previewOpen }"
      >
        <div
          class="input-split-left"
          v-show="collapseSide !== 'left'"
          :style="splitLeftWidth && !collapseSide && previewOpen ? { width: splitLeftWidth + 'px', flex: 'none' } : {}"
        >
          <div class="textarea-wrap">
            <textarea
              class="input-editor"
              ref="inputEl"
              v-model="inputText"
              rows="1"
              spellcheck="false"
              :disabled="sending || inputDisabled"
              :placeholder="sendPlaceholder"
              @keydown="onInputKeydown"
              @input="onEditorInput"
              @paste="onPaste"
              @scroll="syncPreviewFromInput"
            ></textarea>
            <MentionPopup
              :visible="mentionVisible"
              :popupStyle="mentionPopupStyle"
              :isGroup="pageType === 'group'"
              :activeIndex="mentionIndex"
              :candidates="mentionCandidates"
              @selectAll="applyMentionAll"
              @select="applyMention"
            />
          </div>
        </div>
        <div
          class="input-split-divider"
          v-show="previewOpen && !collapseSide"
          title="拖动调整双栏宽度，拖到边缘继续拖可隐藏该侧"
          @mousedown="onSplitDragStart"
        ></div>
        <div class="input-split-right" v-show="previewOpen && collapseSide !== 'right'">
          <div class="input-preview-label">预览</div>
          <div
            class="input-preview-content luogu-md"
            ref="inputPreviewRef"
            v-if="inputText.trim()"
            v-html="renderMdPreview()"
            @scroll="syncInputFromPreview"
          ></div>
          <div class="input-preview-empty" v-else>输入内容后在此预览</div>
        </div>
      </div>

      <div class="counter-line">
        <div class="input-actions">
          <UiSegmented
            class="fmt-toggle"
            v-model="msgFmt"
            size="sm"
            :items="FMT_ITEMS"
            aria-label="消息格式"
            title="消息格式：纯文本原样显示，Markdown 支持渲染"
          />
          <span class="composer-actions-sep" aria-hidden="true"></span>
          <UiIconButton
            class="preview-btn"
            :icon="previewOpen ? 'fas fa-eye-slash' : 'fas fa-eye'"
            :active="previewOpen"
            size="sm"
            variant="ghost"
            aria-label="预览"
            title="预览渲染效果"
            :disabled="sending || inputDisabled"
            @click="togglePreview"
          />
          <UiIconButton
            id="emoji_btn"
            class="emoji-btn"
            icon="fas fa-smile"
            size="sm"
            variant="ghost"
            :active="emojiVisible"
            aria-label="表情"
            title="表情"
            :disabled="sending || inputDisabled"
            @click.stop="toggleEmoji"
          />
          <UiIconButton
            id="camera_btn"
            class="camera-btn"
            :icon="cameraBusy ? 'fas fa-times' : 'fas fa-camera'"
            size="sm"
            variant="ghost"
            :active="cameraBusy"
            :aria-label="cameraBusy ? '取消拍照' : '拍照'"
            :title="cameraBusy ? '取消拍照' : '拍照'"
            :disabled="sending || inputDisabled"
            @click="takePhoto"
          />
          <div class="more-menu" :class="{ open: moreVisible }">
            <UiIconButton
              ref="moreBtnRef"
              id="more_btn"
              class="more-btn"
              icon="fas fa-ellipsis-h"
              size="sm"
              variant="ghost"
              aria-label="更多"
              title="更多"
              :active="moreVisible"
              :disabled="sending || inputDisabled"
              @click.stop="toggleMore"
            />
            <UiMenu
              :open="moreVisible"
              :anchor="moreBtnRef?.$el"
              placement="top"
              :items="MORE_MENU_ITEMS"
              @select="onMoreSelect"
              @close="moreVisible = false"
            />
          </div>
        </div>

        <div class="composer-right">
          <span class="error motion-shake" v-if="errorMessage">{{ errorMessage }}</span>
          <span class="token-info" :class="{ 'token-info-warn': tokenInfo && tokenInfo.remain <= 2 }" v-if="tokenInfo">
            剩余 {{ tokenInfo.remain }} / {{ tokenInfo.total }} token
            <span class="token-tip-icon" title="token 恢复倒计时" @mouseenter="onTokenHover(true)" @mouseleave="onTokenHover(false)">
              <i class="fas fa-question-circle"></i>
            </span>
            <Transition name="dropdown">
              <span class="token-tooltip" data-placement="top" v-if="tokenTipVisible">
                <template v-if="tokenRecovery.length">
                  <div v-for="(r, i) in tokenRecovery" :key="i" class="token-tooltip-row">
                    <span class="token-tooltip-time">{{ fmtLeft(r.left) }}</span>
                    <span>{{ i === 0 ? '+1 token' : '再 +1 token' }}</span>
                  </div>
                </template>
                <div v-else class="token-tooltip-row">全部 token 可用</div>
              </span>
            </Transition>
          </span>
          <UiButton
            id="send"
            class="send-btn"
            variant="primary"
            size="sm"
            pill
            icon="fas fa-paper-plane"
            :disabled="sending || inputDisabled"
            @click="sendMessage"
          >发送</UiButton>
        </div>
      </div>
    </div>

    <EmojiPicker
      :visible="emojiVisible"
      :stickers="store.stickers"
      @select="onEmojiSelect"
      @selectSticker="onStickerSelect"
      @addSticker="addSticker"
      @removeSticker="removeSticker"
      @previewSticker="previewSticker"
    />

    <PollComposerModal
      :open="pollVisible"
      :pageType="pageType"
      :pageId="pageId"
      :sending="sending"
      @update:sending="(v) => sending = v"
      @close="pollVisible = false"
      @sent="(info) => tokenInfo = info"
    />

    <CameraCaptureModal
      :open="cameraModalOpen"
      @close="closeCameraModal"
      @capture="onCameraCapture"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { store } from '../../store.js'
import {
  parseMsgContent,
  renderMarkdownPreview,
  applyChatToStore,
  sendChatMessage,
  extractMentions,
  isSingleEmoji,
  esc,
} from '../../utils.js'
import { QUANCODE } from '../../qqface-data.js'
import { UiButton, UiIconButton, UiSegmented, UiMenu } from '@/ui'
import { useFileDrop } from '../../composables/useFileDrop.js'
import { useInputDrafts } from '../../composables/chat/useInputDrafts.js'
import { useInputSplit } from '../../composables/chat/useInputSplit.js'
import { useTokenRecovery } from '../../composables/chat/useTokenRecovery.js'
import { useMentionAutocomplete } from '../../composables/chat/useMentionAutocomplete.js'
import { useInputMedia } from '../../composables/chat/useInputMedia.js'
import EmojiPicker from './EmojiPicker.vue'
import ReplyQuoteBar from './ReplyQuoteBar.vue'
import PendingAttachmentsBar from './PendingAttachmentsBar.vue'
import MentionPopup from './MentionPopup.vue'
import PollComposerModal from './PollComposerModal.vue'
import CameraCaptureModal from '../modals/CameraCaptureModal.vue'

const FMT_ITEMS = [{ value: 'txt', label: '纯文本' }, { value: 'md', label: 'MD' }]
const MORE_MENU_ITEMS = [
  { key: 'file', label: '文件', icon: 'fas fa-paperclip' },
  { key: 'poll', label: '投票', icon: 'fas fa-poll' },
]

const props = defineProps({
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  targetUser: { type: Object, default: null },
  targetGroup: { type: Object, default: null },
  inputDisabled: { type: Boolean, default: false },
})

const emit = defineEmits(['openPreview'])

const inputText = ref('')
const inputEl = ref(null)
const inputPreviewRef = ref(null)
const moreBtnRef = ref(null)
const msgFmt = ref('md')
const sending = ref(false)
const errorMessage = ref('')
const replyTo = ref(null)
const emojiVisible = ref(false)
const moreVisible = ref(false)
const pollVisible = ref(false)
const pendingFiles = ref([])

const sendShortcut = computed(() => store.setting?.shortcuts?.sendMessage || 'enter')
const sendPlaceholder = computed(() => {
  const sc = sendShortcut.value.toLowerCase()
  if (sc === 'ctrl+enter') return '输入消息... (Ctrl+Enter发送)'
  if (sc === 'shift+enter') return '输入消息... (Shift+Enter发送)'
  return '输入消息... (Enter发送, Ctrl+Enter换行)'
})

function focus() {
  inputEl.value?.focus()
}

function caretOffset() {
  const ta = inputEl.value
  if (!ta) return inputText.value.length
  return ta.selectionStart ?? ta.value.length
}

function insertAtCaret(text, caretDelta) {
  const ta = inputEl.value
  if (!ta) { inputText.value += text; return }
  const start = ta.selectionStart ?? ta.value.length
  const end = ta.selectionEnd ?? start
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end)
  const caret = start + (caretDelta === undefined ? text.length : caretDelta)
  ta.selectionStart = ta.selectionEnd = caret
  inputText.value = ta.value
  nextTick(() => ta.focus())
}

function renderMdPreview() {
  if (msgFmt.value === 'txt') {
    return inputText.value ? '<div class="plain-msg">' + esc(inputText.value) + '</div>' : ''
  }
  return renderMarkdownPreview(inputText.value)
}

const { clearCurrentDraft } = useInputDrafts({
  pageType: () => props.pageType,
  pageId: () => props.pageId,
  inputText,
  pendingFiles,
})

const {
  splitLeftWidth, collapseSide, previewOpen,
  syncPreviewFromInput, syncInputFromPreview, togglePreview, onSplitDragStart,
} = useInputSplit({ inputEl, inputPreviewRef, inputText })

function autoGrowEditor() {
  const ta = inputEl.value
  if (!ta) return
  if (previewOpen.value) {
    ta.style.height = ''
    return
  }
  ta.style.height = 'auto'
  const h = Math.min(Math.max(ta.scrollHeight || 0, 38), 168)
  ta.style.height = h + 'px'
}

watch([inputText, previewOpen], () => nextTick(autoGrowEditor))
onMounted(() => nextTick(autoGrowEditor))

const { tokenInfo, tokenTipVisible, tokenRecovery, onTokenHover, fmtLeft } = useTokenRecovery()

const {
  mentionVisible, mentionIndex, mentionPopupStyle, mentionCandidates,
  handleMentionInput, handleMentionKeydown, applyMention, applyMentionAll,
} = useMentionAutocomplete({
  pageType: () => props.pageType,
  targetGroup: () => props.targetGroup,
  inputEl,
  inputText,
  caretOffset,
  insertAtCaret,
})

const {
  cameraBusy, cameraModalOpen, removePendingFile, previewPendingFile, sendFileMessage,
  onPaste, sendDroppedFile, onEmojiSelect, onStickerSelect,
  previewSticker, addSticker, removeSticker, takePhoto, closeCameraModal, onCameraCapture,
} = useInputMedia({
  pageType: () => props.pageType,
  pageId: () => props.pageId,
  sending,
  errorMessage,
  tokenInfo,
  pendingFiles,
  focusInput: focus,
  insertAtCaret,
  onOpenPreview: (payload) => emit('openPreview', payload),
})

const { isDragging: inputDragOver, dropZoneProps } = useFileDrop({
  multiple: false,
  disabled: () => sending.value || props.inputDisabled,
  onFiles: (files) => { if (files[0]) sendDroppedFile(files[0]) },
})

function onEditorInput(e) {
  handleMentionInput(e)
  autoGrowEditor()
}

function onInputKeydown(e) {
  if (handleMentionKeydown(e)) return
  if (e.key === 'Enter') {
    const sc = sendShortcut.value.toLowerCase()
    const plain = !e.shiftKey && !e.ctrlKey && !e.altKey
    if (sc === 'enter' && plain) { e.preventDefault(); sendMessage(); return }
    if (sc === 'enter' && e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); insertAtCaret('\n'); return }
    if (sc === 'ctrl+enter' && e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); sendMessage(); return }
    if (sc === 'shift+enter' && e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); sendMessage() }
  }
}

async function postAndApply(msgObj) {
  const r = await sendChatMessage({ type: props.pageType, targetId: props.pageId, msgObj })
  if (!r.success) {
    errorMessage.value = r.err?.message || '发送失败'
    return false
  }
  const { tokenInfo: info } = applyChatToStore(r, props.pageType, props.pageId)
  tokenInfo.value = info
  return true
}

function buildTextPayload(text) {
  const trimmed = text.trim()
  const singleEmojiMsg = msgFmt.value === 'md' && (isSingleEmoji(trimmed) || !!QUANCODE.get(trimmed.toLowerCase()))
  const msgObj = singleEmojiMsg
    ? { type: 'emoji', content: trimmed }
    : { type: 'text', content: text, fmt: msgFmt.value }
  if (replyTo.value) {
    msgObj.reply_to = replyTo.value.id
    msgObj.reply_content = replyTo.value.content
  }
  if (props.pageType === 'group') {
    const mentions = extractMentions(text)
    if (mentions.length) msgObj.mentions = mentions
  }
  return msgObj
}

async function sendMessage() {
  const text = inputText.value.replace(/\n+$/, '')
  const hasText = text.trim().length > 0
  const hasFiles = pendingFiles.value.length > 0
  if (!hasText && !hasFiles) {
    errorMessage.value = '不能发送空消息'
    return
  }
  sending.value = true
  try {
    for (const pf of pendingFiles.value.slice()) {
      const msgObj = { type: 'file', name: pf.name, size: pf.size, data: pf.data, mime: pf.mime }
      if (!(await postAndApply(msgObj))) {
        sending.value = false
        return
      }
      pendingFiles.value = pendingFiles.value.filter((x) => x !== pf)
    }
    if (hasText && !(await postAndApply(buildTextPayload(text)))) {
      sending.value = false
      return
    }
    errorMessage.value = ''
    inputText.value = ''
    replyTo.value = null
    pendingFiles.value = []
    clearCurrentDraft()
  } catch {
    errorMessage.value = '发送失败'
  }
  sending.value = false
}

function formatReplySummary(msg) {
  const obj = parseMsgContent(msg.content)
  if (!obj) return msg.content
  if (obj.type === 'file') {
    return '📄 ' + (obj.name || '') + (obj.content ? ': ' + obj.content : '')
  }
  if (obj.type === 'sticker') return '🖼️ ' + (obj.name || '表情')
  return obj.content || ''
}

function startReply(msg) {
  replyTo.value = { id: msg.id, content: formatReplySummary(msg).slice(0, 80) }
  nextTick(() => focus())
}

function toggleEmoji() {
  emojiVisible.value = !emojiVisible.value
}

function toggleMore() {
  moreVisible.value = !moreVisible.value
  if (moreVisible.value) emojiVisible.value = false
}

function onMoreSelect(key) {
  moreVisible.value = false
  if (key === 'file') sendFileMessage()
  else if (key === 'poll') pollVisible.value = true
}

defineExpose({ inputEl, focus, mentionVisible, emojiVisible, replyTo, sending, errorMessage, tokenInfo, startReply, pendingFiles })
</script>

<style src="../../css/components/input-footer.css"></style>
