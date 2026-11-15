<template>
  <div class="preset-panel">
    <div class="theme-grid-modal motion-stagger">
      <button
        v-for="t in themes"
        :key="t.value"
        type="button"
        class="theme-item motion-press"
        :class="{ active: currentTheme === t.value, original: t.original, dark: isDarkTheme(t.value) }"
        :aria-pressed="currentTheme === t.value ? 'true' : 'false'"
        @click.stop="emit('select', t.value)"
        @mouseenter="emit('preview', t.value)"
        @mouseleave="emit('restore')"
      >
        <span class="theme-preview" :style="{ background: varsOf(t.value).bg }">
          <span class="tp-side" :style="{ background: varsOf(t.value).side }"></span>
          <span class="tp-accent" :style="{ background: varsOf(t.value).accent }"></span>
          <span class="tp-line" :style="{ background: varsOf(t.value).text }"></span>
        </span>
        <span class="theme-label-wrap">
          <span class="theme-name">{{ t.label }}</span>
          <span v-if="t.original" class="theme-star" title="原生主题">★</span>
        </span>
        <i v-if="currentTheme === t.value" class="fas fa-check theme-check" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  themes: { type: Array, required: true },
  currentTheme: { type: String, required: true },
  varsOf: { type: Function, required: true },
  isDarkTheme: { type: Function, required: true },
})

const emit = defineEmits(['select', 'preview', 'restore'])
</script>
