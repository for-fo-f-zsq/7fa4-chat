<template>
  <div class="ui-tabs" :class="[`ui-tabs--${variantClass}`, `ui-tabs--${sizeClass}`]">
    <div ref="listRef" class="ui-tabs__list" role="tablist" aria-label="标签页" @keydown="onKeydown">
      <div v-if="activeTab" class="ui-tabs__ink" :style="inkStyle" aria-hidden="true"></div>
      <button
        v-for="(item, index) in items"
        :id="tabId(index)"
        :key="item.key"
        :ref="(el) => setTabRef(el, index)"
        type="button"
        class="ui-tabs__tab"
        :class="{ 'is-active': item.key === activeKey, 'is-disabled': item.disabled }"
        role="tab"
        :aria-selected="item.key === activeKey ? 'true' : 'false'"
        :aria-controls="panelId"
        :tabindex="item.key === activeKey ? 0 : -1"
        :disabled="item.disabled"
        @click="select(item)"
      >
        <slot name="tab" :item="item" :index="index" :active="item.key === activeKey">
          <i v-if="item.icon" :class="item.icon" class="ui-tabs__icon" aria-hidden="true"></i>
          <span class="ui-tabs__label">{{ item.label }}</span>
          <span v-if="item.badge != null" class="ui-tabs__badge">{{ item.badge }}</span>
        </slot>
      </button>
    </div>
    <div
      class="ui-tabs__panel"
      :id="panelId"
      role="tabpanel"
      :aria-labelledby="activeTab ? tabId(activeIndex) : undefined"
      tabindex="0"
    >
      <slot />
    </div>
  </div>
</template>

<script setup>
// UiTabs — 标签页原语：tablist/tab/tabpanel 语义 + 方向键/Tab 焦点 + 滑块 transform 过渡。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

defineOptions({ name: 'UiTabs' })

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  items: { type: Array, default: () => [] },
  variant: { type: String, default: 'line' },
  size: { type: String, default: 'md' }
})

const emit = defineEmits(['update:modelValue', 'change'])

const listRef = ref(null)
const tabRefs = ref([])
const inkStyle = ref({})
const uid = useId()
const panelId = `${uid}-panel`

const variantClass = computed(() => (props.variant === 'pill' ? 'pill' : 'line'))
const sizeClass = computed(() => (['sm', 'md', 'lg'].includes(props.size) ? props.size : 'md'))

const activeKey = computed(() => {
  const matched = props.items.some((item) => item.key === props.modelValue)
  if (matched) return props.modelValue
  return props.items.length ? props.items[0].key : null
})

const activeTab = computed(() => props.items.find((item) => item.key === activeKey.value) || null)
const activeIndex = computed(() => props.items.findIndex((item) => item.key === activeKey.value))

function tabId(index) {
  return `${uid}-tab-${index}`
}

function setTabRef(el, index) {
  tabRefs.value[index] = el || null
}

function updateInk() {
  const tab = activeTab.value
  const list = listRef.value
  const index = activeIndex.value
  const el = tabRefs.value[index]
  if (!tab || !list || !el) {
    inkStyle.value = {}
    return
  }
  if (variantClass.value === 'pill') {
    inkStyle.value = {
      transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`,
      width: `${el.offsetWidth}px`,
      height: `${el.offsetHeight}px`
    }
    return
  }
  inkStyle.value = {
    transform: `translateX(${el.offsetLeft}px)`,
    width: `${el.offsetWidth}px`
  }
}

function select(item) {
  if (!item || item.disabled || item.key === activeKey.value) return
  emit('update:modelValue', item.key)
  emit('change', item.key)
  nextTick(updateInk)
}

function onKeydown(event) {
  const items = props.items
  if (!items.length) return
  const current = activeIndex.value
  let next = -1
  if (event.key === 'ArrowRight') next = (current + 1 + items.length) % items.length
  else if (event.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = items.length - 1
  else return
  event.preventDefault()
  for (let count = 0; count < items.length; count++) {
    if (!items[next].disabled) break
    next = event.key === 'ArrowLeft' ? (next - 1 + items.length) % items.length : (next + 1) % items.length
  }
  const target = items[next]
  if (!target || target.disabled) return
  tabRefs.value[next]?.focus({ preventScroll: true })
  select(target)
}

watch([() => props.modelValue, () => props.items.length, () => props.variant], () => {
  nextTick(updateInk)
})

onMounted(() => {
  nextTick(updateInk)
  window.addEventListener('resize', updateInk)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateInk)
})
</script>

<style scoped src="./UiTabs.css"></style>
