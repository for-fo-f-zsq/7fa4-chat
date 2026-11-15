<template>
  <div class="p-toolbar img-header-bar">
    <div class="img-header-left">
      <i class="fas fa-image img-header-icon" aria-hidden="true"></i>
      <div class="img-filename-pill" :title="currentName || '未打开图片'">
        <i class="far fa-file-image pill-icon" aria-hidden="true"></i>
        <span class="pill-text">{{ currentName || '未命名画布' }}</span>
      </div>

      <ToolSaveBadge
        :has-file="!!savedName"
        :dirty="dirty"
        :saved-path="savedPath"
        :saved-name="savedName"
      />

      <div v-if="canvasReady" class="img-dim-badge" title="当前画布尺寸与格式">
        <span>{{ width }} × {{ height }} px</span>
        <span class="img-format-tag">{{ formatTag }}</span>
      </div>
    </div>

    <div class="p-toolbar__group img-header-actions">
      <UiIconButton
        size="sm"
        icon="fas fa-folder-open"
        title="打开图片"
        aria-label="打开图片"
        @click="$emit('open')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-plus-square"
        title="新建空白画布"
        aria-label="新建空白画布"
        @click="$emit('new')"
      />
      <UiIconButton
        size="sm"
        icon="fas fa-save"
        title="保存 (Ctrl+S)：首次选位置，之后直接覆盖该文件"
        aria-label="保存"
        :disabled="!canvasReady || saving"
        @click="$emit('save')"
      />
      <UiButton
        size="sm"
        variant="primary"
        icon="fas fa-paper-plane"
        title="发送到会话（选择接收方）"
        :disabled="!canvasReady || loading"
        @click="$emit('send')"
      >
        发送
      </UiButton>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { UiButton, UiIconButton } from '@/ui'
import ToolSaveBadge from '../../shared/ToolSaveBadge.vue'

const props = defineProps({
  currentName: { type: String, default: '' },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  mime: { type: String, default: 'image/png' },
  dirty: { type: Boolean, default: false },
  savedName: { type: String, default: '' },
  savedPath: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  canvasReady: { type: Boolean, default: false }
})

defineEmits(['open', 'new', 'save', 'send'])

const formatTag = computed(() => {
  if (props.mime === 'image/jpeg') return 'JPEG'
  if (props.mime === 'image/webp') return 'WEBP'
  return 'PNG'
})
</script>

<style scoped>
.img-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  border-bottom: 0;
  background: transparent;
  gap: var(--space-2);
}

.img-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  flex: 1;
}

.img-header-icon {
  flex-shrink: 0;
  color: var(--brand);
  font-size: var(--text-base);
}

.img-filename-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  background: var(--surface-1);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  font-size: var(--text-xs);
  color: var(--fg);
  font-weight: var(--weight-medium);
  overflow: hidden;
  box-shadow: var(--elev-inset);
}

.pill-icon {
  color: var(--fg-muted);
  font-size: var(--text-2xs);
  flex-shrink: 0;
}

.pill-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.img-dim-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-2);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.img-format-tag {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: var(--weight-semibold);
  padding: 0 4px;
  border-radius: var(--radius-xs);
}

.img-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
}
</style>
