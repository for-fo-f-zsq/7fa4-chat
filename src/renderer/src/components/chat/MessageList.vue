<template>
  <MessageMultiSelectBar
    :visible="store.multiSelectMode"
    :count="store.selectedMsgIds.length"
    @batchForward="$emit('batchForward')"
    @exit="exitMultiSelect"
  />

  <div class="message-list-shell">
    <!-- scroll 监听由 useMessageScroll 以 passive 方式原生挂载（见该 composable 注释），
         不再走模板事件系统，避免 Vue 每次滚动都创建事件派发开销 -->
    <div class="message-area" ref="messageAreaEl" @click="onMessageAreaClick" @dragstart="onMessageAreaDragStart">
      <div class="load-more-hint-row" v-if="hasOlderMessages && !loadingMore" style="cursor: pointer" @click="triggerLoadOlder()">
        <span class="load-more-hint-text"><i class="fas fa-chevron-up"></i> 向上滚动或点击加载更多</span>
      </div>
      <div class="load-more-spinner" v-if="loadingMore"><i class="fas fa-spinner motion-spin"></i> 加载中...</div>

      <template v-if="!visibleMessages.length && (store.initializing || loadingMore || isConvoLoading)">
        <div class="msg-skeleton motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
        <div class="msg-skeleton right motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
        <div class="msg-skeleton motion-pulse"><UiSkeleton variant="circle" class="skeleton-avatar" :animated="false" /><UiSkeleton variant="rect" class="skeleton-bubble" :animated="false" /></div>
      </template>
      <UiEmptyState
        v-else-if="!visibleMessages.length && !hasOlderMessages"
        class="msg-empty-state"
        icon="far fa-comments"
        title="暂无消息，发条消息打个招呼吧"
        size="md"
      />

      <template v-for="item in messagesWithSeparators" :key="item.type === 'separator' ? 'sep_' + item.timestamp : item.data.id">
        <MessageDateDivider v-if="item.type === 'separator'" :label="item.label" />
        <MessageBubble
          v-else
          :msg="item.data"
          :pageType="pageType"
          :isSelf="item.data.sender == selfUid"
          :multiSelectMode="store.multiSelectMode"
          :selected="selectedIdSet.has(item.data.id)"
          :isPat="item.isPat"
          :avatarInitial="getAvatarInitial(item.data.sender == selfUid ? selfUid : item.data.sender)"
          :avatarBg="avatarTint(item.data.sender == selfUid ? selfUid : item.data.sender)"
          :senderName="displayName(msgSenderUser(item.data))"
          :gradeColor="isSelfMsg(item.data) ? '' : getGradeColor(item.data.sender)"
          :gradeLabel="isSelfMsg(item.data) ? '' : getGradeLabel(item.data.sender)"
          :timeText="timeTextOf(item.data.send_time)"
          :poll="pollOf(item.data)"
          :voting="votingPollId === String(item.data.id)"
          :pollVoterName="pollVoterName"
          :renderedHtml="pollOf(item.data) ? '' : renderContent(item.data.content, item.data.sender, item.data.id)"
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
import { ref, computed, watch } from 'vue'
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
import { UiEmptyState, UiIconButton, UiSkeleton } from '@/ui'
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
const isConvoLoading = computed(() => {
  if (!props.pageId) return false
  const key = `${props.pageType === 'group' ? 'group' : 'user'}:${props.pageId}`
  return store.loadingConvoKey === key
})
const { currentMessages } = useCurrentMessages(() => props.pageType, () => props.pageId)

function isSelfMsg(msg) {
  return !!msg && msg.sender == props.selfUid
}

/**
 * 多选命中原先对每一行都做一次 `store.selectedMsgIds.includes(id)`（O(行数 × 选中数)），
 * 改成一次 Set 构建 + 每行 O(1) 查询；多选态变化时才重建。
 */
const selectedIdSet = computed(() => new Set(store.selectedMsgIds || []))

/** gettime2 每次都 new Date().toLocaleString()（ICU 格式化，单次几十微秒），按时间戳记忆化 */
const timeTextCache = new Map()
function timeTextOf(ts) {
  if (ts == null) return ''
  const hit = timeTextCache.get(ts)
  if (hit !== undefined) return hit
  const text = gettime2(ts)
  if (timeTextCache.size > 800) timeTextCache.clear()
  timeTextCache.set(ts, text)
  return text
}

function msgSenderUser(msg) {
  return store.users?.[msg.sender] || { uid: msg.sender }
}

function pollVoterName(uid) {
  const u = store.users?.[Number(uid)] || store.users?.[uid]
  if (!u) return String(uid)
  return displayName(u) || String(uid)
}

function onPollVote(pollMsg, pick, custom, customPick) {
  if (!pollMsg) return
  const id = String(pollMsg.id)
  votingPollId.value = id
  emit('vote', {
    poll: id,
    pick: Array.isArray(pick) ? pick : [],
    custom: String(custom ?? '').trim(),
    customPick: Array.isArray(customPick) ? customPick : [],
  })
  setTimeout(() => { if (votingPollId.value === id) votingPollId.value = null }, 1200)
}

function renderContent(content, senderId, cacheId) {
  if (!content) return ''
  try {
    // 第三参传 msg.id（render 在 utils/message.js:298 新增的签名）：只有 >8KB 的
    // 媒体消息才按 id 缓存，避免把几十 KB base64 当 Map 键长期驻留；小消息行为不变。
    return parseContent(content, senderId, cacheId)
  } catch (e) {
    console.error('[render] 消息渲染失败，已降级为纯文本：', e)
    const raw = String(content == null ? '' : content)
    const text = raw.length > 500 ? raw.slice(0, 500) + '…' : raw
    return '<div class="unknown-msg">' + esc(text || '[消息渲染失败]') + '</div>'
  }
}

const { isExpandable, isExpanded, isClamped, toggleExpand, markExpanded, noteMessages } = useMessageExpand({
  messageAreaEl,
  pageType: () => props.pageType,
  pageId: () => props.pageId,
  expandedMsgs: props.expandedMsgs,
  isPollMsg: (msg) => !!pollOf(msg),
})

const {
  loadingMore, isAtBottom, hasOlderMessages, visibleMessages,
  scrollToBottom, scrollToBottomInstant, setScrollTopProgrammatic, jumpToMessage, triggerLoadOlder,
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

/**
 * 新滑入窗口的行旧实现靠「每次 onUpdated 全表 querySelectorAll + 逐行 rect」才发现，
 * 现在只把「尚未有实测结论」的 id 排进下一帧（O(可见窗口)，已结算的 id 直接跳过）。
 * flush:'post' 让 DOM 已经插入后再排队，测量一定读到真实行。
 */
watch(visibleMessages, (list) => noteMessages(list), { flush: 'post' })

/**
 * 投票卡片的解析/汇总原先遍历 currentMessages（整个会话的全部消息），
 * 每收到一条新消息就 O(全部消息) 重新 parsePoll + aggregatePoll。
 * 实际只渲染 visibleMessages 这一窗口，改成就窗口内计算：
 * 计算量从 O(会话总消息数) 降到 O(可见窗口)，且窗口外的历史不会被无谓解析。
 */
const pollMap = computed(() => {
  const map = new Map()
  const selfUid = props.selfUid
  for (const msg of visibleMessages.value || []) {
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
  onMsgMenu, copyMsg, downloadMsg, collectMsg, startForward, onMessageAreaClick, onMessageAreaDragStart,
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
