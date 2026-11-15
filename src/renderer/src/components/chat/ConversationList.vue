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
  Object.values(props.users || {}).some((u) => u.unread > 0 && !isUserHiddenBySetting(u)) ||
  Object.values(props.groups || {}).some((g) => g.unread > 0)
))

function getDraft(type, id) {
  if (type === activeType.value && String(id) === String(props.pageId)) return ''
  return store.drafts?.[getConvoKey(type, id)] || ''
}

const hiddenNonMutualCount = computed(() =>
  Object.values(props.users || {}).filter((u) => isUserHiddenBySetting(u)).length
)

const sortedConversations = computed(() => {
  const userItems = Object.values(props.users || {})
    .filter((u) => u.show !== false && !isUserHiddenBySetting(u))
    .map((u) => ({
      type: 'user',
      id: u.uid,
      key: `user_${u.uid}`,
      hidden: !!store.hiddenConvos?.[getConvoKey('user', u.uid)],
      pinned: u.pinned,
      unread: u.unread,
      message_ids: u.message_ids,
      watcher: u.watcher === true,
      displayName: displayName(u),
      groupName: null,
      mentioned: false,
      exited: false,
      blocked: false,
      lastSendTime: u.lastSendTime || 0,
      _sortTime: Math.max(getLastMessageTime(u.message_ids, props.messages), u.lastSendTime || 0),
      _hasWatcher: u.watcher === true ? 1 : 0,
      _exited: 0,
    }))

  const groupItems = Object.values(props.groups || {}).map((g) => ({
    type: 'group',
    id: g.gid,
    key: `group_${g.gid}`,
    hidden: !!store.hiddenConvos?.[getConvoKey('group', g.gid)],
    pinned: g.pinned,
    unread: g.unread,
    message_ids: g.message_ids,
    watcher: true,
    displayName: null,
    groupName: g.name,
    mentioned: g.mentioned || false,
    exited: g.exited || false,
    blocked: g.blocked || false,
    lastSendTime: g.lastSendTime || 0,
    _sortTime: Math.max(getLastMessageTime(g.message_ids, props.messages), g.lastSendTime || 0),
    _exited: g.exited ? 1 : 0,
  }))

  return [...userItems, ...groupItems].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned
    if (a._exited !== b._exited) return a._exited - b._exited
    if (a.type === 'user' && b.type === 'user' && a._hasWatcher !== b._hasWatcher) return b._hasWatcher - a._hasWatcher
    return b._sortTime - a._sortTime
  })
})

const filteredConversations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = sortedConversations.value
  if (!q) return list.filter((item) => !item.hidden)
  return list.filter((item) => {
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
