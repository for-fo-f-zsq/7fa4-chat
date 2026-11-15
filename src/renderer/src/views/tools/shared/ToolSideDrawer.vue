<template>
  <button
    v-if="narrow"
    class="tool-drawer-handle"
    :class="[`is-${side}`, { open }]"
    type="button"
    :style="handleStyle"
    :aria-label="open ? closeLabel : openLabel"
    :aria-expanded="open"
    :title="open ? closeLabel : openLabel"
    @click="$emit('update:open', !open)"
  >
    <i :class="chevronClass" aria-hidden="true"></i>
  </button>

  <aside
    class="tool-drawer"
    :class="[`is-${side}`, { narrow, open }]"
    :style="drawerStyle"
  >
    <slot />
  </aside>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  narrow: { type: Boolean, default: false },
  side: { type: String, default: 'left' },
  width: { type: Number, default: 280 },
  narrowWidth: { type: Number, default: 256 },
  openLabel: { type: String, default: '展开侧栏' },
  closeLabel: { type: String, default: '收起侧栏' }
})

defineEmits(['update:open'])

const chevronClass = computed(() => {
  if (props.side === 'right') {
    return props.open ? 'fas fa-chevron-right' : 'fas fa-chevron-left'
  }
  return props.open ? 'fas fa-chevron-left' : 'fas fa-chevron-right'
})

const drawerStyle = computed(() => ({
  '--drawer-w': `${props.narrow ? props.narrowWidth : props.width}px`
}))

const handleStyle = computed(() => ({
  '--drawer-w': `${props.narrowWidth}px`
}))
</script>

<style scoped src="./tool-side-drawer.css"></style>
