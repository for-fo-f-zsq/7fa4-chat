<template>
  <span
    class="p-save-badge tool-save-state"
    :class="state.cls"
    :title="savedPath || savedName || '尚未保存到文件'"
  >
    {{ state.text }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { toolSaveState } from '../../../utils.js'

const props = defineProps({
  hasFile: { type: Boolean, default: false },
  dirty: { type: Boolean, default: false },
  savedPath: { type: String, default: '' },
  savedName: { type: String, default: '' }
})

const state = computed(() => toolSaveState({ hasFile: props.hasFile, dirty: props.dirty }))
</script>
