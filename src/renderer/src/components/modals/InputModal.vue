<template>
  <!-- 面板/遮罩/焦点陷阱/滚动锁由 UiModal 承载；标题槽保留 .inputModal-popup-inner h4（Onboarding 定位契约） -->
  <UiModal :open="visible" :title="title" size="sm" :show-close="false" @update:open="onOpenChange">
    <template #title="{ id }">
      <div class="inputModal-popup-inner">
        <h4 :id="id" class="inputModal-title">{{ title }}</h4>
      </div>
    </template>
    <input
      ref="inputRef"
      v-autofocus
      v-model="inputValue"
      type="text"
      :placeholder="placeholder"
      @keydown.enter="confirm"
      class="inputModal-input"
    />
    <template #footer>
      <UiButton variant="primary" @click="confirm">{{ confirmText }}</UiButton>
      <UiButton variant="secondary" @click="close">{{ cancelText }}</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { UiButton, UiModal } from '../../ui/index.js'

const props = defineProps({
  visible: Boolean,
  title: { type: String, default: '提示' },
  placeholder: { type: String, default: '' },
  initialValue: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' }
})

const emit = defineEmits(['update:visible', 'confirm'])

const inputValue = ref('')
const inputRef = ref(null)

// 监听 visible 变化：打开时清空输入框并自动聚焦
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    inputValue.value = props.initialValue || ''
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
})

function confirm() {
  const val = inputValue.value.trim()
  if (!val) return
  emit('confirm', val)
  close()
}

function close() {
  emit('update:visible', false)
}

// UiModal 的遮罩点击 / Esc 关闭 → 统一走 close()，语义与旧版 @click.self 一致
function onOpenChange(open) {
  if (!open) close()
}
</script>

<style scoped src="../../css/components/input-modal.css"></style>
