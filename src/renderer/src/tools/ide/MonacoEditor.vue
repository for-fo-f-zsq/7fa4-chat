<template>
  <div ref="container" class="monaco-host"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      return new editorWorker()
    }
  }
}

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'plaintext' }
})

const emit = defineEmits(['update:modelValue', 'dirty', 'save', 'ready', 'scroll'])

const container = ref(null)
let editor = null
let suppress = false
let observer = null

function isDarkTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim()
  const m = bg.match(/#([0-9a-f]{6})/i)
  if (m) {
    const n = parseInt(m[1], 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return (r * 299 + g * 587 + b * 114) / 1000 < 128
  }
  return false
}

function applyTheme() {
  monaco.editor.setTheme(isDarkTheme() ? 'vs-dark' : 'vs')
}

onMounted(() => {
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    theme: isDarkTheme() ? 'vs-dark' : 'vs',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    letterSpacing: 0.8,
    lineHeight: 22,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 4,
    padding: { top: 10, bottom: 10 },
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
  })

  editor.onDidChangeModelContent(() => {
    if (suppress) return
    emit('update:modelValue', editor.getValue())
    emit('dirty')
  })

  // Ctrl/Cmd + S 保存
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))

  // 滚动 → 上报顶部可见行号（供分屏同步按行对齐）
  editor.onDidScrollChange(() => {
    if (!editor) return
    const ranges = editor.getVisibleRanges()
    const topLine = ranges && ranges.length ? ranges[0].startLineNumber : 1
    emit('scroll', topLine)
  })

  // 跟随应用主题切换（监听 documentElement 的 class 变化）
  observer = new MutationObserver(applyTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  emit('ready')
})

watch(() => props.modelValue, (v) => {
  if (editor && v !== editor.getValue()) {
    suppress = true
    editor.setValue(v || '')
    suppress = false
  }
})

watch(() => props.language, (lang) => {
  if (editor && lang) monaco.editor.setModelLanguage(editor.getModel(), lang)
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
  if (editor) editor.dispose()
  editor = null
})

defineExpose({
  getValue: () => (editor ? editor.getValue() : ''),
  focus: () => editor?.focus(),
  // 外部同步滚动：滚动到指定源码行（顶部对齐）
  setScrollLine: (line) => {
    if (!editor || !line) return
    editor.setScrollTop(editor.getTopForPosition(line, 1))
  }
})
</script>
