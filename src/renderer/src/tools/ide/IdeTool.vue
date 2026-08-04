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
        <button class="md-ws-btn" :class="{ active: terminalVisible }" title="内置终端（PowerShell / CMD）" @click="terminalVisible = !terminalVisible"><i class="fas fa-terminal"></i> 终端</button>
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
            <button class="md-icon-btn" title="新建文件" @click="createFile()"><i class="fas fa-plus-square"></i></button>
            <button class="md-icon-btn" title="新建文件夹" @click="createFolder()"><i class="fas fa-folder-plus"></i></button>
            <button class="md-icon-btn" title="展开全部" @click="expandAll(true)"><i class="fas fa-chevron-circle-down"></i></button>
            <button class="md-icon-btn" title="折叠全部" @click="expandAll(false)"><i class="fas fa-chevron-circle-up"></i></button>
            <button class="md-icon-btn" title="隐藏文件树" @click="toggleTree(false)"><i class="fas fa-bars"></i></button>
          </div>
        </div>
        <div class="md-file-search">
          <i class="fas fa-search"></i>
          <input v-model="searchQ" placeholder="搜索文件…（Ctrl+F）" spellcheck="false" />
          <button v-if="searchQ" class="md-icon-btn" title="清空搜索" @click="searchQ = ''"><i class="fas fa-times"></i></button>
        </div>
        <div class="md-file-scroll" @contextmenu.prevent="onBlankContext($event)">
          <div v-if="!filteredTree.length" class="md-file-empty">{{ searchQ ? '无匹配文件' : '工作区为空' }}</div>
          <MdFileTree
            :nodes="filteredTree"
            :depth="0"
            :expanded="expanded"
            :force-expand="!!searchQ"
            @open="onOpenFile"
            @toggle="toggleDir"
            @delete="deleteNode"
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

    <TerminalPanel v-if="terminalVisible" :cwd="workspace" @close="terminalVisible = false" />
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
    :placeholder="newFileTargetDir ? '在 ' + newFileTargetDir + ' 下创建，输入文件名' : '文件名'"
    confirm-text="创建"
    @confirm="onCreateFile"
  />
  <InputModal
    v-model:visible="newFolderModal"
    title="新建文件夹"
    :placeholder="newFolderTargetDir ? '在 ' + newFolderTargetDir + ' 下创建，输入文件夹名' : '文件夹名'"
    confirm-text="创建"
    @confirm="onCreateFolder"
  />
  <InputModal
    v-model:visible="renameModal"
    title="重命名"
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
import TerminalPanel from './TerminalPanel.vue'
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
const terminalVisible = ref(false)

const fileCtx = reactive({ show: false, x: 0, y: 0, node: null })
const forwardModalVisible = ref(false)
const forwardMsgContent = ref('')
const newFileModal = ref(false)
const newFolderModal = ref(false)
const renameModal = ref(false)
const renameTarget = ref(null)
const newFileTargetDir = ref('')
const newFolderTargetDir = ref('')
const searchQ = ref('')
const clipboard = ref(null) // { mode: 'copy' | 'cut', rel }

function parentDir(rel) {
  const i = (rel || '').lastIndexOf('/')
  return i > 0 ? rel.slice(0, i) : ''
}

function targetDirOf(node) {
  return node.type === 'dir' ? node.path : parentDir(node.path)
}

const fileCtxItems = computed(() => {
  const node = fileCtx.node
  if (!node) {
    // 文件树空白区（根目录）
    const items = [
      { value: 'newfile', label: '新建文件', icon: 'fas fa-plus-square' },
      { value: 'newfolder', label: '新建文件夹', icon: 'fas fa-folder-plus' }
    ]
    if (clipboard.value) items.push({ value: 'paste', label: '粘贴到根目录', icon: 'fas fa-clipboard' })
    return items
  }
  const isFile = node.type === 'file'
  const items = []
  if (isFile) items.push({ value: 'open', label: '打开', icon: 'fas fa-external-link-alt' })
  items.push({ value: 'newfile', label: isFile ? '新建文件（此目录）' : '在此新建文件', icon: 'fas fa-plus-square' })
  if (!isFile) items.push({ value: 'newfolder', label: '在此新建文件夹', icon: 'fas fa-folder-plus' })
  items.push({ value: 'rename', label: '重命名', icon: 'fas fa-i-cursor' })
  items.push({ value: 'copy', label: '复制', icon: 'fas fa-copy' })
  items.push({ value: 'cut', label: '剪切', icon: 'fas fa-cut' })
  if (clipboard.value) items.push({ value: 'paste', label: '粘贴到此' + (isFile ? '目录' : ''), icon: 'fas fa-clipboard' })
  items.push({ value: 'copypath', label: '复制路径', icon: 'fas fa-link' })
  items.push({ value: 'delete', label: '删除', icon: 'fas fa-trash' })
  if (isFile) items.push({ value: 'send', label: '发送', icon: 'fas fa-paper-plane' })
  return items
})

// 搜索过滤：命中文件保留，目录保留命中项或命中自身的子结构
function filterTree(nodes, q) {
  const out = []
  for (const n of nodes || []) {
    const hit = n.name.toLowerCase().includes(q)
    if (n.type === 'dir') {
      const kids = filterTree(n.children, q)
      if (hit || kids.length) out.push({ ...n, children: kids })
    } else if (hit) {
      out.push(n)
    }
  }
  return out
}

const filteredTree = computed(() => {
  const q = searchQ.value.trim().toLowerCase()
  if (!q) return tree.value
  return filterTree(tree.value, q)
})

function collectDirs(nodes, out) {
  for (const n of nodes || []) {
    if (n.type === 'dir') {
      out.push(n.path)
      collectDirs(n.children, out)
    }
  }
}

function expandAll(expand) {
  if (expand) {
    const dirs = []
    collectDirs(tree.value, dirs)
    expanded.value = new Set(dirs)
  } else {
    expanded.value = new Set()
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
    const w = startW + (ev.clientX - startX)
    if (w < 140) {
      // 拖到最左：隐藏文件树
      treeVisible.value = false
    } else {
      treeVisible.value = true
      treeWidth.value = Math.max(160, Math.min(420, w))
    }
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

// ---- 右键 / 重命名 / 删除 / 发送 / 复制粘贴 ----
function onFileContext(e) {
  fileCtx.node = e.node
  fileCtx.x = e.x
  fileCtx.y = e.y
  fileCtx.show = false
  setTimeout(() => { fileCtx.show = true }, 1)
}

function onBlankContext(e) {
  // 仅文件树空白区本身触发；行内右键已 stopPropagation（双保险）
  if (e.target !== e.currentTarget) return
  fileCtx.node = null
  fileCtx.x = e.clientX
  fileCtx.y = e.clientY
  fileCtx.show = false
  setTimeout(() => { fileCtx.show = true }, 1)
}

async function onFileCtxSelect(value) {
  const node = fileCtx.node
  fileCtx.show = false
  if (value === 'newfile') { createFile(node ? targetDirOf(node) : ''); return }
  if (value === 'newfolder') { createFolder(node ? targetDirOf(node) : ''); return }
  if (value === 'paste') { paste(node ? targetDirOf(node) : ''); return }
  if (!node) return
  if (value === 'open') onOpenFile(node.path)
  else if (value === 'rename') renameFile(node)
  else if (value === 'copy') { clipboard.value = { mode: 'copy', rel: node.path }; flashClipboard() }
  else if (value === 'cut') { clipboard.value = { mode: 'cut', rel: node.path }; flashClipboard() }
  else if (value === 'copypath') {
    try { await navigator.clipboard.writeText(node.path) } catch {}
  }
  else if (value === 'delete') deleteNode(node)
  else if (value === 'send') sendFile(node)
}

function flashClipboard() {
  // 轻提示：复制/剪切成功（用文件树标题闪烁提示）
  const el = document.querySelector('.md-file-list-title')
  if (!el) return
  el.textContent = clipboard.value.mode === 'copy' ? '已复制' : '已剪切'
  setTimeout(() => { el.textContent = '文件 (' + fileCount.value + ')' }, 900)
}

async function paste(targetDir) {
  const cb = clipboard.value
  if (!cb) return
  const name = cb.rel.split('/').pop()
  const dstRel = (targetDir ? targetDir + '/' : '') + name
  if (dstRel === cb.rel) return // 粘贴到自身所在位置
  const r = cb.mode === 'copy'
    ? await window.api.toolCopy(workspace.value, cb.rel, dstRel)
    : await window.api.toolMove(workspace.value, cb.rel, dstRel)
  if (!r.success) { alert('粘贴失败：' + r.error); return }
  if (cb.mode === 'cut') clipboard.value = null
  const parent = parentDir(dstRel)
  if (parent) expanded.value.add(parent)
  await refreshFiles()
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

async function deleteNode(node) {
  const dirWarn = node.type === 'dir' ? '\n目录内容将全部删除！' : ''
  if (!confirm(`确定删除 ${node.path} ？${dirWarn}此操作不可恢复。`)) return
  const r = await window.api.toolDeleteFile(workspace.value, node.path)
  if (!r.success) {
    alert('删除失败：' + r.error)
    return
  }
  editorRef.value?.onFileDeleted(node.path)
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
function createFile(targetDir = '') {
  newFileTargetDir.value = targetDir || ''
  newFileModal.value = true
}

async function onCreateFile(name) {
  const trimmed = name.trim()
  const targetDir = newFileTargetDir.value
  newFileTargetDir.value = ''
  if (!trimmed) return
  const rel = (targetDir ? targetDir + '/' : '') + trimmed
  const r = await window.api.toolCreateFile(workspace.value, rel)
  if (!r.success) {
    alert('创建失败：' + r.error)
    return
  }
  if (targetDir) expanded.value.add(targetDir)
  await refreshFiles()
  await onOpenFile(rel)
}

function createFolder(targetDir = '') {
  newFolderTargetDir.value = targetDir || ''
  newFolderModal.value = true
}

async function onCreateFolder(name) {
  const trimmed = name.trim()
  const targetDir = newFolderTargetDir.value
  newFolderTargetDir.value = ''
  if (!trimmed) return
  const rel = (targetDir ? targetDir + '/' : '') + trimmed
  const r = await window.api.toolMkdir(workspace.value, rel)
  if (!r.success) {
    alert('创建失败：' + r.error)
    return
  }
  const parent = parentDir(rel)
  if (parent) expanded.value.add(parent)
  await refreshFiles()
}

onMounted(() => {
  initWorkspace()
})

onUnmounted(() => {})
</script>
