<template>
  <!-- 面板/遮罩/焦点陷阱/滚动锁由 UiModal 承载；按钮由 UiButton 承载 -->
  <UiModal :open="visible" :title="title" size="sm" :show-close="false" @update:open="onOpenChange">
    <p class="saveconfirm-message">{{ message }}</p>
    <template #footer>
      <UiButton variant="primary" @click="onSave">{{ saveText }}</UiButton>
      <UiButton variant="ghost" class="saveconfirm-discard" @click="onDiscard">{{ discardText }}</UiButton>
      <UiButton variant="secondary" @click="onCancel">取消</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { UiButton, UiModal } from '../ui/index.js'

defineProps({
  visible: Boolean,
  title: { type: String, default: '未保存的修改' },
  message: { type: String, default: '当前内容尚未保存，是否保存后再离开？' },
  saveText: { type: String, default: '保存' },
  discardText: { type: String, default: '不保存' }
})

const emit = defineEmits(['update:visible', 'save', 'discard', 'cancel'])

function onSave() {
  emit('save')
}

function onDiscard() {
  emit('discard')
}

function onCancel() {
  emit('cancel')
  emit('update:visible', false)
}

// UiModal 的遮罩点击 / Esc 关闭 → 与旧版 @click.self 一致，走 cancel 语义
function onOpenChange(open) {
  if (!open) onCancel()
}
</script>

<style scoped src="../css/save-confirm-modal.css"></style>
