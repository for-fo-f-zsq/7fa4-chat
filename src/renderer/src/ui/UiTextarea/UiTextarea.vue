<template>
  <div class="ui-field">
    <label
      v-if="label"
      class="ui-field-label"
      :class="{ 'ui-field-label--hidden': hideLabel }"
      :for="inputId"
    >{{ label }}</label>
    <div
      class="ui-textarea"
      :class="[
        {
          'ui-textarea--sm': size === 'sm',
          'ui-textarea--md': size === 'md',
          'ui-textarea--lg': size === 'lg',
        },
        {
          'ui-textarea--auto': autoResize,
          'ui-textarea--has-prefix': !!prefixIcon || !!$slots.prefix,
          'ui-textarea--has-suffix': !!$slots.suffix,
          'is-focus': focused,
          'is-disabled': disabled,
          'is-readonly': readonly,
          'is-invalid': invalid || !!error,
        },
      ]"
      :style="maxHeightStyle"
    >
      <span v-if="prefixIcon || $slots.prefix" class="ui-textarea-prefix">
        <slot name="prefix"><i :class="prefixIcon" aria-hidden="true"></i></slot>
      </span>
      <textarea
        :id="inputId"
        ref="textareaEl"
        class="ui-textarea-el"
        :class="{ 'ui-textarea-el--mono': monospace }"
        :value="modelValue ?? ''"
        :rows="autoResize ? minRows : effectiveRows"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :maxlength="maxlength ?? undefined"
        :aria-invalid="invalid || !!error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      ></textarea>
      <span v-if="$slots.suffix" class="ui-textarea-suffix"><slot name="suffix" /></span>
    </div>
    <span v-if="error" :id="errorId" class="ui-field-error">{{ error }}</span>
    <span v-else-if="help" :id="helpId" class="ui-field-help">{{ help }}</span>
  </div>
</template>

<script setup>
// 用法：<UiTextarea v-model="draft" :rows="1" auto-resize @enter="send" />

import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'

defineOptions({ name: 'UiTextarea' })

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  placeholder: { type: String, default: '' },
  size: { type: String, default: 'md' },
  rows: { type: Number, default: 1 },
  autoResize: { type: Boolean, default: false },
  minRows: { type: Number, default: 1 },
  maxRows: { type: Number, default: 8 },
  maxHeight: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  monospace: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
  maxlength: { type: Number, default: null },
  prefixIcon: { type: String, default: '' },
  label: { type: String, default: '' },
  help: { type: String, default: '' },
  error: { type: String, default: '' },
  hideLabel: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'enter', 'resize'])

const inputId = `ui-textarea-${useId()}`
const helpId = `${inputId}-help`
const errorId = `${inputId}-error`
const focused = ref(false)
const textareaEl = ref(null)

const effectiveRows = computed(() => {
  const min = Math.max(1, props.minRows)
  const max = Math.max(min, props.maxRows)
  return Math.min(Math.max(props.rows, min), max)
})

const maxHeightStyle = computed(() =>
  props.maxHeight ? { '--ta-max': `${props.maxHeight}px` } : undefined,
)

const describedBy = computed(() => {
  if (props.error) return errorId
  if (props.help) return helpId
  return undefined
})

function onInput(event) {
  emit('update:modelValue', event.target.value)
  nextTick(autoSize)
}

function onFocus(event) {
  focused.value = true
}

function onBlur() {
  focused.value = false
}

function onKeydown(event) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    emit('enter', event)
  }
}

function autoSize() {
  const el = textareaEl.value
  if (!el || !props.autoResize) return
  el.style.setProperty('--ta-h', 'auto')
  const height = Math.min(el.scrollHeight, props.maxHeight || 200)
  el.style.setProperty('--ta-h', `${height}px`)
  emit('resize', height)
}

watch(
  () => props.modelValue,
  () => nextTick(autoSize),
)

watch(
  () => props.autoResize,
  () => nextTick(autoSize),
)

onMounted(() => {
  if (props.autofocus) textareaEl.value?.focus()
  autoSize()
})
</script>

<style scoped src="./UiTextarea.css"></style>
