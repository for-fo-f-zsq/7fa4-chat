<template>
  <span
    v-if="dot || $slots.default || count !== null"
    class="ui-badge"
    :class="[
      {
        'ui-badge--neutral': variant === 'neutral',
        'ui-badge--brand': variant === 'brand',
        'ui-badge--success': variant === 'success',
        'ui-badge--warning': variant === 'warning',
        'ui-badge--danger': variant === 'danger',
        'ui-badge--notice': variant === 'notice',
        'ui-badge--outline': variant === 'outline',
      },
      {
        'ui-badge--sm': size === 'sm',
        'ui-badge--md': size === 'md',
      },
      {
        'ui-badge--dot': dot,
        'ui-badge--rect': !pill,
        'has-color': !!color,
      },
    ]"
    :style="color ? { '--badge-accent': color } : undefined"
  >
    <span v-if="dot" class="ui-badge-dot" aria-hidden="true"></span>
    <template v-else>
      <slot>{{ displayCount }}</slot>
    </template>
  </span>
</template>

<script setup>
// 用法：<UiBadge variant="brand">{{ count }}</UiBadge>

import { computed } from 'vue'

defineOptions({ name: 'UiBadge' })

const props = defineProps({
  variant: { type: String, default: 'neutral' },
  size: { type: String, default: 'md' },
  dot: { type: Boolean, default: false },
  count: { type: Number, default: null },
  max: { type: Number, default: 99 },
  pill: { type: Boolean, default: true },
  color: { type: String, default: '' },
})

const displayCount = computed(() => {
  if (props.count === null || props.count === undefined) return ''
  return props.count > props.max ? `${props.max}+` : String(props.count)
})
</script>

<style scoped src="./UiBadge.css"></style>
