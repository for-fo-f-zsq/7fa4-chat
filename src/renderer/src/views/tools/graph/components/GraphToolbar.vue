<template>
  <div class="p-toolbar graph-toolbar">
    <div class="p-toolbar__group">
      <UiIconButton
        v-for="t in GRAPH_TOOLS"
        :key="t.value"
        size="sm"
        :icon="t.icon"
        :active="mode === t.value"
        :title="t.label"
        :aria-label="t.label"
        @click="$emit('update:mode', t.value)"
      />
    </div>
    <div class="graph-tool-divider"></div>
    <div class="p-toolbar__group">
      <UiButton
        size="sm"
        :variant="directed ? 'soft' : 'secondary'"
        :icon="directed ? 'fas fa-long-arrow-alt-right' : 'fas fa-exchange-alt'"
        :title="directed ? '当前为有向图，点击切换为无向' : '当前为无向图，点击切换为有向'"
        @click="$emit('update:directed', !directed)"
      >
        {{ directed ? '有向' : '无向' }}
      </UiButton>
      <UiButton
        size="sm"
        :variant="!locked ? 'soft' : 'secondary'"
        :icon="locked ? 'fas fa-lock' : 'fas fa-unlock'"
        :title="locked ? '已锁定布局，点击解锁' : '自动布局（力导向），点击锁定'"
        @click="$emit('toggleLock')"
      >
        {{ locked ? '锁定' : '布局' }}
      </UiButton>
      <UiIconButton size="sm" icon="fas fa-magic" title="重新随机排布并自动布局" aria-label="重新随机排布并自动布局" @click="$emit('restartLayout')" />
      <UiButton
        size="sm"
        :variant="treeMode ? 'soft' : 'secondary'"
        icon="fas fa-sitemap"
        title="树形布局：点击一个节点作为根，按 DFS 树边分层排布"
        @click="$emit('toggleTreeMode')"
      >
        树形
      </UiButton>
    </div>
    <div class="graph-tool-divider"></div>
    <div class="p-toolbar__group">
      <UiIconButton size="sm" icon="fas fa-trash" title="清空画布" aria-label="清空画布" @click="$emit('clearGraph')" />
    </div>
    <div class="p-toolbar__spacer"></div>
    <div class="p-toolbar__group">
      <UiIconButton size="sm" icon="fas fa-search-plus" title="放大" aria-label="放大" @click="$emit('zoomIn')" />
      <UiIconButton size="sm" icon="fas fa-search-minus" title="缩小" aria-label="缩小" @click="$emit('zoomOut')" />
      <UiIconButton size="sm" icon="fas fa-expand" title="适应画布" aria-label="适应画布" @click="$emit('fitView')" />
    </div>
    <div class="graph-tool-divider"></div>
    <div class="p-toolbar__group">
      <UiIconButton size="sm" icon="fas fa-folder-open" title="从文件载入图（.json）" aria-label="从文件载入图" @click="$emit('openFile')" />
      <UiIconButton size="sm" icon="fas fa-save" title="保存 (Ctrl+S)：首次选位置，之后直接覆盖该文件" aria-label="保存" @click="$emit('save')" />
      <UiIconButton size="sm" icon="fas fa-file-image" title="导出为 PNG 图片" aria-label="导出为 PNG 图片" @click="$emit('exportImg')" />
    </div>
    <ToolSaveBadge
      :has-file="!!savedName"
      :dirty="dirty"
      :saved-path="savedPath"
      :saved-name="savedName"
    />
  </div>
</template>

<script setup>
import { UiButton, UiIconButton } from '@/ui'
import ToolSaveBadge from '../../shared/ToolSaveBadge.vue'
import { GRAPH_TOOLS } from '../graphConstants.js'

defineProps({
  mode: { type: String, required: true },
  directed: { type: Boolean, required: true },
  locked: { type: Boolean, required: true },
  treeMode: { type: Boolean, required: true },
  savedName: { type: String, default: '' },
  savedPath: { type: String, default: '' },
  dirty: { type: Boolean, default: false }
})

defineEmits([
  'update:mode',
  'update:directed',
  'toggleLock',
  'restartLayout',
  'toggleTreeMode',
  'clearGraph',
  'zoomIn',
  'zoomOut',
  'fitView',
  'openFile',
  'save',
  'exportImg'
])
</script>

<style scoped>
.graph-toolbar {
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--border-width) solid var(--line-hairline);
  background: var(--surface-1);
}

.graph-tool-divider {
  width: 1px;
  height: 20px;
  background: var(--line-hairline);
  margin: 0 2px;
  flex-shrink: 0;
}
</style>
