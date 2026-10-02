<script setup>
/** 轻量下拉：在按钮下方浮出操作列表 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  label: { type: String, default: '⋯' },
  align: { type: String, default: 'right' },
})
const open = ref(false)
const root = ref(null)

function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true))
</script>

<template>
  <div ref="root" style="position: relative; display: inline-block">
    <button class="btn btn--sm" @click="open = !open">{{ label }}</button>
    <div v-if="open" class="menu" :style="align === 'right' ? { right: 0 } : { left: 0 }" @click="open = false">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: absolute;
  top: calc(100% + 5px);
  z-index: 40;
  min-width: 150px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-elev);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
</style>
