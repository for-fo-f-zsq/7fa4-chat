<template>
  <div v-if="visible" class="inputModal-popup" @click.self="close">
    <div class="inputModal-popup-inner">
      <h4>{{ title }}</h4>
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        :placeholder="placeholder"
        @keydown.enter="confirm"
        class="inputModal-input"
      />
      <div class="inputModal-popup-btns">
        <button @click="confirm" class="inputModal-ok">{{ confirmText }}</button>
        <button @click="close" class="inputModal-cancel">{{ cancelText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  visible: Boolean,
  title: { type: String, default: '提示' },
  placeholder: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' }
})

const emit = defineEmits(['update:visible', 'confirm'])

const inputValue = ref('')
const inputRef = ref(null)

// 监听 visible 变化：打开时清空输入框并自动聚焦
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    inputValue.value = ''
    await nextTick()
    inputRef.value?.focus()
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
</script>