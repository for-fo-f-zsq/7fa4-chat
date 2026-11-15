<template>
  <div class="p-toolbar md-workspace-bar">
    <i class="fas fa-file-alt md-workspace-icon" aria-hidden="true"></i>
    <UiInput
      v-if="editingName"
      ref="nameInputRef"
      :autofocus="true"
      class="md-name-input"
      size="sm"
      :model-value="fileNameDraft"
      spellcheck="false"
      @update:model-value="fileNameDraft = $event"
      @keydown.enter="commitName"
      @keydown.esc="cancelName"
      @blur="commitName"
    />
    <span
      v-else
      class="md-workspace-path md-name-edit"
      :title="'点击修改文件名' + (fileName ? '：' + fileName : '')"
      @click="startEditName"
    >
      {{ fileName || '未命名' }}<i class="fas fa-pencil-alt md-name-edit-icon" aria-hidden="true"></i>
    </span>
    <div class="p-toolbar__group">
      <UiIconButton size="sm" icon="fas fa-folder-open" title="打开文件" aria-label="打开文件" @click="$emit('open')" />
      <UiIconButton size="sm" icon="fas fa-file" title="新建文件" aria-label="新建文件" @click="$emit('new')" />
      <UiIconButton size="sm" icon="fas fa-save" title="保存 (Ctrl+S)：首次选位置，之后直接覆盖该文件" aria-label="保存" :disabled="saving" @click="$emit('save')" />
      <UiIconButton size="sm" icon="fas fa-file-export" title="另存为 (Ctrl+Shift+S)" aria-label="另存为" :disabled="saving" @click="$emit('saveAs')" />
      <UiIconButton size="sm" icon="fas fa-image" title="导出为图片" aria-label="导出为图片" :disabled="exporting" @click="$emit('exportPng')" />
      <UiIconButton size="sm" icon="fas fa-copy" title="复制 HTML 代码" aria-label="复制 HTML 代码" @click="$emit('copyHtml')" />
      <UiIconButton size="sm" icon="fas fa-file-code" title="导出为 HTML 文件" aria-label="导出为 HTML 文件" :disabled="exporting" @click="$emit('exportHtml')" />
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { UiIconButton, UiInput } from '@/ui'

const props = defineProps({
  fileName: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  exporting: { type: Boolean, default: false }
})

const emit = defineEmits(['update:fileName', 'open', 'new', 'save', 'saveAs', 'exportPng', 'copyHtml', 'exportHtml'])

const editingName = ref(false)
const fileNameDraft = ref('')
const nameInputRef = ref(null)

function startEditName() {
  fileNameDraft.value = props.fileName
  editingName.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function commitName() {
  if (!editingName.value) return
  editingName.value = false
  const name = fileNameDraft.value.trim()
  if (name) emit('update:fileName', name)
}

function cancelName() {
  editingName.value = false
}
</script>

<style scoped>
.md-workspace-bar {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-bottom: 0;
  background: transparent;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.md-workspace-icon {
  flex-shrink: 0;
  color: var(--brand);
}

.md-workspace-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
  background: var(--surface-2);
  border: var(--border-width) solid var(--line-hairline);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-3);
  color: var(--fg);
  font-weight: var(--weight-medium);
  transition:
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    background-color var(--motion-dur-fast) var(--motion-ease-standard);
}

.md-name-edit {
  cursor: text;
}

@media (hover: hover) {
  .md-name-edit:hover {
    border-color: var(--brand-line);
    background: var(--surface-hover);
  }
}

.md-name-edit-icon {
  font-size: var(--text-2xs);
  opacity: 0.55;
  margin-left: var(--space-2);
}

.md-name-input {
  flex: 1;
  min-width: 0;
}
</style>
