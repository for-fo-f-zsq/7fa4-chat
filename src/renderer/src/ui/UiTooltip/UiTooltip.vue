<template>
  <span
    ref="triggerRef"
    class="ui-tooltip__trigger"
    @mouseenter="onMouseenter"
    @mouseleave="onMouseleave"
    @focusin="onFocusin"
    @focusout="onFocusout"
  >
    <slot />
  </span>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-show="visible"
        :id="tooltipId"
        ref="panelRef"
        class="ui-tooltip"
        role="tooltip"
        :style="panelStyle"
      >
        {{ content }}
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// UiTooltip — 文字提示原语：hover/focus + delay 触发，fade 过渡，aria-describedby，fixed 定位翻转。
import { nextTick, onBeforeUnmount, ref, useId } from 'vue'

defineOptions({ name: 'UiTooltip' })

const props = defineProps({
  content: { type: String, default: '' },
  placement: { type: String, default: 'top' },
  delay: { type: Number, default: 300 },
  disabled: { type: Boolean, default: false }
})

const triggerRef = ref(null)
const panelRef = ref(null)
const panelStyle = ref({})
const visible = ref(false)
const uid = useId()
const tooltipId = `${uid}-tooltip`

const GUTTER = 8
const OFFSET = 8

let showTimer = 0
let bound = false

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function updatePosition() {
  const trigger = triggerRef.value
  const panel = panelRef.value
  if (!trigger || !panel) return
  const anchor = trigger.getBoundingClientRect()
  const width = panel.offsetWidth
  const height = panel.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  let placement = props.placement
  let top = 0
  let left = 0

  if (placement === 'left' || placement === 'right') {
    const spaceRight = vw - anchor.right - GUTTER
    const spaceLeft = anchor.left - GUTTER
    if (placement === 'right' && width + OFFSET > spaceRight && spaceLeft > spaceRight) placement = 'left'
    if (placement === 'left' && width + OFFSET > spaceLeft && spaceRight > spaceLeft) placement = 'right'
    left = placement === 'right' ? anchor.right + OFFSET : anchor.left - OFFSET - width
    top = anchor.top + anchor.height / 2 - height / 2
  } else {
    const spaceBelow = vh - anchor.bottom - GUTTER
    const spaceAbove = anchor.top - GUTTER
    if (placement === 'bottom' && height + OFFSET > spaceBelow && spaceAbove > spaceBelow) placement = 'top'
    if (placement === 'top' && height + OFFSET > spaceAbove && spaceBelow > spaceAbove) placement = 'bottom'
    top = placement === 'bottom' ? anchor.bottom + OFFSET : anchor.top - OFFSET - height
    left = anchor.left + anchor.width / 2 - width / 2
  }

  panelStyle.value = {
    top: `${clamp(top, GUTTER, vh - height - GUTTER)}px`,
    left: `${clamp(left, GUTTER, vw - width - GUTTER)}px`
  }
}

function onDocumentKeydown(event) {
  if (event.key !== 'Escape') return
  hide()
}

function bind() {
  if (bound) return
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  bound = true
}

function unbind() {
  if (!bound) return
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  bound = false
}

function clearShowTimer() {
  window.clearTimeout(showTimer)
  showTimer = 0
}

function show() {
  if (props.disabled || !props.content) return
  clearShowTimer()
  visible.value = true
  bind()
  nextTick(updatePosition)
}

function hide() {
  clearShowTimer()
  if (!visible.value) return
  visible.value = false
  unbind()
}

function onMouseenter() {
  if (props.disabled || !props.content) return
  clearShowTimer()
  showTimer = window.setTimeout(show, Math.max(0, props.delay))
}

function onMouseleave() {
  hide()
}

function onFocusin(event) {
  if (props.disabled || !props.content) return
  const target = event.target
  if (target && typeof target.setAttribute === 'function') target.setAttribute('aria-describedby', tooltipId)
  show()
}

function onFocusout(event) {
  const target = event.target
  if (target && typeof target.removeAttribute === 'function') target.removeAttribute('aria-describedby')
  hide()
}

onBeforeUnmount(() => {
  clearShowTimer()
  unbind()
})
</script>

<style scoped src="./UiTooltip.css"></style>
