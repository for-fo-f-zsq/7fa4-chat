<template>
  <button class="md-back-btn" :title="title || '返回'" @click="emit('back')"><i class="fas fa-arrow-left"></i></button>
</template>

<script setup>
defineProps({
  title: { type: String, default: '返回' }
})
const emit = defineEmits(['back'])
</script>
