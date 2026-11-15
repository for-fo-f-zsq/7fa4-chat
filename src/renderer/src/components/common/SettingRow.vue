<template>
  <div
    class="p-setting-row setting-row"
    :class="{ 'setting-row--interactive': clickable }"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="onClick"
    @keydown.enter="onKeyActivate"
    @keydown.space.prevent="onKeyActivate"
  >
    <div class="p-setting-row__info">
      <div class="p-setting-row__label setting-row__label">
        <span>{{ label }}</span>
        <i v-if="tooltip" class="fas fa-circle-info setting-row__info" :title="tooltip" @click.stop></i>
      </div>
      <div v-if="description" class="p-setting-row__desc">{{ description }}</div>
    </div>
    <div class="p-setting-row__ctrl">
      <slot />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  label: { type: String, required: true },
  description: { type: String, default: '' },
  tooltip: { type: String, default: '' },
  clickable: { type: Boolean, default: false },
})

const emit = defineEmits(['activate'])

function onClick(e) {
  if (!props.clickable) return
  emit('activate', e)
}

function onKeyActivate(e) {
  if (!props.clickable) return
  emit('activate', e)
}
</script>

<style scoped>
.setting-row {
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-md);
  transition: background-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.setting-row--interactive {
  cursor: pointer;
}

.setting-row--interactive:hover {
  background: var(--surface-hover);
}

.setting-row--interactive:focus-visible {
  outline: var(--focus-width) solid var(--focus-color);
  outline-offset: var(--focus-offset);
}

.setting-row__label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.setting-row__info {
  font-size: var(--text-sm);
  color: var(--fg-subtle);
  cursor: help;
}
</style>
