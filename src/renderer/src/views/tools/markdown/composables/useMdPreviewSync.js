import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Prism, setTaskToggleHandler, renderDocumentLive } from '../../../../markdown/index.js'
import { createScrollSync } from '../../../../markdown/scroll-sync.js'

function patchPreviewDom(parent, html, loadedBiliSrcs) {
  const tpl = document.createElement('template')
  tpl.innerHTML = html

  const keyOf = (n) => {
    if (n.nodeType === 3) return `t:${n.data}`
    if (n.nodeType !== 1) return `o:${n.nodeName}`
    if (n.classList && n.classList.contains('luogu-bilibili-container')) {
      const holder = n.querySelector('[data-src]')
      if (holder) return `b:${holder.getAttribute('data-src')}`
    }
    return `h:${n.outerHTML}`
  }

  const oldNodes = Array.from(parent.childNodes)
  const newNodes = Array.from(tpl.content.childNodes)
  const oldKeys = oldNodes.map(keyOf)
  const newKeys = newNodes.map(keyOf)

  const drop = (n) => {
    if (n && n.parentNode === parent) {
      try { parent.removeChild(n) } catch { /* detached */ }
    }
  }

  let oi = 0
  const WINDOW = 64
  for (let ni = 0; ni < newNodes.length; ni++) {
    let found = -1
    for (let k = oi; k < oldNodes.length && k < oi + WINDOW; k++) {
      if (oldKeys[k] === newKeys[ni]) { found = k; break }
    }
    if (found === -1) {
      let refNode = null
      for (let k = oi; k < oldNodes.length; k++) {
        if (oldNodes[k].parentNode === parent) { refNode = oldNodes[k]; break }
      }
      parent.insertBefore(newNodes[ni], refNode)
    } else {
      for (let k = oi; k < found; k++) drop(oldNodes[k])
      oi = found + 1
    }
  }
  for (let k = oi; k < oldNodes.length; k++) drop(oldNodes[k])

  parent.querySelectorAll('button.luogu-bilibili-facade[data-src]').forEach((btn) => {
    if (loadedBiliSrcs.has(btn.getAttribute('data-src')) && window.loadBilibiliPlayer) {
      window.loadBilibiliPlayer(btn)
    }
  })
}

export function useMdPreviewSync({
  content,
  taEl,
  previewEl,
  gutterEl,
  getToggleTask,
  onReady
}) {
  if (Prism && 'manual' in Prism) Prism.manual = true

  const scrollSyncOn = ref(localStorage.getItem('md_tool_scroll_sync') !== '0')
  const viewMode = ref('split')

  const syncEngine = createScrollSync({
    getTextarea: () => taEl.value,
    getPreview: () => previewEl.value,
    getGutter: () => gutterEl.value
  })

  const calloutToggles = new Map()
  const loadedBiliSrcs = new Set()
  let renderTimer = null
  let lastTypingAt = 0
  let resizeObs = null
  let previewResizeObs = null

  function onEditorScroll() {
    const ta = taEl.value
    if (!ta) return
    syncEngine.updateGutterScroll()
    if (syncEngine.isEchoScroll(ta)) return
    syncEngine.sync('editor')
  }

  function onPreviewScroll() {
    const pv = previewEl.value
    if (!pv) return
    if (syncEngine.isEchoScroll(pv)) return
    syncEngine.sync('preview')
  }

  function toggleScrollSync(force) {
    const next = force === undefined ? !scrollSyncOn.value : !!force
    scrollSyncOn.value = next
    localStorage.setItem('md_tool_scroll_sync', next ? '1' : '0')
    syncEngine.setEnabled(next)
  }

  function renderDelay() {
    const len = content.value.length
    if (len > 200000) return 400
    if (len > 50000) return 250
    return 120
  }

  function renderNow() {
    const ta = taEl.value
    const pv = previewEl.value
    if (!ta || !pv) return
    syncEngine.invalidate()
    // 渲染统一走 markdown 门面：表情掩码 + 异常兜底都在里面，避免预览裸奔。
    const html = renderDocumentLive(ta.value)
    patchPreviewDom(pv, html, loadedBiliSrcs)
    if (calloutToggles.size) {
      pv.querySelectorAll('details.luogu-callout').forEach((d) => {
        const key = d.getAttribute('data-src-line')
        if (key === null || !calloutToggles.has(key)) return
        if (calloutToggles.get(key)) d.setAttribute('open', '')
        else d.removeAttribute('open')
      })
    }
    syncEngine.syncEditorTailPadding()
    syncEngine.updateGutter()
  }

  function scheduleRender(immediate) {
    clearTimeout(renderTimer)
    renderTimer = setTimeout(renderNow, immediate ? 0 : renderDelay())
  }

  function onInput() {
    lastTypingAt = Date.now()
    scheduleRender(false)
  }

  watch(content, () => {
    scheduleRender(Date.now() - lastTypingAt >= 80)
  })

  function onPreviewClickCapture(e) {
    const btn = e.target && e.target.closest ? e.target.closest('.luogu-bilibili-facade[data-src]') : null
    if (btn) loadedBiliSrcs.add(btn.getAttribute('data-src'))
  }

  function onPreviewToggle(e) {
    const d = e.target
    if (!d || !d.classList || !d.classList.contains('luogu-callout')) return
    const key = d.getAttribute('data-src-line')
    if (key === null) return
    calloutToggles.set(key, d.open)
    syncEngine.invalidate()
  }

  watch(viewMode, () => {
    nextTick(() => {
      syncEngine.invalidate()
      syncEngine.syncEditorTailPadding()
    })
  })

  function setViewMode(mode) {
    viewMode.value = mode
  }

  function clearCalloutToggles() {
    calloutToggles.clear()
  }

  onMounted(async () => {
    await nextTick()
    setTaskToggleHandler((line, checked) => getToggleTask()?.(line, checked))
    const ta = taEl.value
    const pv = previewEl.value
    if (ta && pv && typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => syncEngine.updateGutter())
      resizeObs.observe(ta)
      previewResizeObs = new ResizeObserver(() => syncEngine.invalidate())
      previewResizeObs.observe(pv)
    }
    onReady?.()
    syncEngine.setEnabled(scrollSyncOn.value)
  })

  onBeforeUnmount(() => {
    clearTimeout(renderTimer)
    resizeObs?.disconnect()
    previewResizeObs?.disconnect()
    resizeObs = null
    previewResizeObs = null
    setTaskToggleHandler(null)
    syncEngine.destroy()
  })

  return {
    scrollSyncOn,
    viewMode,
    setViewMode,
    toggleScrollSync,
    onEditorScroll,
    onPreviewScroll,
    onInput,
    scheduleRender,
    onPreviewClickCapture,
    onPreviewToggle,
    clearCalloutToggles
  }
}
