<template>
  <Teleport to="body" :disabled="!anchorEl">
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="ui-menu"
        :class="{ 'ui-menu--floating': isFloating }"
        :style="menuStyle"
        role="menu"
        tabindex="-1"
        :aria-activedescendant="activeDescendant"
        @keydown="onKeydown"
      >
        <template v-for="(item, index) in items" :key="item.key ?? index">
          <div v-if="item.divider" class="ui-menu__divider" role="separator" aria-hidden="true"></div>
          <button
            v-else
            :id="itemId(index)"
            type="button"
            class="ui-menu__item"
            :class="{ 'is-active': index === activeIndex, 'is-disabled': item.disabled, 'is-danger': item.danger }"
            role="menuitem"
            tabindex="-1"
            :disabled="item.disabled"
            :aria-disabled="item.disabled ? 'true' : undefined"
            @click="selectItem(item, index)"
            @mousemove="activeIndex = index"
          >
            <slot name="item" :item="item" :index="index" :active="index === activeIndex">
              <i v-if="item.icon" :class="item.icon" class="ui-menu__icon" aria-hidden="true"></i>
              <span class="ui-menu__label">{{ item.label }}</span>
              <span v-if="item.right != null" class="ui-menu__right">{{ item.right }}</span>
            </slot>
          </button>
        </template>
        <div v-if="!items.length" class="ui-menu__empty">暂无选项</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// UiMenu — 菜单原语：role=menu + aria-activedescendant 键盘导航 + 可选锚点 fixed 定位/视口翻转。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

defineOptions({ name: 'UiMenu' })

const props = defineProps({
  items: { type: Array, default: () => [] },
  modelValue: { type: [String, Number], default: null },
  matchWidth: { type: Boolean, default: false },
  open: { type: Boolean, default: null },
  anchor: { type: [Object, String], default: null },
  placement: { type: String, default: 'bottom' },
  offset: { type: Number, default: 6 }
})

const emit = defineEmits(['select', 'update:open', 'close'])

const menuRef = ref(null)
const anchorEl = ref(null)
const menuStyle = ref({})
const activeIndex = ref(-1)
const uid = useId()
const GUTTER = 8

let restoreEl = null
let listenersBound = false
let anchorPrevExpanded = null

const isOpen = computed(() => (props.open === null ? true : props.open))
const isFloating = computed(() => Boolean(anchorEl.value) && isOpen.value)
const activeDescendant = computed(() =>
  isFloating.value && activeIndex.value >= 0 ? itemId(activeIndex.value) : undefined
)

function itemId(index) {
  return `${uid}-item-${index}`
}

function resolveAnchor() {
  const value = props.anchor
  if (!value) {
    anchorEl.value = null
    return
  }
  anchorEl.value = typeof value === 'string' ? document.querySelector(value) : value
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function updatePosition() {
  const anchor = anchorEl.value
  const menu = menuRef.value
  if (!anchor || !menu) return
  const rect = anchor.getBoundingClientRect()
  const width = menu.offsetWidth
  const height = menu.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  let placement = props.placement
  const spaceBelow = vh - rect.bottom - GUTTER
  const spaceAbove = rect.top - GUTTER

  if (placement === 'bottom' && height + props.offset > spaceBelow && spaceAbove > spaceBelow) placement = 'top'
  if (placement === 'top' && height + props.offset > spaceAbove && spaceBelow > spaceAbove) placement = 'bottom'

  const top = placement === 'top' ? rect.top - props.offset - height : rect.bottom + props.offset
  const left = rect.left
  const style = {
    top: `${clamp(top, GUTTER, vh - height - GUTTER)}px`,
    left: `${clamp(left, GUTTER, vw - width - GUTTER)}px`
  }
  if (props.matchWidth) style.minWidth = `${rect.width}px`
  menuStyle.value = style
}

function isSelectable(item) {
  return Boolean(item) && !item.divider && !item.disabled
}

function firstEnabledIndex() {
  const items = props.items
  const preferred = items.findIndex((item) => item && item.key === props.modelValue)
  if (preferred >= 0 && isSelectable(items[preferred])) return preferred
  return items.findIndex((item) => isSelectable(item))
}

function moveActive(step) {
  const items = props.items
  if (!items.length) return
  let index = activeIndex.value
  for (let count = 0; count < items.length; count++) {
    index = (index + step + items.length) % items.length
    if (isSelectable(items[index])) {
      activeIndex.value = index
      return
    }
  }
}

function moveToEdge(edge) {
  const items = props.items
  if (!items.length) return
  if (edge === 'first') {
    const index = items.findIndex((item) => isSelectable(item))
    if (index >= 0) activeIndex.value = index
    return
  }
  for (let index = items.length - 1; index >= 0; index--) {
    if (isSelectable(items[index])) {
      activeIndex.value = index
      return
    }
  }
}

function selectItem(item, index) {
  if (!isSelectable(item)) return
  activeIndex.value = index
  emit('select', item.key, item)
  requestClose()
}

function requestClose() {
  if (props.open !== null) emit('update:open', false)
  emit('close')
}

function onKeydown(event) {
  if (!isOpen.value) return
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1)
      break
    case 'Home':
      event.preventDefault()
      moveToEdge('first')
      break
    case 'End':
      event.preventDefault()
      moveToEdge('last')
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      selectItem(props.items[activeIndex.value], activeIndex.value)
      break
    case 'Escape':
      if (props.open !== null) {
        event.preventDefault()
        event.stopPropagation()
        requestClose()
      }
      break
    case 'Tab':
      if (props.open !== null) requestClose()
      break
    default:
      break
  }
}

function onDocumentMousedown(event) {
  const target = event.target
  if (menuRef.value && menuRef.value.contains(target)) return
  if (anchorEl.value && anchorEl.value.contains(target)) return
  requestClose()
}

function onDocumentKeydown(event) {
  if (event.key !== 'Escape' || props.open === null || !isOpen.value) return
  if (menuRef.value && menuRef.value.contains(document.activeElement)) return
  requestClose()
}

function markAnchor(open) {
  const anchor = anchorEl.value
  if (!anchor || typeof anchor.setAttribute !== 'function') return
  if (open) {
    anchorPrevExpanded = anchor.getAttribute('aria-expanded')
    anchor.setAttribute('aria-expanded', 'true')
    anchor.setAttribute('aria-haspopup', 'menu')
    return
  }
  if (anchorPrevExpanded === null) anchor.removeAttribute('aria-expanded')
  else if (anchorPrevExpanded != null) anchor.setAttribute('aria-expanded', anchorPrevExpanded)
  anchorPrevExpanded = null
}

function bindListeners() {
  if (listenersBound) return
  document.addEventListener('mousedown', onDocumentMousedown)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  listenersBound = true
}

function unbindListeners() {
  if (!listenersBound) return
  document.removeEventListener('mousedown', onDocumentMousedown)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  listenersBound = false
}

watch(
  isOpen,
  async (open) => {
    if (open) {
      resolveAnchor()
      await nextTick()
      updatePosition()
      if (activeIndex.value < 0) activeIndex.value = Math.max(0, firstEnabledIndex())
      if (props.open !== null && anchorEl.value) {
        restoreEl = document.activeElement
        markAnchor(true)
        menuRef.value?.focus({ preventScroll: true })
      }
      bindListeners()
    } else {
      unbindListeners()
      markAnchor(false)
      if (restoreEl && document.contains(restoreEl) && typeof restoreEl.focus === 'function') {
        restoreEl.focus({ preventScroll: true })
      }
      restoreEl = null
      activeIndex.value = -1
    }
  },
  { immediate: true }
)

watch([() => props.anchor, () => props.placement, () => props.offset, () => props.matchWidth], async () => {
  if (!isOpen.value) return
  resolveAnchor()
  await nextTick()
  updatePosition()
})

watch(
  () => props.items,
  () => {
    if (activeIndex.value >= props.items.length) activeIndex.value = Math.max(0, firstEnabledIndex())
  }
)

onMounted(() => {
  resolveAnchor()
})

onBeforeUnmount(() => {
  unbindListeners()
  markAnchor(false)
  restoreEl = null
})
</script>

<style scoped src="./UiMenu.css"></style>
