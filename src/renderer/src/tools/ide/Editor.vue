<template>
  <div class="md-editor-area">
    <div class="md-editor-toolbar">
      <button v-if="!treeVisible" class="md-tree-toggle" title="显示文件树" @click="$emit('toggleTree')"><i class="fas fa-bars"></i></button>
      <div class="md-editor-tabs">
        <template v-if="activeTab?.type === 'md'">
          <button :class="['md-tab', { active: viewMode === 'edit' }]" @click="viewMode = 'edit'"><i class="fas fa-pen"></i> 编辑</button>
          <button :class="['md-tab', { active: viewMode === 'preview' }]" @click="viewMode = 'preview'"><i class="fas fa-eye"></i> 预览</button>
          <button :class="['md-tab', { active: viewMode === 'both' }]" @click="viewMode = 'both'"><i class="fas fa-columns"></i> 分屏</button>
        </template>
        <span v-else-if="activeTab?.type === 'image'" class="md-plain-tag"><i class="fas fa-image"></i> 图片编辑</span>
        <span v-else-if="activeTab?.type === 'pdf'" class="md-plain-tag"><i class="fas fa-file-pdf"></i> PDF 查看</span>
        <span v-else-if="activeTab?.type === 'cpp'" class="md-plain-tag"><i class="fas fa-code"></i> C++</span>
        <span v-else-if="activeTab" class="md-plain-tag"><i class="fas fa-file-code"></i> 纯文本</span>
      </div>
      <div class="md-editor-actions">
        <span v-if="activeTab" class="md-current-file">{{ activeTab.path }}</span>
        <template v-if="activeTab && activeTab.type !== 'image' && activeTab.type !== 'pdf'">
          <span class="md-save-state" :class="{ saved: !activeTab.dirty }">{{ activeTab.dirty ? '未保存' : '已保存' }}</span>
          <button v-if="activeTab.type === 'md'" class="md-export-btn" @click="exportMdAsImage"><i class="fas fa-file-image"></i> 导出图片</button>
          <button class="md-save-btn" :disabled="!activeTab.dirty" @click="saveActiveTab"><i class="fas fa-save"></i> 保存 (Ctrl+S)</button>
        </template>
      </div>
    </div>

    <div class="md-editors">
      <div
        v-for="t in tabs"
        :key="t.path"
        v-show="t.path === activePath"
        class="md-editor-pane"
      >
        <ImageEditor
          v-if="t.type === 'image'"
          :key="'img-' + t.path"
          :workspace="workspace"
          :rel-path="t.path"
          @dirty="(v) => (t.imageDirty = v)"
          @saved="onImageSaved"
        />
        <PDFViewer
          v-else-if="t.type === 'pdf'"
          :key="'pdf-' + t.path"
          :workspace="workspace"
          :rel-path="t.path"
        />
        <div v-else class="md-editor-content" :class="{ split: t.type === 'md' && viewMode === 'both', 'cpp-layout': t.type === 'cpp' }">
          <div
            v-if="t.type !== 'md' || viewMode !== 'preview'"
            class="md-editor-monaco"
            :style="t.type === 'md' && viewMode === 'both' ? { width: splitLeftPct + '%' } : {}"
          >
            <MonacoEditor
              v-model="t.content"
              :language="langFor(t.path)"
              @dirty="t.dirty = true"
              @save="saveTab(t)"
            />
          </div>
          <div v-if="t.type === 'md' && viewMode === 'both'" class="md-split-resizer" @mousedown="startSplitResize"></div>
          <div v-if="t.type === 'md' && viewMode !== 'edit'" class="md-preview" v-html="renderMarkdown(t.content)"></div>
          <CppRunner
            v-if="t.type === 'cpp'"
            v-show="cppVisible"
            :style="{ width: cppWidth + 'px' }"
            :source="t.content"
            :tests="t.tests"
            @update:tests="(v) => (t.tests = v)"
          />
          <div
            v-if="t.type === 'cpp'"
            class="cpp-resizer"
            :class="{ collapsed: !cppVisible }"
            title="拖动调整宽度（拖到最左隐藏，隐藏后向右拖回展开）"
            @mousedown="startCppResize"
          ></div>
        </div>
      </div>
      <div v-if="!tabs.length" class="md-no-file">
        <i class="fas fa-file-alt"></i>
        <p>从左侧选择一个可打开的文件，或点击 + 新建文件</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
import { renderMarkdown } from '../../utils.js'
import MonacoEditor from './MonacoEditor.vue'
import ImageEditor from './ImageEditor.vue'
import PDFViewer from './PDFViewer.vue'
import CppRunner from './CppRunner.vue'
import './ide-tool.css'

const props = defineProps({
  workspace: { type: String, required: true },
  treeVisible: { type: Boolean, default: true }
})

const emit = defineEmits(['saved', 'toggleTree'])

const tabs = ref([])
const activePath = ref('')
const activeTab = computed(() => tabs.value.find(t => t.path === activePath.value) || null)
const anyDirty = computed(() => tabs.value.some(t => t.dirty || t.imageDirty))
const viewMode = ref('both')
const splitLeftPct = ref(50)
const cppWidth = ref(260)
const cppVisible = ref(true)

const IMAGE_RE = /\.(png|jpe?g|gif|bmp|webp|ico|svg)$/i
const MARKDOWN_FILE_RE = /\.(md|markdown)$/i

const LANG_MAP = {
  '.md': 'markdown', '.markdown': 'markdown',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.json': 'json', '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.htm': 'html', '.vue': 'html',
  '.xml': 'xml', '.svg': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
  '.py': 'python', '.java': 'java', '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp', '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.php': 'php',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell', '.bat': 'bat', '.cmd': 'bat',
  '.sql': 'sql', '.ini': 'ini', '.toml': 'ini', '.properties': 'ini',
  '.txt': 'plaintext', '.text': 'plaintext', '.log': 'plaintext', '.csv': 'plaintext'
}

function fileType(p) {
  if (IMAGE_RE.test(p)) return 'image'
  if (/\.pdf$/i.test(p)) return 'pdf'
  if (/\.(cpp|cc|cxx|c\+\+)$/i.test(p)) return 'cpp'
  if (MARKDOWN_FILE_RE.test(p)) return 'md'
  return 'text'
}

function langFor(p) {
  const ext = (p || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''
  return LANG_MAP[ext] || 'plaintext'
}

async function openFile(path) {
  const existing = tabs.value.find(t => t.path === path)
  if (existing) {
    activePath.value = path
    return
  }
  const type = fileType(path)
  const tab = reactive({
    path,
    name: path.split('/').pop(),
    type,
    content: '',
    dirty: false,
    imageDirty: false,
    tests: [{ input: '', expected: '' }]
  })
  if (type === 'text' || type === 'md' || type === 'cpp') {
    const r = await window.api.toolReadFile(props.workspace, path)
    if (!r.success) {
      alert('读取失败：' + r.error)
      return
    }
    tab.content = r.content
  }
  tabs.value.push(tab)
  activePath.value = path
}

function closeTab(path) {
  const idx = tabs.value.findIndex(t => t.path === path)
  if (idx < 0) return
  const t = tabs.value[idx]
  if ((t.dirty || t.imageDirty) && !confirm(`文件 ${t.name} 有未保存的修改，确定关闭？`)) return
  tabs.value.splice(idx, 1)
  if (activePath.value === path) {
    const next = tabs.value[Math.min(idx, tabs.value.length - 1)]
    activePath.value = next ? next.path : ''
  }
}

function closeActiveTab() {
  if (activePath.value) closeTab(activePath.value)
}

function setActivePath(path) {
  activePath.value = path
}

function saveActiveTab() {
  const t = activeTab.value
  if (t && (t.type === 'text' || t.type === 'md' || t.type === 'cpp')) saveTab(t)
}

async function saveTab(t) {
  if (!t || t.type === 'image' || t.type === 'pdf') return
  const r = await window.api.toolWriteFile(props.workspace, t.path, t.content)
  if (!r.success) {
    alert('保存失败：' + r.error)
    return
  }
  t.dirty = false
  emit('saved')
}

async function onImageSaved(newPath) {
  const t = activeTab.value
  if (t && t.type === 'image') {
    if (newPath !== t.path) {
      t.path = newPath
      t.name = newPath.split('/').pop()
    }
    t.imageDirty = false
  }
  emit('saved')
}

async function exportMdAsImage() {
  const t = activeTab.value
  if (!t || t.type !== 'md') return
  try {
    const r = await window.api.toolExportMarkdownToPng(props.workspace, t.path, renderMarkdown(t.content))
    if (r.success) {
      emit('saved')
      alert('已导出到同文件夹：' + r.path)
    } else {
      alert('导出失败：' + r.error)
    }
  } catch (e) {
    alert('导出失败：' + (e.message || e))
  }
}

// 供父组件（文件树）联动
function onFileRenamed(oldPath, newPath) {
  const tab = tabs.value.find(t => t.path === oldPath)
  if (tab) {
    tab.path = newPath
    tab.name = newPath.split('/').pop()
  }
  if (activePath.value === oldPath) activePath.value = newPath
}

function onFileDeleted(path) {
  const idx = tabs.value.findIndex(t => t.path === path)
  if (idx < 0) return
  tabs.value.splice(idx, 1)
  if (activePath.value === path) {
    const next = tabs.value[Math.min(idx, tabs.value.length - 1)]
    activePath.value = next ? next.path : ''
  }
}

function startSplitResize(e) {
  e.preventDefault()
  const area = e.currentTarget.parentElement
  const rect = area.getBoundingClientRect()
  const onMove = (ev) => {
    const pct = ((ev.clientX - rect.left) / rect.width) * 100
    splitLeftPct.value = Math.max(25, Math.min(75, pct))
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
  }
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function startCppResize(e) {
  e.preventDefault()
  const wasHidden = !cppVisible.value
  const startX = e.clientX
  const startW = cppVisible.value ? cppWidth.value : 0
  const onMove = (ev) => {
    const dx = ev.clientX - startX
    if (wasHidden) {
      // 隐藏态：向右拖出面板
      if (dx > 20) {
        cppVisible.value = true
        cppWidth.value = Math.max(220, Math.min(520, 240 + dx))
      }
    } else {
      const w = startW + dx
      if (w < 150) {
        cppVisible.value = false
      } else {
        cppVisible.value = true
        cppWidth.value = Math.max(180, Math.min(520, w))
      }
    }
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
    saveCppWidth()
  }
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

async function saveCppWidth() {
  try {
    const s = await window.api.loadSetting()
    s.ideCppWidth = cppWidth.value
    s.ideCppVisible = cppVisible.value
    await window.api.saveSetting(s)
  } catch {}
}


function onKeydown(e) {
  const t = activeTab.value
  // 图片/PDF 不由文本编辑器管理
  if (t && (t.type === 'image' || t.type === 'pdf')) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveActiveTab()
  }
}

let unsubCtrlW = null

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  if (window.api?.onAppCtrlW) unsubCtrlW = window.api.onAppCtrlW(closeActiveTab)
  window.api.loadSetting().then((s) => {
    if (typeof s?.ideCppWidth === 'number' && s.ideCppWidth >= 180) {
      cppWidth.value = s.ideCppWidth
    }
    if (typeof s?.ideCppVisible === 'boolean') {
      cppVisible.value = s.ideCppVisible
    }
  }).catch(() => {})
})

onBeforeUnmount(() => {
  if (anyDirty.value && !confirm('有文件未保存，确定离开工具页？未保存的修改将丢失。')) {
    // 无法阻止卸载，仅提示用户
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (unsubCtrlW) unsubCtrlW()
})

defineExpose({ openFile, onFileRenamed, onFileDeleted, closeTab, setActivePath, tabs, activePath })
</script>
