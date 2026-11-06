<template>
  <Transition name="dropdown">
    <div
      ref="menuRef"
      v-if="visible"
      class="context-menu"
      :class="extraClass"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
      @click.stop
    >
      <!-- 菜单主体（chrome / 键盘导航 / 点外关闭）由 UiMenu 承载，这里只做固定坐标定位 -->
      <UiMenu :open="true" :items="menuItems" @select="onItemClick" @close="emit('close')" />
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useContextMenu } from '../composables/useContextMenu.js'
import { UiMenu } from '../ui/index.js'

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

// 外部 API 是 { value,label,icon }；UiMenu 用 { key,label,icon }
const menuItems = computed(() =>
  props.items.map((it) => ({
    key: it.value,
    label: it.label,
    icon: it.icon,
    danger: !!it.danger,
    disabled: !!it.disabled
  }))
)

function onItemClick(key) {
  emit('select', key)
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

<style scoped src="../css/context-menu.css"></style>
