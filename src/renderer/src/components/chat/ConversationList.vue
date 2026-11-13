<template>
  <div class="list-section"
    @click="onListClick"
    @dragover.prevent="onListDragOver"
    @dragleave="onListDragLeave"
    @drop.prevent="onListDrop">
    <div class="list-header">
      <h2 class="page-title motion-fade-down-in"><i class="fas fa-comment-dots"></i> 消息</h2>
      <div class="list-header-actions">
        <!-- .inputModal-btn 保留为 Onboarding 定位锚点（plusBtn() 取最后一个），样式由 UiIconButton 提供 -->
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
          class="inputModal-btn"
          icon="fas fa-plus"
          aria-label="新建会话"
          title="新建会话"
          size="sm"
          @click.stop="onNewConversation"
        />
        <Transition name="dropdown">
          <div v-if="showNewMenu" class="new-convo-menu">
            <div class="new-convo-item" @click="onNewUser"><i class="fas fa-user-plus"></i> 添加好友</div>
            <div class="new-convo-item" @click="onNewGroup"><i class="fas fa-users"></i> 创建群聊</div>
          </div>
        </Transition>
      </div>
    </div>
    <!-- 搜索：UiSearchInput 承载输入/前缀图标/清空按钮；键盘导航挂在外层冒泡 -->
    <div
      class="list-search"
      ref="searchRootRef"
      @keydown.escape.prevent="clearSearch"
      @keydown.down.prevent="navigateList(1)"
      @keydown.up.prevent="navigateList(-1)"
      @keydown.enter.prevent="selectNavigatedItem"
    >
      <UiSearchInput
        v-model="searchQuery"
        placeholder="搜索联系人或群聊..."
        size="sm"
        @clear="navIndex = -1"
      />
    </div>
    <div class="list-scroll" ref="listScrollRef">
      <TransitionGroup name="list" tag="div" class="list-inner">
        <div
          v-for="item in filteredConversations"
          :key="item.key"
          class="conversation-item"
          :class="{
            active: item.type === activeType && pageId === item.id,
            pinned: item.pinned,
            unread: item.unread > 0,
            inactive: item.type === 'user' && !item.watcher,
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
          <!-- 私信/群聊头像统一由 UiAvatar 承担（shape="rounded" 与列表/消息一致）；
               底色按会话稳定取马卡龙浅色，文字走 --on-brand 深墨色保证可读性 -->
          <UiAvatar
            class="conv-avatar"
            shape="rounded"
            :size="40"
            :color="convAvatarBg(item)"
            :name="item.type === 'user' ? getAvatarInitial(item.id) : (item.groupName || '群')"
          />
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
            <UiBadge v-if="!isWeb && item.unread > 0" size="md" :count="item.unread" color="var(--brand-fill)" />
          </div>
        </div>
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
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { store } from '../../store.js'
import { UiAvatar, UiBadge, UiEmptyState, UiIconButton, UiSearchInput } from '../../ui/index.js'
import { getLastMessage, getLastMessageSender, getLastMessageTime, gettime1, displayName, getGradeColor, getGradeLabel, getAvatarInitial, getConvoKey, isConvoMuted, isUserHiddenBySetting, avatarTint, isWebBrowser } from '../../utils.js'

// 网页版不显示未读：消息本身按需拉取，未读数没有可靠来源，显示出来只会误导
const isWeb = isWebBrowser()

const props = defineProps({
  pageType: String,
  pageId: [String, Number],
  users: Object,
  groups: Object,
  messages: Object
})

const emit = defineEmits(['select', 'Targetmenu', 'dropFile', 'markAllRead', 'newConversation'])

// 会话头像底色 key：单聊用 uid、群聊用 group:<群名>，与聊天标题/群设置/成员表保持一致
function convAvatarBg(item) {
  if (!item) return undefined
  return item.type === 'group' ? avatarTint('group:' + (item.groupName || '')) : avatarTint(item.id)
}

// --- 搜索 ---
const searchQuery = ref('')
const searchRootRef = ref(null)
const navIndex = ref(-1)

function searchInputEl() {
  return searchRootRef.value?.querySelector('input') || null
}

function clearSearch() {
  searchQuery.value = ''
  navIndex.value = -1
  searchInputEl()?.blur()
}

function focusSearch() {
  searchInputEl()?.focus()
}

// 兼容 A 域 ChatView.vue:1379 对 activeElement.classList 含 .list-search-input 的判断：
// UiSearchInput 的 class 落在包裹层，这里把锚点类同步到内层 input（A 域改用 closest('.list-search') 后可删）。
function syncSearchInputClass() {
  searchInputEl()?.classList.add('list-search-input')
}

onMounted(() => nextTick(syncSearchInputClass))

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
  return Object.values(props.users || {}).some(u => u.unread > 0 && !isUserHiddenBySetting(u)) ||
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

// 因「隐藏非双向好友」被隐藏的数量（用于空列表提示）
const hiddenNonMutualCount = computed(() =>
  Object.values(props.users || {}).filter(u => isUserHiddenBySetting(u)).length
)

// --- 合并后的会话列表 ---
const sortedConversations = computed(() => {
  const userItems = Object.values(props.users || {})
    .filter(u => u.show !== false)
    .filter(u => !isUserHiddenBySetting(u))
    .map(u => ({
      type: 'user',
      id: u.uid,
      key: `user_${u.uid}`,
      hidden: !!store.hiddenConvos?.[getConvoKey('user', u.uid)],
      pinned: u.pinned,
      unread: u.unread,
      message_ids: u.message_ids,
      realname: u.realname,
      watcher: u.watcher === true,
      watchee: u.watchee === true,
      displayName: displayName(u),
      groupName: null,
      mentioned: false,
      exited: false,
      blocked: false,
      lastSendTime: u.lastSendTime || 0,
      _sortTime: Math.max(getLastMessageTime(u.message_ids, props.messages), u.lastSendTime || 0),
      _hasWatcher: u.watcher === true ? 1 : 0,
      _exited: 0
    }))

  const groupItems = Object.values(props.groups || {})
    .map(g => ({
      type: 'group',
      id: g.gid,
      key: `group_${g.gid}`,
      hidden: !!store.hiddenConvos?.[getConvoKey('group', g.gid)],
      pinned: g.pinned,
      unread: g.unread,
      message_ids: g.message_ids,
      realname: null,
      watcher: true,
      displayName: null,
      groupName: g.name,
      mentioned: g.mentioned || false,
      exited: g.exited || false,
      blocked: g.blocked || false,
      lastSendTime: g.lastSendTime || 0,
      _sortTime: Math.max(getLastMessageTime(g.message_ids, props.messages), g.lastSendTime || 0),
      _exited: g.exited ? 1 : 0
    }))

  return [...userItems, ...groupItems].sort((a, b) => {
    // 置顶优先
    if (a.pinned !== b.pinned) return b.pinned - a.pinned
    // 未退出优先（群聊已退出的排后面）
    if (a._exited !== b._exited) return a._exited - b._exited
    // 对方关注我（可联系）优先（仅私信之间比较，群聊之间无差异）
    if (a.type === 'user' && b.type === 'user' && a._hasWatcher !== b._hasWatcher) return b._hasWatcher - a._hasWatcher
    // 最后消息时间倒序
    return b._sortTime - a._sortTime
  })
})

// --- 搜索过滤 ---
// 默认列表过滤「不显示」的会话；一旦输入搜索词，隐藏会话也纳入结果（仍按名字/UID 过滤），
// 便于搜到后右键「取消不显示」。
const filteredConversations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = sortedConversations.value
  if (!q) return list.filter(item => !item.hidden)
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
  showNewMenu.value = !showNewMenu.value
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
    // 双向好友（watcher）才提供右键资料/免打扰等操作；但被「不显示」的会话即使不是好友，
    // 在搜索结果里也要能右键把「不显示」取消掉 —— 否则隐藏后无从恢复。
    if (u && (u.watcher || item.hidden)) {
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
  // 网页版没有本地消息可算，用 target-times 探针回填的 lastSendTime（同为秒级）兜底
  const t = Math.max(getLastMessageTime(item.message_ids, props.messages), item.lastSendTime || 0)
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

<style scoped src="../../css/components/conversation-list.css"></style>
