<template>
  <button
    type="button"
    role="switch"
    class="ui-switch"
    :class="[
      {
        'ui-switch--sm': size === 'sm',
        'ui-switch--md': size === 'md',
      },
      {
        'is-checked': modelValue,
        'is-disabled': disabled,
      },
    ]"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="ariaLabel || undefined"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="ui-switch-track" aria-hidden="true">
      <span class="ui-switch-knob"></span>
    </span>
    <span v-if="label || $slots.label" class="ui-switch-label"><slot name="label">{{ label }}</slot></span>
  </button>
</template>

<script setup>
// 用法：<UiSwitch v-model="enabled" label="通知" />

import { useSlots } from 'vue'

defineOptions({ name: 'UiSwitch' })

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: 'md' },
  label: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const slots = useSlots()

if (import.meta.env.DEV && !props.label && !props.ariaLabel && !slots.label) {
  console.warn('[UiSwitch] 建议提供 label 或 ariaLabel，用于屏幕阅读器')
}

function toggle() {
  if (props.disabled) return
  const next = !props.modelValue
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<style scoped src="./UiSwitch.css"></style>
