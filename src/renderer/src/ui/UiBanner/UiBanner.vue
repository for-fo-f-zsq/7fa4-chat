<template>
  <Transition name="fade">
    <div
      v-if="visible"
      v-bind="$attrs"
      class="ui-banner"
      :class="[
        {
          'ui-banner--info': variant === 'info',
          'ui-banner--success': variant === 'success',
          'ui-banner--warning': variant === 'warning',
          'ui-banner--danger': variant === 'danger',
          'ui-banner--notice': variant === 'notice',
        },
      ]"
      :role="role"
    >
      <span class="ui-banner-icon" aria-hidden="true">
        <slot name="icon"><i :class="icon || defaultIcon"></i></slot>
      </span>
      <div class="ui-banner-content">
        <span v-if="title" class="ui-banner-title">{{ title }}</span>
        <span v-if="description || $slots.default" class="ui-banner-desc"><slot>{{ description }}</slot></span>
      </div>
      <slot name="action" />
      <button v-if="closable" type="button" class="ui-banner-close" aria-label="关闭" @click="onClose">
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  </Transition>
</template>

<script setup>
// 用法：<UiBanner variant="warning" title="提示" description="内容" closable @close="hide" />

import { computed, ref } from 'vue'

defineOptions({ name: 'UiBanner', inheritAttrs: false })

const props = defineProps({
  variant: { type: String, default: 'info' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: { type: String, default: '' },
  closable: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const ICONS = {
  info: 'fas fa-circle-info',
  success: 'fas fa-circle-check',
  warning: 'fas fa-triangle-exclamation',
  danger: 'fas fa-circle-exclamation',
  notice: 'fas fa-bell',
}

const visible = ref(true)

const defaultIcon = computed(() => ICONS[props.variant] || ICONS.info)

const role = computed(() => (props.variant === 'danger' ? 'alert' : 'status'))

function onClose() {
  visible.value = false
  emit('close')
}
</script>

<style scoped src="./UiBanner.css"></style>
