<template>
  <div class="graph-tool-host">
    <GraphEditor
      ref="editorRef"
      @back="$emit('back')"
      @dirty-change="$emit('dirty-change', $event)"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import GraphEditor from './GraphEditor.vue'

// dirty-change 需透传给外层 ChatView（未保存拦截），save/openFile 也需转暴露
defineEmits(['back', 'dirty-change'])

const editorRef = ref(null)

defineExpose({
  save: () => editorRef.value?.save(),
  openFile: () => editorRef.value?.openFile()
})
</script>
