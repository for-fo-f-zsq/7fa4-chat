<template>
  <Transition name="fade-down">
    <div class="pending-files-bar" v-if="files.length">
      <div
        class="pending-file-item"
        v-for="(pf, idx) in files"
        :key="idx"
        @click="$emit('preview', pf)"
      >
        <div class="pending-file-thumb" v-if="pf.isImage">
          <img :src="pf.thumbUrl" :alt="pf.name" />
        </div>
        <div class="pending-file-icon" v-else>
          <i class="fas fa-file"></i>
        </div>
        <div class="pending-file-info">
          <span class="pending-file-name">{{ pf.name }}</span>
          <span class="pending-file-size">{{ formatSize(pf.size) }}</span>
        </div>
        <UiIconButton
          class="pending-file-remove"
          icon="fas fa-times"
          size="sm"
          round
          danger
          aria-label="移除文件"
          title="移除文件"
          @click.stop="$emit('remove', idx)"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { UiIconButton } from '@/ui'
import { formatSize } from '../../utils.js'

defineProps({
  files: { type: Array, default: () => [] },
})

defineEmits(['preview', 'remove'])
</script>
