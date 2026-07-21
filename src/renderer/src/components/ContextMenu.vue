<template>
  <div
    ref="menuRef"
    v-if="visible"
    class="context-menu"
    :class="extraClass"
    :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
    @click.stop
  >
    <div
      v-for="item in items"
      :key="item.value"
      class="context-menu-item"
      @click="onItemClick(item.value)"
    >
      <i v-if="item.icon" :class="item.icon"></i> {{ item.label }}
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useContextMenu } from '../composables/useContextMenu.js'

const props = defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  items: { type: Array, default: () => [] },
  extraClass: { type: String, default: '' }
})

const emit = defineEmits(['select', 'close'])

const menuRef = ref(null)
const { adjustedX, adjustedY } = useContextMenu(
  menuRef,
  () => props.x,
  () => props.y,
  () => props.visible
)

function onItemClick(value) {
  emit('select', value)
  emit('close')
}

function handleGlobalClick(e) {
  if (props.visible && menuRef.value && !menuRef.value.contains(e.target)) {
    emit('close')
  }
}

watch(() => props.visible, (v) => {
  if (v) {
    document.addEventListener('click', handleGlobalClick)
  } else {
    document.removeEventListener('click', handleGlobalClick)
  }
}, { immediate: true })

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})
</script>
