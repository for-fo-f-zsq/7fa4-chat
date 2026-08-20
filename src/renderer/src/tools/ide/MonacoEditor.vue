<template>
  <div ref="container" class="monaco-host"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as monaco from 'monaco-editor'
// Monaco 样式（vs/vs-dark 主题 CSS，缺失会导致深色主题下 setTheme('vs-dark') 不生效仍为白底）
import 'monaco-editor/min/vs/editor/editor.main.css'
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
  const cs = getComputedStyle(document.documentElement)
  const bg = (cs.getPropertyValue('--bg-app') || cs.getPropertyValue('--bg-sidebar') || '').trim()
  let lum = null
  const hex = bg.match(/#([0-9a-f]{6})/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    lum = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000
  } else {
    const rgb = bg.match(/rgba?\(([^)]+)\)/)
    if (rgb) {
      const parts = rgb[1].split(',').map(s => parseFloat(s))
      if (parts.length >= 3) lum = (parts[0] * 299 + parts[1] * 587 + parts[2] * 114) / 1000
    }
  }
  return lum !== null ? lum < 128 : false
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

  // 跟随应用主题切换（监听 documentElement 的 class / style 变化——custom 主题走内联 style）
  observer = new MutationObserver(applyTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })

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
  },
  // 在光标处插入文本；若含 {sel} 占位，替换为当前选区文本（供 markdown 格式按钮包裹选区）
  insertText: (text) => {
    if (!editor) return
    const sel = editor.getSelection()
    const model = editor.getModel()
    if (!model) return
    const selected = sel && !sel.isEmpty() ? model.getValueInRange(sel) : ''
    const hasSel = !!(selected)
    // {sel} → 选中文本；无占位则简单插入
    const toInsert = text.includes('{sel}') ? text.replace('{sel}', selected || '') : text
    if (hasSel && text.includes('{sel}')) {
      // 包裹选区
      const range = new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn)
      editor.executeEdits('markdown-toolbar', [{ range, text: toInsert }])
      const startPos = new monaco.Position(sel.startLineNumber, sel.startColumn)
      editor.setPosition(startPos)
      editor.focus()
    } else if (hasSel && !text.includes('{sel}')) {
      // 有选区且文本无占位：先在选区前插入（行首命令如标题/列表）
      const range = new monaco.Range(sel.startLineNumber, 1, sel.startLineNumber, 1)
      editor.executeEdits('markdown-toolbar', [{ range, text }])
      editor.focus()
    } else if (!hasSel && text.includes('{sel}')) {
      // 无选区且含 {sel}：占位留空，光标放到占位起始处（支持跨行，如代码块）
      const pos = editor.getPosition()
      const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
      editor.executeEdits('markdown-toolbar', [{ range, text: toInsert }])
      // {sel} 前的文本（含换行）：据此计算光标应处的实际行与列
      const idx = text.indexOf('{sel}')
      const before = text.slice(0, idx)
      const lines = before.split('\n')
      const newLine = pos.lineNumber + (lines.length - 1)
      const newCol = lines.length > 1 ? lines[lines.length - 1].length + 1 : pos.column + before.length
      const newPos = new monaco.Position(Math.max(1, newLine), Math.max(1, newCol))
      editor.setPosition(newPos)
      editor.focus()
    } else {
      // 无选区：在光标处插入
      const pos = editor.getPosition()
      const range = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
      editor.executeEdits('markdown-toolbar', [{ range, text: toInsert }])
      // 光标移到插入点之后
      const newPos = new monaco.Position(pos.lineNumber, pos.column + toInsert.length)
      editor.setPosition(newPos)
      editor.focus()
    }
  }
})
</script>
