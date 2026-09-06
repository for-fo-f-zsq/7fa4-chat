<template>
  <div class="emoji-picker" v-if="visible" ref="pickerEl" :style="pickerStyle">
    <div class="emoji-drag-bar" title="上下拖动调整高度" @mousedown.prevent="onDragStart"><i></i></div>
    <div class="emoji-mode-switch">
      <button :class="['mode-btn', { active: mode === 'emoji' }]" @click="mode = 'emoji'">QQ 表情</button>
      <button :class="['mode-btn', { active: mode === 'sticker' }]" @click="mode = 'sticker'">自定义表情</button>
    </div>
    <template v-if="mode === 'emoji'">
      <div class="emoji-search">
        <input v-autofocus v-model="search" placeholder="搜索 QQ 表情（输入 /微笑 或 /wx）..." ref="searchInput" />
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
          class="sticker-item" :title="s.name + '（点击发送 · 右键放大预览）'"
          @click="emit('selectSticker', s)"
          @contextmenu.prevent="emit('previewSticker', s)">
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
const emit = defineEmits(['select', 'selectSticker', 'addSticker', 'removeSticker', 'previewSticker'])

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

// ---- 拖拽调整高度（把手上移增高，下限/上限钳制，localStorage 持久化） ----
const DRAG_MIN = 160
const DRAG_MAX = 480
const DRAG_KEY = '7fa4_emoji_picker_h'
const pickerEl = ref(null)
const pickerHeight = ref(null)
let dragState = null

// 自定义高度时同时覆盖 CSS 的 max-height:320px（否则拖拽会被钳在 320 以内）
const pickerStyle = () => (pickerHeight.value
  ? { height: pickerHeight.value + 'px', maxHeight: DRAG_MAX + 'px', flex: 'none' }
  : {})

function restorePickerHeight() {
  try {
    const v = parseInt(localStorage.getItem(DRAG_KEY) || '', 10)
    if (Number.isFinite(v) && v >= DRAG_MIN && v <= DRAG_MAX) pickerHeight.value = v
  } catch {}
}

function onDragStart(e) {
  const el = pickerEl.value
  if (!el) return
  dragState = { startH: el.offsetHeight, startY: e.clientY }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
}

function onDragMove(e) {
  if (!dragState) return
  // 把手上移 → 高度变大；下移 → 变小；限制在 [DRAG_MIN, DRAG_MAX]
  const h = Math.round(Math.max(DRAG_MIN, Math.min(DRAG_MAX, dragState.startH + (dragState.startY - e.clientY))))
  pickerHeight.value = h
  try { localStorage.setItem(DRAG_KEY, String(h)) } catch {}
}

function onDragEnd() {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onMounted(() => {
  document.addEventListener('focus-emoji-search', onFocusEmojiSearch)
  restorePickerHeight()
})
onUnmounted(() => {
  document.removeEventListener('focus-emoji-search', onFocusEmojiSearch)
  onDragEnd()
})
</script>