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
  isOwn: { type: Boolean, default: false }
})

const emit = defineEmits(['copy', 'forward', 'download', 'reply', 'collect', 'close', 'multiselect'])

const show = computed(() => true)

const menuItems = computed(() => {
  const items = [
    { value: 'reply', label: '引用', icon: 'fas fa-quote-left' },
    { value: 'copy', label: '复制', icon: 'fas fa-copy' },
    { value: 'forward', label: '转发', icon: 'fas fa-share' }
  ]
  if (props.canCollect) {
    items.push({ value: 'collect', label: '添加表情', icon: 'fas fa-star' })
  }
  if (props.canDownload) {
    items.push({ value: 'download', label: '下载', icon: 'fas fa-download' })
  }
  items.push({ value: 'multiselect', label: '多选', icon: 'fas fa-check-double' })
  return items
})

function onSelect(value) {
  emit(value)
}
</script>
