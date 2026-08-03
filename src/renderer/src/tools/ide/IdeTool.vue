<template>
  <div class="md-tool">
    <div class="md-tool-header">
      <div class="md-tool-title">
        <button class="md-back-btn" title="返回工具列表" @click="$emit('back')"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-wrench"></i> 工具
        <span class="md-tool-sep">/</span>
        IDE
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
            <button class="md-icon-btn" title="新建文件" @click="createFile"><i class="fas fa-plus"></i></button>
            <button class="md-icon-btn" title="隐藏文件树" @click="toggleTree(false)"><i class="fas fa-bars"></i></button>
          </div>
        </div>
        <div class="md-file-scroll">
          <div v-if="!tree.length" class="md-file-empty">工作区为空</div>
          <MdFileTree
            :nodes="tree"
            :depth="0"
            :expanded="expanded"
            @open="onOpenFile"
            @toggle="toggleDir"
            @delete="deleteFile"
            @context="onFileContext"
          />
        </div>
      </div>
      <div v-if="treeVisible" class="md-tree-resizer" @mousedown="startTreeResize"></div>

      <div class="md-editor-col">
        <div v-if="editorRef?.tabs?.length" class="md-tabs">
          <div
            v-for="t in editorRef.tabs"
            :key="t.path"
            class="md-tab-item"
            :class="{ active: t.path === editorRef.activePath }"
            :title="t.path"
            @click="editorRef.setActivePath(t.path)"
            @auxclick.middle="editorRef.closeTab(t.path)"
          >
            <i :class="tabIcon(t)"></i>
            <span class="md-tab-name">{{ t.name }}</span>
            <span v-if="t.dirty || t.imageDirty" class="md-tab-dot"></span>
            <button class="md-tab-close" title="关闭标签" @click.stop="editorRef.closeTab(t.path)"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <Editor
          ref="editorRef"
          :workspace="workspace"
          :tree-visible="treeVisible"
          @saved="refreshFiles"
          @toggle-tree="toggleTree(true)"
        />
      </div>
    </div>
  </div>

  <ContextMenu
    v-if="fileCtx.show"
    :visible="fileCtx.show"
    :x="fileCtx.x"
    :y="fileCtx.y"
    :items="fileCtxItems"
    @select="onFileCtxSelect"
    @close="fileCtx.show = false"
  />
  <ForwardModal
    v-if="forwardModalVisible"
    :msg-content="forwardMsgContent"
    @close="forwardModalVisible = false"
    @forward="onForwardFile"
  />
  <InputModal
    v-model:visible="newFileModal"
    title="新建文件"
    placeholder="文件名"
    confirm-text="创建"
    @confirm="onCreateFile"
  />
  <InputModal
    v-model:visible="renameModal"
    title="重命名文件"
    :initial-value="renameTarget?.name || ''"
    confirm-text="确定"
    @confirm="onRenameConfirm"
  />
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { sendChatMessage } from '../../utils.js'
import MdFileTree from './MdFileTree.vue'
import Editor from './Editor.vue'
import ContextMenu from '../../components/ContextMenu.vue'
import ForwardModal from '../../components/ForwardModal.vue'
import InputModal from '../../components/InputModal.vue'
import './ide-tool.css'

defineEmits(['back'])

const workspace = ref('')
const tree = ref([])
const expanded = ref(new Set())
const treeWidth = ref(240)
const treeVisible = ref(true)
const apiMissing = ref(false)
const editorRef = ref(null)

const fileCtx = reactive({ show: false, x: 0, y: 0, node: null })
const forwardModalVisible = ref(false)
const forwardMsgContent = ref('')
const newFileModal = ref(false)
const renameModal = ref(false)
const renameTarget = ref(null)

const fileCtxItems = computed(() => [
  { value: 'rename', label: '重命名', icon: 'fas fa-i-cursor' },
  { value: 'send', label: '发送', icon: 'fas fa-paper-plane' },
  { value: 'delete', label: '删除', icon: 'fas fa-trash' }
])

function countFiles(nodes) {
  let n = 0
  for (const node of nodes || []) {
    if (node.type === 'file') n++
    else n += countFiles(node.children)
  }
  return n
}
const fileCount = computed(() => countFiles(tree.value))

function tabIcon(t) {
  if (t.type === 'image') return 'fas fa-file-image'
  if (t.type === 'pdf') return 'fas fa-file-pdf'
  if (t.type === 'md') return 'fas fa-file-alt'
  return 'fas fa-file-code'
}

async function persistWorkspace() {
  try {
    const s = await window.api.loadSetting()
    s.ideWorkspace = workspace.value
    s.ideTreeWidth = treeWidth.value
    s.ideTreeVisible = treeVisible.value
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
    // 兼容旧字段 mdWorkspace / mdTreeWidth / mdTreeVisible
    if (s.ideWorkspace || s.mdWorkspace) {
      workspace.value = s.ideWorkspace || s.mdWorkspace
    } else {
      workspace.value = await window.api.getDocumentsPath()
      await persistWorkspace()
    }
    if (s.ideTreeWidth || s.mdTreeWidth) treeWidth.value = s.ideTreeWidth || s.mdTreeWidth
    if (s.ideTreeVisible !== undefined) treeVisible.value = s.ideTreeVisible
    else if (s.mdTreeVisible !== undefined) treeVisible.value = s.mdTreeVisible
  } catch {
    workspace.value = await window.api.getDocumentsPath()
  }
  await refreshFiles()
}

async function selectWorkspace() {
  const r = await window.api.selectWorkspace()
  if (!r.success) return
  workspace.value = r.path
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

function onOpenFile(path) {
  editorRef.value?.openFile(path)
}

// ---- 右键 / 重命名 / 删除 / 发送 ----
function onFileContext(e) {
  fileCtx.node = e.node
  fileCtx.x = e.x
  fileCtx.y = e.y
  fileCtx.show = false
  setTimeout(() => { fileCtx.show = true }, 1)
}

async function onFileCtxSelect(value) {
  const node = fileCtx.node
  fileCtx.show = false
  if (!node || node.type !== 'file') return
  if (value === 'rename') renameFile(node)
  else if (value === 'send') sendFile(node)
  else if (value === 'delete') deleteFile(node.path)
}

async function renameFile(node) {
  renameTarget.value = node
  renameModal.value = true
}

async function onRenameConfirm(name) {
  const node = renameTarget.value
  renameTarget.value = null
  if (!node) return
  const trimmed = name.trim()
  if (!trimmed || trimmed === node.name) return
  const r = await window.api.toolRenameFile(workspace.value, node.path, trimmed)
  if (!r.success) {
    alert('重命名失败：' + r.error)
    return
  }
  editorRef.value?.onFileRenamed(node.path, r.path)
  await refreshFiles()
}

async function deleteFile(rel) {
  if (!confirm(`确定删除 ${rel} ？此操作不可恢复。`)) return
  const r = await window.api.toolDeleteFile(workspace.value, rel)
  if (!r.success) {
    alert('删除失败：' + r.error)
    return
  }
  editorRef.value?.onFileDeleted(rel)
  await refreshFiles()
}

async function sendFile(node) {
  const r = await window.api.toolReadRawFile(workspace.value, node.path)
  if (!r.success) {
    alert('读取失败：' + r.error)
    return
  }
  const msgObj = { type: 'file', name: node.name, size: r.size, data: r.data, mime: r.mime }
  const content = JSON.stringify(msgObj)
  if (content.length > 102400) {
    alert('文件过大（聊天单条消息上限约 76KB），无法发送')
    return
  }
  forwardMsgContent.value = content
  forwardModalVisible.value = true
}

async function onForwardFile({ type, targetId, msgContent }) {
  forwardModalVisible.value = false
  try {
    const msgObj = JSON.parse(msgContent)
    const res = await sendChatMessage({ type, targetId, msgObj })
    if (res.success) alert('已发送')
    else alert('发送失败：' + (res.err?.message || '未知错误'))
  } catch (e) {
    alert('发送失败：' + e.message)
  }
}

// ---- 新建 ----
function createFile() {
  newFileModal.value = true
}

async function onCreateFile(name) {
  const rel = name.trim()
  if (!rel) return
  const r = await window.api.toolCreateFile(workspace.value, rel)
  if (!r.success) {
    alert('创建失败：' + r.error)
    return
  }
  await refreshFiles()
  await onOpenFile(rel)
}

onMounted(() => {
  initWorkspace()
})

onUnmounted(() => {})
</script>
