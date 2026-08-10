<template>
  <div class="emoji-picker" v-if="visible">
    <div class="emoji-mode-switch">
      <button :class="['mode-btn', { active: mode === 'emoji' }]" @click="mode = 'emoji'">QQ 表情</button>
      <button :class="['mode-btn', { active: mode === 'sticker' }]" @click="mode = 'sticker'">自定义表情</button>
    </div>
    <template v-if="mode === 'emoji'">
      <div class="emoji-search">
        <input v-model="search" placeholder="搜索 QQ 表情（输入 /微笑 或 /wx）..." ref="searchInput" />
      </div>
      <div class="emoji-grid qqface-grid">
        <img v-for="f in filteredQqfaces" :key="f.id"
          :src="qqfaceUrl(f.file)" :alt="f.name"
          :title="f.name + '　' + f.code + (f.pinyin ? ' /' + f.pinyin : '') + (f.alias && f.alias.length ? ' /' + f.alias.join(' /') : '')"
          class="emoji-item qqface-item" @click="emit('select', f)" />
      </div>
      <div v-if="filteredQqfaces.length === 0" class="emoji-empty">无匹配表情</div>
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
import { QQFACES, qqfaceUrl } from '../qqface-data.js'

const props = defineProps({
  visible: Boolean,
  stickers: { type: Array, default: () => [] }
})
const emit = defineEmits(['select', 'selectSticker', 'addSticker', 'removeSticker'])

const mode = ref('emoji')
const search = ref('')
const searchInput = ref(null)

const filteredQqfaces = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return QQFACES
  return QQFACES.filter(f =>
    f.code.toLowerCase().includes(q) ||
    f.name.includes(q) ||
    f.pinyin.includes(q) ||
    (f.alias && f.alias.some(a => a.includes(q)))
  )
})

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
</script>