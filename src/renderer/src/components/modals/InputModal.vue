<template>
  <!-- 标题槽保留 .inputModal-popup-inner h4，输入框保留 .inputModal-input（Onboarding 定位契约） -->
  <UiModal :open="visible" :title="title" size="sm" :show-close="false" @update:open="onOpenChange">
    <template #title="{ id }">
      <div class="inputModal-popup-inner">
        <h4 :id="id" class="inputModal-title">{{ title }}</h4>
      </div>
    </template>
    <UiInput
      ref="inputRef"
      v-model="inputValue"
      class="inputModal-input"
      :placeholder="placeholder"
      autofocus
      @enter="confirm"
    />
    <template #footer>
      <UiButton variant="secondary" @click="close">{{ cancelText }}</UiButton>
      <UiButton variant="primary" @click="confirm">{{ confirmText }}</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { UiButton, UiInput, UiModal } from '@/ui'

const props = defineProps({
  visible: Boolean,
  title: { type: String, default: '提示' },
  placeholder: { type: String, default: '' },
  initialValue: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
})

const emit = defineEmits(['update:visible', 'confirm'])

const inputValue = ref('')
const inputRef = ref(null)

watch(
  () => props.visible,
  async (newVal) => {
    if (newVal) {
      inputValue.value = props.initialValue || ''
      await nextTick()
      inputRef.value?.focus()
      inputRef.value?.select()
    }
  }
)

function confirm() {
  const val = inputValue.value.trim()
  if (!val) return
  emit('confirm', val)
  close()
}

function close() {
  emit('update:visible', false)
}

function onOpenChange(open) {
  if (!open) close()
}
</script>

<style scoped src="../../css/components/input-modal.css"></style>
