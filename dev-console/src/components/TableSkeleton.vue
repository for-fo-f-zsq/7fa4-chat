<script setup>
/** 表格骨架屏，避免刷新时内容跳动 */
defineProps({ rows: { type: Number, default: 5 }, cols: { type: Number, default: 4 } })
</script>

<template>
  <div style="padding: 16px; display: flex; flex-direction: column; gap: 10px">
    <div v-for="r in rows" :key="r" class="row" style="gap: 14px">
      <div v-for="c in cols" :key="c" class="skeleton" :style="{ height: '15px', flex: c === 1 ? '0 0 26%' : '1 1 0' }" />
    </div>
  </div>
</template>
