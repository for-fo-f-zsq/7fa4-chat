<template>
  <div
    class="ui-slider"
    :class="[`ui-slider--${sizeClass}`, { 'is-disabled': disabled }]"
  >
    <div v-if="label || showValue" class="ui-slider__header">
      <label v-if="label" :for="sliderId" class="ui-slider__label">{{ label }}</label>
      <span v-if="showValue" class="ui-slider__value">{{ displayValue }}</span>
    </div>
    <input
      :id="sliderId"
      class="ui-slider__input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="!label ? (ariaLabel || undefined) : undefined"
      :style="trackStyle"
      @input="onInput"
      @change="onChange"
    />
  </div>
</template>

<script setup>
import { computed, useId } from 'vue'

defineOptions({ name: 'UiSlider' })

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  label: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  showValue: { type: Boolean, default: true },
  valueSuffix: { type: String, default: '' },
  size: { type: String, default: 'md' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'change'])

const sliderId = `ui-slider-${useId()}`

const sizeClass = computed(() => (props.size === 'sm' ? 'sm' : 'md'))

const percent = computed(() => {
  const span = props.max - props.min
  if (span <= 0) return 0
  const raw = ((Number(props.modelValue) - props.min) / span) * 100
  return Math.min(100, Math.max(0, raw))
})

const trackStyle = computed(() => ({
  '--slider-pct': `${percent.value}%`
}))

const displayValue = computed(() => `${props.modelValue}${props.valueSuffix}`)

function onInput(event) {
  const val = Number(event.target.value)
  emit('update:modelValue', val)
}

function onChange(event) {
  const val = Number(event.target.value)
  emit('change', val)
}
</script>

<style src="./UiSlider.css"></style>
