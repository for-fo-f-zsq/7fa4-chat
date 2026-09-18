<template>
  <div class="graph-tool-host">
    <GraphEditor @back="$emit('back')" />
  </div>
</template>

<script setup>
import GraphEditor from './GraphEditor.vue'

defineEmits(['back'])
</script>
