<template>
  <MessageMultiSelectBar
    :visible="store.multiSelectMode"
    :count="store.selectedMsgIds.length"
    @batchForward="$emit('batchForward')"
    @exit="exitMultiSelect"
  />

  <div class="message-list-shell">
    <div class="message-area" ref="messageAreaEl" @scroll="onScroll" @click="onMessageAreaClick">
      <div class="load-more-hint-row" v-if="hasOlderMessages && !loadingMore">
        <span class="load-more-hint-text"><i class="fas fa-chevron-up"></i> 向上滚动加载更多</span>
      </div>
      <div class="load-more-spinner" v-if="loadingMore"><i class="fas fa-spinner motion-spin"></i> 加载中...</div>

      <template v-if="!visibleMessages.length && !hasOlderMessages">
        <div class="msg-skeleton motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
        <div class="msg-skeleton right motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
        <div class="msg-skeleton motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
      </template>

      <template v-for="item in messagesWithSeparators" :key="item.type === 'separator' ? 'sep_' + item.timestamp : item.data.id">
        <MessageDateDivider v-if="item.type === 'separator'" :label="item.label" />
        <MessageBubble
          v-else
          :msg="item.data"
          :pageType="pageType"
          :isSelf="item.data.sender == selfUid"
          :multiSelectMode="store.multiSelectMode"
          :selected="store.selectedMsgIds.includes(item.data.id)"
          :isPat="item.isPat"
          :avatarInitial="getAvatarInitial(item.data.sender == selfUid ? selfUid : item.data.sender)"
          :avatarBg="avatarTint(item.data.sender == selfUid ? selfUid : item.data.sender)"
          :senderName="displayName(msgSenderUser(item.data))"
          :gradeColor="getGradeColor(item.data.sender)"
          :gradeLabel="getGradeLabel(item.data.sender)"
          :timeText="gettime2(item.data.send_time)"
          :poll="pollOf(item.data)"
          :voting="votingPollId === String(item.data.id)"
          :pollVoterName="pollVoterName"
          :renderedHtml="pollOf(item.data) ? '' : renderContent(item.data.content, item.data.sender)"
          :clamped="isClamped(item.data)"
          :expandable="isExpandable(item.data)"
          :expanded="isExpanded(item.data)"
          @toggleSelect="toggleMsgSelect"
          @avatarClick="onAvatarSingleClick"
          @avatarDblClick="onAvatarDoubleClick"
          @groupMenu="(e, sender) => $emit('openGroupActionMenu', e, sender)"
          @contextMenu="onMsgMenu"
          @vote="onPollVote"
          @toggleExpand="toggleExpand"
        />
      </template>
    </div>

    <Transition name="pop">
      <UiIconButton
        class="scroll-to-bottom-btn"
        v-if="!isAtBottom"
        icon="fas fa-chevron-down"
        aria-label="滚动到底部"
        title="滚动到底部"
        round
        @click="scrollToBottom"
      />
    </Transition>
  </div>

  <MsgMenu
    v-if="msgCtx.show"
    :x="msgCtx.x"
    :y="msgCtx.y"
    :canDownload="msgCtx.canDownload"
    :canCollect="msgCtx.canCollect"
    :isOwn="msgCtx.isOwn"
    @copy="copyMsg"
    @forward="startForward"
    @download="downloadMsg"
    @reply="$emit('startReply', store.messages[msgCtx.msgId]); msgCtx.show = false"
    @collect="collectMsg"
    @multiselect="enterMultiSelect"
    @close="msgCtx.show = false"
  />
</template>

<script setup>
import { ref, computed } from 'vue'
import { store } from '../../store.js'
import {
  gettime2,
  parseContent,
  parseMsgContent,
  displayName,
  getGradeColor,
  getGradeLabel,
  getAvatarInitial,
  formatDateSeparator,
  isSameDay,
  parsePoll,
  aggregatePoll,
  avatarTint,
  esc,
} from '../../utils.js'
import { UiIconButton, UiSkeleton } from '@/ui'
import { useCurrentMessages } from '../../composables/useCurrentMessages.js'
import { useMessageExpand } from '../../composables/chat/useMessageExpand.js'
import { useMessageScroll } from '../../composables/chat/useMessageScroll.js'
import { useMessageActions } from '../../composables/chat/useMessageActions.js'
import MsgMenu from './MsgMenu.vue'
import MessageBubble from './MessageBubble.vue'
import MessageDateDivider from './MessageDateDivider.vue'
import MessageMultiSelectBar from './MessageMultiSelectBar.vue'

const props = defineProps({
  pageType: { type: String, required: true },
  pageId: { type: [Number, String], default: null },
  selfUid: { type: Number, default: null },
  expandedMsgs: { type: Object, required: true },
  visibleCount: { type: Number, required: true },
  canLoadOlder: { type: Boolean, default: null },
})

const emit = defineEmits([
  'sendPat',
  'openGroupActionMenu',
  'scrollToTop',
  'startReply',
  'openUserInfo',
  'forward',
  'batchForward',
  'openPreview',
  'vote',
])

const messageAreaEl = ref(null)
const votingPollId = ref(null)

const targetUser = computed(() => store.users?.[props.pageId] || null)
const targetGroup = computed(() => store.groups?.[props.pageId] || null)
const { currentMessages } = useCurrentMessages(() => props.pageType, () => props.pageId)

const pollMap = computed(() => {
  const map = new Map()
  const selfUid = props.selfUid
  for (const msg of currentMessages.value || []) {
    if (!msg) continue
    const def = parsePoll(parseMsgContent(msg.content))
    if (!def) continue
    map.set(String(msg.id), { def, result: aggregatePoll(def, msg.id, selfUid) })
  }
  return map
})

function pollOf(msg) {
  return msg ? (pollMap.value.get(String(msg.id)) || null) : null
}

function msgSenderUser(msg) {
  return store.users?.[msg.sender] || { uid: msg.sender }
}

function pollVoterName(uid) {
  const u = store.users?.[Number(uid)] || store.users?.[uid]
  if (!u) return String(uid)
  return displayName(u) || String(uid)
}

function onPollVote(pollMsg, pick, custom) {
  if (!pollMsg) return
  const id = String(pollMsg.id)
  votingPollId.value = id
  emit('vote', { poll: id, pick: Array.isArray(pick) ? pick : [], custom: String(custom ?? '').trim() })
  setTimeout(() => { if (votingPollId.value === id) votingPollId.value = null }, 1200)
}

function renderContent(msg, senderId) {
  if (!msg) return ''
  try {
    return parseContent(msg, senderId)
  } catch (e) {
    console.error('[render] 消息渲染失败，已降级为纯文本：', e)
    const raw = String(msg.content == null ? '' : msg.content)
    const text = raw.length > 500 ? raw.slice(0, 500) + '…' : raw
    return '<div class="unknown-msg">' + esc(text || '[消息渲染失败]') + '</div>'
  }
}

const { isExpandable, isExpanded, isClamped, toggleExpand, markExpanded } = useMessageExpand({
  messageAreaEl,
  pageType: () => props.pageType,
  pageId: () => props.pageId,
  expandedMsgs: props.expandedMsgs,
  isPollMsg: (msg) => !!pollOf(msg),
})

const {
  loadingMore, isAtBottom, hasOlderMessages, visibleMessages,
  onScroll, scrollToBottom, scrollToBottomInstant, setScrollTopProgrammatic, jumpToMessage,
} = useMessageScroll({
  messageAreaEl,
  pageType: () => props.pageType,
  pageId: () => props.pageId,
  selfUid: () => props.selfUid,
  visibleCount: () => props.visibleCount,
  canLoadOlder: () => props.canLoadOlder,
  currentMessages,
  targetUser,
  targetGroup,
  onLoadOlder: (height) => emit('scrollToTop', height),
  onLoadAll: () => emit('scrollToTop', 0, true),
  onEnsureExpanded: markExpanded,
})

const messagesWithSeparators = computed(() => {
  const result = []
  let lastDate = null
  for (const msg of visibleMessages.value) {
    if (!isSameDay(msg.send_time, lastDate)) {
      result.push({ type: 'separator', timestamp: msg.send_time, label: formatDateSeparator(msg.send_time) })
      lastDate = msg.send_time
    }
    result.push({ type: 'msg', data: msg, isPat: isPatMsg(msg) })
  }
  return result
})

const {
  msgCtx, onAvatarSingleClick, onAvatarDoubleClick, isPatMsg,
  enterMultiSelect, exitMultiSelect, toggleMsgSelect,
  onMsgMenu, copyMsg, downloadMsg, collectMsg, startForward, onMessageAreaClick,
} = useMessageActions({
  messageAreaEl,
  selfUid: () => props.selfUid,
  onForward: (content) => emit('forward', content),
  onOpenPreview: (payload) => emit('openPreview', payload),
  onOpenUserInfo: (uid) => emit('openUserInfo', uid),
  onSendPat: (uid) => emit('sendPat', uid),
  onJumpToMessage: jumpToMessage,
})

defineExpose({ messageAreaEl, scrollToBottom, scrollToBottomInstant, setScrollTopProgrammatic, jumpToMessage, msgCtx, exitMultiSelect })
</script>

<style src="../../css/components/message-list.css"></style>
