<template>
  <div class="md-tool">
    <div class="md-tool-header">
      <div class="md-tool-title">
        <i class="fas fa-wrench"></i> 工具
        <span class="md-tool-sep">/</span>
        Markdown 编辑与预览
      </div>
      <div class="md-workspace-bar">
        <i class="fas fa-folder-open"></i>
        <span class="md-workspace-path" :title="workspace">{{ workspace || '尚未选择工作区' }}</span>
        <button class="md-ws-btn" @click="selectWorkspace"><i class="fas fa-exchange-alt"></i> 更换工作区</button>
        <button class="md-ws-btn" @click="refreshFiles" title="刷新文件列表"><i class="fas fa-sync-alt"></i> 刷新</button>
      </div>
    </div>

    <div v-if="apiMissing" class="md-tool-error">
      <i class="fas fa-exclamation-triangle"></i>
      工具模块尚未加载（主进程/preload 未更新）。请完全关闭应用后重新启动。
    </div>

    <div class="md-tool-body">
      <div v-if="treeVisible" class="md-file-list" :style="{ width: treeWidth + 'px' }">
        <div class="md-file-list-header">
          <span class="md-file-list-title">文件 ({{ fileCount }})</span>
          <div class="md-file-list-actions">
            <button class="md-icon-btn" title="新建 Markdown 文件" @click="createFile"><i class="fas fa-plus"></i></button>
            <button class="md-icon-btn" title="隐藏文件树" @click="toggleTree(false)"><i class="fas fa-bars"></i></button>
          </div>
        </div>
        <div class="md-file-scroll">
          <div v-if="!tree.length" class="md-file-empty">工作区为空</div>
          <MdFileTree
            :nodes="tree"
            :depth="0"
            :current-file="currentFile"
            :expanded="expanded"
            @open="openFile"
            @toggle="toggleDir"
            @delete="deleteFile"
          />
        </div>
      </div>
      <div v-if="treeVisible" class="md-tree-resizer" @mousedown="startTreeResize"></div>

      <div class="md-editor-area">
        <div class="md-editor-toolbar">
          <button v-if="!treeVisible" class="md-tree-toggle" title="显示文件树" @click="toggleTree(true)"><i class="fas fa-bars"></i></button>
          <div class="md-editor-tabs">
            <button :class="['md-tab', { active: viewMode === 'edit' }]" @click="viewMode = 'edit'"><i class="fas fa-pen"></i> 编辑</button>
            <template v-if="isMdFile">
              <button :class="['md-tab', { active: viewMode === 'preview' }]" @click="viewMode = 'preview'"><i class="fas fa-eye"></i> 预览</button>
              <button :class="['md-tab', { active: viewMode === 'both' }]" @click="viewMode = 'both'"><i class="fas fa-columns"></i> 分屏</button>
            </template>
            <span v-else-if="isImageFile" class="md-plain-tag"><i class="fas fa-image"></i> 图片编辑</span>
            <span v-else class="md-plain-tag"><i class="fas fa-file-code"></i> 纯文本</span>
          </div>
          <div class="md-editor-actions">
            <span v-if="currentFile" class="md-current-file">{{ currentFile }}</span>
            <template v-if="!isImageFile">
              <span class="md-save-state" :class="{ saved: !dirty }">{{ dirty ? '未保存' : '已保存' }}</span>
              <button class="md-save-btn" :disabled="!currentFile || !dirty" @click="saveFile"><i class="fas fa-save"></i> 保存 (Ctrl+S)</button>
            </template>
          </div>
        </div>
        <div v-if="isImageFile" class="img-editor-host">
          <ImageEditor
            ref="imageEditorRef"
            :key="currentFile"
            :workspace="workspace"
            :rel-path="currentFile"
            @dirty="imageDirty = $event"
            @saved="onImageSaved"
          />
        </div>
        <div v-else-if="!currentFile" class="md-no-file">
          <i class="fas fa-file-alt"></i>
          <p>从左侧选择一个可打开的文件，或点击 + 新建 Markdown 文件</p>
        </div>
        <div v-else class="md-editor-content" :class="{ split: viewMode === 'both' }">
          <div
            v-if="viewMode !== 'preview'"
            class="md-editor-monaco"
            :style="viewMode === 'both' ? { width: splitLeftPct + '%' } : {}"
          >
            <MonacoEditor
              ref="monacoRef"
              v-model="content"
              :language="editorLanguage"
              @dirty="dirty = true"
              @save="saveFile"
              @ready="onMonacoReady"
            />
          </div>
          <div v-if="viewMode === 'both'" class="md-split-resizer" @mousedown="startSplitResize"></div>
          <div v-if="viewMode !== 'edit'" class="md-preview" v-html="previewHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
import { parseMarkdown } from '../utils.js'
import MdFileTree from './MdFileTree.vue'
import ImageEditor from './ImageEditor.vue'
import MonacoEditor from './MonacoEditor.vue'
import '../css/markdown-tool.css'

const workspace = ref('')
const tree = ref([])
const expanded = ref(new Set())
const treeWidth = ref(240)
const treeVisible = ref(true)
const splitLeftPct = ref(50)
const currentFile = ref('')
const content = ref('')
const dirty = ref(false)
const viewMode = ref('both')
const apiMissing = ref(false)
const imageDirty = ref(false)
const imageEditorRef = ref(null)
const monacoRef = ref(null)

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
const editorLanguage = computed(() => {
  const ext = (currentFile.value || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''
  return LANG_MAP[ext] || 'plaintext'
})

const previewHtml = computed(() => parseMarkdown(content.value))
const isMdFile = computed(() => /\.(md|markdown)$/i.test(currentFile.value || ''))
const IMAGE_RE = /\.(png|jpe?g|gif|bmp|webp|ico|svg)$/i
const isImageFile = computed(() => IMAGE_RE.test(currentFile.value || ''))
function isImagePath(p) {
  return IMAGE_RE.test(p || '')
}

// 非 Markdown 文件只有编辑模式，不渲染预览
watch(currentFile, (val) => {
  if (val && !/\.(md|markdown)$/i.test(val)) viewMode.value = 'edit'
})

async function onImageSaved(newPath) {
  await refreshFiles()
  if (newPath && newPath !== currentFile.value) {
    await openFile(newPath)
  }
}

function countFiles(nodes) {
  let n = 0
  for (const node of nodes || []) {
    if (node.type === 'file') n++
    else n += countFiles(node.children)
  }
  return n
}
const fileCount = computed(() => countFiles(tree.value))

async function persistWorkspace() {
  try {
    const s = await window.api.loadSetting()
    s.mdWorkspace = workspace.value
    s.mdTreeWidth = treeWidth.value
    s.mdTreeVisible = treeVisible.value
    await window.api.saveSetting(s)
  } catch {}
}

async function initWorkspace() {
  if (!window.api?.toolListFiles || !window.api?.toolReadFile) {
    apiMissing.value = true
    return
  }
  try {
    const s = await window.api.loadSetting()
    if (s.mdWorkspace) {
      workspace.value = s.mdWorkspace
    } else {
      workspace.value = await window.api.getDocumentsPath()
      await persistWorkspace()
    }
    if (s.mdTreeWidth) treeWidth.value = s.mdTreeWidth
    if (s.mdTreeVisible !== undefined) treeVisible.value = s.mdTreeVisible
  } catch {
    workspace.value = await window.api.getDocumentsPath()
  }
  await refreshFiles()
}

function toggleTree(show) {
  treeVisible.value = show
  persistWorkspace()
}

function startTreeResize(e) {
  e.preventDefault()
  const startX = e.clientX
  const startW = treeWidth.value
  const onMove = (ev) => {
    treeWidth.value = Math.max(160, Math.min(420, startW + (ev.clientX - startX)))
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
    persistWorkspace()
  }
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
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

async function selectWorkspace() {
  const r = await window.api.selectWorkspace()
  if (!r.success) return
  workspace.value = r.path
  currentFile.value = ''
  content.value = ''
  dirty.value = false
  await persistWorkspace()
  await refreshFiles()
}

async function refreshFiles() {
  if (!workspace.value) return
  const r = await window.api.toolListFiles(workspace.value)
  if (r.success) tree.value = r.tree?.children || []
}

function toggleDir(path) {
  if (expanded.value.has(path)) expanded.value.delete(path)
  else expanded.value.add(path)
}

async function openFile(rel) {
  if ((dirty.value || imageDirty.value) && !confirm('当前文件有未保存的修改，确定放弃并切换？')) return
  imageDirty.value = false
  // 图片文件由 ImageEditor 通过图片 IPC 自行加载，不走文本读取
  if (isImagePath(rel)) {
    currentFile.value = rel
    content.value = ''
    dirty.value = false
    return
  }
  const r = await window.api.toolReadFile(workspace.value, rel)
  if (!r.success) {
    alert('读取失败：' + r.error)
    return
  }
  currentFile.value = rel
  content.value = r.content
  dirty.value = false
}

async function saveFile() {
  if (!currentFile.value) return
  const r = await window.api.toolWriteFile(workspace.value, currentFile.value, content.value)
  if (!r.success) {
    alert('保存失败：' + r.error)
    return
  }
  dirty.value = false
  await refreshFiles()
}

async function createFile() {
  const name = prompt('新文件名（自动补 .md 后缀）', '未命名.md')
  if (!name) return
  let rel = name.trim()
  if (!/\.(md|markdown)$/i.test(rel)) rel += '.md'
  const r = await window.api.toolCreateFile(workspace.value, rel)
  if (!r.success) {
    alert('创建失败：' + r.error)
    return
  }
  await refreshFiles()
  await openFile(rel)
}

async function deleteFile(rel) {
  if (!confirm(`确定删除 ${rel} ？此操作不可恢复。`)) return
  const r = await window.api.toolDeleteFile(workspace.value, rel)
  if (!r.success) {
    alert('删除失败：' + r.error)
    return
  }
  if (currentFile.value === rel) {
    currentFile.value = ''
    content.value = ''
    dirty.value = false
  }
  await refreshFiles()
}

function onKeydown(e) {
  if (isImageFile.value) return // 图片由 ImageEditor 自己处理保存
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (monacoRef.value) return // Monaco 编辑器内部已绑定 Ctrl+S
    saveFile()
  }
}

function onMonacoReady() {
  monacoRef.value?.focus()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  initWorkspace()
})

onBeforeUnmount(() => {
  if (imageDirty.value && currentFile.value && confirm('图片有未保存的修改，是否保存？')) {
    imageEditorRef.value?.save()
    return
  }
  if (dirty.value && currentFile.value && confirm('当前文件有未保存的修改，是否保存？')) {
    saveFile()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>
