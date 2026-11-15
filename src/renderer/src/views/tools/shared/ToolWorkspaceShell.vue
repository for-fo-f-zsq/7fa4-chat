<template>
  <div class="tool-shell" :class="{ narrow: isNarrow, 'is-flush': flush }">
    <header v-if="$slots.header" class="tool-shell__header">
      <div class="tool-shell__bar">
        <slot name="header" />
      </div>
    </header>
    <div class="tool-shell__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="tool-shell__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useNarrow } from '../../../composables/useNarrow.js'

const props = defineProps({
  narrow: { type: Boolean, default: undefined },
  flush: { type: Boolean, default: false }
})

const { isNarrow: detectedNarrow } = useNarrow()
const isNarrow = computed(() => (props.narrow !== undefined ? props.narrow : detectedNarrow.value))
</script>

<style scoped src="./tool-workspace-shell.css"></style>
