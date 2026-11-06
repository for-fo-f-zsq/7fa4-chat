<template>
  <button
    type="button"
    class="ui-icon-btn"
    :class="[
      {
        'ui-icon-btn--ghost': variant === 'ghost',
        'ui-icon-btn--soft': variant === 'soft',
        'ui-icon-btn--solid': variant === 'solid',
      },
      {
        'ui-icon-btn--sm': size === 'sm',
        'ui-icon-btn--md': size === 'md',
        'ui-icon-btn--lg': size === 'lg',
      },
      {
        'ui-icon-btn--round': round,
        'ui-icon-btn--danger': danger,
        'is-active': active,
        'is-loading': loading,
        'is-disabled': disabled,
      },
    ]"
    :disabled="disabled || loading"
    :aria-label="ariaLabel || undefined"
    :aria-pressed="hasActiveProp ? (active ? 'true' : 'false') : undefined"
    :aria-busy="loading ? 'true' : undefined"
    @click="onClick"
  >
    <UiSpinner
      v-if="loading"
      class="ui-icon-btn-spinner"
      :size="size === 'sm' ? 'xs' : 'sm'"
      color="currentColor"
      label="加载中"
    />
    <span v-else class="ui-icon-btn-icon" aria-hidden="true">
      <slot name="icon"><i :class="icon"></i></slot>
    </span>
    <span v-if="badge > 0" class="ui-icon-btn-badge" aria-hidden="true">{{ badge > 99 ? '99+' : badge }}</span>
  </button>
</template>

<script setup>
// 用法：<UiIconButton icon="fas fa-trash" aria-label="删除" @click="remove" />

import { getCurrentInstance } from 'vue'
import UiSpinner from '../UiSpinner/UiSpinner.vue'

defineOptions({ name: 'UiIconButton' })

const props = defineProps({
  icon: { type: String, required: true },
  ariaLabel: { type: String, default: '' },
  size: { type: String, default: 'md' },
  variant: { type: String, default: 'ghost' },
  round: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  danger: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  badge: { type: Number, default: 0 },
})

const emit = defineEmits(['click'])

const instance = getCurrentInstance()
const hasActiveProp = Boolean(instance?.vnode.props && 'active' in instance.vnode.props)

if (import.meta.env.DEV && !props.ariaLabel) {
  console.warn('[UiIconButton] ariaLabel 为必填，用于屏幕阅读器')
}

function onClick(event) {
  if (props.disabled || props.loading) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<style scoped src="./UiIconButton.css"></style>
