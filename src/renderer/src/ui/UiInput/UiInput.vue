<template>
  <div class="ui-field">
    <label
      v-if="label"
      class="ui-field-label"
      :class="{ 'ui-field-label--hidden': hideLabel }"
      :for="inputId"
    >{{ label }}</label>
    <div
      class="ui-input"
      :class="[
        {
          'ui-input--sm': size === 'sm',
          'ui-input--md': size === 'md',
          'ui-input--lg': size === 'lg',
        },
        {
          'is-focus': focused,
          'is-disabled': disabled,
          'is-readonly': readonly,
          'is-invalid': invalid || !!error,
        },
      ]"
      @click="onBoxClick"
    >
      <span v-if="prefixIcon || $slots.prefix" class="ui-input-prefix">
        <slot name="prefix"><i :class="prefixIcon" aria-hidden="true"></i></slot>
      </span>
      <input
        :id="inputId"
        ref="inputEl"
        class="ui-input-el"
        :class="{ 'ui-input-el--mono': monospace }"
        :type="type"
        :value="modelValue ?? ''"
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
      />
      <button
        v-if="canClear"
        type="button"
        class="ui-input-clear"
        aria-label="清空"
        @mousedown.prevent
        @click="clear"
      >
        <i class="fas fa-circle-xmark" aria-hidden="true"></i>
      </button>
      <span v-if="$slots.suffix" class="ui-input-suffix"><slot name="suffix" /></span>
    </div>
    <span v-if="error" :id="errorId" class="ui-field-error">{{ error }}</span>
    <span v-else-if="help" :id="helpId" class="ui-field-help">{{ help }}</span>
  </div>
</template>

<script setup>
// 用法：<UiInput v-model="keyword" label="搜索" clearable @enter="submit" />

import { computed, nextTick, onMounted, ref, useId } from 'vue'

defineOptions({ name: 'UiInput' })

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  size: { type: String, default: 'md' },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  monospace: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
  prefixIcon: { type: String, default: '' },
  maxlength: { type: Number, default: null },
  label: { type: String, default: '' },
  help: { type: String, default: '' },
  error: { type: String, default: '' },
  hideLabel: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur', 'enter', 'clear'])

const inputId = `ui-input-${useId()}`
const helpId = `${inputId}-help`
const errorId = `${inputId}-error`
const focused = ref(false)
const inputEl = ref(null)

const canClear = computed(
  () => props.clearable && !props.disabled && !props.readonly && String(props.modelValue ?? '').length > 0,
)

const describedBy = computed(() => {
  if (props.error) return errorId
  if (props.help) return helpId
  return undefined
})

function onInput(event) {
  emit('update:modelValue', event.target.value)
}

function onFocus(event) {
  focused.value = true
  emit('focus', event)
}

function onBlur(event) {
  focused.value = false
  emit('blur', event)
}

function onKeydown(event) {
  if (event.key === 'Enter') {
    emit('enter', event)
    return
  }
  if (event.key === 'Escape' && canClear.value) {
    event.preventDefault()
    clear()
  }
}

function clear() {
  if (!canClear.value) return
  emit('clear')
  emit('update:modelValue', '')
  nextTick(() => inputEl.value?.focus())
}

function onBoxClick(event) {
  if (props.disabled || props.readonly) return
  if (event.target?.closest?.('.ui-input-clear')) return
  inputEl.value?.focus()
}

onMounted(() => {
  if (props.autofocus) inputEl.value?.focus()
})
</script>

<style scoped src="./UiInput.css"></style>
