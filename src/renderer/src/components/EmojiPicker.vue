<template>
  <div class="emoji-picker" v-if="visible">
    <div class="emoji-mode-switch">
      <button :class="['mode-btn', { active: mode === 'emoji' }]" @click="mode = 'emoji'">普通表情</button>
      <button :class="['mode-btn', { active: mode === 'sticker' }]" @click="mode = 'sticker'">自定义表情</button>
    </div>
    <template v-if="mode === 'emoji'">
      <div class="emoji-tabs">
        <button v-for="(g, key) in groups" :key="key"
          :class="['emoji-tab', { active: activeGroup === key }]"
          @click="activeGroup = key"
          :title="key">{{ g.icon }}</button>
      </div>
      <div class="emoji-search">
        <input v-model="search" placeholder="搜索..." ref="searchInput" />
      </div>
      <div class="emoji-grid">
        <span v-for="(e, i) in filteredEmojis" :key="i"
          class="emoji-item" @click="emit('select', e)">{{ e }}</span>
      </div>
    </template>
    <template v-if="mode === 'sticker'">
      <div class="sticker-toolbar">
        <button class="sticker-add-btn" @click="emit('addSticker')"><i class="fas fa-plus"></i> 添加表情</button>
      </div>
      <div class="sticker-grid">
        <div v-if="!stickers || stickers.length === 0" class="sticker-empty">
          暂无自定义表情<br>点击上方按钮添加
        </div>
        <div v-for="(s, i) in stickers" :key="i"
          class="sticker-item" @click="emit('selectSticker', s)">
          <img :src="s.data && s.mime ? 'data:' + s.mime + ';base64,' + s.data : ''" :alt="s.name" />
          <button class="sticker-del-btn" @click.stop="emit('removeSticker', i)" title="删除"><i class="fas fa-times"></i></button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { EMOJI_GROUPS } from '../emoji-data.js'

const props = defineProps({
  visible: Boolean,
  stickers: { type: Array, default: () => [] }
})
const emit = defineEmits(['select', 'selectSticker', 'addSticker', 'removeSticker'])

const groups = EMOJI_GROUPS
const mode = ref('emoji')
const activeGroup = ref('表情')
const search = ref('')
const searchInput = ref(null)

// ----- 监听全局搜索聚焦事件 -----
function onFocusEmojiSearch() {
  if (mode.value !== 'emoji') mode.value = 'emoji'
  searchInput.value?.focus()
}

onMounted(() => {
  document.addEventListener('focus-emoji-search', onFocusEmojiSearch)
})

onUnmounted(() => {
  document.removeEventListener('focus-emoji-search', onFocusEmojiSearch)
})

const filteredEmojis = computed(() => {
  const g = groups[activeGroup.value]
  if (!g) return []
  return g.emojis
})
</script>
