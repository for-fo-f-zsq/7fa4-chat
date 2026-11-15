export function useMdEditorActions({
  getTa,
  content,
  pushHistory,
  scheduleRender,
  undo,
  redo,
  save,
  saveAs,
  openModal,
  openFind,
  toggleFind
}) {
  function applyText(v, selStart = null, selEnd = null) {
    const ta = getTa()
    if (ta) {
      ta.value = v
      if (selStart != null) ta.setSelectionRange(selStart, selEnd ?? selStart)
    }
    content.value = v
    pushHistory()
    scheduleRender(true)
  }

  function wrapSelection(prefix, suffix, defaultText = '') {
    const ta = getTa()
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = ta.value
    const selected = val.substring(start, end) || defaultText
    ta.value = val.substring(0, start) + prefix + selected + suffix + val.substring(end)
    ta.focus()
    ta.selectionStart = start + prefix.length
    ta.selectionEnd = start + prefix.length + selected.length
    content.value = ta.value
    pushHistory()
    scheduleRender(true)
  }

  function insertAtCursor(text) {
    const ta = getTa()
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = ta.value
    ta.value = val.substring(0, start) + text + val.substring(end)
    ta.focus()
    ta.selectionStart = ta.selectionEnd = start + text.length
    content.value = ta.value
    pushHistory()
    scheduleRender(true)
  }

  const insertBold = () => wrapSelection('**', '**', '加粗文本')
  const insertItalic = () => wrapSelection('*', '*', '斜体文本')
  const insertStrikethrough = () => wrapSelection('~~', '~~', '删除线文本')
  const insertInlineCode = () => wrapSelection('`', '`', 'code')
  const insertQuote = () => wrapSelection('\n> ', '\n', '引用内容')
  const insertHR = () => insertAtCursor('\n\n---\n\n')
  const insertMathInline = () => wrapSelection('$', '$', 'x')
  const insertMathBlock = () => insertAtCursor('\n\n$$\n\\sum_{i=1}^n a_i = S_n\n$$\n\n')
  const insertHeading = (level) => wrapSelection(`\n${'#'.repeat(level)} `, '\n', `标题 ${level}`)
  const insertTaskList = () => insertAtCursor('\n- [ ] 未完成任务项\n- [x] 已完成任务项\n')
  const insertUnorderedList = () => insertAtCursor('\n- 列表项一\n- 列表项二\n- 列表项三\n')
  const insertOrderedList = () => insertAtCursor('\n1. 列表项一\n2. 列表项二\n3. 列表项三\n')
  const insertCallout = (type, title, isOpen) =>
    insertAtCursor(`\n\n::::${type}${title ? `[${title}]` : ''}${isOpen ? '{open}' : ''}\n这里是${type}折叠框的内容。\n::::\n\n`)
  const insertEpigraph = (author, text) =>
    insertAtCursor(`\n\n:::epigraph${author ? `[——${author}]` : ''}\n${text || '千里之行，始于足下。'}\n:::\n\n`)
  const insertBilibili = (id) => {
    if (id) insertAtCursor(`\n\n![](bilibili:${id})\n\n`)
  }

  function shiftHeadingLevel(delta) {
    const ta = getTa()
    if (!ta) return
    const val = ta.value
    const caret = ta.selectionStart
    const lineStart = val.lastIndexOf('\n', caret - 1) + 1
    let lineEnd = val.indexOf('\n', caret)
    if (lineEnd === -1) lineEnd = val.length
    const line = val.slice(lineStart, lineEnd)

    const m = line.match(/^(#{1,6})\s+(.*)$/)
    const current = m ? m[1].length : 0
    const text = m ? m[2] : line.trim()
    if (!text) return

    let next
    if (current === 0) next = delta < 0 ? 1 : 0
    else {
      next = current + delta
      if (next < 0) next = 0
      if (next > 6) next = 6
    }
    if (next === current) return

    const replacement = next === 0 ? text : '#'.repeat(next) + ' ' + text
    ta.value = val.slice(0, lineStart) + replacement + val.slice(lineEnd)
    const pos = Math.max(lineStart, caret + (replacement.length - line.length))
    ta.selectionStart = ta.selectionEnd = pos
    content.value = ta.value
    pushHistory()
    scheduleRender(true)
  }

  function toggleTask(checkbox) {
    const taskIndexAttr = checkbox.getAttribute('data-task-index')
    const ta = getTa()
    if (taskIndexAttr === null || taskIndexAttr === undefined || !ta) return
    const targetIdx = parseInt(taskIndexAttr, 10)
    const isChecked = checkbox.checked
    const val = ta.value

    let curTaskIdx = 0
    const lines = val.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(\s*(?:[*+-]|\d+\.)\s+)\[([ xX])\](\s*.*)$/)
      if (match) {
        if (curTaskIdx === targetIdx) {
          lines[i] = `${match[1]}[${isChecked ? 'x' : ' '}]${match[3]}`
          break
        }
        curTaskIdx++
      }
    }
    ta.value = lines.join('\n')
    content.value = ta.value
    pushHistory()
  }

  function onKeydown(e) {
    const isCtrl = e.ctrlKey || e.metaKey
    if (isCtrl) {
      if (e.shiftKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); Promise.resolve(saveAs()).catch(() => {}); return }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); Promise.resolve(save()).catch(() => {}); return }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); insertBold(); return }
      if ((e.key === 'i' || e.key === 'I') && !e.shiftKey) { e.preventDefault(); insertItalic(); return }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        if (e.shiftKey) insertMathInline(); else openModal('link')
        return
      }
      if ((e.key === 'd' || e.key === 'D') && !e.shiftKey) { e.preventDefault(); insertStrikethrough(); return }
      if ((e.key === 'f' || e.key === 'F') && !e.shiftKey) {
        e.preventDefault()
        if (toggleFind) toggleFind()
        else if (openFind) openFind()
        return
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        if (e.shiftKey) insertMathBlock(); else openModal('math')
        return
      }
      if (e.shiftKey && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); insertHR(); return }
      if (e.shiftKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); openModal('link'); return }
      if (e.shiftKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); openModal('image'); return }
      if (e.shiftKey && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); insertQuote(); return }
      if (e.shiftKey && /^Digit[12789]$/.test(e.code || '')) {
        const action = {
          Digit1: () => openModal('code'),
          Digit2: () => openModal('table'),
          Digit7: insertUnorderedList,
          Digit8: insertOrderedList,
          Digit9: insertTaskList
        }[e.code]
        if (action) { e.preventDefault(); action(); return }
      }
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        shiftHeadingLevel(e.key === 'ArrowUp' ? -1 : 1)
        return
      }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redo(); return }
    }

    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ta = getTa()
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      if (start === end) {
        const val = ta.value
        const lineStart = val.lastIndexOf('\n', start - 1) + 1
        const line = val.slice(lineStart, start)
        const m = line.match(/^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(?:\[([ xX])\]\s+)?(.*)$/)
        if (m) {
          const [, indent, bullet, num, delim, gap, box, text] = m
          if (text.trim() === '' && box === undefined) {
            e.preventDefault()
            ta.value = val.slice(0, lineStart) + val.slice(start)
            ta.selectionStart = ta.selectionEnd = lineStart
            content.value = ta.value
            pushHistory()
            scheduleRender(true)
            return
          }
          let marker = bullet ? bullet + gap : (parseInt(num, 10) + 1) + delim + gap
          if (box !== undefined) {
            if (text.trim() === '') {
              e.preventDefault()
              const bare = indent + (bullet ? bullet + gap : num + delim + gap)
              ta.value = val.slice(0, lineStart) + bare + val.slice(start)
              ta.selectionStart = ta.selectionEnd = lineStart + bare.length
              content.value = ta.value
              pushHistory()
              scheduleRender(true)
              return
            }
            marker += '[ ] '
          }
          e.preventDefault()
          const insert = '\n' + indent + marker
          ta.value = val.slice(0, start) + insert + val.slice(end)
          ta.selectionStart = ta.selectionEnd = start + insert.length
          content.value = ta.value
          pushHistory()
          scheduleRender(true)
          return
        }
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = getTa()
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const val = ta.value
      if (e.shiftKey) {
        const lineStart = val.lastIndexOf('\n', start - 1) + 1
        if (val.substring(lineStart, lineStart + 4) === '    ') {
          ta.value = val.substring(0, lineStart) + val.substring(lineStart + 4)
          ta.selectionStart = Math.max(lineStart, start - 4)
          ta.selectionEnd = Math.max(lineStart, end - 4)
        } else if (val.substring(lineStart, lineStart + 2) === '  ') {
          ta.value = val.substring(0, lineStart) + val.substring(lineStart + 2)
          ta.selectionStart = Math.max(lineStart, start - 2)
          ta.selectionEnd = Math.max(lineStart, end - 2)
        }
      } else {
        ta.value = val.substring(0, start) + '    ' + val.substring(end)
        ta.selectionStart = ta.selectionEnd = start + 4
      }
      content.value = ta.value
      pushHistory()
      scheduleRender(true)
    }
  }

  return {
    applyText,
    wrapSelection,
    insertAtCursor,
    insertBold,
    insertItalic,
    insertStrikethrough,
    insertInlineCode,
    insertQuote,
    insertHR,
    insertMathInline,
    insertMathBlock,
    insertHeading,
    insertTaskList,
    insertUnorderedList,
    insertOrderedList,
    insertCallout,
    insertEpigraph,
    insertBilibili,
    onKeydown,
    toggleTask
  }
}
