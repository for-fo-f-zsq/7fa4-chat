import { createApp, ref } from 'vue'
import UiDialogHost from '../ui/UiDialogHost/UiDialogHost.vue'

export const activeDialog = ref(null)

const queue = []
let nextId = 1
let hostCount = 0
let fallbackMounted = false

export function registerDialogHost() {
  hostCount += 1
  return () => {
    hostCount = Math.max(0, hostCount - 1)
  }
}

function ensureHostMounted() {
  if (hostCount > 0 || fallbackMounted || typeof document === 'undefined') return
  fallbackMounted = true
  const container = document.createElement('div')
  container.setAttribute('data-ui-dialog-fallback', '1')
  document.body.appendChild(container)
  createApp(UiDialogHost).mount(container)
}

function flushNext() {
  if (activeDialog.value || !queue.length) return
  activeDialog.value = queue.shift()
}

export function resolveActiveDialog(accepted, value) {
  const current = activeDialog.value
  if (!current) return
  activeDialog.value = null
  if (current.kind === 'alert') {
    current.resolve(undefined)
  } else if (current.kind === 'confirm') {
    current.resolve(Boolean(accepted))
  } else if (current.kind === 'prompt') {
    current.resolve(accepted ? String(value ?? current.inputValue ?? '') : null)
  }
  flushNext()
}

function enqueue(kind, optionsOrMessage, defaults = {}) {
  const opts =
    optionsOrMessage && typeof optionsOrMessage === 'object'
      ? optionsOrMessage
      : { message: String(optionsOrMessage ?? '') }

  ensureHostMounted()

  return new Promise((resolve) => {
    queue.push({
      id: nextId++,
      kind,
      title: opts.title ?? defaults.title ?? '提示',
      message: opts.message ?? '',
      confirmText: opts.confirmText ?? defaults.confirmText ?? '确定',
      cancelText: opts.cancelText ?? defaults.cancelText ?? '取消',
      danger: Boolean(opts.danger),
      placeholder: opts.placeholder ?? '',
      inputType: opts.inputType ?? 'text',
      inputValue: opts.defaultValue != null ? String(opts.defaultValue) : '',
      resolve,
    })
    flushNext()
  })
}

export function showAlert(optionsOrMessage) {
  return enqueue('alert', optionsOrMessage, { title: '提示', confirmText: '知道了' })
}

export function showConfirm(optionsOrMessage) {
  return enqueue('confirm', optionsOrMessage, { title: '确认操作', confirmText: '确定', cancelText: '取消' })
}

export function showPrompt(optionsOrMessage) {
  return enqueue('prompt', optionsOrMessage, { title: '输入内容', confirmText: '确定', cancelText: '取消' })
}

export function useDialog() {
  return {
    alert: showAlert,
    confirm: showConfirm,
    prompt: showPrompt,
  }
}
