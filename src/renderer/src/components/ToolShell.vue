<template>
  <div class="tool-shell">
    <ToolBar :name="name" :back-title="backTitle" @back="emit('back')" />
    <div class="tool-shell-body">
      <slot />
    </div>
  </div>
</template>

<script setup>
/**
 * 内置工具外壳：顶部窄条（返回按钮 + 工具名）+ 工具本体。
 *
 * 内置工具（Markdown / 图片 / Graph / 计算器 / 计时器 / GeoGebra）自身不再绘制
 * 「工具 / X」标题行，统一由这里的窄条显示，视觉与远端工具宿主（ToolHost）一致。
 */
import ToolBar from './ToolBar.vue'

defineProps({
  /** 工具显示名，如「计算器」 */
  name: {
    type: String,
    default: '工具',
  },
  /** 返回按钮的 title */
  backTitle: {
    type: String,
    default: '返回工具列表',
  },
})

const emit = defineEmits(['back'])
</script>
