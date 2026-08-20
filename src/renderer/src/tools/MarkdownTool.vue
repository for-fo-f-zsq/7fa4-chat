<template>
  <div class="md-tool">
    <div class="md-tool-header">
      <div class="md-tool-title">
        <button class="md-back-btn" title="返回工具列表" @click="onBack"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-file-alt"></i> 工具
        <span class="md-tool-sep">/</span>
        Markdown 编辑
      </div>
      <div class="md-workspace-bar">
        <i class="fas fa-file-alt"></i>
        <input
          v-if="editingName"
          ref="nameInputRef"
          v-model="fileNameDraft"
          class="md-name-input"
          spellcheck="false"
          @keydown.enter="commitName"
          @keydown.esc="cancelName"
          @blur="commitName"
        />
        <span v-else class="md-workspace-path md-name-edit" :title="'点击修改文件名' + (fileName ? '：' + fileName : '')" @click="startEditName">
          {{ fileName || '未命名' }}<i class="fas fa-pencil-alt md-name-edit-icon"></i>
        </span>
        <button class="md-ws-btn md-ws-btn-icon" title="打开文件" @click="openFile"><i class="fas fa-folder-open"></i></button>
        <button class="md-ws-btn md-ws-btn-icon" title="新建文件" @click="newFile"><i class="fas fa-file"></i></button>
        <button class="md-ws-btn md-ws-btn-icon" title="保存到文件" :disabled="saving" @click="save"><i class="fas fa-save"></i></button>
        <button class="md-ws-btn md-ws-btn-icon" title="导出为图片" :disabled="exporting" @click="exportPng"><i class="fas fa-image"></i></button>
        <div class="md-view-switch">
          <button :class="{ active: viewMode === 'edit' }" title="编辑" @click="viewMode = 'edit'"><i class="fas fa-pen"></i></button>
          <button :class="{ active: viewMode === 'split' }" title="分屏" @click="viewMode = 'split'"><i class="fas fa-columns"></i></button>
          <button :class="{ active: viewMode === 'preview' }" title="预览" @click="viewMode = 'preview'"><i class="fas fa-eye"></i></button>
        </div>
      </div>
    </div>

    <!-- 洛谷式 markdown 富文本工具栏 -->
    <div class="mp-editor-toolbar">
      <ul class="mp-editor-menu">
        <li><a title="粗体" @click="toolbar('**{sel}**')"><i class="fas fa-bold"></i></a></li>
        <li><a title="删除线" @click="toolbar('~~{sel}~~')"><i class="fas fa-strikethrough"></i></a></li>
        <li><a title="斜体" @click="toolbar('*{sel}*')"><i class="fas fa-italic"></i></a></li>
        <li><a title="分割线" @click="toolbar('\n---\n')"><i class="fas fa-minus"></i></a></li>
        <li class="mp-divider"><span>|</span></li>
        <li v-for="h in 6" :key="h"><a :title="h + ' 级标题'" @click="toolbar(('#'.repeat(h)) + ' ')"><i class="mp-icon-header">H{{ h }}</i></a></li>
        <li class="mp-divider"><span>|</span></li>
        <li><a title="无序列表" @click="toolbar('\n- ')"><i class="fas fa-list-ul"></i></a></li>
        <li><a title="有序列表" @click="toolbar('\n1. ')"><i class="fas fa-list-ol"></i></a></li>
        <li class="mp-divider"><span>|</span></li>
        <li><a title="插入图片" @click="toolbar('![图片描述](图片链接)')"><i class="fas fa-image"></i></a></li>
        <li><a title="插入链接" @click="toolbar('[链接文字](链接地址)')"><i class="fas fa-link"></i></a></li>
        <li><a title="插入代码块" @click="insertCodeBlock"><i class="fas fa-code"></i></a></li>
        <li><a title="插入表格" @click="toolbar('\n| 列1 | 列2 |\n| --- | --- |\n| 数据 | 数据 |\n')"><i class="fas fa-table"></i></a></li>
        <li class="mp-divider"><span>|</span></li>
        <li><a title="隐藏预览" @click="togglePreview"><i class="fas fa-eye"></i></a></li>
        <li><a title="全屏" @click="toggleFullscreen"><i class="fas fa-expand-arrows-alt"></i></a></li>
      </ul>
    </div>

    <div class="md-tool-body">
      <template v-if="viewMode === 'split'">
        <MonacoEditor ref="monacoRef" v-model="content" language="markdown" class="md-md-host" @save="save" @scroll="onMonacoScroll" />
        <div ref="previewRef" class="md-preview-fill" v-html="previewHtml" @scroll="onPreviewScroll"></div>
      </template>
      <MonacoEditor v-else-if="viewMode === 'edit'" ref="monacoRef" v-model="content" language="markdown" class="md-md-host" @save="save" />
      <div v-else class="md-preview-fill" v-html="previewHtml"></div>
    </div>
  </div>
  <SaveConfirmModal
    v-model:visible="saveConfirmVisible"
    title="未保存的文档"
    message="当前 Markdown 内容尚未保存，是否保存后再离开？"
    @save="onSaveThenLeave"
    @discard="leaveNow"
  />
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import MonacoEditor from './ide/MonacoEditor.vue'
import SaveConfirmModal from '../components/SaveConfirmModal.vue'
import { renderMarkdown } from '../utils.js'
import './ide/ide-tool.css'

const emit = defineEmits(['back', 'dirty-change'])

const content = ref('')
const fileName = ref('')
const viewMode = ref('split') // edit | split | preview
const saving = ref(false)
const exporting = ref(false)
const saveConfirmVisible = ref(false)
const savedContent = ref('') // 最近一次 打开/新建/保存 时的内容（dirty 基准）

// 未保存标记：内容与已保存基准不一致
const dirty = computed(() => content.value !== savedContent.value)
watch(dirty, (v) => emit('dirty-change', v))

// 返回工具列表：未保存时先弹保存确认
function onBack() {
  if (dirty.value) {
    saveConfirmVisible.value = true
    return
  }
  emit('back')
}

async function onSaveThenLeave() {
  saveConfirmVisible.value = false
  await save()
  if (!dirty.value) emit('back')
}

function leaveNow() {
  saveConfirmVisible.value = false
  emit('back')
}

// 洛谷式 markdown 工具栏：在光标处插入 markdown 语法（{sel} 由选区文本替换）
function toolbar(text) {
  monacoRef.value?.insertText(text)
}
// 插入代码块：无选区默认 cpp 且光标放两 ``` 之间；有选区则包围选区
function insertCodeBlock() {
  monacoRef.value?.insertText('\n```cpp\n{sel}\n```\n')
}
function togglePreview() {
  // 在 编辑/分屏/预览 间简单切换：当前预览或分屏 → 回编辑；编辑 → 分屏
  viewMode.value = viewMode.value === 'preview' ? 'edit' : (viewMode.value === 'split' ? 'edit' : 'split')
}
function toggleFullscreen() {
  const el = document.querySelector('.md-tool')
  if (!el) return
  if (!document.fullscreenElement) { el.requestFullscreen?.().catch?.(() => {}) }
  else { document.exitFullscreen?.() }
}

onMounted(() => {
  // 新实例必然无未保存内容，重置父级拦截标记
  emit('dirty-change', false)
})

// 文件名编辑
const editingName = ref(false)
const fileNameDraft = ref('')
const nameInputRef = ref(null)

// 分屏同步：全量渲染 + 块内插值定位——预览完整内容（前面也在），滚动时把当前源码行精确放到顶部
const monacoRef = ref(null)
const previewRef = ref(null)
let scrollSyncing = false
let scrollSyncTimer = null
let pendingLine = null
let rafPending = false
let lastTopLine = 1 // Monaco 当前顶部源码行（内容变化后重新定位预览用）

const previewHtml = computed(() => renderMarkdown(content.value))

// 锁：覆盖异步 scroll 事件派发窗口（120ms），避免双向循环
function lockScroll() {
  scrollSyncing = true
  clearTimeout(scrollSyncTimer)
  scrollSyncTimer = setTimeout(() => { scrollSyncing = false }, 120)
}

// 元素在滚动容器内的可视偏移（getBoundingClientRect 差值，不依赖 offsetParent）
function elOffsetIn(el, container) {
  return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
}

// 源码行 line → 预览滚动位置：找包含 line 的块，按行号比例在块内插值（代码块内精确、段落内平滑）
function locateLine(line) {
  const el = previewRef.value
  if (!el) return null
  const blocks = el.querySelectorAll('[data-line]')
  if (!blocks.length) return null
  // 包含 line 的块 = data-line <= line 的最后一个块
  let cur = null
  for (const b of blocks) {
    const l = Number(b.dataset.line)
    if (l <= line) cur = b
    else break
  }
  if (!cur) return Math.round(elOffsetIn(blocks[0], el))
  const curStart = Number(cur.dataset.line)
  let top = elOffsetIn(cur, el)
  // 下一个块：在 (curStart, nextStart) 区间内按行号比例插值
  let next = null
  for (const b of blocks) {
    if (Number(b.dataset.line) > curStart) { next = b; break }
  }
  if (next) {
    const nextTop = elOffsetIn(next, el)
    const height = Math.max(nextTop - top, 1)
    const span = Math.max(Number(next.dataset.line) - curStart, 1)
    const ratio = Math.min(Math.max((line - curStart) / span, 0), 0.99)
    top += height * ratio
  }
  return Math.round(top)
}

// 预览顶部 → 对应源码行：顶部附近块 + 块内比例反推（locateLine 的逆运算）
function visibleLine() {
  const el = previewRef.value
  if (!el) return null
  const blocks = el.querySelectorAll('[data-line]')
  if (!blocks.length) return null
  // 顶部附近的最后一个块（top <= scrollTop + 8 且 data-line 最大）
  let best = null
  for (const b of blocks) {
    if (elOffsetIn(b, el) <= el.scrollTop + 8) best = b
    else break
  }
  if (!best) return 1
  const curStart = Number(best.dataset.line)
  const top = elOffsetIn(best, el)
  let line = curStart
  // 块内比例反推行号
  let next = null
  for (const b of blocks) {
    if (Number(b.dataset.line) > curStart) { next = b; break }
  }
  if (next) {
    const nextTop = elOffsetIn(next, el)
    const height = Math.max(nextTop - top, 1)
    const span = Math.max(Number(next.dataset.line) - curStart, 1)
    const ratio = Math.min(Math.max((el.scrollTop - top) / height, 0), 0.99)
    line = curStart + Math.round(ratio * span)
  }
  return line
}

function onMonacoScroll(line) {
  if (!line || scrollSyncing) return
  pendingLine = line
  if (rafPending) return
  rafPending = true
  // rAF 合并：滚动过程中每帧最多定位一次
  requestAnimationFrame(() => {
    rafPending = false
    if (!pendingLine) return
    lastTopLine = pendingLine
    const target = locateLine(pendingLine)
    pendingLine = null
    if (target === null || target === undefined) return
    lockScroll()
    const el = previewRef.value
    if (el) el.scrollTop = target
  })
}

function onPreviewScroll() {
  const el = previewRef.value
  if (!el || scrollSyncing) return
  const line = visibleLine()
  if (!line) return
  lastTopLine = line
  lockScroll()
  monacoRef.value?.setScrollLine(line)
}

// 内容变化：预览全量重渲染，按 Monaco 当前顶部行重新定位（保持对齐）
watch(content, () => {
  nextTick(() => {
    if (viewMode.value !== 'split' || scrollSyncing) return
    const el = previewRef.value
    if (!el) return
    const target = locateLine(lastTopLine)
    if (target !== null && target !== undefined) el.scrollTop = target
  })
})

function startEditName() {
  fileNameDraft.value = fileName.value
  editingName.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function commitName() {
  if (!editingName.value) return
  editingName.value = false
  const name = fileNameDraft.value.trim()
  if (name) fileName.value = name
}

function cancelName() {
  editingName.value = false
}

// base64 编码 UTF-8 文本（分块避免栈溢出）
function textToBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

async function openFile() {
  const r = await window.api.selectFile()
  if (!r.success) return
  if (!r.data) return
  try {
    const binary = atob(r.data)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    content.value = new TextDecoder('utf-8').decode(bytes)
    fileName.value = r.name
    savedContent.value = content.value
  } catch (e) {
    alert('读取文件失败：' + e.message)
  }
}

function newFile() {
  if (content.value.trim() && !confirm('当前内容未保存，确定新建并丢弃？')) return
  content.value = ''
  fileName.value = ''
  savedContent.value = ''
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const name = fileName.value || '未命名.md'
    const base64 = textToBase64(content.value)
    const r = await window.api.downloadFile(base64, name, 'text/markdown')
    if (r.success) {
      fileName.value = r.path ? r.path.split(/[\\/]/).pop() : fileName.value
      savedContent.value = content.value
      alert('已保存')
    }
  } catch (e) {
    alert('保存失败：' + e.message)
  }
  saving.value = false
}

async function exportPng() {
  if (exporting.value) return
  if (!content.value.trim()) { alert('内容为空'); return }
  exporting.value = true
  try {
    const r = await window.api.exportMarkdownPng(fileName.value || '未命名.md', renderMarkdown(content.value))
    if (r.success) alert('已导出')
    else if (!r.canceled) alert('导出失败：' + (r.error || '未知错误'))
  } catch (e) {
    alert('导出失败：' + e.message)
  }
  exporting.value = false
}
</script>
