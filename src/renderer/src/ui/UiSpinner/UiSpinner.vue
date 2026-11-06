<template>
  <span
    class="ui-spinner"
    :class="[
      {
        'ui-spinner--xs': size === 'xs',
        'ui-spinner--sm': size === 'sm',
        'ui-spinner--md': size === 'md',
        'ui-spinner--lg': size === 'lg',
      },
    ]"
    role="status"
    :aria-label="label"
    :style="colorStyle"
  >
    <span class="ui-spinner-ring motion-spin" aria-hidden="true"></span>
  </span>
</template>

<script setup>
// 用法：<UiSpinner size="sm" />

import { computed } from 'vue'

defineOptions({ name: 'UiSpinner' })

const props = defineProps({
  size: { type: String, default: 'md' },
  color: { type: String, default: '' },
  label: { type: String, default: '加载中' },
})

const colorStyle = computed(() => (props.color ? { '--spin-color': props.color } : undefined))
</script>

<style scoped src="./UiSpinner.css"></style>
