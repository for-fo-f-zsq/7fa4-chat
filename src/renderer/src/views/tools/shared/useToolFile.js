import { computed, onScopeDispose, ref } from 'vue'
import { saveToolFile, textToBase64, toolSaveState } from '../../../utils.js'
import { useDialog } from '../../../composables/useDialog.js'
import { useToast } from '../../../composables/useToast.js'

/** Decode UTF-8 base64 string returned by window.api.selectFile / selectImage. */
export function b64ToText(b64) {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export { textToBase64 }

/**
 * Shared file-session state & save helper for standalone/embedded tools.
 * Supports either imperative dirty tracking (Graph/Image) or a computed dirty ref (Markdown).
 */
export function useToolFile({
  defaultName = '',
  dirtyRef = null
} = {}) {
  const dialog = useDialog()
  const toast = useToast()

  const fileName = ref(defaultName)
  const savedName = ref('')
  const savedPath = ref('')
  const saving = ref(false)
  const internalDirty = ref(false)
  const dirty = dirtyRef || internalDirty

  let suppressDirty = false

  if (typeof window !== 'undefined') {
    const onBeforeUnload = (e) => {
      if (!dirty.value) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    onScopeDispose(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  const saveState = computed(() =>
    toolSaveState({ hasFile: !!savedName.value, dirty: dirty.value })
  )

  function setSuppressDirty(v) {
    suppressDirty = Boolean(v)
  }

  function markDirty() {
    if (suppressDirty || dirtyRef) return
    if (internalDirty.value) return
    internalDirty.value = true
  }

  function markClean() {
    if (dirtyRef) return
    if (!internalDirty.value) return
    internalDirty.value = false
  }

  function setSavedMeta({ name = '', path = '' } = {}) {
    if (name) fileName.value = name
    savedName.value = name
    savedPath.value = path
    markClean()
  }

  function resetMeta(nextFileName = defaultName) {
    fileName.value = nextFileName
    savedName.value = ''
    savedPath.value = ''
    markClean()
  }

  async function saveBase64File({ base64, name, mime, forceDialog = false, onSuccess = null }) {
    if (saving.value) return { success: false, busy: true }
    const targetName = (name && String(name).trim()) || defaultName || 'untitled'
    const reusePath = !forceDialog && savedPath.value && savedName.value === targetName ? savedPath.value : ''
    saving.value = true
    try {
      const r = await saveToolFile(base64, targetName, mime, reusePath)
      if (!r.success) {
        if (!r.canceled) {
          await dialog.alert({ title: '保存失败', message: r.error || '未知错误' })
        }
        return r
      }
      fileName.value = targetName
      savedName.value = targetName
      savedPath.value = r.path || reusePath || ''
      if (!dirtyRef) internalDirty.value = false
      if (onSuccess) onSuccess(r)
      toast.showToast('已保存：' + (r.path || targetName), 'success', 1800)
      return { success: true, path: savedPath.value }
    } catch (e) {
      await dialog.alert({ title: '保存失败', message: (e && e.message) || '未知错误' })
      return { success: false, error: (e && e.message) || '未知错误' }
    } finally {
      saving.value = false
    }
  }

  return {
    fileName,
    savedName,
    savedPath,
    saving,
    dirty,
    saveState,
    setSuppressDirty,
    markDirty,
    markClean,
    setSavedMeta,
    resetMeta,
    saveBase64File
  }
}
