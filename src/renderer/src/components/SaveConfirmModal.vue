<template>
  <div v-if="visible" class="inputModal-popup" @click.self="onCancel">
    <div class="inputModal-popup-inner">
      <h4>{{ title }}</h4>
      <div class="saveconfirm-message">{{ message }}</div>
      <div class="inputModal-popup-btns">
        <button @click="onSave" class="inputModal-ok">{{ saveText }}</button>
        <button @click="onDiscard" class="saveconfirm-discard">{{ discardText }}</button>
        <button @click="onCancel" class="inputModal-cancel">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
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
</script>
