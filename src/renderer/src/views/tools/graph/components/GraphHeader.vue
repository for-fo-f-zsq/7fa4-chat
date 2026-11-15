<template>
  <div class="p-toolbar graph-header-bar">
    <div class="p-toolbar__group">
      <UiIconButton
        size="sm"
        :icon="sideOpen ? 'fas fa-outdent' : 'fas fa-indent'"
        :active="sideOpen"
        :title="sideOpen ? '收起配置侧边栏' : '展开配置侧边栏'"
        :aria-label="sideOpen ? '收起配置侧边栏' : '展开配置侧边栏'"
        @click="$emit('toggleSidebar')"
      />
      <div class="graph-header-brand">
        <i class="fas fa-project-diagram graph-header-icon" aria-hidden="true"></i>
        <span class="graph-header-title">图编辑器</span>
      </div>
    </div>

    <div class="graph-header-divider"></div>

    <div class="p-toolbar__group">
      <UiSegmented
        size="sm"
        :model-value="directed ? 'directed' : 'undirected'"
        :items="directedOptions"
        @update:model-value="$emit('update:directed', $event === 'directed')"
      />
    </div>

    <div class="p-toolbar__spacer"></div>

    <ToolSaveBadge
      :has-file="!!savedName"
      :dirty="dirty"
      :saved-path="savedPath"
      :saved-name="savedName"
    />

    <div class="graph-header-divider"></div>

    <div class="p-toolbar__group">
      <UiIconButton
        size="sm"
        icon="fas fa-folder-open"
        title="从文件载入图 (.json)"
        aria-label="从文件载入图"
        @click="$emit('openFile')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-save"
        title="保存工程 (Ctrl+S)：首次选择保存路径，之后直接覆盖"
        aria-label="保存工程"
        @click="$emit('save')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-file-image"
        title="导出为高清 PNG 图片"
        aria-label="导出为 PNG 图片"
        @click="$emit('exportImg')"
      />
    </div>
  </div>
</template>

<script setup>
import { UiIconButton, UiSegmented } from '@/ui'
import ToolSaveBadge from '../../shared/ToolSaveBadge.vue'

defineProps({
  directed: { type: Boolean, required: true },
  savedName: { type: String, default: '' },
  savedPath: { type: String, default: '' },
  dirty: { type: Boolean, default: false },
  sideOpen: { type: Boolean, default: true },
  isNarrow: { type: Boolean, default: false }
})

defineEmits([
  'update:directed',
  'toggleSidebar',
  'openFile',
  'save',
  'exportImg'
])

const directedOptions = [
  { value: 'undirected', label: '无向图', icon: 'fas fa-exchange-alt' },
  { value: 'directed', label: '有向图', icon: 'fas fa-long-arrow-alt-right' }
]
</script>

<style scoped>
.graph-header-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 0 var(--space-2);
}

.graph-header-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: var(--space-1);
  user-select: none;
}

.graph-header-icon {
  font-size: var(--text-base);
  color: var(--brand);
}

.graph-header-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--fg);
  letter-spacing: -0.01em;
}

.graph-header-divider {
  width: 1px;
  height: 18px;
  background: var(--line-hairline);
  margin: 0 var(--space-1);
  flex-shrink: 0;
}
</style>
