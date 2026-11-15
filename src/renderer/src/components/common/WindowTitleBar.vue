<template>
  <div class="title-bar">
    <div class="title-bar-drag u-drag-region">
      <span class="title-bar-title">{{ title }}</span>
    </div>
    <div class="title-bar-controls u-no-drag">
      <button type="button" class="title-btn title-minimize" aria-label="最小化" @click="windowMinimize">
        <i class="fas fa-minus" aria-hidden="true"></i>
      </button>
      <button type="button" class="title-btn title-maximize" :aria-label="isMaximized ? '还原' : '最大化'" @click="windowMaximize">
        <i class="fas" :class="isMaximized ? 'fa-clone' : 'fa-square'" aria-hidden="true"></i>
      </button>
      <button type="button" class="title-btn title-close" aria-label="关闭" @click="windowClose">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useWindowControls } from '../../composables/useWindowControls.js'

defineProps({
  title: { type: String, default: '7FA4 Chat' },
})

const { isMaximized, windowMinimize, windowMaximize, windowClose } = useWindowControls()
</script>

<style scoped src="../../css/components/window-title-bar.css"></style>
