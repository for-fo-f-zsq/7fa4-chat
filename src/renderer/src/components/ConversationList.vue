<template>
  <div class="list-section"
    @click="onListClick"
    @dragover.prevent="onListDragOver"
    @dragleave="onListDragLeave"
    @drop.prevent="onListDrop">
    <div class="list-header">
      <h2>消息</h2>
      <div class="list-header-actions">
        <button class="inputModal-btn" v-if="hasUnread" @click="$emit('markAllRead')" title="全部已读">
          <i class="fas fa-check-double"></i>
        </button>
        <button class="inputModal-btn" @click="onNewConversation">
          <i class="fas fa-plus"></i>
        </button>
        <div v-if="showNewMenu" class="new-convo-menu">
          <div class="new-convo-item" @click="onNewUser"><i class="fas fa-user-plus"></i> 添加好友</div>
          <div class="new-convo-item" @click="onNewGroup"><i class="fas fa-users"></i> 创建群聊</div>
        </div>
      </div>
    </div>
    <div class="list-search">
      <div class="list-search-box">
        <i class="fas fa-search list-search-icon"></i>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          class="list-search-input"
          placeholder="搜索联系人或群聊..."
          @keydown.escape.prevent="clearSearch"
          @keydown.down.prevent="navigateList(1)"
          @keydown.up.prevent="navigateList(-1)"
          @keydown.enter.prevent="selectNavigatedItem"
        />
        <button v-if="searchQuery" class="list-search-clear" @click="clearSearch">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
    <div class="list-scroll" ref="listScrollRef">
      <div
        v-for="item in filteredConversations"
        :key="item.key"
        class="conversation-item"
        :class="{
          active: item.type === activeType && pageId === item.id,
          pinned: item.pinned,
          unread: item.unread > 0,
          inactive: item.type === 'user' && !item.realname,
          exited: item.type === 'group' && item.exited,
          blocked: item.type === 'group' && item.blocked,
          'nav-highlight': navIndex >= 0 && filteredConversations[navIndex]?.key === item.key,
          'drop-target': dragOverType === item.type && dragOverId === item.id
        }"
        @click="$emit('select', { type: item.type, id: item.id })"
        @contextmenu.prevent="onContextMenu($event, item)"
        @dragover.prevent="onItemDragOver($event, item.type, item.id)"
        @dragleave="onItemDragLeave($event)"
        @drop.prevent.stop="onItemDrop($event, item.type, item.id)"
      >
        <!-- 私信头像 -->
        <div v-if="item.type === 'user'" class="conv-avatar">
          <div class="avatar-placeholder-sm">{{ getAvatarInitial(item.id) }}</div>
        </div>
        <!-- 群聊头像 -->
        <div v-else class="conv-avatar conv-avatar-group">
          <div class="avatar-placeholder-sm avatar-group-initial">{{ item.groupName ? item.groupName.charAt(0) : '群' }}</div>
        </div>
        <div class="conv-info">
          <!-- 私信名称 -->
          <div v-if="item.type === 'user'" class="conv-name" :style="{ color: getGradeColor(item.id) }" :title="getGradeLabel(item.id)">{{ item.displayName }}</div>
          <!-- 群聊名称 -->
          <div v-else class="conv-name">{{ item.groupName }}<span v-if="item.blocked" class="conv-blocked-tag">(已屏蔽)</span><span v-else-if="item.exited" class="conv-exited-tag">(已退出)</span></div>
          <!-- 私信最后消息 -->
          <div v-if="item.type === 'user'" class="conv-last"><span v-if="hasDraft('user', item.id)" class="conv-draft-tag">[草稿]</span>{{ getDraft('user', item.id) || getLastMessage(item.message_ids, messages) }}</div>
          <!-- 群聊最后消息 -->
          <div v-else class="conv-last"><span v-if="hasDraft('group', item.id)" class="conv-draft-tag">[草稿]</span><span v-if="!hasDraft('group', item.id) && item.mentioned" class="conv-mention">[有人@你]</span>{{ getDraft('group', item.id) || (getLastMessageSender(item.message_ids, messages) + getLastMessage(item.message_ids, messages)) }}</div>
        </div>
        <div class="conv-meta">
          <span class="conv-time">{{ lastTime(item) }}</span>
          <i v-if="isMuted(item.type, item.id)" class="fas fa-bell-slash conv-muted-icon"></i>
          <span v-if="item.unread > 0" class="conv-unread-count">{{ item.unread > 99 ? '99+' : item.unread }}</span>
        </div>
      </div>
      <div v-if="searchQuery && filteredConversations.length === 0" class="list-search-empty">
        无搜索结果
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { store } from '../store.js'
import { getLastMessage, getLastMessageSender, getLastMessageTime, gettime1, displayName, getGradeColor, getGradeLabel, getAvatarInitial, getConvoKey, isConvoMuted } from '../utils.js'

const props = defineProps({
  pageType: String,
  pageId: [String, Number],
  users: Object,
  groups: Object,
  messages: Object
})

const emit = defineEmits(['select', 'Targetmenu', 'dropFile', 'markAllRead', 'newConversation'])

// --- 搜索 ---
const searchQuery = ref('')
const searchInputRef = ref(null)
const navIndex = ref(-1)

function clearSearch() {
  searchQuery.value = ''
  navIndex.value = -1
  searchInputRef.value?.blur()
}

function focusSearch() {
  searchInputRef.value?.focus()
}

// --- 当前激活的会话类型（从 pageType/pageId 推导） ---
const activeType = computed(() => {
  if (props.pageType === 'group') return 'group'
  if (props.pageType === 'user') return 'user'
  // 'chat' 模式：根据 pageId 判断
  if (props.pageId && props.groups?.[props.pageId]) return 'group'
  return 'user'
})

// --- 未读/草稿/免打扰辅助 ---
const hasUnread = computed(() => {
  return Object.values(props.users || {}).some(u => u.unread > 0) ||
         Object.values(props.groups || {}).some(g => g.unread > 0)
})

function getDraft(type, id) {
  const key = getConvoKey(type, id)
  return store.drafts?.[key] || ''
}

function hasDraft(type, id) {
  return !!getDraft(type, id)
}

function isMuted(type, id) {
  return isConvoMuted(type, id)
}

// --- 合并后的会话列表 ---
const sortedConversations = computed(() => {
  const userItems = Object.values(props.users || {})
    .filter(u => u.show !== false && !store.hiddenConvos?.[getConvoKey('user', u.uid)])
    .map(u => ({
      type: 'user',
      id: u.uid,
      key: `user_${u.uid}`,
      pinned: u.pinned,
      unread: u.unread,
      message_ids: u.message_ids,
      realname: u.realname,
      displayName: displayName(u),
      groupName: null,
      mentioned: false,
      exited: false,
      blocked: false,
      _sortTime: getLastMessageTime(u.message_ids, props.messages),
      _hasRealname: u.realname ? 1 : 0,
      _exited: 0
    }))

  const groupItems = Object.values(props.groups || {})
    .filter(g => !store.hiddenConvos?.[getConvoKey('group', g.gid)])
    .map(g => ({
      type: 'group',
      id: g.gid,
      key: `group_${g.gid}`,
      pinned: g.pinned,
      unread: g.unread,
      message_ids: g.message_ids,
      realname: true,
      displayName: null,
      groupName: g.name,
      mentioned: g.mentioned || false,
      exited: g.exited || false,
      blocked: g.blocked || false,
      _sortTime: getLastMessageTime(g.message_ids, props.messages),
      _exited: g.exited ? 1 : 0
    }))

  return [...userItems, ...groupItems].sort((a, b) => {
    // 置顶优先
    if (a.pinned !== b.pinned) return b.pinned - a.pinned
    // 未退出优先（群聊已退出的排后面）
    if (a._exited !== b._exited) return a._exited - b._exited
    // 有真名优先（仅私信之间比较，群聊之间无差异）
    if (a.type === 'user' && b.type === 'user' && a._hasRealname !== b._hasRealname) return b._hasRealname - a._hasRealname
    // 最后消息时间倒序
    return b._sortTime - a._sortTime
  })
})

// --- 搜索过滤 ---
const filteredConversations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = sortedConversations.value
  if (!q) return list
  return list.filter(item => {
    if (item.type === 'user') {
      const u = props.users[item.id]
      if (!u) return false
      const nickname = (u.nickname || '').toLowerCase()
      const realname = (u.realname || '').toLowerCase()
      const username = (u.username || '').toLowerCase()
      const uid = String(u.uid)
      return nickname.includes(q) || realname.includes(q) || username.includes(q) || uid.includes(q)
    } else {
      const g = props.groups[item.id]
      if (!g) return false
      const name = (g.name || '').toLowerCase()
      const gid = String(g.gid)
      return name.includes(q) || gid.includes(q)
    }
  })
})

// --- 新建会话 ---
const showNewMenu = ref(false)

function onNewConversation() {
  setTimeout(()=>showNewMenu.value = !showNewMenu.value,1)
}

function onNewUser() {
  showNewMenu.value = false
  emit('select', { type: 'user', id: '__new__' })
}

function onNewGroup() {
  showNewMenu.value = false
  emit('newConversation', 'group')
}

// 点击外部关闭新建菜单
function onListClick() {
  if (showNewMenu.value) showNewMenu.value = false
}

// --- 右键菜单 ---
function onContextMenu(e, item) {
  if (item.type === 'user') {
    const u = props.users[item.id]
    if (u && u.realname) {
      emit('Targetmenu', e, 'user', item.id)
    }
  } else {
    emit('Targetmenu', e, 'group', item.id)
  }
}

// --- 键盘导航 ---
function navigateList(direction) {
  const list = filteredConversations.value
  if (list.length === 0) return
  if (navIndex.value < 0) {
    navIndex.value = direction > 0 ? 0 : list.length - 1
  } else {
    navIndex.value = (navIndex.value + direction + list.length) % list.length
  }
  scrollToNavItem()
}

function selectNavigatedItem() {
  const list = filteredConversations.value
  if (navIndex.value < 0 || navIndex.value >= list.length) return
  const item = list[navIndex.value]
  emit('select', { type: item.type, id: item.id })
}

function navigateConversation(direction) {
  const list = filteredConversations.value
  if (list.length === 0) return
  const currentIdx = list.findIndex(item => item.type === activeType.value && item.id === props.pageId)
  let nextIdx
  if (currentIdx < 0) {
    nextIdx = direction > 0 ? 0 : list.length - 1
  } else {
    nextIdx = currentIdx + direction
    if (nextIdx < 0 || nextIdx >= list.length) return
  }
  const item = list[nextIdx]
  emit('select', { type: item.type, id: item.id })
}

function scrollToNavItem() {
  nextTick(() => {
    const el = listScrollRef.value?.querySelector('.nav-highlight')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

const listScrollRef = ref(null)

watch(() => props.pageType, () => {
  searchQuery.value = ''
  navIndex.value = -1
})

// --- 原有逻辑 ---
function lastTime(item) {
  const t = getLastMessageTime(item.message_ids, props.messages)
  return t ? gettime1(t) : ''
}

// --- 拖拽转发 ---
const dragOverType = ref('')
const dragOverId = ref(null)

function onListDragOver(e) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function onListDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dragOverType.value = ''
    dragOverId.value = null
  }
}

function onListDrop() {
  dragOverType.value = ''
  dragOverId.value = null
}

function onItemDragOver(e, type, id) {
  dragOverType.value = type
  dragOverId.value = id
  e.dataTransfer.dropEffect = 'copy'
}

function onItemDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dragOverType.value = ''
    dragOverId.value = null
  }
}

function onItemDrop(e, type, id) {
  dragOverType.value = ''
  dragOverId.value = null

  // 仅保留系统文件拖入（dropFile）
  if (e.dataTransfer?.files?.length > 0) {
    const file = e.dataTransfer.files[0]
    emit('dropFile', { targetType: type, targetId: id, file })
  }
}

defineExpose({ focusSearch, navigateConversation })
</script>
