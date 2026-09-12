/**
 * 把 LuoguTypora 包成一个 Vue 组合式函数，供输入框与 Markdown 工具共用。
 *
 * 数据模型与上游一致：纯文本源码是唯一真源（这里的 `source`），渲染结果只是它的视图。
 * 就地编辑器永远是一个真实的 <textarea>，绝不使用 contenteditable——中文输入法、
 * 撤销栈、选区行为都因此与普通文本框完全一致。
 *
 * 本层额外解决四个上游外壳里不需要、但聊天输入框必须解决的问题：
 *   1. 事件优先级 —— 自己的捕获监听先于 Typora 注册，Enter/Ctrl+Enter 才能被发送逻辑抢下
 *      （Typora 对 Ctrl+Enter 绑了"折叠块"，在聊天框里会与发送快捷键冲突）；
 *   2. 空态可直接输入 —— 没有打开任何块时敲下可见字符，自动在文末开一个段落并接手该字符；
 *   3. 外部改源码时收口 —— resetSource 先 commit，避免就地编辑器被重渲染直接抹掉；
 *   4. 渲染落盘不用 v-html —— Typora 会就地增删宿主元素（隐藏原块、插入编辑框），
 *      而 Vue 的 v-html 补丁拿当前 innerHTML 和新字符串比对，一旦不等就整体重写，
 *      会把正在编辑的 textarea 一起抹掉。所以这里改成命令式赋值，并在有就地编辑器
 *      打开时挂起（pendingRender），等它关闭后再补上。
 */
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { LuoguTypora, renderMarkdown as defaultRender } from './index.js'

export function useTyporaEditor(options = {}) {
  const {
    render = defaultRender,
    placeholder = '在此输入 Markdown…',
    initial = '',
  } = options

  // placeholder 允许传函数：聊天输入框的提示语随"发送快捷键"设置变化，必须按需取值
  const ph = () => (typeof placeholder === 'function' ? placeholder() : placeholder)

  const source = ref(initial)
  const surfaceEl = ref(null)
  /** 是否正有就地编辑器打开（驱动外部 UI 状态） */
  const editing = ref(false)
  /** Typora 是否处于启用状态；模板用它绑定 typora-mode，与 Typora 自己的 classList 保持一致 */
  const enabled = ref(true)

  let typora = null
  let keydownHook = null
  let observer = null
  /** 源码变了但有就地编辑器占着 DOM，渲染被挂起 */
  let pendingRender = false

  const html = computed(() => render(source.value))

  // ---------- 内部工具 ----------

  function openTextarea() {
    return typora && typora.openBlock ? typora.openBlock.textarea : null
  }

  function syncEditingFlag() {
    const on = !!(typora && typora.openBlock)
    if (editing.value !== on) editing.value = on
    return on
  }

  /**
   * 把 html 落盘到宿主元素。
   *
   * 有就地编辑器打开时必须让路：那段时间 DOM 的所有权属于 Typora，
   * 整体重写 innerHTML 会让它手里的 textarea 变成游离节点。
   *
   * 也只在宿主确实挂着时才读 html —— Markdown 工具的分屏模式下，源码每敲一个键
   * 都会走到这里，提前返回可以省掉一次整篇渲染。
   */
  function renderSurface() {
    const el = surfaceEl.value
    if (!el) return
    if (syncEditingFlag()) { pendingRender = true; return }
    pendingRender = false
    const next = html.value || ''
    if (el.innerHTML !== next) el.innerHTML = next
  }

  function isActive() {
    return !!(typora && typora.active)
  }

  /** 在打开的编辑器里插入文本（替换当前选区），插入后把光标放到插入内容之后 */
  function insertIntoOpen(text, caretDelta) {
    const ta = openTextarea()
    if (!ta) return false
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? start
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end)
    const caret = start + (caretDelta === undefined ? text.length : caretDelta)
    ta.selectionStart = ta.selectionEnd = caret
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    ta.focus()
    syncEditingFlag()
    return true
  }

  /** 替换打开的编辑器里 [start, end) 这段文本（@提及 补全要吃掉已输入的查询串） */
  function replaceRange(start, end, text) {
    const ta = openTextarea()
    if (!ta) return false
    ta.setSelectionRange(start, end)
    return insertIntoOpen(text)
  }

  /** 在文末开一个新的段落编辑器，并把初始内容填进去 */
  function openAtEnd(initialText = '', caretDelta) {
    if (!isActive()) return false
    typora.commit()
    syncEditingFlag()

    const lines = source.value.length ? source.value.split('\n') : []
    // 已有内容且末行非空时先隔一个空行，避免新内容被并进上一个段落
    const lastLine = lines.length ? lines[lines.length - 1] : ''
    const prefix = lines.length && lastLine.trim() !== '' ? '\n\n' : ''

    typora.openGap(lines.length)
    const ta = openTextarea()
    if (!ta) return false
    ta.placeholder = ph()
    const value = prefix + initialText
    if (value) {
      ta.value = value
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const caret = caretDelta === undefined ? ta.value.length : prefix.length + caretDelta
    ta.selectionStart = ta.selectionEnd = caret
    syncEditingFlag()
    return true
  }

  // ---------- 事件 ----------

  const onKeyDown = (e) => {
    // 输入法合成中的按键一律放行，交给 textarea 自己处理
    if (e.isComposing) return

    // 外部钩子优先（@提及导航、发送快捷键）；返回 true 表示已消费
    if (keydownHook && keydownHook(e) === true) return

    if (!typora || !typora.openBlock) {
      // 空态直接开写：把这一次按键交给新开的段落
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopImmediatePropagation()
        openAtEnd(e.key)
      }
      return
    }

    // 已打开编辑器时拦掉 Typora 对 Ctrl+Enter 的"折叠"绑定：
    // 聊天框里这个组合要么发送、要么换行，折叠语义会让人措手不及。
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopImmediatePropagation()
      insertIntoOpen('\n')
    }
  }

  const onFocusOut = () => {
    // Typora 自己用 blur 提交；这里只同步标志位
    setTimeout(syncEditingFlag, 0)
  }

  // ---------- 挂载 ----------

  function attach(el) {
    if (!el || typora) return
    typora = new LuoguTypora({
      previewEl: el,
      textarea: {
        get value() { return source.value },
        set value(v) { source.value = v },
      },
      setContent(v) { source.value = v },
    })
    // 必须先于 Typora.enable() 注册，否则它的捕获监听会先吃掉 Ctrl+Enter
    el.addEventListener('keydown', onKeyDown, true)
    el.addEventListener('focusout', onFocusOut, true)
    // Typora 的开/关块由点击或它自己的按键触发，外面无从得知；
    // 它总会改动宿主子节点，据此同步 editing、补上被挂起的渲染，
    // 并给"空白处点出来的新段落"换上属于当前场景的提示语。
    observer = new MutationObserver(() => {
      if (syncEditingFlag()) {
        const ta = openTextarea()
        if (ta && ta.value === '') ta.placeholder = ph()
      } else if (pendingRender) {
        renderSurface()
      }
    })
    observer.observe(el, { childList: true, subtree: true })
    typora.enable()
    renderSurface()
  }

  function detach() {
    if (!typora) return
    const el = typora.previewEl
    el.removeEventListener('keydown', onKeyDown, true)
    el.removeEventListener('focusout', onFocusOut, true)
    if (observer) { observer.disconnect(); observer = null }
    typora.commit()
    typora.disable()
    typora = null
    syncEditingFlag()
  }

  watch(surfaceEl, (el, prev) => {
    if (prev) detach()
    if (el) attach(el)
  }, { flush: 'post' })

  // 源码变化 → 重渲染。挂在 source 而不是 html 上：html 会在依赖被读取时才求值，
  // 宿主没挂时 renderSurface 直接返回，整篇渲染就不会发生。
  watch(source, renderSurface, { flush: 'post' })

  onBeforeUnmount(detach)

  // ---------- 对外 ----------

  return {
    source,
    html,
    surfaceEl,
    editing,
    enabled,
    /** 注册 keydown 钩子；返回 true 表示已消费该事件 */
    setKeydownHook(fn) { keydownHook = fn },
    getOpenTextarea: openTextarea,
    hasOpenBlock() { return !!(typora && typora.openBlock) },
    /** 打开的编辑器里光标前的文本（用于 @提及 与表情码检测）；无编辑器时返回 null */
    caretContext() {
      const ta = openTextarea()
      if (!ta) return null
      const offset = ta.selectionStart ?? ta.value.length
      return { value: ta.value, offset, before: ta.value.slice(0, offset) }
    },
    insertIntoOpen,
    replaceRange,
    openAtEnd,
    /** 统一插入入口：有打开的编辑器就插入，否则在文末开一个新段落。
     *  caretDelta 用于把光标停在插入内容中间（工具栏的 **{sel}** 这种结构占位）。 */
    insert(text, caretDelta) {
      if (insertIntoOpen(text, caretDelta)) return true
      return openAtEnd(text, caretDelta)
    },
    /** 提交就地编辑器（同步），随后按需重渲染 */
    commit() {
      if (typora) typora.commit()
      syncEditingFlag()
      renderSurface()
    },
    /** 同步取回最新源码：先收口，再读 */
    readSource() {
      if (typora) typora.commit()
      syncEditingFlag()
      renderSurface()
      return source.value
    },
    /** 外部替换源码（草稿恢复、切换会话）：先收口再替换 */
    resetSource(text) {
      if (typora) typora.commit()
      source.value = text ?? ''
      syncEditingFlag()
      renderSurface()
    },
    enable() {
      enabled.value = true
      if (typora && !typora.active) typora.enable()
    },
    disable() {
      enabled.value = false
      if (typora && typora.active) {
        typora.commit()
        typora.disable()
        syncEditingFlag()
        renderSurface()
      }
    },
    isActive,
    /** 让渲染结果落盘后再执行（用于发送等需要读最新源码的场景） */
    async flush() {
      if (typora) typora.commit()
      syncEditingFlag()
      renderSurface()
      await nextTick()
    },
  }
}
