<template>
  <div
    class="ui-progress"
    :class="[
      {
        'ui-progress--xs': size === 'xs',
        'ui-progress--sm': size === 'sm',
        'ui-progress--md': size === 'md',
      },
    ]"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="indeterminate ? undefined : clamped"
    :aria-label="label || undefined"
  >
    <span v-if="label" class="ui-progress-label">{{ label }}</span>
    <span class="ui-progress-track">
      <span
        class="ui-progress-bar"
        :class="[
          {
            'ui-progress-bar--brand': variant === 'brand',
            'ui-progress-bar--success': variant === 'success',
            'ui-progress-bar--warning': variant === 'warning',
            'ui-progress-bar--danger': variant === 'danger',
          },
          {
            'is-indeterminate': indeterminate,
            'motion-shimmer': indeterminate,
          },
        ]"
        :style="barStyle"
      ></span>
    </span>
  </div>
</template>

<script setup>
// 用法：<UiProgress :value="42" label="上传进度" />

import { computed } from 'vue'

defineOptions({ name: 'UiProgress' })

const props = defineProps({
  value: { type: Number, default: 0 },
  indeterminate: { type: Boolean, default: false },
  size: { type: String, default: 'sm' },
  variant: { type: String, default: 'brand' },
  label: { type: String, default: '' },
})

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))

const barStyle = computed(() => ({
  '--p': `${clamped.value}%`,
}))
</script>

<style scoped src="./UiProgress.css"></style>
