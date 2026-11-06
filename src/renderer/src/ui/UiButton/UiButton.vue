<template>
  <component
    :is="tag"
    class="ui-btn"
    :class="[
      {
        'ui-btn--primary': variant === 'primary',
        'ui-btn--secondary': variant === 'secondary',
        'ui-btn--ghost': variant === 'ghost',
        'ui-btn--danger': variant === 'danger',
        'ui-btn--text': variant === 'text',
      },
      {
        'ui-btn--sm': size === 'sm',
        'ui-btn--md': size === 'md',
        'ui-btn--lg': size === 'lg',
      },
      {
        'ui-btn--block': block,
        'ui-btn--pill': pill,
        'is-loading': loading,
        'is-disabled': disabled,
      },
    ]"
    :type="tag === 'button' ? type : undefined"
    :href="tag === 'a' ? href : undefined"
    :disabled="tag === 'button' ? disabled || loading : undefined"
    :tabindex="tag === 'a' && (disabled || loading) ? -1 : undefined"
    :aria-label="ariaLabel || undefined"
    :aria-busy="loading ? 'true' : undefined"
    :aria-disabled="tag === 'a' && (disabled || loading) ? 'true' : undefined"
    @click="onClick"
  >
    <UiSpinner v-if="loading" class="ui-btn-spinner" size="sm" color="currentColor" label="加载中" />
    <span v-else-if="icon || $slots.icon" class="ui-btn-icon">
      <slot name="icon"><i :class="icon" aria-hidden="true"></i></slot>
    </span>
    <span class="ui-btn-label"><slot /></span>
    <span v-if="$slots.trailing" class="ui-btn-trailing"><slot name="trailing" /></span>
  </component>
</template>

<script setup>
// 用法：<UiButton variant="primary" @click="save">保存</UiButton>

import UiSpinner from '../UiSpinner/UiSpinner.vue'

defineOptions({ name: 'UiButton' })

const props = defineProps({
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'md' },
  block: { type: Boolean, default: false },
  pill: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  tag: { type: String, default: 'button' },
  href: { type: String, default: '' },
  icon: { type: String, default: '' },
  type: { type: String, default: 'button' },
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['click'])

function onClick(event) {
  if (props.disabled || props.loading) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<style scoped src="./UiButton.css"></style>
