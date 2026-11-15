<template>
  <UiMenu
    class="msg-ctx"
    :open="visible"
    :anchor="{ x: x ?? 0, y: y ?? 0 }"
    :offset="2"
    :items="menuItems"
    @select="onSelect"
    @close="$emit('close')"
  />
</template>

<script setup>
import { computed } from 'vue'
import { UiMenu } from '@/ui'

const props = defineProps({
  visible: { type: Boolean, default: true },
  x: Number,
  y: Number,
  canDownload: Boolean,
  canCollect: Boolean,
  isOwn: { type: Boolean, default: false },
})

const emit = defineEmits(['copy', 'forward', 'download', 'reply', 'collect', 'close', 'multiselect'])

const menuItems = computed(() => {
  const items = [
    { key: 'reply', label: '引用', icon: 'fas fa-quote-left' },
    { key: 'copy', label: '复制', icon: 'fas fa-copy' },
    { key: 'forward', label: '转发', icon: 'fas fa-share' },
  ]
  if (props.canCollect) {
    items.push({ key: 'collect', label: '添加表情', icon: 'fas fa-star' })
  }
  if (props.canDownload) {
    items.push({ key: 'download', label: '下载', icon: 'fas fa-download' })
  }
  items.push({ divider: true })
  items.push({ key: 'multiselect', label: '多选', icon: 'fas fa-check-double' })
  return items
})

function onSelect(key) {
  if (key) emit(key)
}
</script>
