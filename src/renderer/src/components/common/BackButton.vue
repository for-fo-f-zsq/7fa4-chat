<template>
  <UiIconButton
    icon="fas fa-arrow-left"
    size="sm"
    variant="soft"
    :aria-label="title || '返回'"
    :title="title || '返回'"
    @click="emit('back')"
  />
</template>

<script setup>
import { UiIconButton } from '@/ui'

defineProps({
  title: { type: String, default: '返回' },
})
const emit = defineEmits(['back'])
</script>
