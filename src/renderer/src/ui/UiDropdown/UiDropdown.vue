<template>
  <div
    class="ui-dropdown"
    :class="[`ui-dropdown--${sizeClass}`, { 'is-open': open, 'is-disabled': disabled, 'is-invalid': invalid }]"
  >
    <label v-if="label" :id="labelId" :for="triggerId" class="ui-dropdown__field-label">{{ label }}</label>
    <button
      :id="triggerId"
      ref="triggerRef"
      type="button"
      class="ui-dropdown__trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-labelledby="label ? labelId : undefined"
      :aria-label="!label && ariaLabel ? ariaLabel : undefined"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
      :disabled="disabled"
      @click="toggleOpen"
      @keydown="onKeydown"
    >
      <span class="ui-dropdown__value">
        <template v-if="multiple && selectedOptions.length">
          <span v-for="option in selectedOptions" :key="option.value" class="ui-dropdown__chip">{{ option.label }}</span>
        </template>
        <span v-else-if="!multiple && selectedOption" class="ui-dropdown__label">{{ selectedOption.label }}</span>
        <span v-else class="ui-dropdown__placeholder">{{ placeholder }}</span>
      </span>
      <svg class="ui-dropdown__arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <Teleport to="body">
      <Transition name="dropdown">
        <div v-if="open" ref="panelRef" class="ui-dropdown__panel" :style="panelStyle" @mousedown.prevent>
          <div v-if="searchable" class="ui-dropdown__search">
            <input
              ref="searchRef"
              v-model="query"
              type="text"
              class="ui-dropdown__input"
              placeholder="搜索"
              aria-label="搜索选项"
              @keydown="onKeydown"
            />
          </div>
          <ul
            :id="listId"
            class="ui-dropdown__list"
            role="listbox"
            :aria-multiselectable="multiple ? 'true' : undefined"
            @keydown="onKeydown"
          >
            <li
              v-for="(option, index) in filteredOptions"
              :id="optionId(index)"
              :key="option.value"
              class="ui-dropdown__option"
              :class="{ 'is-active': index === activeIndex, 'is-selected': isSelected(option), 'is-disabled': option.disabled }"
              role="option"
              :aria-selected="isSelected(option) ? 'true' : 'false'"
              :aria-disabled="option.disabled ? 'true' : undefined"
              @click="selectOption(option)"
              @mousemove="activeIndex = index"
            >
              <slot name="option" :option="option" :selected="isSelected(option)" :active="index === activeIndex">
                <span
                  v-if="option.color"
                  class="ui-dropdown__dot"
                  :style="{ backgroundColor: option.color }"
                  aria-hidden="true"
                ></span>
                <i v-if="option.icon" :class="option.icon" class="ui-dropdown__icon" aria-hidden="true"></i>
                <span class="ui-dropdown__option-text">
                  <span class="ui-dropdown__option-label">{{ option.label }}</span>
                  <span v-if="option.desc" class="ui-dropdown__option-desc">{{ option.desc }}</span>
                </span>
                <span v-if="multiple && isSelected(option)" class="ui-dropdown__check" aria-hidden="true">✓</span>
              </slot>
            </li>
            <li v-if="!filteredOptions.length" class="ui-dropdown__empty" role="presentation">无匹配选项</li>
          </ul>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
// UiDropdown — 下拉选择原语：combobox/listbox 语义 + 多选/搜索/typeahead + fixed 锚点面板与视口翻转。
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

defineOptions({ name: 'UiDropdown' })

const props = defineProps({
  modelValue: { type: [String, Number, Array], default: null },
  options: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  searchable: { type: Boolean, default: false },
  placeholder: { type: String, default: '请选择' },
  label: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  size: { type: String, default: 'md' },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'change'])

const triggerRef = ref(null)
const panelRef = ref(null)
const searchRef = ref(null)
const panelStyle = ref({})
const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const uid = useId()
const listId = `${uid}-list`
const labelId = `${uid}-label`
const triggerId = `${uid}-trigger`

const GUTTER = 8
const PANEL_GAP = 6
const TYPEAHEAD_RESET = 500

let listenersBound = false
let typeBuffer = ''
let typeTimer = 0

const sizeClass = computed(() => (['sm', 'md', 'lg'].includes(props.size) ? props.size : 'md'))

const selectedValues = computed(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : []
  return props.modelValue == null ? [] : [props.modelValue]
})

const selectedOptions = computed(() => props.options.filter((option) => selectedValues.value.includes(option.value)))

const selectedOption = computed(() => selectedOptions.value[0] || null)

const filteredOptions = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return props.options
  return props.options.filter((option) => String(option.label).toLowerCase().includes(keyword))
})

function optionId(index) {
  return `${uid}-option-${index}`
}

function isSelected(option) {
  return selectedValues.value.includes(option.value)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function updatePosition() {
  const trigger = triggerRef.value
  const panel = panelRef.value
  if (!trigger || !panel) return
  const rect = trigger.getBoundingClientRect()
  const width = rect.width
  const height = panel.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  const spaceBelow = vh - rect.bottom - GUTTER
  let top = rect.bottom + PANEL_GAP
  if (height > spaceBelow && rect.top > spaceBelow) top = rect.top - height - PANEL_GAP
  panelStyle.value = {
    top: `${clamp(top, GUTTER, vh - height - GUTTER)}px`,
    left: `${clamp(rect.left, GUTTER, vw - width - GUTTER)}px`,
    width: `${width}px`
  }
}

function activeFirstEnabled() {
  const index = filteredOptions.value.findIndex((option) => !option.disabled)
  activeIndex.value = index >= 0 ? index : 0
}

function openMenu() {
  if (props.disabled || open.value) return
  open.value = true
  query.value = ''
  const selectedIndex = filteredOptions.value.findIndex((option) => isSelected(option) && !option.disabled)
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : Math.max(0, filteredOptions.value.findIndex((o) => !o.disabled))
  bindListeners()
  nextTick(() => {
    updatePosition()
    if (props.searchable) searchRef.value?.focus()
  })
}

function closeMenu(refocus = true) {
  if (!open.value) return
  open.value = false
  unbindListeners()
  window.clearTimeout(typeTimer)
  typeBuffer = ''
  if (refocus) nextTick(() => triggerRef.value?.focus())
}

function toggleOpen() {
  if (open.value) closeMenu()
  else openMenu()
}

function selectOption(option) {
  if (!option || option.disabled) return
  if (props.multiple) {
    const next = selectedValues.value.includes(option.value)
      ? selectedValues.value.filter((value) => value !== option.value)
      : [...selectedValues.value, option.value]
    emit('update:modelValue', next)
    emit('change', next)
    return
  }
  emit('update:modelValue', option.value)
  emit('change', option.value)
  closeMenu()
}

function moveActive(step) {
  const list = filteredOptions.value
  if (!list.length) return
  let index = activeIndex.value
  for (let count = 0; count < list.length; count++) {
    index = (index + step + list.length) % list.length
    if (!list[index].disabled) {
      activeIndex.value = index
      return
    }
  }
}

function moveToEdge(edge) {
  const list = filteredOptions.value
  if (!list.length) return
  if (edge === 'first') {
    const index = list.findIndex((option) => !option.disabled)
    activeIndex.value = index >= 0 ? index : 0
    return
  }
  for (let index = list.length - 1; index >= 0; index--) {
    if (!list[index].disabled) {
      activeIndex.value = index
      return
    }
  }
}

function typeahead(char) {
  typeBuffer += char.toLowerCase()
  window.clearTimeout(typeTimer)
  typeTimer = window.setTimeout(() => {
    typeBuffer = ''
  }, TYPEAHEAD_RESET)
  const index = filteredOptions.value.findIndex(
    (option) => !option.disabled && String(option.label).toLowerCase().startsWith(typeBuffer)
  )
  if (index >= 0) activeIndex.value = index
}

function onKeydown(event) {
  if (props.disabled) return
  const key = event.key
  if (!open.value) {
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      openMenu()
    }
    return
  }
  switch (key) {
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      break
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
      event.preventDefault()
      selectOption(filteredOptions.value[activeIndex.value])
      break
    case ' ':
      if (props.multiple) {
        event.preventDefault()
        selectOption(filteredOptions.value[activeIndex.value])
      }
      break
    case 'Tab':
      closeMenu(false)
      break
    default:
      if (key.length === 1 && !props.searchable && !event.ctrlKey && !event.metaKey && !event.altKey) {
        typeahead(key)
      }
      break
  }
}

function onDocumentMousedown(event) {
  const target = event.target
  if (panelRef.value && panelRef.value.contains(target)) return
  if (triggerRef.value && triggerRef.value.contains(target)) return
  if (triggerRef.value && triggerRef.value.parentElement && triggerRef.value.parentElement.contains(target)) return
  closeMenu(false)
}

function bindListeners() {
  if (listenersBound) return
  document.addEventListener('mousedown', onDocumentMousedown)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  listenersBound = true
}

function unbindListeners() {
  if (!listenersBound) return
  document.removeEventListener('mousedown', onDocumentMousedown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  listenersBound = false
}

watch(query, () => {
  if (open.value) activeFirstEnabled()
})

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeMenu(false)
  }
)

onBeforeUnmount(() => {
  unbindListeners()
  window.clearTimeout(typeTimer)
})
</script>

<style scoped src="./UiDropdown.css"></style>
