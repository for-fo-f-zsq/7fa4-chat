<template>
  <div class="panel-shell" :class="{ 'panel-shell--fixed': !scrollable }">
    <div class="panel-shell__inner" :class="{ 'panel-shell__inner--fixed': !scrollable }">
      <header class="p-panel-header panel-shell__header">
        <div class="panel-shell__title-wrap">
          <BackButton v-if="backable" :title="backTitle" @back="emit('back')" />
          <h2 class="p-panel-header__title panel-shell__title">
            <i v-if="icon" :class="icon" class="panel-shell__icon" aria-hidden="true"></i>
            <span>{{ title }}</span>
          </h2>
        </div>
        <div v-if="$slots['header-actions']" class="panel-shell__actions">
          <slot name="header-actions" />
        </div>
      </header>

      <div class="panel-shell__body" :class="{ 'panel-shell__body--fixed': !scrollable }">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import BackButton from './BackButton.vue'

defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  backable: { type: Boolean, default: false },
  backTitle: { type: String, default: '返回消息列表' },
  scrollable: { type: Boolean, default: true },
})

const emit = defineEmits(['back'])
</script>

<style scoped src="../../css/components/panel-shell.css"></style>
