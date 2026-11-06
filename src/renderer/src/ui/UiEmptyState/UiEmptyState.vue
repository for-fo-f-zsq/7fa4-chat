<template>
  <div
    class="ui-empty"
    :class="[
      {
        'ui-empty--sm': size === 'sm',
        'ui-empty--md': size === 'md',
      },
    ]"
  >
    <span v-if="icon" class="ui-empty-icon" aria-hidden="true"><i :class="icon"></i></span>
    <p v-if="title" class="ui-empty-title">{{ title }}</p>
    <div v-if="$slots.default || description" class="ui-empty-desc"><slot>{{ description }}</slot></div>
    <div v-if="$slots.action" class="ui-empty-action"><slot name="action" /></div>
  </div>
</template>

<script setup>
// 用法：<UiEmptyState title="暂无消息" description="收到消息后会显示在这里" />

defineOptions({ name: 'UiEmptyState' })

defineProps({
  icon: { type: String, default: 'fa-inbox' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  size: { type: String, default: 'md' },
})
</script>

<style scoped src="./UiEmptyState.css"></style>
