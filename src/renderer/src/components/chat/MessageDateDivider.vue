<template>
  <div class="msg-date-separator">{{ label }}</div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
})
</script>
