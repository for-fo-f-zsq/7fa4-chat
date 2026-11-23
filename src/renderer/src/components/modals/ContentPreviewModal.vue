<template>
  <Transition v-if="type === 'image'" name="overlay" appear @after-leave="emit('close')">
    <ImageLightbox
      :src="src"
      :shown="shown"
      :downloading="downloading"
      :show-edit="showEdit"
      :can-prev="canPrev"
      :can-next="canNext"
      :gallery-current="galleryCurrent"
      :gallery-total="galleryTotal"
      @request-close="requestClose"
      @download="onDownloadClick"
      @edit="emit('edit')"
      @prev="emit('prev')"
      @next="emit('next')"
    />
  </Transition>
  <UiModal v-else v-model:open="open" size="lg" :aria-label="title || '内容预览'" @closed="emit('close')">
    <template #header>
      <div class="preview-header">
        <span class="preview-title">{{ title }}</span>
        <div class="preview-header-actions">
          <UiIconButton v-if="showActions" size="sm" icon="fas fa-copy" aria-label="复制" title="复制" @click="emit('copy')" />
          <UiIconButton v-if="showActions" size="sm" icon="fas fa-share" aria-label="转发" title="转发" @click="emit('forward')" />
          <UiIconButton
            v-if="canDownload"
            size="sm"
            icon="fas fa-download"
            :loading="downloading"
            aria-label="下载"
            title="下载"
            @click="onDownloadClick"
          />
        </div>
      </div>
    </template>
    <div class="preview-body" @click="onBodyClick">
      <pre v-if="type === 'text'" class="preview-text">{{ text }}</pre>
      <div v-else-if="type === 'html'" class="preview-html" v-html="text"></div>
      <iframe v-else-if="type === 'pdf'" :src="src" class="preview-pdf" title="PDF 预览"></iframe>
      <div v-else class="preview-error">无法解析为图片或文字</div>
    </div>
  </UiModal>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { UiIconButton, UiModal } from '@/ui'
import { useImageDownload } from '@/composables/modals/useImageDownload.js'
import ImageLightbox from './preview/ImageLightbox.vue'

const props = defineProps({
  type: String,
  title: String,
  src: String,
  text: String,
  rawContent: { type: String, default: '' },
  showActions: { type: Boolean, default: false },
  showEdit: { type: Boolean, default: true },
  remoteSrc: { type: String, default: '' },
  downloadName: { type: String, default: '' },
  canPrev: { type: Boolean, default: false },
  canNext: { type: Boolean, default: false },
  galleryCurrent: { type: Number, default: 0 },
  galleryTotal: { type: Number, default: 0 },
})

const emit = defineEmits(['close', 'copy', 'forward', 'download', 'edit', 'prev', 'next'])

const shown = ref(true)
const open = ref(false)
const { canDownload, downloading, onDownloadClick } = useImageDownload(props, emit)

onMounted(() => {
  if (props.type !== 'image') {
    nextTick(() => {
      open.value = true
    })
  }
})

function requestClose() {
  if (props.type === 'image') shown.value = false
  else open.value = false
}

watch(
  () => [props.type, props.src],
  () => {
    shown.value = true
    open.value = props.type !== 'image'
  }
)

function onBodyClick(e) {
  const a = e.target.closest('a[href]')
  if (a) {
    e.preventDefault()
    e.stopPropagation()
    window.api.openExternal(a.href)
  }
}
</script>

<style src="../../css/components/content-preview-modal.css"></style>
