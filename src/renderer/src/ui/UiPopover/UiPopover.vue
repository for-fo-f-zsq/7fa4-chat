<template>
  <span
    v-if="$slots.trigger"
    ref="triggerRef"
    class="ui-popover"
    :aria-expanded="open ? 'true' : 'false'"
    aria-haspopup="dialog"
    :aria-controls="panelId"
    @click="onTriggerClick"
    @mouseenter="onTriggerEnter"
    @mouseleave="onTriggerLeave"
  >
    <slot name="trigger" />
  </span>
  <Teleport to="body">
    <Transition name="dropdown">
      <div
        v-if="open"
        :id="panelId"
        ref="panelRef"
        class="ui-popover__panel"
        :data-placement="actualPlacement"
        :style="panelStyle"
        @mouseenter="onPanelEnter"
        @mouseleave="onPanelLeave"
      >
        <slot name="content" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// UiPopover — 锚点浮层原语：fixed 定位 + 视口翻转 + dropdown 成对过渡 + 点外/Esc 关闭。
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

defineOptions({ name: 'UiPopover' })

const props = defineProps({
  open: { type: Boolean, default: false },
  anchor: { type: [Object, String], default: null },
  placement: { type: String, default: 'bottom' },
  offset: { type: Number, default: 6 },
  disabled: { type: Boolean, default: false },
  trigger: { type: String, default: 'click' }
})

const emit = defineEmits(['update:open'])

const triggerRef = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})
const actualPlacement = ref(props.placement)
const panelId = `${useId()}-panel`

const GUTTER = 8
const HOVER_CLOSE_DELAY = 120

let hoverTimer = 0
let bound = false

function setOpen(value) {
  if (props.disabled) return
  if (value === props.open) return
  emit('update:open', value)
}

function toggle() {
  setOpen(!props.open)
}

function onTriggerClick() {
  if (props.trigger !== 'click') return
  toggle()
}

function clearHoverTimer() {
  window.clearTimeout(hoverTimer)
  hoverTimer = 0
}

function startHoverClose() {
  clearHoverTimer()
  hoverTimer = window.setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY)
}

function onTriggerEnter() {
  if (props.trigger !== 'hover' || props.disabled) return
  clearHoverTimer()
  setOpen(true)
}

function onTriggerLeave() {
  if (props.trigger !== 'hover') return
  startHoverClose()
}

function onPanelEnter() {
  if (props.trigger !== 'hover') return
  clearHoverTimer()
}

function onPanelLeave() {
  if (props.trigger !== 'hover') return
  startHoverClose()
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function resolveAnchorRect() {
  const value = props.anchor
  if (value) {
    if (typeof value === 'string') return document.querySelector(value)?.getBoundingClientRect() || null
    if (typeof value.getBoundingClientRect === 'function') return value.getBoundingClientRect()
    if (typeof value.x === 'number' && typeof value.y === 'number') {
      return {
        top: value.y,
        bottom: value.y,
        left: value.x,
        right: value.x,
        width: 0,
        height: 0
      }
    }
  }
  return triggerRef.value ? triggerRef.value.getBoundingClientRect() : null
}

function updatePosition() {
  const panel = panelRef.value
  const anchor = resolveAnchorRect()
  if (!anchor || !panel) return
  const width = panel.offsetWidth
  const height = panel.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  const offset = props.offset
  const [rawSide, align = 'center'] = String(props.placement || 'bottom').split('-')
  let side = ['top', 'bottom', 'left', 'right'].includes(rawSide) ? rawSide : 'bottom'
  let top = 0
  let left = 0

  if (side === 'left' || side === 'right') {
    const spaceRight = vw - anchor.right - GUTTER
    const spaceLeft = anchor.left - GUTTER
    if (side === 'right' && width + offset > spaceRight && spaceLeft > spaceRight) side = 'left'
    if (side === 'left' && width + offset > spaceLeft && spaceRight > spaceLeft) side = 'right'
    left = side === 'right' ? anchor.right + offset : anchor.left - offset - width
    if (align === 'start') top = anchor.top
    else if (align === 'end') top = anchor.bottom - height
    else top = anchor.top + anchor.height / 2 - height / 2
  } else {
    const spaceBelow = vh - anchor.bottom - GUTTER
    const spaceAbove = anchor.top - GUTTER
    if (side === 'bottom' && height + offset > spaceBelow && spaceAbove > spaceBelow) side = 'top'
    if (side === 'top' && height + offset > spaceAbove && spaceBelow > spaceAbove) side = 'bottom'
    top = side === 'bottom' ? anchor.bottom + offset : anchor.top - offset - height
    if (align === 'start') left = anchor.left
    else if (align === 'end') left = anchor.right - width
    else left = anchor.left + anchor.width / 2 - width / 2
  }

  actualPlacement.value = align === 'center' ? side : `${side}-${align}`
  panelStyle.value = {
    top: `${clamp(top, GUTTER, Math.max(GUTTER, vh - height - GUTTER))}px`,
    left: `${clamp(left, GUTTER, Math.max(GUTTER, vw - width - GUTTER))}px`
  }
}

function onDocumentMousedown(event) {
  const target = event.target
  if (panelRef.value && panelRef.value.contains(target)) return
  if (triggerRef.value && triggerRef.value.contains(target)) return
  setOpen(false)
}

function onDocumentKeydown(event) {
  if (event.key !== 'Escape' || !props.open) return
  event.stopPropagation()
  setOpen(false)
  nextTick(() => focusTrigger())
}

function focusTrigger() {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  const inner = triggerRef.value?.querySelector(selector)
  ;(inner || triggerRef.value)?.focus?.()
}

function bind() {
  if (bound) return
  document.addEventListener('mousedown', onDocumentMousedown)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  bound = true
}

function unbind() {
  if (!bound) return
  document.removeEventListener('mousedown', onDocumentMousedown)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  bound = false
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick()
      updatePosition()
      bind()
    } else {
      unbind()
      panelStyle.value = {}
    }
  },
  { immediate: true }
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) setOpen(false)
  }
)

watch([() => props.anchor, () => props.placement, () => props.offset], () => {
  if (props.open) updatePosition()
})

onBeforeUnmount(() => {
  clearHoverTimer()
  unbind()
})
</script>

<style src="./UiPopover.css"></style>
