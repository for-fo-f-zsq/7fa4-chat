<script setup>
import { toastState } from '@/lib/util.js'
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toastState" :key="t.id" class="toast" :class="'toast--' + t.type">
        <span>{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-leave-active { transition: all 180ms ease; }
.toast-leave-to { opacity: 0; transform: translateX(16px); }
</style>
