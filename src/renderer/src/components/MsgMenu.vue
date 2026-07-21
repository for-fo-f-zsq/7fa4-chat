<template>
  <ContextMenu
    :visible="show"
    :x="x"
    :y="y"
    :items="menuItems"
    extra-class="msg-ctx"
    @select="onSelect"
    @close="$emit('close')"
  />
</template>

<script setup>
import { computed } from 'vue'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  x: Number,
  y: Number,
  canDownload: Boolean,
  canCollect: Boolean,
  canFavorite: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  canResend: { type: Boolean, default: false },
  isOwn: { type: Boolean, default: false },
  isFailed: { type: Boolean, default: false }
})

const emit = defineEmits(['copy', 'forward', 'download', 'reply', 'collect', 'close', 'delete', 'multiselect', 'favorite', 'resend'])

const show = computed(() => true)

const menuItems = computed(() => {
  const items = [
    { value: 'reply', label: '回复', icon: 'fas fa-reply' },
    { value: 'copy', label: '复制', icon: 'fas fa-copy' },
    { value: 'forward', label: '转发', icon: 'fas fa-share' }
  ]
  if (props.canFavorite) {
    items.push({ value: 'favorite', label: '收藏消息', icon: 'fas fa-bookmark' })
  }
  if (props.canCollect) {
    items.push({ value: 'collect', label: '收藏表情', icon: 'fas fa-star' })
  }
  if (props.canDownload) {
    items.push({ value: 'download', label: '下载', icon: 'fas fa-download' })
  }
  if (props.canResend) {
    items.push({ value: 'resend', label: '重新发送', icon: 'fas fa-redo' })
  }
  items.push({ value: 'multiselect', label: '多选', icon: 'fas fa-check-double' })
  if (props.canDelete) {
    items.push({ value: 'delete', label: '删除', icon: 'fas fa-trash' })
  }
  return items
})

function onSelect(value) {
  emit(value)
}
</script>
