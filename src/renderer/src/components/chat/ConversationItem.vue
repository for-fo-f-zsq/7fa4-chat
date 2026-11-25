<template>
  <div
    class="conversation-item"
    :class="{
      active,
      pinned: item.pinned,
      unread: item.unread > 0,
      inactive: item.type === 'user' && !item.watcher,
      exited: item.type === 'group' && item.exited,
      blocked: item.type === 'group' && item.blocked,
      'nav-highlight': navHighlighted,
      'drop-target': isDragging,
    }"
    v-bind="dropZoneProps"
    @click="$emit('select', { type: item.type, id: item.id })"
    @contextmenu.prevent="$emit('contextmenu', $event, item)"
  >
    <UiAvatar
      class="conv-avatar"
      shape="rounded"
      :size="40"
      :color="avatarBg"
      :name="avatarName"
    />
    <div class="conv-info">
      <div
        v-if="item.type === 'user'"
        class="conv-name"
        :style="{ color: getGradeColor(item.id) }"
        :title="getGradeLabel(item.id)"
      >{{ item.displayName }}</div>
      <div v-else class="conv-name">
        {{ item.groupName }}<span v-if="item.blocked" class="conv-blocked-tag">(已屏蔽)</span><span v-else-if="item.exited" class="conv-exited-tag">(已退出)</span>
      </div>

      <div class="conv-last">
        <span v-if="draft" class="conv-draft-tag">[草稿]</span>
        <span v-if="!draft && item.type === 'group' && item.mentioned" class="conv-mention">[有人@你]</span>
        {{ previewText }}
      </div>
    </div>
    <div class="conv-meta">
      <span class="conv-time u-tabular-nums">{{ lastTimeText }}</span>
      <div v-if="muted || (!isWeb && item.unread > 0)" class="conv-meta-badges">
        <i v-if="muted" class="fas fa-bell-slash conv-muted-icon" aria-hidden="true"></i>
        <UiBadge
          v-if="!isWeb && item.unread > 0"
          class="conv-unread-badge"
          size="sm"
          :count="item.unread"
          :variant="muted ? 'neutral' : undefined"
          :color="muted ? '' : 'var(--brand-fill)'"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { UiAvatar, UiBadge } from '@/ui'
import { useFileDrop } from '../../composables/useFileDrop.js'
import {
  getLastMessage,
  getLastMessageSender,
  getLastMessageTime,
  gettime1,
  getGradeColor,
  getGradeLabel,
  getAvatarInitial,
  avatarTint,
} from '../../utils.js'

const props = defineProps({
  item: { type: Object, required: true },
  messages: { type: Object, default: () => ({}) },
  active: { type: Boolean, default: false },
  navHighlighted: { type: Boolean, default: false },
  draft: { type: String, default: '' },
  muted: { type: Boolean, default: false },
  isWeb: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'contextmenu', 'dropFile'])

const avatarBg = computed(() => (
  props.item.type === 'group'
    ? avatarTint('group:' + (props.item.groupName || ''))
    : avatarTint(props.item.id)
))

const avatarName = computed(() => (
  props.item.type === 'user'
    ? getAvatarInitial(props.item.id)
    : (props.item.groupName || '群')
))

// 最后一条消息的预览由 ConversationList 统一预计算（一次扫描、按会话缓存），
// 这里直接读 item.lastText / lastSenderText / lastTime；字段缺失时才回退到自己扫描，
// 保证组件单独使用（测试/其他页面）时行为不变。
const previewText = computed(() => {
  if (props.draft) return props.draft
  const it = props.item
  if (typeof it.lastText === 'string') {
    return it.type === 'group' ? (it.lastSenderText || '') + it.lastText : it.lastText
  }
  const last = getLastMessage(it.message_ids, props.messages)
  if (it.type === 'group') {
    return getLastMessageSender(it.message_ids, props.messages) + last
  }
  return last
})

const lastTimeText = computed(() => {
  const it = props.item
  const t = typeof it.lastTime === 'number'
    ? Math.max(it.lastTime, it.lastSendTime || 0)
    : Math.max(getLastMessageTime(it.message_ids, props.messages), it.lastSendTime || 0)
  return t ? gettime1(t) : ''
})

const { isDragging, dropZoneProps } = useFileDrop({
  multiple: false,
  onFiles: (files) => {
    if (files[0]) emit('dropFile', { targetType: props.item.type, targetId: props.item.id, file: files[0] })
  },
})
</script>
