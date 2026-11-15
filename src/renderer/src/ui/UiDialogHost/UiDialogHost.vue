<template>
  <UiModal
    :open="!!activeDialog"
    :title="activeDialog?.title || ''"
    size="sm"
    modal-class="ui-dialog-modal"
    :z-index="'var(--z-toast, 5000)'"
    :show-close="activeDialog?.kind !== 'alert'"
    :close-on-overlay="activeDialog?.kind !== 'alert'"
    :close-on-esc="true"
    @update:open="onModalOpenChange"
  >
    <div v-if="activeDialog" class="ui-dialog-body">
      <p v-if="activeDialog.message" class="ui-dialog-message">{{ activeDialog.message }}</p>
      <UiInput
        v-if="activeDialog.kind === 'prompt'"
        ref="promptInputRef"
        v-model="activeDialog.inputValue"
        :type="activeDialog.inputType || 'text'"
        :placeholder="activeDialog.placeholder || ''"
        autofocus
        @enter="onConfirm"
      />
    </div>
    <template v-if="activeDialog" #footer>
      <div class="p-modal-footer">
        <UiButton
          v-if="activeDialog.kind !== 'alert'"
          variant="ghost"
          @click="onCancel"
        >
          {{ activeDialog.cancelText || '取消' }}
        </UiButton>
        <UiButton
          :variant="activeDialog.danger ? 'danger' : 'primary'"
          @click="onConfirm"
        >
          {{ activeDialog.confirmText || '确定' }}
        </UiButton>
      </div>
    </template>
  </UiModal>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiModal from '../UiModal/UiModal.vue'
import UiButton from '../UiButton/UiButton.vue'
import UiInput from '../UiInput/UiInput.vue'
import { activeDialog, registerDialogHost, resolveActiveDialog } from '../../composables/useDialog.js'

defineOptions({ name: 'UiDialogHost' })

const promptInputRef = ref(null)
let unregister = null

onMounted(() => {
  unregister = registerDialogHost()
})

onBeforeUnmount(() => {
  unregister?.()
  unregister = null
})

watch(
  () => activeDialog.value?.id,
  async (id) => {
    if (!id || activeDialog.value?.kind !== 'prompt') return
    await nextTick()
    promptInputRef.value?.focus()
    promptInputRef.value?.select()
  }
)

function onConfirm() {
  resolveActiveDialog(true, activeDialog.value?.inputValue ?? '')
}

function onCancel() {
  resolveActiveDialog(false, null)
}

function onModalOpenChange(open) {
  if (!open && activeDialog.value) {
    resolveActiveDialog(activeDialog.value.kind === 'alert', null)
  }
}
</script>

<style src="./UiDialogHost.css"></style>
