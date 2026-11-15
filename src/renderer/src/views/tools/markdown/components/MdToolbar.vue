<template>
  <div class="md-toolbar" role="toolbar" aria-label="格式工具栏">
    <!-- 1. 历史 -->
    <div class="md-tb-group">
      <UiIconButton size="sm" icon="fas fa-undo" title="撤销 (Ctrl+Z)" aria-label="撤销" :disabled="!canUndo" @click="$emit('undo')" />
      <UiIconButton size="sm" icon="fas fa-redo" title="重做 (Ctrl+Y)" aria-label="重做" :disabled="!canRedo" @click="$emit('redo')" />
    </div>
    <div class="md-tb-sep"></div>

    <!-- 2. 行内排版 -->
    <div class="md-tb-group">
      <UiIconButton size="sm" icon="fas fa-bold" title="加粗 (Ctrl+B)" aria-label="加粗" @click="$emit('bold')" />
      <UiIconButton size="sm" icon="fas fa-italic" title="斜体 (Ctrl+I)" aria-label="斜体" @click="$emit('italic')" />
      <UiIconButton size="sm" icon="fas fa-strikethrough" title="删除线 (Ctrl+D)" aria-label="删除线" @click="$emit('strikethrough')" />
      <UiIconButton size="sm" icon="fas fa-code" title="行内代码" aria-label="行内代码" @click="$emit('inlineCode')" />
      <UiIconButton size="sm" icon="fas fa-quote-left" title="引用 (Ctrl+Shift+Q)" aria-label="引用" @click="$emit('quote')" />
    </div>
    <div class="md-tb-sep"></div>

    <!-- 3. 标题与分割线 -->
    <div class="md-tb-group">
      <UiButton size="sm" variant="ghost" title="一级标题" @click="$emit('heading', 1)">H1</UiButton>
      <UiButton size="sm" variant="ghost" title="二级标题" @click="$emit('heading', 2)">H2</UiButton>
      <UiButton size="sm" variant="ghost" title="三级标题" @click="$emit('heading', 3)">H3</UiButton>
      <UiIconButton size="sm" icon="fas fa-minus" title="水平线 (Ctrl+Shift+H)" aria-label="水平线" @click="$emit('hr')" />
    </div>
    <div class="md-tb-sep"></div>

    <!-- 4. 列表 -->
    <div class="md-tb-group">
      <UiIconButton size="sm" icon="fas fa-list-ul" title="无序列表 (Ctrl+Shift+7)" aria-label="无序列表" @click="$emit('unorderedList')" />
      <UiIconButton size="sm" icon="fas fa-list-ol" title="有序列表 (Ctrl+Shift+8)" aria-label="有序列表" @click="$emit('orderedList')" />
      <UiIconButton size="sm" icon="fas fa-tasks" title="任务列表 (Ctrl+Shift+9)" aria-label="任务列表" @click="$emit('taskList')" />
    </div>
    <div class="md-tb-sep"></div>

    <!-- 5. 插入元素与富文本 -->
    <div class="md-tb-group">
      <UiIconButton size="sm" icon="fas fa-link" title="插入链接 (Ctrl+K)" aria-label="插入链接" @click="$emit('openModal', 'link')" />
      <UiIconButton size="sm" icon="fas fa-image" title="插入图片 (Ctrl+Shift+I)" aria-label="插入图片" @click="$emit('openModal', 'image')" />
      <UiIconButton size="sm" icon="fas fa-file-code" title="插入代码块 (Ctrl+Shift+1)" aria-label="插入代码块" @click="$emit('openModal', 'code')" />
      <UiIconButton size="sm" icon="fas fa-table" title="表格生成器 (Ctrl+Shift+2)" aria-label="表格生成器" @click="$emit('openModal', 'table')" />
      <UiIconButton size="sm" icon="fas fa-box-archive" title="插入折叠框" aria-label="插入折叠框" @click="$emit('openModal', 'callout')" />
      <UiIconButton size="sm" icon="fas fa-feather" title="插入引言" aria-label="插入引言" @click="$emit('openModal', 'epigraph')" />
      <UiIconButton size="sm" icon="fas fa-tv" title="插入 Bilibili 视频" aria-label="插入 Bilibili 视频" @click="$emit('openModal', 'bilibili')" />
      <UiIconButton size="sm" icon="fas fa-square-root-variable" title="数学公式面板 (Ctrl+M)" aria-label="数学公式面板" @click="$emit('openModal', 'math')" />
    </div>
    <div class="md-tb-sep"></div>

    <!-- 6. 辅助工具 -->
    <div class="md-tb-group">
      <UiIconButton
        size="sm"
        icon="fas fa-list"
        :active="outlineOpen"
        title="文档大纲 (TOC)"
        aria-label="文档大纲"
        @click="$emit('toggleOutline')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-search"
        :active="findOpen"
        title="查找与替换 (Ctrl+F)"
        aria-label="查找与替换"
        @click="$emit('toggleFind')"
      />
    </div>

    <!-- 7. 视图模式与滚动同步 -->
    <div class="md-tb-group md-tb-right">
      <UiIconButton
        size="sm"
        icon="fas fa-arrows-up-down"
        :active="scrollSyncOn"
        :title="'滚动同步：' + (scrollSyncOn ? '开' : '关')"
        aria-label="滚动同步"
        @click="$emit('toggleScrollSync')"
      />
      <div class="md-tb-sep"></div>
      <UiIconButton size="sm" icon="fas fa-table-columns" :active="viewMode === 'split'" title="双栏对比" aria-label="双栏对比" @click="$emit('setViewMode', 'split')" />
      <UiIconButton size="sm" icon="fas fa-pen" :active="viewMode === 'editor-only'" title="纯编辑" aria-label="纯编辑" @click="$emit('setViewMode', 'editor-only')" />
      <UiIconButton size="sm" icon="fas fa-eye" :active="viewMode === 'preview-only'" title="纯预览" aria-label="纯预览" @click="$emit('setViewMode', 'preview-only')" />
    </div>
  </div>
</template>

<script setup>
import { UiButton, UiIconButton } from '@/ui'

defineProps({
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  scrollSyncOn: { type: Boolean, default: true },
  viewMode: { type: String, required: true },
  outlineOpen: { type: Boolean, default: false },
  findOpen: { type: Boolean, default: false }
})

defineEmits([
  'undo',
  'redo',
  'bold',
  'italic',
  'strikethrough',
  'inlineCode',
  'quote',
  'heading',
  'hr',
  'unorderedList',
  'orderedList',
  'taskList',
  'openModal',
  'toggleOutline',
  'toggleFind',
  'toggleScrollSync',
  'setViewMode'
])
</script>

<style scoped>
.md-toolbar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: 6px var(--space-3);
  border-bottom: var(--border-width) solid var(--line-hairline);
  background: var(--surface-1);
}

.md-tb-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}

.md-tb-right {
  margin-left: auto;
}

.md-tb-sep {
  width: 1px;
  height: 18px;
  background: var(--line-hairline);
  margin: 0 var(--space-1);
  flex: none;
}
</style>
