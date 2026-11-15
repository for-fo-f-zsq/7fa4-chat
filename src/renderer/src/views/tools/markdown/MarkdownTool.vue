<template>
  <ToolWorkspaceShell class="md-tool" :narrow="isNarrow">
    <template #header>
      <MdWorkspaceHeader
        v-model:file-name="fileName"
        :saving="saving"
        :exporting="exporting"
        @open="openFile"
        @new="newFile"
        @save="save()"
        @save-as="saveAs"
        @export-png="exportPng"
        @copy-html="copyHtml"
        @export-html="exportHtml"
      />
    </template>

    <div class="md-editor" v-bind="dropZoneProps">
      <MdToolbar
        :can-undo="canUndo"
        :can-redo="canRedo"
        :scroll-sync-on="scrollSyncOn"
        :view-mode="viewMode"
        :outline-open="outlineOpen"
        :find-open="findOpen"
        @undo="undo"
        @redo="redo"
        @bold="insertBold"
        @italic="insertItalic"
        @strikethrough="insertStrikethrough"
        @inline-code="insertInlineCode"
        @quote="insertQuote"
        @heading="insertHeading"
        @hr="insertHR"
        @unordered-list="insertUnorderedList"
        @ordered-list="insertOrderedList"
        @task-list="insertTaskList"
        @open-modal="openModal"
        @toggle-outline="outlineOpen = !outlineOpen"
        @toggle-find="toggleFind"
        @toggle-scroll-sync="toggleScrollSync()"
        @set-view-mode="setViewMode"
      />

      <MdFindReplaceBar
        v-if="findOpen"
        :find-text="findText"
        :replace-text="replaceText"
        :case-sensitive="caseSensitive"
        :match-index="matchIndex"
        :matches-count="matchesCount"
        @update:find-text="onFindTextChange"
        @update:replace-text="replaceText = $event"
        @update:case-sensitive="onCaseSensitiveChange"
        @find-next="findNext"
        @find-prev="findPrev"
        @replace-current="replaceCurrent"
        @replaceAll="replaceAll"
        @close="closeFind"
      />

      <MdSplitPane
        :content="content"
        :view-mode="viewMode"
        :stats-text="statsText"
        :saved-name="savedName"
        :saved-path="savedPath"
        :dirty="dirty"
        :outline-open="outlineOpen"
        :is-narrow="isNarrow"
        :set-ta-el="(el) => { taEl = el }"
        :set-preview-el="(el) => { previewEl = el }"
        :set-gutter-el="(el) => { gutterEl = el }"
        @update:content="content = $event"
        @update:outline-open="outlineOpen = $event"
        @navigate-heading="navigateToHeading"
        @input="handleEditorInput"
        @keydown="onKeydown"
        @editor-scroll="onEditorScroll"
        @preview-scroll="onPreviewScroll"
        @preview-click="onPreviewClickCapture"
        @preview-toggle="onPreviewToggle"
      />
    </div>

    <MdInsertModals
      v-model:link-open="linkVisible"
      v-model:image-open="imageVisible"
      v-model:code-open="codeVisible"
      v-model:callout-open="calloutVisible"
      v-model:epigraph-open="epigraphVisible"
      v-model:bilibili-open="bilibiliVisible"
      @insert="insertAtCursor"
      @insert-callout="insertCallout($event.type, $event.title, $event.isOpen)"
      @insert-epigraph="insertEpigraph($event.author, $event.text)"
      @insert-bilibili="insertBilibili"
    />

    <MdTableBuilderModal
      v-model:open="tableVisible"
      :rows="tableRows"
      :cols="tableCols"
      @insert="insertAtCursor"
    />

    <MdMathPanelModal
      v-model:open="mathVisible"
      @insert="insertAtCursor"
    />
  </ToolWorkspaceShell>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useNarrow } from '../../../composables/useNarrow.js'
import ToolWorkspaceShell from '../shared/ToolWorkspaceShell.vue'
import MdWorkspaceHeader from './components/MdWorkspaceHeader.vue'
import MdToolbar from './components/MdToolbar.vue'
import MdFindReplaceBar from './components/MdFindReplaceBar.vue'
import MdSplitPane from './components/MdSplitPane.vue'
import MdInsertModals from './components/MdInsertModals.vue'
import MdTableBuilderModal from './components/MdTableBuilderModal.vue'
import MdMathPanelModal from './components/MdMathPanelModal.vue'
import { useMdHistory } from './composables/useMdHistory.js'
import { useMdEditorActions } from './composables/useMdEditorActions.js'
import { useMdFileSession } from './composables/useMdFileSession.js'
import { useMdPreviewSync } from './composables/useMdPreviewSync.js'
import { useMdFindReplace } from './composables/useMdFindReplace.js'

const emit = defineEmits(['back', 'dirty-change'])
const { isNarrow } = useNarrow()

const taEl = ref(null)
const previewEl = ref(null)
const gutterEl = ref(null)
const content = ref('')
const outlineOpen = ref(false)

// ===== 弹窗开关 =====
const linkVisible = ref(false)
const imageVisible = ref(false)
const codeVisible = ref(false)
const tableVisible = ref(false)
const tableRows = ref(3)
const tableCols = ref(4)
const calloutVisible = ref(false)
const epigraphVisible = ref(false)
const bilibiliVisible = ref(false)
const mathVisible = ref(false)

function openModal(kind) {
  if (kind === 'link') linkVisible.value = true
  else if (kind === 'image') imageVisible.value = true
  else if (kind === 'code') codeVisible.value = true
  else if (kind === 'table') {
    tableRows.value = 3
    tableCols.value = 4
    tableVisible.value = true
  } else if (kind === 'callout') calloutVisible.value = true
  else if (kind === 'epigraph') epigraphVisible.value = true
  else if (kind === 'bilibili') bilibiliVisible.value = true
  else if (kind === 'math') mathVisible.value = true
}

// ===== 预览 / 滚动同步 =====
const {
  scrollSyncOn,
  viewMode,
  setViewMode,
  toggleScrollSync,
  onEditorScroll,
  onPreviewScroll,
  onInput,
  scheduleRender,
  onPreviewClickCapture,
  onPreviewToggle,
  clearCalloutToggles
} = useMdPreviewSync({
  content,
  taEl,
  previewEl,
  gutterEl,
  getToggleTask: () => toggleTask,
  onReady: () => loadDocument(content.value || '')
})

// ===== 历史 / 编辑动作 / 文件会话 =====
const { canUndo, canRedo, pushHistory, noteInput, undo, redo, resetHistory } = useMdHistory({
  getTa: () => taEl.value,
  content,
  scheduleRender
})

// 手输也要进历史：先记实时文本与检查点，再走预览防抖渲染。
function handleEditorInput() {
  noteInput()
  onInput()
}

// ===== 查找与替换 =====
const {
  findOpen,
  findText,
  replaceText,
  caseSensitive,
  matchIndex,
  matchesCount,
  openFind,
  closeFind,
  toggleFind,
  findNext,
  findPrev,
  replaceCurrent,
  replaceAll,
  onFindTextChange,
  onCaseSensitiveChange,
  updateMatches
} = useMdFindReplace({
  getTa: () => taEl.value,
  content,
  pushHistory,
  scheduleRender
})

function loadDocument(text) {
  clearCalloutToggles()
  resetHistory()
  content.value = text
  nextTick(() => {
    pushHistory()
    scheduleRender(true)
    updateMatches()
  })
}

const {
  fileName,
  savedName,
  savedPath,
  saving,
  exporting,
  dirty,
  dropZoneProps,
  openFile,
  newFile,
  save,
  saveAs,
  exportPng,
  copyHtml,
  exportHtml
} = useMdFileSession({
  content,
  loadDocument,
  onDirtyChange: (v) => emit('dirty-change', v)
})

const {
  applyText,
  insertAtCursor,
  insertBold,
  insertItalic,
  insertStrikethrough,
  insertInlineCode,
  insertQuote,
  insertHR,
  insertHeading,
  insertTaskList,
  insertUnorderedList,
  insertOrderedList,
  insertCallout,
  insertEpigraph,
  insertBilibili,
  onKeydown,
  toggleTask
} = useMdEditorActions({
  getTa: () => taEl.value,
  content,
  pushHistory,
  scheduleRender,
  undo,
  redo,
  save,
  saveAs,
  openModal,
  openFind,
  toggleFind
})

function navigateToHeading(heading) {
  const ta = taEl.value
  const pv = previewEl.value
  const targetLine = heading.line

  if (ta) {
    const lines = ta.value.split('\n')
    let charOffset = 0
    for (let i = 0; i < targetLine - 1 && i < lines.length; i++) {
      charOffset += lines[i].length + 1
    }
    ta.focus()
    ta.setSelectionRange(charOffset, charOffset)
    const approxLineHeight = ta.scrollHeight / Math.max(1, lines.length)
    ta.scrollTop = Math.max(0, (targetLine - 1) * approxLineHeight - 40)
  }

  if (pv) {
    const zeroBasedLine = targetLine - 1
    let targetEl = pv.querySelector(`[data-src-line="${zeroBasedLine}"]`)
    if (!targetEl) {
      const anchors = Array.from(pv.querySelectorAll('[data-src-line]'))
      targetEl = anchors.find((el) => {
        const l = parseInt(el.getAttribute('data-src-line'), 10)
        return l >= zeroBasedLine
      }) || anchors[anchors.length - 1]
    }
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

const statsText = computed(() => {
  const text = content.value
  const chars = text.length
  const words = (text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9_]+/g) || []).length
  const lines = text.split('\n').length
  const formulas = (text.match(/\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$/g) || []).length
  return `${lines} 行 · ${words} 字 · ${chars} 字符 · ${formulas} 公式`
})

onMounted(() => {
  emit('dirty-change', false)
})

defineExpose({ save, openFile })
</script>

<style scoped src="./markdown-tool.css"></style>
