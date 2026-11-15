<template>
  <div class="donate-qr-box" :class="{ 'is-compact': compact }">
    <img
      v-if="!qrError"
      :src="src"
      alt="赞赏码"
      class="donate-qr-img"
      title="点击放大"
      @click="zoomOpen = true"
      @error="emit('error')"
    />
    <p v-if="qrError" class="donate-qr-tip">赞赏码加载失败，请稍后刷新重试</p>
    <p v-else class="donate-qr-tip">{{ tip }}</p>

    <UiModal :open="zoomOpen && !qrError" size="lg" aria-label="赞赏码大图" @close="zoomOpen = false">
      <img :src="src" alt="赞赏码" class="donate-zoom-img" @click="zoomOpen = false" />
    </UiModal>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { UiModal } from '@/ui'

defineProps({
  src: { type: String, required: true },
  qrError: { type: Boolean, default: false },
  tip: { type: String, default: '微信扫码赞赏 · 点击可放大' },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['error'])
const zoomOpen = ref(false)
</script>

<style scoped src="../../css/components/donate-shared.css"></style>
