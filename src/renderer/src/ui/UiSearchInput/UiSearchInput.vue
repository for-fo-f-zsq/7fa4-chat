<template>
  <UiInput
    ref="inputRef"
    class="ui-search"
    :model-value="modelValue"
    :placeholder="placeholder"
    :size="size"
    :autofocus="autofocus"
    prefix-icon="fas fa-magnifying-glass"
    :clearable="true"
    @update:model-value="onInput"
    @clear="onClear"
    @enter="onEnter"
  />
</template>

<script setup>
// 用法：<UiSearchInput v-model="keyword" :debounce="300" @search="query" />

import { onBeforeUnmount } from 'vue'
import { computed, ref } from 'vue'
import UiInput from '../UiInput/UiInput.vue'

defineOptions({ name: 'UiSearchInput' })

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  placeholder: { type: String, default: '搜索' },
  size: { type: String, default: 'sm' },
  debounce: { type: Number, default: 0 },
  autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'search', 'clear'])

const inputRef = ref(null)

let timer = null
let skipSearch = false

function cancel() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function schedule(value) {
  cancel()
  if (props.debounce > 0) {
    timer = setTimeout(() => {
      timer = null
      emit('search', value)
    }, props.debounce)
    return
  }
  emit('search', value)
}

function onInput(value) {
  emit('update:modelValue', value)
  if (skipSearch) {
    skipSearch = false
    return
  }
  schedule(value)
}

function onClear() {
  cancel()
  skipSearch = true
  emit('clear')
  emit('search', '')
}

function onEnter() {
  cancel()
  emit('search', props.modelValue)
}

onBeforeUnmount(cancel)

defineExpose({
  focus: () => inputRef.value?.focus(),
  select: () => inputRef.value?.select(),
  el: computed(() => inputRef.value?.el),
})
</script>

<style src="./UiSearchInput.css"></style>
