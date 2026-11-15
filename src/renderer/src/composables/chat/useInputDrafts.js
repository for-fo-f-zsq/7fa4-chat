import { computed, onBeforeUnmount, watch } from 'vue'
import { store } from '../../store.js'
import { getConvoKey } from '../../utils.js'

/**
 * 会话草稿自动保存与恢复（文字 + 待发送文件列表）。
 * InputFooter 不随会话重建，必须开 immediate watch：首开即恢复、切走与编辑实时同步落盘。
 */
export function useInputDrafts({ pageType, pageId, inputText, pendingFiles }) {
  const convoKey = computed(() => getConvoKey(pageType(), pageId()))
  let lastConvoKey = null
  let restoring = false

  function syncDraftToStore(key) {
    if (!key) return
    if (inputText.value.trim()) store.drafts[key] = inputText.value
    else delete store.drafts[key]

    if (pendingFiles.value.length) {
      store.drafts[key + '_files'] = JSON.parse(JSON.stringify(pendingFiles.value))
      if (!inputText.value.trim()) {
        const names = pendingFiles.value.map((f) => f.name).join(', ')
        store.drafts[key] = '📄 ' + names
      }
    } else {
      delete store.drafts[key + '_files']
      if (store.drafts[key] && store.drafts[key].startsWith('📄 ')) {
        delete store.drafts[key]
      }
    }
  }

  watch(convoKey, (newKey) => {
    if (lastConvoKey) syncDraftToStore(lastConvoKey)

    restoring = true
    try {
      const draftText = store.drafts?.[newKey] || ''
      const isFileDraft = draftText.startsWith('📄 ')
      inputText.value = isFileDraft ? '' : draftText

      const savedFiles = store.drafts?.[newKey + '_files']
      pendingFiles.value = Array.isArray(savedFiles) ? JSON.parse(JSON.stringify(savedFiles)) : []
    } finally {
      restoring = false
    }

    lastConvoKey = newKey
  }, { immediate: true })

  watch([inputText, pendingFiles], () => {
    if (!restoring) syncDraftToStore(convoKey.value)
  }, { deep: true })

  onBeforeUnmount(() => {
    syncDraftToStore(convoKey.value)
  })

  function clearCurrentDraft() {
    delete store.drafts[convoKey.value]
    delete store.drafts[convoKey.value + '_files']
  }

  return {
    convoKey,
    clearCurrentDraft,
  }
}
