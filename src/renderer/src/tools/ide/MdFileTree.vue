<template>
  <div class="mdtree">
    <div v-for="node in nodes" :key="node.path" class="mdtree-node">
      <div
        class="mdtree-row"
        :class="{
          dir: node.type === 'dir',
          'file-md': node.type === 'file' && isMarkdown(node.name),
          active: node.type === 'file' && node.path === currentFile
        }"
        :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
        @click="onClick(node)"
        @contextmenu.prevent="onContext($event, node)"
      >
        <span v-if="node.type === 'dir'" class="mdtree-chevron" :class="{ open: isExpanded(node.path) }">
          <i class="fas fa-chevron-right"></i>
        </span>
        <span v-else class="mdtree-chevron-spacer"></span>
        <i
          v-if="node.type === 'dir'"
          class="mdtree-icon"
          :class="isExpanded(node.path) ? 'fas fa-folder-open' : 'fas fa-folder'"
        ></i>
        <i v-else class="mdtree-icon" :class="fileIcon(node.name)"></i>
        <span class="mdtree-name">{{ node.name }}</span>
        <span
          v-if="node.type === 'file'"
          class="mdtree-del"
          title="删除文件"
          @click.stop="$emit('delete', node.path)"
        ><i class="fas fa-trash"></i></span>
      </div>
      <div
        v-if="node.type === 'dir' && isExpanded(node.path) && node.children && node.children.length"
        class="mdtree-children"
      >
        <MdFileTree
          :nodes="node.children"
          :depth="depth + 1"
          :current-file="currentFile"
          :expanded="expanded"
          @open="$emit('open', $event)"
          @delete="$emit('delete', $event)"
          @context="$emit('context', $event)"
          @toggle="$emit('toggle', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: 'MdFileTree' })

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 },
  currentFile: { type: String, default: '' },
  expanded: { type: Set, default: () => new Set() }
})

const emit = defineEmits(['open', 'delete', 'toggle', 'context'])

const MARKDOWN_RE = /\.(md|markdown)$/i

function isMarkdown(name) {
  return MARKDOWN_RE.test(name || '')
}

function fileIcon(name) {
  if (isMarkdown(name)) return 'fas fa-file-alt'
  if (/\.(png|jpe?g|gif|bmp|webp|ico|svg)$/i.test(name)) return 'fas fa-file-image'
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'fas fa-file-archive'
  if (/\.(js|ts|json|css|html|vue|py|java|c|cpp|sh|yml|yaml)$/i.test(name)) return 'fas fa-file-code'
  return 'fas fa-file'
}

function isExpanded(path) {
  return props.expanded.has(path)
}

function onClick(node) {
  if (node.type === 'dir') {
    emit('toggle', node.path)
    return
  }
  emit('open', node.path)
}

function onContext(e, node) {
  if (node.type === 'file') emit('context', { node, x: e.clientX, y: e.clientY })
}
</script>
