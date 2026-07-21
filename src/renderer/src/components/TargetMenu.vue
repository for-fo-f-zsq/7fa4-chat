<template>
  <ContextMenu
    :visible="show"
    :x="x"
    :y="y"
    :items="menuItems"
    @select="onSelect"
    @close="$emit('close')"
  />
</template>

<script setup>
import { computed } from 'vue'
import { store } from '../store.js'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  type: String,
  x: Number,
  y: Number,
  id: [String, Number],
  isPinned: Boolean,
  isUnread: Boolean
})

const emit = defineEmits(['close', 'pin', 'showuserinfo', 'showgroupinfo', 'leavegroup', 'blockgroup', 'unblockgroup', 'dissolvegroup', 'deletegroup', 'deleteconvo', 'mute', 'unmute', 'markread', 'markunread'])

const show = computed(() => true)

const isOwner = computed(() => {
  if (props.type !== 'group') return false
  const group = store.groups?.[props.id]
  if (!group) return false
  const selfMember = group.users.find(u => String(u.user_id) === String(store.self.uid))
  return selfMember?.type === 'Owner'
})

const isBlocked = computed(() => {
  if (props.type !== 'group') return false
  return store.groups?.[props.id]?.blocked || false
})

const isExited = computed(() => {
  if (props.type !== 'group') return false
  return store.groups?.[props.id]?.exited || false
})

const menuItems = computed(() => {
  const items = []
  const convoKey = `${props.type}_${props.id}`
  const isMuted = !!store.mutedConvos?.[convoKey]
  if (props.type === 'user') {
    items.push({ value: 'pin', label: props.isPinned ? '取消置顶' : '置顶', icon: 'fas fa-thumbtack' })
    items.push({ value: 'showuserinfo', label: '好友详情', icon: 'fas fa-user' })
    items.push({ value: isMuted ? 'unmute' : 'mute', label: isMuted ? '取消免打扰' : '消息免打扰', icon: isMuted ? 'fas fa-bell' : 'fas fa-bell-slash' })
    items.push({ value: props.isUnread ? 'markread' : 'markunread', label: props.isUnread ? '标记已读' : '标记未读', icon: props.isUnread ? 'fas fa-check' : 'fas fa-envelope' })
    items.push({ value: 'deleteconvo', label: '删除聊天记录', icon: 'fas fa-trash' })
  }
  if (props.type === 'group') {
    if (isExited.value) {
      if (isBlocked.value) {
        items.push({ value: 'unblockgroup', label: '取消屏蔽', icon: 'fas fa-ban' })
      } else {
        items.push({ value: 'blockgroup', label: '屏蔽', icon: 'fas fa-ban' })
      }
      items.push({ value: 'deletegroup', label: '删除', icon: 'fas fa-trash' })
    } else {
      items.push({ value: 'pin', label: props.isPinned ? '取消置顶' : '置顶', icon: 'fas fa-thumbtack' })
      items.push({ value: 'showgroupinfo', label: '群详情', icon: 'fas fa-users' })
      items.push({ value: isMuted ? 'unmute' : 'mute', label: isMuted ? '取消免打扰' : '消息免打扰', icon: isMuted ? 'fas fa-bell' : 'fas fa-bell-slash' })
      items.push({ value: props.isUnread ? 'markread' : 'markunread', label: props.isUnread ? '标记已读' : '标记未读', icon: props.isUnread ? 'fas fa-check' : 'fas fa-envelope' })
      if (isBlocked.value) {
        items.push({ value: 'unblockgroup', label: '取消屏蔽', icon: 'fas fa-ban' })
      } else if (isOwner.value) {
        items.push({ value: 'dissolvegroup', label: '解散群聊', icon: 'fas fa-trash-alt' })
      } else {
        items.push({ value: 'leavegroup', label: '退出群聊', icon: 'fas fa-sign-out-alt' })
        items.push({ value: 'blockgroup', label: '退出并屏蔽', icon: 'fas fa-ban' })
      }
      items.push({ value: 'deleteconvo', label: '删除聊天记录', icon: 'fas fa-trash' })
    }
  }
  return items
})

function onSelect(value) {
  emit(value)
}
</script>
