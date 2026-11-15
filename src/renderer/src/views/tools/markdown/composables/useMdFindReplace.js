import { ref, computed } from 'vue'

export function useMdFindReplace({
  getTa,
  content,
  pushHistory,
  scheduleRender
}) {
  const findOpen = ref(false)
  const findText = ref('')
  const replaceText = ref('')
  const caseSensitive = ref(false)
  const matchIndex = ref(-1)
  const matches = ref([])

  const matchesCount = computed(() => matches.value.length)

  function updateMatches() {
    const ta = getTa()
    const text = ta ? ta.value : (content.value || '')
    const query = findText.value

    if (!query) {
      matches.value = []
      matchIndex.value = -1
      return
    }

    try {
      const flag = caseSensitive.value ? 'g' : 'gi'
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(escaped, flag)
      const list = []
      let m
      while ((m = re.exec(text)) !== null) {
        list.push({ start: m.index, end: m.index + m[0].length })
        if (m.index === re.lastIndex) re.lastIndex++ // avoid zero-length infinite loop
      }
      matches.value = list

      if (list.length > 0) {
        const caret = ta ? ta.selectionStart : 0
        const idx = list.findIndex((it) => it.start >= caret)
        matchIndex.value = idx !== -1 ? idx : 0
      } else {
        matchIndex.value = -1
      }
    } catch {
      matches.value = []
      matchIndex.value = -1
    }
  }

  // focus=false：调用方还在查找框里打字，不能把焦点抢回编辑器（否则只能输进一个字符）。
  function goToMatch(index, focus = true) {
    if (matches.value.length === 0) return
    const idx = (index + matches.value.length) % matches.value.length
    matchIndex.value = idx
    const match = matches.value[idx]
    const ta = getTa()
    if (!ta || !match) return

    if (focus) {
      ta.focus()
      ta.setSelectionRange(match.start, match.end)
    }

    // Scroll to reveal match
    const textBefore = ta.value.slice(0, match.start)
    const lineNum = textBefore.split('\n').length
    const totalLines = ta.value.split('\n').length
    const approxLineHeight = ta.scrollHeight / Math.max(1, totalLines)
    ta.scrollTop = Math.max(0, (lineNum - 3) * approxLineHeight)
  }

  function findNext() {
    if (matches.value.length === 0) return
    goToMatch(matchIndex.value + 1)
  }

  function findPrev() {
    if (matches.value.length === 0) return
    goToMatch(matchIndex.value - 1)
  }

  function replaceCurrent() {
    const ta = getTa()
    if (!ta || !findText.value) return
    // 正文可能刚被手输改过，偏移量必须按当前文本重算，否则会替换到错误的区间。
    updateMatches()
    if (matches.value.length === 0 || matchIndex.value < 0) return
    const match = matches.value[matchIndex.value]
    if (!match) return

    const val = ta.value
    const replacement = replaceText.value
    const nextVal = val.slice(0, match.start) + replacement + val.slice(match.end)
    ta.value = nextVal
    content.value = nextVal
    pushHistory?.()
    scheduleRender?.(true)

    updateMatches()
    if (matches.value.length > 0) {
      goToMatch(Math.min(matchIndex.value, matches.value.length - 1))
    }
  }

  function replaceAll() {
    const ta = getTa()
    if (!ta || !findText.value) return
    const val = ta.value
    const query = findText.value
    const flag = caseSensitive.value ? 'g' : 'gi'
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped, flag)
    const rep = replaceText.value
    const nextVal = val.replace(re, () => rep)

    if (nextVal !== val) {
      ta.value = nextVal
      content.value = nextVal
      pushHistory?.()
      scheduleRender?.(true)
      updateMatches()
    }
  }

  function openFind() {
    const ta = getTa()
    if (ta) {
      const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd)
      if (sel && sel.length <= 100 && !sel.includes('\n')) {
        findText.value = sel
      }
    }
    findOpen.value = true
    updateMatches()
  }

  function closeFind() {
    findOpen.value = false
    const ta = getTa()
    ta?.focus()
  }

  function toggleFind() {
    if (findOpen.value) {
      closeFind()
    } else {
      openFind()
    }
  }

  function onFindTextChange(v) {
    findText.value = v
    updateMatches()
    if (matches.value.length > 0) {
      goToMatch(0, false)
    }
  }

  function onCaseSensitiveChange(v) {
    caseSensitive.value = v
    updateMatches()
    if (matches.value.length > 0) {
      goToMatch(0, false)
    }
  }

  return {
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
  }
}
