import { ref } from 'vue'

/**
 * 统一拖拽放文件状态管理：用计数器避免子元素触发 dragleave 闪烁。
 * @param {{ onFiles?: (files: File[], event: DragEvent) => void, accept?: (file: File) => boolean, multiple?: boolean, disabled?: () => boolean }} [options]
 */
export function useFileDrop(options = {}) {
  const isDragging = ref(false)
  let dragDepth = 0

  function isDisabled() {
    return typeof options.disabled === 'function' ? Boolean(options.disabled()) : Boolean(options.disabled)
  }

  function hasFiles(event) {
    const types = event?.dataTransfer?.types
    if (!types) return false
    return Array.from(types).includes('Files')
  }

  function onDragEnter(event) {
    if (isDisabled() || !hasFiles(event)) return
    event.preventDefault()
    dragDepth += 1
    isDragging.value = true
  }

  function onDragOver(event) {
    if (isDisabled() || !hasFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(event) {
    if (!isDragging.value) return
    event.preventDefault()
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) isDragging.value = false
  }

  function onDrop(event) {
    dragDepth = 0
    isDragging.value = false
    if (isDisabled()) return
    const rawFiles = Array.from(event?.dataTransfer?.files || [])
    if (!rawFiles.length) return
    event.preventDefault()
    let files = typeof options.accept === 'function' ? rawFiles.filter(options.accept) : rawFiles
    if (options.multiple === false && files.length > 1) files = [files[0]]
    if (files.length && typeof options.onFiles === 'function') {
      options.onFiles(files, event)
    }
  }

  function resetDrag() {
    dragDepth = 0
    isDragging.value = false
  }

  return {
    isDragging,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    resetDrag,
    dropZoneProps: {
      onDragenter: onDragEnter,
      onDragover: onDragOver,
      onDragleave: onDragLeave,
      onDrop,
    },
  }
}
