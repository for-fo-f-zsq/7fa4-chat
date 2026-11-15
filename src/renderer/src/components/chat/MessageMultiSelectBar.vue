<template>
  <Transition name="fade-down">
    <div class="multi-select-bar" v-if="visible">
      <span class="msb-info u-tabular-nums">已选 {{ count }} 条</span>
      <div class="msb-actions">
        <UiButton
          class="msb-btn"
          size="sm"
          variant="secondary"
          icon="fas fa-share"
          :disabled="!count"
          @click="$emit('batchForward')"
        >批量转发</UiButton>
        <UiButton
          class="msb-btn"
          size="sm"
          variant="ghost"
          icon="fas fa-times"
          @click="$emit('exit')"
        >退出多选</UiButton>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { UiButton } from '@/ui'

defineProps({
  visible: { type: Boolean, default: false },
  count: { type: Number, default: 0 },
})

defineEmits(['batchForward', 'exit'])
</script>
