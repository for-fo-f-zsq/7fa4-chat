<script setup>
/**
 * 危险操作确认。用 Promise 暴露：
 *   const ok = await confirm.ask({ title, message, danger, confirmText })
 */
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'

const visible = ref(false)
const opts = ref({})
let resolver = null

function ask(options = {}) {
  opts.value = Object.assign(
    { title: '确认操作', message: '', danger: true, confirmText: '确认', cancelText: '取消' },
    options
  )
  visible.value = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

function settle(v) {
  visible.value = false
  if (resolver) resolver(v)
  resolver = null
}

defineExpose({ ask })
</script>

<template>
  <BaseModal v-if="visible" :title="opts.title" :dismissable="false" @close="settle(false)">
    <p style="white-space: pre-wrap; line-height: 1.65">{{ opts.message }}</p>
    <template #foot>
      <button class="btn" @click="settle(false)">{{ opts.cancelText }}</button>
      <button class="btn" :class="opts.danger ? 'btn--danger' : 'btn--primary'" @click="settle(true)">
        {{ opts.confirmText }}
      </button>
    </template>
  </BaseModal>
</template>
