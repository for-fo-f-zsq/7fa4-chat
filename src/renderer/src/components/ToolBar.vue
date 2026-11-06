<template>
  <div class="tool-bar">
    <UiButton
      variant="ghost"
      size="sm"
      pill
      icon="fas fa-arrow-left"
      :title="backTitle"
      :aria-label="backTitle"
      @click="emit('back')"
    >
      返回
    </UiButton>
    <span class="tool-bar-name">{{ name }}</span>
  </div>
</template>

<script setup>
/**
 * 工具页顶部窄条：返回按钮 + 工具名。
 *
 * 工具自身不再绘制「工具 / X」标题行（重复且占高度），统一由这条窄条显示；
 * 远端工具（ToolHost，iframe 宿主）与内置工具（ToolShell）共用本组件，保证两处外观一致。
 */
defineProps({
  /** 工具显示名，如「计算器」「计时器」 */
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

import { UiButton } from '@/ui'

const emit = defineEmits(['back'])
</script>

<style scoped src="../css/tool-bar.css"></style>
