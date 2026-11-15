<template>
  <UiMenu
    :open="true"
    :anchor="anchorPoint"
    :offset="0"
    placement="bottom"
    :items="menuItems"
    @select="onSelect"
    @close="emit('close')"
  />
</template>

<script setup>
import { computed } from 'vue'
import { store } from '../../store.js'
import { getConvoKey } from '../../utils.js'
import { UiMenu } from '@/ui'

const props = defineProps({
  type: String,
  x: Number,
  y: Number,
  id: [String, Number],
  isPinned: Boolean,
  isUnread: Boolean,
})

const emit = defineEmits([
  'close',
  'pin',
  'showuserinfo',
  'showgroupinfo',
  'leavegroup',
  'blockgroup',
  'unblockgroup',
  'dissolvegroup',
  'mute',
  'unmute',
  'markread',
  'markunread',
  'togglehidden',
])

const anchorPoint = computed(() => ({ x: props.x || 0, y: props.y || 0 }))

const isOwner = computed(() => {
  if (props.type !== 'group') return false
  const group = store.groups?.[props.id]
  if (!group) return false
  const selfMember = group.users.find((u) => String(u.user_id) === String(store.self.uid))
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

const isHidden = computed(() => !!store.hiddenConvos?.[getConvoKey(props.type, props.id)])
const hiddenItem = computed(() => ({
  key: 'togglehidden',
  label: isHidden.value ? '取消不显示' : '不显示',
  icon: isHidden.value ? 'fas fa-eye' : 'fas fa-eye-slash',
}))

const menuItems = computed(() => {
  const items = []
  const convoKey = getConvoKey(props.type, props.id)
  const isMuted = !!store.mutedConvos?.[convoKey]
  if (props.type === 'user') {
    items.push({ key: 'pin', label: props.isPinned ? '取消置顶' : '置顶', icon: 'fas fa-thumbtack' })
    items.push({ key: 'showuserinfo', label: '好友详情', icon: 'fas fa-user' })
    items.push({
      key: isMuted ? 'unmute' : 'mute',
      label: isMuted ? '取消免打扰' : '消息免打扰',
      icon: isMuted ? 'fas fa-bell' : 'fas fa-bell-slash',
    })
    items.push({
      key: props.isUnread ? 'markread' : 'markunread',
      label: props.isUnread ? '标记已读' : '标记未读',
      icon: props.isUnread ? 'fas fa-check' : 'fas fa-envelope',
    })
    items.push(hiddenItem.value)
  }
  if (props.type === 'group') {
    if (isExited.value) {
      items.push({
        key: isBlocked.value ? 'unblockgroup' : 'blockgroup',
        label: isBlocked.value ? '取消屏蔽' : '屏蔽',
        icon: 'fas fa-ban',
      })
      items.push(hiddenItem.value)
    } else {
      items.push({ key: 'pin', label: props.isPinned ? '取消置顶' : '置顶', icon: 'fas fa-thumbtack' })
      items.push({ key: 'showgroupinfo', label: '群详情', icon: 'fas fa-users' })
      items.push({
        key: isMuted ? 'unmute' : 'mute',
        label: isMuted ? '取消免打扰' : '消息免打扰',
        icon: isMuted ? 'fas fa-bell' : 'fas fa-bell-slash',
      })
      items.push({
        key: props.isUnread ? 'markread' : 'markunread',
        label: props.isUnread ? '标记已读' : '标记未读',
        icon: props.isUnread ? 'fas fa-check' : 'fas fa-envelope',
      })
      if (isBlocked.value) {
        items.push({ key: 'unblockgroup', label: '取消屏蔽', icon: 'fas fa-ban' })
      } else if (isOwner.value) {
        items.push({ key: 'dissolvegroup', label: '解散群聊', icon: 'fas fa-trash-alt', danger: true })
      } else {
        items.push({ key: 'leavegroup', label: '退出群聊', icon: 'fas fa-sign-out-alt' })
        items.push({ key: 'blockgroup', label: '退出并屏蔽', icon: 'fas fa-ban', danger: true })
      }
      items.push(hiddenItem.value)
    }
  }
  return items
})

function onSelect(key) {
  emit(key)
  emit('close')
}
</script>
