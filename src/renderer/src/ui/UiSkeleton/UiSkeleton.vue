<template>
  <div
    class="ui-skeleton"
    :class="[
      {
        'ui-skeleton--text': variant === 'text',
        'ui-skeleton--rect': variant === 'rect',
        'ui-skeleton--circle': variant === 'circle',
      },
    ]"
    :style="sizeStyle"
    aria-hidden="true"
  >
    <template v-if="variant === 'text' && lines > 1">
      <span
        v-for="index in lines"
        :key="index"
        class="ui-skeleton-line"
        :class="{ 'ui-skeleton-line--last': index === lines, 'motion-shimmer': animated }"
      ></span>
    </template>
    <span v-else class="ui-skeleton-block" :class="{ 'motion-shimmer': animated }"></span>
  </div>
</template>

<script setup>
// 用法：<UiSkeleton variant="text" :lines="3" />

import { computed } from 'vue'

defineOptions({ name: 'UiSkeleton' })

const props = defineProps({
  variant: { type: String, default: 'text' },
  width: { type: [String, Number], default: null },
  height: { type: [String, Number], default: null },
  lines: { type: Number, default: 1 },
  animated: { type: Boolean, default: true },
})

function toSize(value) {
  return typeof value === 'number' ? `${value}px` : value
}

const sizeStyle = computed(() => {
  const style = {}
  if (props.width !== null && props.width !== undefined && props.width !== '') {
    style['--sk-w'] = toSize(props.width)
  }
  if (props.height !== null && props.height !== undefined && props.height !== '') {
    style['--sk-h'] = toSize(props.height)
  }
  return Object.keys(style).length ? style : undefined
})
</script>

<style scoped src="./UiSkeleton.css"></style>
