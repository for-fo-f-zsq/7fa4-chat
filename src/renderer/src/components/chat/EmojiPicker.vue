<template>
  <Transition name="dropdown">
    <div class="emoji-picker" v-if="visible" ref="pickerEl" data-placement="top" :style="pickerStyle">
      <div class="emoji-drag-bar" title="上下拖动调整高度" @mousedown.prevent="onDragStart"><i></i></div>
      <UiSegmented class="emoji-mode-switch" v-model="mode" size="sm" :items="MODE_ITEMS" aria-label="表情类型" />
      <template v-if="mode === 'emoji'">
        <div class="emoji-search">
          <UiSearchInput
            ref="searchInput"
            v-model="search"
            size="sm"
            placeholder="搜索 QQ 表情（输入 /微笑 或 /wx）..."
            :autofocus="true"
          />
        </div>
        <div class="emoji-grid qqface-grid">
          <img
            v-for="f in filteredQqfaces"
            :key="f.id"
            :src="qqfaceUrl(f.file)"
            :alt="f.name"
            :title="faceTitle(f)"
            loading="lazy"
            decoding="async"
            class="emoji-item qqface-item"
            @click="emit('select', f)"
          />
        </div>
        <UiEmptyState v-if="filteredQqfaces.length === 0" size="sm" icon="fas fa-face-meh" title="无匹配表情" />
      </template>
      <template v-if="mode === 'sticker'">
        <div class="sticker-toolbar">
          <UiButton size="sm" variant="secondary" icon="fas fa-plus" @click="emit('addSticker')">添加表情</UiButton>
        </div>
        <div class="sticker-grid">
          <UiEmptyState
            v-if="!stickers || stickers.length === 0"
            class="sticker-empty"
            size="sm"
            icon="fas fa-images"
            title="暂无自定义表情"
            description="点击上方按钮添加"
          />
          <div
            v-for="(s, i) in stickers"
            :key="i"
            class="sticker-item"
            :title="s.name + '（点击发送 · 右键放大预览）'"
            @click="emit('selectSticker', s)"
            @contextmenu.prevent="emit('previewSticker', s)"
          >
            <img :src="s.data && s.mime ? 'data:' + s.mime + ';base64,' + s.data : ''" :alt="s.name" />
            <UiIconButton
              class="sticker-del-btn"
              icon="fas fa-times"
              size="sm"
              round
              aria-label="删除"
              title="删除"
              @click.stop="emit('removeSticker', i)"
            />
          </div>
        </div>
      </template>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { QQFACES, qqfaceUrl } from '../../qqface-data.js'
import { UiButton, UiEmptyState, UiIconButton, UiSearchInput, UiSegmented } from '@/ui'

const MODE_ITEMS = [{ value: 'emoji', label: 'QQ 表情' }, { value: 'sticker', label: '自定义表情' }]

defineProps({
  visible: Boolean,
  stickers: { type: Array, default: () => [] },
})
const emit = defineEmits(['select', 'selectSticker', 'addSticker', 'removeSticker', 'previewSticker'])

const mode = ref('emoji')
const search = ref('')
const searchInput = ref(null)

function faceTitle(f) {
  const parts = [f.name + '　' + f.code]
  if (f.pinyin && '/' + f.pinyin !== f.code.toLowerCase()) parts.push('/' + f.pinyin)
  if (f.alias?.length) parts.push(...f.alias.map((a) => '/' + a))
  return parts.join(' ')
}

const filteredQqfaces = computed(() => {
  const rawQ = search.value.trim().toLowerCase()
  if (!rawQ) return QQFACES
  const q = rawQ.replace(/^\/+/, '')
  return QQFACES.filter((f) =>
    f.code.toLowerCase().includes(rawQ) ||
    (q && (
      f.name.toLowerCase().includes(q) ||
      f.pinyin.includes(q) ||
      (f.alias && f.alias.some((a) => a.includes(q)))
    ))
  )
})

function onFocusEmojiSearch() {
  if (mode.value !== 'emoji') mode.value = 'emoji'
  searchInput.value?.focus()
}

const DRAG_MIN = 160
const DRAG_MAX = 480
const DRAG_KEY = '7fa4_emoji_picker_h'
const pickerEl = ref(null)
const pickerHeight = ref(null)
let dragState = null

const pickerStyle = computed(() => (pickerHeight.value
  ? { height: pickerHeight.value + 'px', maxHeight: DRAG_MAX + 'px', flex: 'none' }
  : {}))

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

<style scoped src="../../css/components/emoji-picker.css"></style>
