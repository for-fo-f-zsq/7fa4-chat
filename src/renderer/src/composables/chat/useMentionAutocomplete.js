import { ref, computed, nextTick } from 'vue'
import { store } from '../../store.js'

/**
 * 群聊输入区 @ 提及自动补全状态、键盘导航与弹窗定位。
 */
export function useMentionAutocomplete({
  pageType,
  targetGroup,
  inputEl,
  inputText,
  caretOffset,
  insertAtCaret,
}) {
  const mentionVisible = ref(false)
  const mentionIndex = ref(0)
  const mentionQuery = ref('')
  const mentionPopupStyle = ref({ display: 'none' })

  const mentionCandidates = computed(() => {
    const q = mentionQuery.value.toLowerCase()
    const group = targetGroup()
    if (pageType() !== 'group' || !group) return []
    const candidates = group.users
      .map((u) => store.users[u.user_id] || { uid: u.user_id })
      .filter(Boolean)
    if (!q) return candidates
    return candidates.filter((u) => {
      const name = (u.nickname || u.username || '').toLowerCase()
      const uid = String(u.uid)
      return name.includes(q) || uid.includes(q)
    })
  })

  const mentionAllCandidates = computed(() => {
    const all = pageType() === 'group' ? [{ uid: 'all', nickname: '所有人', _isAll: true }] : []
    return [...all, ...mentionCandidates.value]
  })

  function updateMentionPosition() {
    const el = inputEl.value
    if (!el) { mentionPopupStyle.value = { display: 'none' }; return }
    const rect = el.getBoundingClientRect()
    mentionPopupStyle.value = {
      left: rect.left + 'px',
      bottom: (window.innerHeight - rect.top + 4) + 'px',
      width: Math.max(rect.width, 160) + 'px',
    }
  }

  function handleMentionInput() {
    const before = inputText.value.slice(0, caretOffset())
    const atMatch = before.match(/@([^\s@]*)$/)
    if (atMatch && pageType() === 'group') {
      mentionQuery.value = atMatch[1]
      mentionVisible.value = true
      mentionIndex.value = 0
      nextTick(updateMentionPosition)
    } else {
      mentionVisible.value = false
    }
  }

  function replaceMentionQuery(replacement) {
    const before = inputText.value.slice(0, caretOffset())
    const m = before.match(/@([^\s@]*)$/)
    if (!m) { mentionVisible.value = false; return }
    const start = before.length - m[0].length
    const ta = inputEl.value
    if (ta) {
      ta.setSelectionRange(start, before.length)
      insertAtCaret(replacement)
    } else {
      inputText.value = inputText.value.slice(0, start) + replacement + inputText.value.slice(before.length)
    }
    mentionVisible.value = false
    nextTick(() => inputEl.value?.focus())
  }

  function applyMention(user) {
    replaceMentionQuery('@' + user.uid + ' ')
  }

  function applyMentionAll() {
    replaceMentionQuery('@所有人 ')
  }

  function selectMentionByIndex(idx) {
    const candidate = mentionAllCandidates.value[idx]
    if (!candidate) return
    if (candidate._isAll) applyMentionAll()
    else applyMention(candidate)
  }

  function handleMentionKeydown(e) {
    if (!mentionVisible.value || !mentionAllCandidates.value.length) return false
    const n = mentionAllCandidates.value.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionIndex.value = (mentionIndex.value + 1) % n
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionIndex.value = (mentionIndex.value - 1 + n) % n
      return true
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault()
      selectMentionByIndex(mentionIndex.value)
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      mentionVisible.value = false
      return true
    }
    return false
  }

  return {
    mentionVisible,
    mentionIndex,
    mentionPopupStyle,
    mentionCandidates,
    handleMentionInput,
    handleMentionKeydown,
    applyMention,
    applyMentionAll,
  }
}
