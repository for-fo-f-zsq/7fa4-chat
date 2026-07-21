<template>
  <div class="navbar">
    <div class="nav-logo">
      <img src="../../icon/icon.ico" class="nav-logo-img" />
    </div>
    <div
      class="nav-icon"
      :class="{ active: pageType === 'chat' }"
      @click="$emit('switch', 'chat')"
      @dragover.prevent="onNavDragOver($event, 'chat')"
      @dragleave="onNavDragLeave"
      @drop.prevent="onNavDrop('chat')"
    >
      <i class="fas fa-comment-dots"></i>
      <span>消息</span>
      <span v-if="chatUnread" class="nav-badge"></span>
    </div>
    <div
      class="nav-icon"
      :class="{ active: pageType === 'favorites' }"
      @click="$emit('switch', 'favorites')"
    >
      <i class="fas fa-star"></i>
      <span>收藏</span>
    </div>
    <div
      class="nav-icon"
      :class="{ active: pageType === 'settings' }"
      @click="$emit('switch', 'settings')"
    >
      <i class="fas fa-cog"></i>
      <span>设置</span>
    </div>
    <div
      class="nav-icon"
      :class="{ active: pageType === 'about' }"
      @click="$emit('switch', 'about')"
    >
      <i class="fas fa-info-circle"></i>
      <span>关于</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pageType: String,
  users: Object,
  groups: Object
})

const emit = defineEmits(['switch'])

const chatUnread = computed(() =>
  Object.values(props.users || {}).some(u => u.unread > 0) ||
  Object.values(props.groups || {}).some(g => g.unread > 0 && !g.exited)
)

// --- 拖拽切换 pageType ---
function onNavDragOver(e, type) {
  if (e.dataTransfer?.types?.includes('application/x-chat-msg')) {
    e.dataTransfer.dropEffect = 'copy'
    if (props.pageType !== type) {
      emit('switch', type)
    }
  }
}

function onNavDragLeave() {
}

function onNavDrop() {
}
</script>
