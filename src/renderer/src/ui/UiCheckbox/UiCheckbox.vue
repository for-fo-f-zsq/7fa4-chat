<template>
  <label
    class="ui-checkbox"
    :class="[
      {
        'is-checked': modelValue,
        'is-indeterminate': indeterminate,
        'is-disabled': disabled,
      },
    ]"
  >
    <input
      ref="inputEl"
      class="ui-checkbox-input"
      type="checkbox"
      :checked="modelValue"
      :value="value ?? undefined"
      :aria-label="ariaLabel || undefined"
      :disabled="disabled"
      @change="onChange"
    />
    <span class="ui-checkbox-box" aria-hidden="true">
      <i class="fas fa-check ui-checkbox-mark"></i>
      <i class="fas fa-minus ui-checkbox-dash"></i>
    </span>
    <span v-if="label || $slots.label" class="ui-checkbox-label"><slot name="label">{{ label }}</slot></span>
  </label>
</template>

<script setup>
// 用法：<UiCheckbox v-model="checked" label="记住我" />

import { ref, useSlots, watchEffect } from 'vue'

defineOptions({ name: 'UiCheckbox' })

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  indeterminate: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  value: { type: [String, Number, Boolean], default: null },
})

const emit = defineEmits(['update:modelValue', 'change'])

const slots = useSlots()

if (import.meta.env.DEV && !props.label && !props.ariaLabel && !slots.label) {
  console.warn('[UiCheckbox] 建议提供 label 或 ariaLabel，用于屏幕阅读器')
}

const inputEl = ref(null)

watchEffect(() => {
  if (inputEl.value) inputEl.value.indeterminate = props.indeterminate
})

function onChange(event) {
  const checked = event.target.checked
  emit('update:modelValue', checked)
  emit('change', checked)
}
</script>

<style scoped src="./UiCheckbox.css"></style>
