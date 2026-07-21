<template>
  <div class="preview-overlay" @click.self="$emit('close')">
    <div class="preview-modal">
      <div class="preview-header">
        <span class="preview-title">{{ title }}</span>
        <div class="preview-header-actions">
          <button v-if="showActions" class="preview-action-btn" title="复制" @click="$emit('copy')"><i class="fas fa-copy"></i></button>
          <button v-if="showActions" class="preview-action-btn" title="转发" @click="$emit('forward')"><i class="fas fa-share"></i></button>
          <button v-if="canDownload" class="preview-action-btn" title="下载" @click="$emit('download')"><i class="fas fa-download"></i></button>
          <button class="preview-close" @click="$emit('close')"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="preview-body" @click="onBodyClick">
        <img v-if="type === 'image'" :src="src" class="preview-image" />
        <pre v-else-if="type === 'text'" class="preview-text">{{ text }}</pre>
        <div v-else-if="type === 'html'" class="preview-html" v-html="text"></div>
        <div v-else class="preview-error">无法解析为图片或文字</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { parseMsgContent } from '../utils.js'

const props = defineProps({
  type: String,
  title: String,
  src: String,
  text: String,
  rawContent: { type: String, default: '' },
  showActions: { type: Boolean, default: false }
})

defineEmits(['close', 'copy', 'forward', 'download'])

const canDownload = computed(() => {
  if (!props.showActions || !props.rawContent) return false
  const obj = parseMsgContent(props.rawContent)
  return obj && (obj.type === 'file' || obj.type === 'sticker') && obj.url
})

function onBodyClick(e) {
  const a = e.target.closest('a[href]')
  if (a) {
    e.preventDefault()
    e.stopPropagation()
    window.api.openExternal(a.href)
  }
}
</script>
