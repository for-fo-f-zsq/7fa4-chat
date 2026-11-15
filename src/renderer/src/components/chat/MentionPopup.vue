<template>
  <Transition name="dropdown">
    <div class="mention-popup" v-if="visible" data-placement="top" :style="popupStyle">
      <div
        class="mention-item mention-all-item"
        :class="{ active: activeIndex === 0 }"
        @click="$emit('selectAll')"
        v-if="isGroup"
      >
        <i class="fas fa-users"></i> 所有人
      </div>
      <div
        class="mention-item"
        v-for="(m, idx) in candidates"
        :key="m.uid"
        :class="{ active: (idx + (isGroup ? 1 : 0)) === activeIndex }"
        @click="$emit('select', m)"
      >
        <i class="fas fa-user"></i> {{ displayName(m) }}
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { displayName } from '../../utils.js'

defineProps({
  visible: { type: Boolean, default: false },
  popupStyle: { type: Object, default: () => ({}) },
  isGroup: { type: Boolean, default: false },
  activeIndex: { type: Number, default: 0 },
  candidates: { type: Array, default: () => [] },
})

defineEmits(['selectAll', 'select'])
</script>
