<template>
  <div class="graph-floating-pill" role="toolbar" aria-label="模式与布局工具栏">
    <!-- Group 1: Mode: Select, Add Node, Add Edge, Erase -->
    <div class="pill-group" role="group" aria-label="编辑模式">
      <UiIconButton
        size="sm"
        icon="fas fa-mouse-pointer"
        :active="mode === 'select' || mode === 'edit'"
        title="选择模式 (点击选中节点/边，拖拽移动，Delete 删除)"
        aria-label="选择模式"
        @click="$emit('update:mode', 'select')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-plus"
        :active="mode === 'node'"
        title="加节点模式 (点击画布空白处添加节点)"
        aria-label="加节点模式"
        @click="$emit('update:mode', 'node')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-long-arrow-alt-right"
        :active="mode === 'edge'"
        title="加边模式 (依次点击起点和终点连边)"
        aria-label="加边模式"
        @click="$emit('update:mode', 'edge')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-eraser"
        :active="mode === 'delete'"
        title="擦除模式 (点击节点或边将其删除)"
        aria-label="擦除模式"
        @click="$emit('update:mode', 'delete')"
      />
    </div>

    <div class="pill-divider" aria-hidden="true"></div>

    <!-- Group 2: Layout: Force Lock, Re-layout, Tree -->
    <div class="pill-group" role="group" aria-label="布局计算">
      <UiIconButton
        size="sm"
        :icon="locked ? 'fas fa-lock' : 'fas fa-unlock'"
        :active="locked"
        :title="locked ? '物理模拟已锁定（点击解锁力导向）' : '物理力导向模拟中（点击锁定）'"
        aria-label="物理锁定切换"
        @click="$emit('toggleLock')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-sync-alt"
        title="重新随机排布物理布局"
        aria-label="重新随机排布"
        @click="$emit('restartLayout')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-sitemap"
        :active="treeMode"
        title="树形分层布局 (点击任一节点作为根分层展示)"
        aria-label="树形分层布局"
        @click="$emit('toggleTreeMode')"
      />
    </div>

    <div class="pill-divider" aria-hidden="true"></div>

    <!-- Group 3: View: Zoom in/out, fit -->
    <div class="pill-group" role="group" aria-label="视口导航">
      <UiIconButton
        size="sm"
        icon="fas fa-search-plus"
        title="放大视图"
        aria-label="放大视图"
        @click="$emit('zoomIn')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-search-minus"
        title="缩小视图"
        aria-label="缩小视图"
        @click="$emit('zoomOut')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-expand"
        title="适应画布全部节点"
        aria-label="适应画布"
        @click="$emit('fitView')"
      />
    </div>
  </div>
</template>

<script setup>
import { UiIconButton } from '@/ui'

defineProps({
  mode: { type: String, required: true },
  locked: { type: Boolean, required: true },
  treeMode: { type: Boolean, required: true }
})

defineEmits([
  'update:mode',
  'toggleLock',
  'restartLayout',
  'toggleTreeMode',
  'zoomIn',
  'zoomOut',
  'fitView'
])
</script>

<style scoped>
.graph-floating-pill {
  position: absolute;
  top: var(--space-3);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 4px 8px;
  background: var(--surface-glass, rgba(255, 255, 255, 0.85));
  backdrop-filter: blur(var(--glass-blur, 16px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 16px));
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-pill, 9999px);
  box-shadow: var(--elev-3);
  z-index: 10;
  user-select: none;
  transition: box-shadow var(--motion-dur-fast) var(--motion-ease-standard);
}

.graph-floating-pill:hover {
  box-shadow: var(--elev-4);
}

.pill-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.pill-divider {
  width: 1px;
  height: 18px;
  background: var(--line-hairline);
  margin: 0 4px;
  flex-shrink: 0;
}
</style>
