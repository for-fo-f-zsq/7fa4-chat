<template>
  <div
    class="ui-card"
    :class="[
      {
        'ui-card--sm': size === 'sm',
        'ui-card--md': size === 'md',
        'ui-card--lg': size === 'lg',
      },
      {
        'is-interactive': interactive,
        'is-clickable': clickable,
      },
    ]"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="onClick"
    @keydown.enter="onActivate"
    @keydown.space="onActivate"
  >
    <div v-if="$slots.header" class="ui-card-header"><slot name="header" /></div>
    <div class="ui-card-body"><slot /></div>
    <div v-if="$slots.footer" class="ui-card-footer"><slot name="footer" /></div>
  </div>
</template>

<script setup>
// 用法：<UiCard interactive><template #header>标题</template><template #footer>操作</template>内容</UiCard>

defineOptions({ name: 'UiCard' })

const props = defineProps({
  size: { type: String, default: 'md' },
  interactive: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
})

const emit = defineEmits(['click'])

function onClick(event) {
  if (!props.clickable) return
  emit('click', event)
}

function onActivate(event) {
  if (!props.clickable) return
  if (event.type === 'keydown' && event.key === ' ') event.preventDefault()
  emit('click', event)
}
</script>

<style scoped src="./UiCard.css"></style>
