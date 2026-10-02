<script setup>
/**
 * 通用弹窗：标题 + 内容槽 + 页脚槽。
 * 点遮罩关闭（可用 :dismissable="false" 禁用，用于防误关）。
 */
defineProps({
  title: { type: String, default: '' },
  width: { type: String, default: '' },
  dismissable: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

function onScrim(e) {
  // 只在「点到遮罩本身」时关闭，点内部不关
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <div class="scrim" @click="onScrim" @keydown.esc="$emit('close')">
    <div class="modal" :style="width ? { maxWidth: width } : null" role="dialog" aria-modal="true">
      <div class="modal__head">
        <h3 class="modal__title">{{ title }}</h3>
        <button class="btn btn--ghost btn--icon btn--sm" aria-label="关闭" :disabled="busy" @click="$emit('close')">
          <i class="fa-solid fa-xmark" />
        </button>
      </div>
      <div class="modal__body">
        <slot />
      </div>
      <div v-if="$slots.foot" class="modal__foot">
        <slot name="foot" />
      </div>
    </div>
  </div>
</template>
