<template>
  <Transition name="fade-down">
    <div class="reply-bar" v-if="replyTo">
      <i class="fas fa-quote-left reply-bar-icon"></i>
      <span class="reply-bar-text">{{ replyTo.content }}</span>
      <UiIconButton
        class="reply-bar-close"
        icon="fas fa-times"
        size="sm"
        round
        aria-label="取消引用"
        title="取消引用"
        @click="$emit('clear')"
      />
    </div>
  </Transition>
</template>

<script setup>
import { UiIconButton } from '@/ui'

defineProps({
  replyTo: { type: Object, default: null },
})

defineEmits(['clear'])
</script>
