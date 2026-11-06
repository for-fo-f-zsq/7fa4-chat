<template>
  <div
    class="ui-segmented"
    :class="[
      {
        'ui-segmented--sm': size === 'sm',
        'ui-segmented--md': size === 'md',
      },
      {
        'ui-segmented--block': block,
      },
    ]"
    role="tablist"
    :aria-label="ariaLabel || '分段控件'"
    :style="indicatorStyle"
  >
    <span class="ui-segmented-thumb" aria-hidden="true"></span>
    <button
      v-for="(item, index) in items"
      :key="item.value"
      :ref="(el) => setItemEl(el, index)"
      type="button"
      role="tab"
      class="ui-segmented-item"
      :class="{ 'is-active': index === activeIndex }"
      :aria-selected="index === activeIndex ? 'true' : 'false'"
      :tabindex="index === activeIndex ? 0 : -1"
      @click="select(item)"
      @keydown="onKeydown($event, index)"
    >
      <i v-if="item.icon" :class="item.icon" aria-hidden="true"></i>
      <span v-if="item.label" class="ui-segmented-label">{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup>
// 用法：<UiSegmented v-model="mode" :items="[{ value: 'all', label: '全部' }]" />

import { computed, nextTick } from 'vue'

defineOptions({ name: 'UiSegmented' })

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  items: { type: Array, default: () => [] },
  size: { type: String, default: 'md' },
  block: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const itemEls = []

const activeIndex = computed(() => {
  const index = props.items.findIndex((item) => item.value === props.modelValue)
  return index >= 0 ? index : 0
})

const indicatorStyle = computed(() => ({
  '--seg-index': activeIndex.value,
  '--seg-count': Math.max(props.items.length, 1),
}))

function setItemEl(el, index) {
  if (el) itemEls[index] = el
}

function select(item) {
  if (!item || item.value === props.modelValue) return
  emit('update:modelValue', item.value)
  emit('change', item.value)
}

function onKeydown(event, index) {
  const count = props.items.length
  let next = -1
  if (event.key === 'ArrowLeft') next = (index - 1 + count) % count
  else if (event.key === 'ArrowRight') next = (index + 1) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next < 0 || next === index) return
  event.preventDefault()
  select(props.items[next])
  nextTick(() => itemEls[next]?.focus())
}
</script>

<style scoped src="./UiSegmented.css"></style>
