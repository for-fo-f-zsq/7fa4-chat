<script setup>
/**
 * 空状态。icon 传 Font Awesome 类名（如 'fa-inbox'），由调用方决定语义。
 */
defineProps({
  icon: { type: String, default: 'fa-inbox' },
  title: { type: String, default: '暂无数据' },
  sub: { type: String, default: '' },
})
</script>

<template>
  <div class="empty">
    <div class="empty__icon"><i class="fa-solid" :class="icon" /></div>
    <div class="empty__title">{{ title }}</div>
    <p v-if="sub" style="max-width: 340px; font-size: 12.5px">{{ sub }}</p>
    <div v-if="$slots.default" style="margin-top: 6px">
      <slot />
    </div>
  </div>
</template>
