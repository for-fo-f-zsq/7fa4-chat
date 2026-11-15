<template>
  <div class="editable-title-wrap">
    <UiInput
      v-if="editing"
      ref="inputRef"
      v-model="draft"
      size="sm"
      autofocus
      :maxlength="maxlength"
      @enter="commit"
      @keydown.esc.stop="cancel"
      @blur="commit"
    />
    <h3
      v-else
      class="editable-title"
      :class="{ 'is-editable': editable, 'is-multiline': multiline }"
      @click="start"
    >
      <span>{{ value }}</span>
      <i v-if="editable" class="fas fa-pencil-alt editable-title__icon" aria-hidden="true"></i>
    </h3>
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import { UiInput } from '@/ui'

const props = defineProps({
  value: { type: String, default: '' },
  editable: { type: Boolean, default: false },
  multiline: { type: Boolean, default: false },
  maxlength: { type: Number, default: 50 },
  editInitialValue: { type: String, default: null },
})

const emit = defineEmits(['save'])

const editing = ref(false)
const draft = ref('')
const inputRef = ref(null)

function start() {
  if (!props.editable) return
  draft.value = props.editInitialValue != null ? props.editInitialValue : props.value
  editing.value = true
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function commit() {
  if (!editing.value) return
  editing.value = false
  emit('save', draft.value.trim())
}

function cancel() {
  editing.value = false
}
</script>

<style scoped src="../../css/components/editable-title.css"></style>
