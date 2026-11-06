<template>
  <span
    class="ui-avatar"
    :class="[
      {
        'ui-avatar--xs': size === 'xs',
        'ui-avatar--sm': size === 'sm',
        'ui-avatar--md': size === 'md',
        'ui-avatar--lg': size === 'lg',
        'ui-avatar--xl': size === 'xl',
        'ui-avatar--2xl': size === '2xl',
        'ui-avatar--3xl': size === '3xl',
      },
      {
        'ui-avatar--circle': shape === 'circle',
        'ui-avatar--rounded': shape === 'rounded',
        'is-clickable': clickable,
        'has-color': !!color,
      },
    ]"
    :style="avatarStyle"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    :aria-label="clickable ? (name || '头像') : undefined"
    @click="onClick"
    @keydown.enter.prevent="onActivate"
    @keydown.space.prevent="onActivate"
  >
    <slot>
      <img v-if="src && !failed" class="ui-avatar-img" :src="src" :alt="name" @error="onError" />
      <span v-else class="ui-avatar-text">{{ initial }}</span>
    </slot>
    <span v-if="badge !== null && badge !== ''" class="ui-avatar-badge" aria-hidden="true">{{ badge }}</span>
    <span
      v-if="status"
      class="ui-avatar-status"
      :class="[
        {
          'ui-avatar-status--online': status === 'online',
          'ui-avatar-status--offline': status === 'offline',
        },
      ]"
      aria-hidden="true"
    ></span>
  </span>
</template>

<script setup>
// 用法：<UiAvatar :src="user.avatar" :name="user.name" size="lg" />

import { computed, ref, watch } from 'vue'

defineOptions({ name: 'UiAvatar' })

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: [String, Number], default: 'md' },
  shape: { type: String, default: 'circle' },
  color: { type: String, default: '' },
  badge: { type: [Number, String], default: null },
  status: { type: String, default: '' },
  clickable: { type: Boolean, default: false },
})

const emit = defineEmits(['click', 'error'])

const failed = ref(false)

const initial = computed(() => {
  const name = String(props.name || '').trim()
  return name ? name.charAt(0).toUpperCase() : ''
})

const avatarStyle = computed(() => {
  const style = {}
  if (typeof props.size === 'number') style['--avatar-size'] = `${props.size}px`
  if (props.color) style['--avatar-bg'] = props.color
  return Object.keys(style).length ? style : undefined
})

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)

function onError(event) {
  failed.value = true
  emit('error', event)
}

function onClick(event) {
  if (!props.clickable) return
  emit('click', event)
}

function onActivate(event) {
  if (!props.clickable) return
  emit('click', event)
}
</script>

<style scoped src="./UiAvatar.css"></style>
