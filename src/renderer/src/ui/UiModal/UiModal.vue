<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div
        v-if="open"
        class="ui-modal-overlay"
        aria-hidden="true"
        @mousedown.self.prevent
        @click.self="onOverlayClick"
      ></div>
    </Transition>
    <Transition name="modal" @after-enter="onAfterEnter" @after-leave="onAfterLeave">
      <div
        v-if="open"
        ref="panelRef"
        class="ui-modal"
        :class="[`ui-modal--${sizeClass}`, { 'is-scrollable': scrollable }]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        tabindex="-1"
      >
        <div v-if="title || $slots.header || $slots.title" class="ui-modal__header">
          <slot name="header">
            <slot name="title" :id="titleId">
              <h2 v-if="title" :id="titleId" class="ui-modal__title">{{ title }}</h2>
            </slot>
          </slot>
          <button
            v-if="showClose"
            type="button"
            class="ui-modal__close"
            aria-label="关闭"
            @click="requestClose('button')"
          >
            <span class="ui-modal__close-glyph" aria-hidden="true">×</span>
          </button>
        </div>
        <div class="ui-modal__body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="ui-modal__footer">
          <slot name="footer" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// UiModal — 浮层弹窗原语：body Teleport + 遮罩/面板成对过渡 + 焦点陷阱 + 滚动锁 + 焦点还原。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

defineOptions({ name: 'UiModal' })

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
  showClose: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true },
  closeOnEsc: { type: Boolean, default: true },
  persistent: { type: Boolean, default: false },
  scrollable: { type: Boolean, default: true }
})

const emit = defineEmits(['update:open', 'close', 'opened', 'closed'])

const panelRef = ref(null)
const uid = useId()
const titleId = `${uid}-title`

const sizeClass = computed(() => (['sm', 'md', 'lg', 'xl'].includes(props.size) ? props.size : 'md'))

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

let restoreEl = null
let bodyLocked = false
let bodyPrevOverflow = ''

function focusables() {
  const panel = panelRef.value
  if (!panel) return []
  return Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  })
}

function focusInitial() {
  const target = focusables()[0] || panelRef.value
  if (target) target.focus({ preventScroll: true })
}

function lockBodyScroll() {
  if (bodyLocked) return
  bodyPrevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  bodyLocked = true
}

function unlockBodyScroll() {
  if (!bodyLocked) return
  document.body.style.overflow = bodyPrevOverflow
  bodyLocked = false
}

function requestClose(reason) {
  if (props.persistent && (reason === 'overlay' || reason === 'esc')) return
  emit('update:open', false)
  emit('close', reason)
}

function onOverlayClick() {
  if (props.closeOnOverlay) requestClose('overlay')
}

function onDocumentKeydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') {
    if (!props.closeOnEsc || props.persistent) return
    event.preventDefault()
    event.stopPropagation()
    requestClose('esc')
    return
  }
  if (event.key !== 'Tab') return
  const panel = panelRef.value
  if (!panel) return
  const list = focusables()
  if (!list.length) {
    event.preventDefault()
    panel.focus({ preventScroll: true })
    return
  }
  const first = list[0]
  const last = list[list.length - 1]
  const active = document.activeElement
  if (!panel.contains(active)) {
    event.preventDefault()
    first.focus({ preventScroll: true })
  } else if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault()
    last.focus({ preventScroll: true })
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus({ preventScroll: true })
  }
}

function onAfterEnter() {
  emit('opened')
}

function onAfterLeave() {
  emit('closed')
  if (restoreEl && document.contains(restoreEl) && typeof restoreEl.focus === 'function') {
    restoreEl.focus({ preventScroll: true })
  }
  restoreEl = null
}

function startOpen() {
  restoreEl = document.activeElement
  lockBodyScroll()
  document.addEventListener('keydown', onDocumentKeydown)
  nextTick(focusInitial)
}

function startClose() {
  document.removeEventListener('keydown', onDocumentKeydown)
  unlockBodyScroll()
}

watch(
  () => props.open,
  (open) => {
    if (open) startOpen()
    else startClose()
  }
)

onMounted(() => {
  if (props.open) startOpen()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  unlockBodyScroll()
  restoreEl = null
})
</script>

<style scoped src="./UiModal.css"></style>
