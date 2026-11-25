<template>
  <div class="list-section">
    <div class="list-header">
      <h2 class="page-title motion-fade-down-in"><i class="fas fa-comment-dots"></i> 消息</h2>
      <div class="list-header-actions">
        <!-- .inputModal-btn 保留为 Onboarding 定位锚点 -->
        <UiIconButton
          v-if="hasUnread"
          class="inputModal-btn"
          icon="fas fa-check-double"
          aria-label="全部已读"
          title="全部已读"
          size="sm"
          @click="$emit('markAllRead')"
        />
        <UiIconButton
          ref="newBtnRef"
          class="inputModal-btn"
          icon="fas fa-plus"
          aria-label="新建会话"
          title="新建会话"
          size="sm"
          @click.stop="showNewMenu = !showNewMenu"
        />
        <UiMenu
          :open="showNewMenu"
          :anchor="newBtnRef?.$el"
          placement="bottom"
          :items="NEW_MENU_ITEMS"
          @select="onNewMenuSelect"
          @close="showNewMenu = false"
        >
          <template #item="{ item }">
            <span class="new-convo-item"><i :class="item.icon" aria-hidden="true"></i> {{ item.label }}</span>
          </template>
        </UiMenu>
      </div>
    </div>

    <div
      class="list-search"
      @keydown.escape.prevent="clearSearch"
      @keydown.down.prevent="navigateList(1)"
      @keydown.up.prevent="navigateList(-1)"
      @keydown.enter.prevent="selectNavigatedItem"
    >
      <UiSearchInput
        ref="searchInputRef"
        v-model="searchQuery"
        placeholder="搜索联系人或群聊..."
        size="sm"
        @clear="navIndex = -1"
      />
    </div>

    <div class="list-scroll" ref="listScrollRef">
      <TransitionGroup name="list" tag="div" class="list-inner">
        <ConversationItem
          v-for="item in filteredConversations"
          :key="item.key"
          :item="item"
          :messages="messages"
          :active="item.type === activeType && pageId === item.id"
          :navHighlighted="navIndex >= 0 && filteredConversations[navIndex]?.key === item.key"
          :draft="getDraft(item.type, item.id)"
          :muted="isConvoMuted(item.type, item.id)"
          :isWeb="isWeb"
          @select="$emit('select', $event)"
          @contextmenu="onContextMenu"
          @dropFile="$emit('dropFile', $event)"
        />
      </TransitionGroup>

      <UiEmptyState
        v-if="searchQuery && filteredConversations.length === 0"
        size="sm"
        icon="fas fa-magnifying-glass"
        title="无搜索结果"
      />
      <UiEmptyState
        v-else-if="filteredConversations.length === 0 && hiddenNonMutualCount > 0"
        size="sm"
        icon="fas fa-user-slash"
        :title="`已隐藏 ${hiddenNonMutualCount} 个非双向好友`"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { store } from '../../store.js'
import { UiEmptyState, UiIconButton, UiMenu, UiSearchInput } from '@/ui'
import {
  getLastMessage,
  getLastMessageSender,
  getLastMessageTime,
  displayName,
  getConvoKey,
  isConvoMuted,
  isUserHiddenBySetting,
  isWebBrowser,
} from '../../utils.js'
import ConversationItem from './ConversationItem.vue'

const NEW_MENU_ITEMS = [
  { key: 'user', label: '添加好友', icon: 'fas fa-user-plus' },
  { key: 'group', label: '创建群聊', icon: 'fas fa-users' },
]

const isWeb = isWebBrowser()

const props = defineProps({
  pageType: String,
  pageId: [String, Number],
  users: Object,
  groups: Object,
  messages: Object,
})

const emit = defineEmits(['select', 'Targetmenu', 'dropFile', 'markAllRead', 'newConversation'])

const searchQuery = ref('')
const searchInputRef = ref(null)
const newBtnRef = ref(null)
const listScrollRef = ref(null)
const navIndex = ref(-1)
const showNewMenu = ref(false)

function clearSearch() {
  searchQuery.value = ''
  navIndex.value = -1
  searchInputRef.value?.el?.blur?.()
}

function focusSearch() {
  searchInputRef.value?.focus()
}

const activeType = computed(() => {
  if (props.pageType === 'group') return 'group'
  if (props.pageType === 'user') return 'user'
  if (props.pageId && props.groups?.[props.pageId]) return 'group'
  return 'user'
})

const hasUnread = computed(() => (
  Object.values(props.users || {}).some((u) => !!u && typeof u === 'object' && u.unread > 0 && !isUserHiddenBySetting(u)) ||
  Object.values(props.groups || {}).some((g) => !!g && typeof g === 'object' && g.unread > 0)
))

function getDraft(type, id) {
  if (type === activeType.value && String(id) === String(props.pageId)) return ''
  return store.drafts?.[getConvoKey(type, id)] || ''
}

const hiddenNonMutualCount = computed(() =>
  Object.values(props.users || {}).filter((u) => !!u && typeof u === 'object' && isUserHiddenBySetting(u)).length
)

// ========== 会话项构造：引用稳定化 ==========
// 会话列表的瓶颈不是「算出列表」，而是「每次数据变动都让所有会话项换新 props」：
// v-for 里的 ConversationItem 只要 props 变了就要重跑 render + 4 个 computed。
// 所以这里对每个会话源对象做记忆化——照常算出候选 item，但逐字段比较后
// 若无变化就返回上一次的对象，于是父组件重算不会把没变的会话项拖下水。
const itemCache = new WeakMap()

function sameShallow(a, b) {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of kb) {
    if (!Object.is(a[k], b[k])) return false
  }
  return true
}

function memoItem(source, candidate) {
  if (!source || typeof source !== 'object') return candidate
  const prev = itemCache.get(source)
  const item = prev && sameShallow(prev, candidate) ? prev : candidate
  itemCache.set(source, item)
  return item
}

// 最后一条消息摘要缓存：getLastMessage / getLastMessageTime / getLastMessageSender
// 都是 O(会话消息数) 的全量扫描。以前每个会话项要扫 3 遍，且每次列表重算都重扫；
// 这里按 message_ids 数组做记忆化，只在「会影响结果的那几个事实」变化时才重扫。
//
// 注意缓存键必须取「send_time 最大的那条」，不能取数组末位：三个 utils 的口径都是
// 「send_time 最大」（见 utils/message.js:347-385），而 id 顺序与时间顺序可能分叉
// （上滑补历史用 unshift、跨端重传/时钟偏移都可能让末位不是最新那条）。
const EMPTY_SUMMARY = {
  len: 0, lastId: null, lastMsg: undefined, senderUser: null, senderName: null,
  time: 0, text: '', senderText: '',
}
const summaryCache = new WeakMap()

function convoSummary(ids, messages) {
  if (!Array.isArray(ids) || ids.length === 0) return EMPTY_SUMMARY
  const len = ids.length
  // 一次扫描拿到「时间最新」的那条（与 getLastMessage/Sender 的严格 > 口径一致）
  // 以及最新的时间戳（getLastMessageTime 额外接受 msg.time 兜底）。
  let newestId = null
  let newestMsg = undefined
  let newestSendTime = -1
  let newestTime = 0
  for (const id of ids) {
    const m = messages[id]
    if (!m) continue
    const st = m.send_time || 0
    if (st > newestSendTime) {
      newestSendTime = st
      newestId = id
      newestMsg = m
    }
    const t = st || m.time || 0
    if (t > newestTime) newestTime = t
  }
  const senderUid = newestMsg ? newestMsg.sender : null
  const senderUser = senderUid == null ? null : (store.users?.[senderUid] || null)
  // 用户对象是原地改字段的（备注/昵称随时可能变），只比对象引用会漏掉改名，故带上名字一起比。
  const senderName = senderUser ? (senderUser.note || senderUser.nickname || senderUser.username || null) : null
  const cached = summaryCache.get(ids)
  if (cached
    && cached.len === len
    && cached.lastId === newestId
    && cached.lastMsg === newestMsg
    && cached.time === newestTime
    && cached.senderUser === senderUser
    && cached.senderName === senderName) return cached
  const entry = {
    len,
    lastId: newestId,
    lastMsg: newestMsg,
    senderUser,
    senderName,
    time: getLastMessageTime(ids, messages),
    text: getLastMessage(ids, messages),
    senderText: getLastMessageSender(ids, messages),
  }
  summaryCache.set(ids, entry)
  return entry
}

// 排序结果引用也要稳定：内容没变就返回旧数组，下游 filteredConversations 与
// v-for 的 patch 才不会白跑一趟。
let prevSorted = []
let prevFiltered = []

const sortedConversations = computed(() => {
  const messages = props.messages
  const items = []

  for (const key in (props.users || {})) {
    const u = props.users[key]
    // typeof 守卫：历史脏数据（unread=true/1 之类）可能让某个键变成非对象，
    // 后续 memoItem 的 WeakMap 会直接抛 TypeError 把整个列表 computed 打死。
    if (!u || typeof u !== 'object' || u.show === false || isUserHiddenBySetting(u)) continue
    const summary = convoSummary(u.message_ids, messages)
    items.push(memoItem(u, {
      type: 'user',
      id: u.uid,
      key: `user_${u.uid}`,
      hidden: !!store.hiddenConvos?.[getConvoKey('user', u.uid)],
      // 归一成布尔：pinned 在 store 里只有「被置顶时为 true，否则根本没有该字段」，
      // 直接拿去相减（true - undefined）会得到 NaN，比较器失效 → 置顶项不一定浮到最前。
      pinned: u.pinned === true,
      unread: u.unread,
      message_ids: u.message_ids,
      watcher: u.watcher === true,
      displayName: displayName(u),
      groupName: null,
      mentioned: false,
      exited: false,
      blocked: false,
      lastSendTime: u.lastSendTime || 0,
      // 预计算好的最后一条消息摘要，ConversationItem 直接读，不再自己扫一遍
      lastText: summary.text,
      lastSenderText: '',
      lastTime: summary.time,
      _sortTime: Math.max(summary.time, u.lastSendTime || 0),
      _hasWatcher: u.watcher === true ? 1 : 0,
      _exited: 0,
    }))
  }

  for (const key in (props.groups || {})) {
    const g = props.groups[key]
    if (!g || typeof g !== 'object') continue
    const summary = convoSummary(g.message_ids, messages)
    items.push(memoItem(g, {
      type: 'group',
      id: g.gid,
      key: `group_${g.gid}`,
      hidden: !!store.hiddenConvos?.[getConvoKey('group', g.gid)],
      pinned: g.pinned === true,
      unread: g.unread,
      message_ids: g.message_ids,
      watcher: true,
      displayName: null,
      groupName: g.name,
      mentioned: g.mentioned || false,
      exited: g.exited || false,
      blocked: g.blocked || false,
      lastSendTime: g.lastSendTime || 0,
      lastText: summary.text,
      lastSenderText: summary.senderText,
      lastTime: summary.time,
      _sortTime: Math.max(summary.time, g.lastSendTime || 0),
      _hasWatcher: g.exited ? 0 : 1,
      _exited: g.exited ? 1 : 0,
    }))
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned
    if (a._exited !== b._exited) return a._exited - b._exited
    if (a._hasWatcher !== b._hasWatcher) return b._hasWatcher - a._hasWatcher
    return b._sortTime - a._sortTime
  })

  if (items.length === prevSorted.length) {
    let same = true
    for (let i = 0; i < items.length; i++) {
      if (items[i] !== prevSorted[i]) { same = false; break }
    }
    if (same) return prevSorted
  }
  prevSorted = items
  return items
})

const filteredConversations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = sortedConversations.value
  let out
  if (!q) {
    out = list.filter((item) => !item.hidden)
  } else {
    out = list.filter((item) => {
      if (item.type === 'user') {
        const u = props.users[item.id]
        if (!u) return false
        return (u.nickname || '').toLowerCase().includes(q) ||
          (u.realname || '').toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q) ||
          String(u.uid).includes(q)
      }
      const g = props.groups[item.id]
      if (!g) return false
      return (g.name || '').toLowerCase().includes(q) || String(g.gid).includes(q)
    })
  }
  if (out.length === prevFiltered.length) {
    let same = true
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== prevFiltered[i]) { same = false; break }
    }
    if (same) return prevFiltered
  }
  prevFiltered = out
  return out
})

function onNewMenuSelect(key) {
  showNewMenu.value = false
  if (key === 'user') emit('select', { type: 'user', id: '__new__' })
  else if (key === 'group') emit('newConversation', 'group')
}

function onContextMenu(e, item) {
  if (item.type === 'user') {
    const u = props.users[item.id]
    if (u && (u.watcher || item.hidden)) emit('Targetmenu', e, 'user', item.id)
  } else {
    emit('Targetmenu', e, 'group', item.id)
  }
}

function navigateList(direction) {
  const list = filteredConversations.value
  if (!list.length) return
  if (navIndex.value < 0) navIndex.value = direction > 0 ? 0 : list.length - 1
  else navIndex.value = (navIndex.value + direction + list.length) % list.length
  nextTick(() => {
    listScrollRef.value?.querySelector('.nav-highlight')?.scrollIntoView({ block: 'nearest' })
  })
}

function selectNavigatedItem() {
  const list = filteredConversations.value
  if (navIndex.value < 0 || navIndex.value >= list.length) return
  const item = list[navIndex.value]
  emit('select', { type: item.type, id: item.id })
}

function navigateConversation(direction) {
  const list = filteredConversations.value
  if (!list.length) return
  const currentIdx = list.findIndex((item) => item.type === activeType.value && item.id === props.pageId)
  let nextIdx
  if (currentIdx < 0) nextIdx = direction > 0 ? 0 : list.length - 1
  else {
    nextIdx = currentIdx + direction
    if (nextIdx < 0 || nextIdx >= list.length) return
  }
  const item = list[nextIdx]
  emit('select', { type: item.type, id: item.id })
}

watch(() => props.pageType, () => {
  searchQuery.value = ''
  navIndex.value = -1
})

defineExpose({ focusSearch, navigateConversation })
</script>

<style src="../../css/components/conversation-list.css"></style>
