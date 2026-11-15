<template>
  <div class="step-dots" :class="{ 'is-centered': centered }">
    <span
      v-for="i in count"
      :key="i"
      class="step-dot"
      :class="{ active: current === i - 1 }"
    ></span>
  </div>
</template>

<script setup>
defineProps({
  count: { type: Number, required: true },
  current: { type: Number, required: true },
  centered: { type: Boolean, default: false },
})
</script>

<style scoped>
.step-dots {
  display: flex;
  gap: 6px;
}

.step-dots.is-centered {
  justify-content: center;
}

.step-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line-strong);
  transition:
    width var(--motion-dur-base) var(--motion-ease-standard),
    background-color var(--motion-dur-base) var(--motion-ease-standard),
    border-radius var(--motion-dur-base) var(--motion-ease-standard);
}

.step-dot.active {
  width: 18px;
  border-radius: var(--radius-xs);
  background: var(--brand);
}
</style>
