<template>
  <button
    ref="triggerRef"
    class="tm-who"
    :class="{ open }"
    type="button"
    @click="$emit('toggle')"
  >
    <span v-if="user" class="tm-who-avatar" :style="{ color: user.color || 'var(--brand)' }">
      {{ user.initial }}
    </span>
    <i v-else class="fas fa-user tm-who-none" aria-hidden="true"></i>
    <span class="tm-who-name" :class="{ custom: !!(panel.customName && !panel.uid) }">
      {{ user?.name || '选择用户' }}
    </span>
    <i class="fas fa-chevron-down tm-who-caret" aria-hidden="true"></i>
  </button>

  <Transition name="dropdown">
    <TimerUserDropdown
      v-if="open"
      :panel="panel"
      :trigger-el="triggerRef"
      @close="$emit('close')"
    />
  </Transition>
</template>

<script setup>
import { ref, computed } from 'vue'
import { panelUser } from '../timerStore.js'
import TimerUserDropdown from './TimerUserDropdown.vue'

const props = defineProps({
  panel: { type: Object, required: true },
  open: { type: Boolean, default: false }
})

defineEmits(['toggle', 'close'])

const triggerRef = ref(null)
const user = computed(() => panelUser(props.panel))
</script>

<style scoped>
.tm-who {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1 1 0;
  min-width: 0;
  height: var(--control-h-lg);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  padding: 0 10px;
  border-radius: var(--radius-base);
  border: var(--border-width) solid var(--line-hairline);
  background: var(--surface-0);
  color: var(--fg);
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--motion-dur-fast) var(--motion-ease-standard),
    border-color var(--motion-dur-fast) var(--motion-ease-standard),
    color var(--motion-dur-fast) var(--motion-ease-standard),
    box-shadow var(--motion-dur-fast) var(--motion-ease-standard),
    transform var(--motion-dur-fast) var(--motion-ease-out-expo);
}

.tm-who:focus-visible {
  outline: 2px solid transparent;
  box-shadow: var(--focus-ring);
}

@media (hover: hover) {
  .tm-who:hover {
    border-color: var(--c, var(--brand));
    background: var(--surface-hover);
  }
}

.tm-who:active {
  transform: scale(0.99);
}

.tm-who.open {
  border-color: var(--c, var(--brand));
  box-shadow: var(--focus-halo);
}

.tm-who-avatar {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  background: var(--surface-2);
}

.tm-who-none {
  color: var(--fg-placeholder);
  font-size: var(--text-base);
}

.tm-who-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tm-who-name.custom {
  color: var(--brand);
  font-weight: var(--weight-semibold);
}

.tm-who-caret {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--fg-muted);
  transition: transform var(--motion-dur-fast) var(--motion-ease-out-expo);
}

.tm-who.open .tm-who-caret {
  transform: rotate(180deg);
}

:global(.tm-tool.narrow) .tm-who {
  padding: 0 var(--space-3);
}
</style>
