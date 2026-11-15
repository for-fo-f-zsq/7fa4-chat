import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  readGraphTheme,
  computeHighlightState,
  createEmptyHighlight,
  drawGraphScene,
  exportGraphPng
} from '../graphRenderer.js'

export function useGraphCanvas({
  getModel,
  getLayout,
  getInter,
  dialog,
  toast,
  onReady
}) {
  const canvasRef = ref(null)
  const wrapRef = ref(null)

  let ctx = null
  let canvasW = 0
  let canvasH = 0
  let drawPending = false
  let hlDirty = true
  let currentHl = createEmptyHighlight()
  let resizeObserver = null
  let themeObserver = null

  const theme = reactive({
    bg: '#ffffff',
    nodeFill: '#f2f3f5',
    nodeStroke: '#8a8f99',
    text: '#1f2329',
    accent: '#3c8ce7',
    edge: '#8a8f99',
    danger: '#e5484d'
  })

  function refreshInfo() {
    const model = getModel()
    model.info.value = `节点 ${model.nodes.length} · 边 ${model.edges.length}`
  }

  function draw() {
    if (!ctx) return
    const model = getModel()
    const layout = getLayout()
    const inter = getInter()
    if (hlDirty) {
      hlDirty = false
      const res = computeHighlightState({
        nodes: model.nodes,
        edges: model.edges,
        highlight: model.highlight.value,
        directed: model.directed.value,
        algoSrc: model.algoSrc.value,
        algoSink: model.algoSink.value,
        byId: model.byId,
        isDark: theme.isDark
      })
      currentHl = res.hl
      model.analysis.value = res.analysis
    }
    drawGraphScene(ctx, {
      canvasW,
      canvasH,
      view: layout.view,
      theme,
      nodes: model.nodes,
      edges: model.edges,
      byId: model.byId,
      interaction: inter.interaction,
      hl: currentHl,
      treeEdgeSet: layout.getTreeEdgeSet(),
      highlight: model.highlight.value,
      directed: model.directed.value
    })
  }

  function requestDraw() {
    if (drawPending) return
    drawPending = true
    requestAnimationFrame(() => {
      drawPending = false
      draw()
    })
  }

  function invalidate() {
    hlDirty = true
    refreshInfo()
    requestDraw()
  }

  function markHlDirty() {
    hlDirty = true
    requestDraw()
  }

  function resizeCanvas() {
    const wrap = wrapRef.value
    const cv = canvasRef.value
    if (!wrap || !cv) return
    const dpr = window.devicePixelRatio || 1
    canvasW = wrap.clientWidth
    canvasH = wrap.clientHeight
    cv.width = Math.max(1, Math.round(canvasW * dpr))
    cv.height = Math.max(1, Math.round(canvasH * dpr))
    cv.style.width = canvasW + 'px'
    cv.style.height = canvasH + 'px'
    requestDraw()
  }

  function exportImg() {
    const model = getModel()
    const layout = getLayout()
    exportGraphPng({
      nodes: model.nodes,
      edges: model.edges,
      byId: model.byId,
      theme,
      hl: currentHl,
      treeEdgeSet: layout.getTreeEdgeSet(),
      highlight: model.highlight.value,
      directed: model.directed.value,
      dialog,
      toast
    })
  }

  onMounted(async () => {
    const inter = getInter()
    readGraphTheme(theme)
    ctx = canvasRef.value.getContext('2d')
    await nextTick()
    resizeCanvas()
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(wrapRef.value)
    themeObserver = new MutationObserver(() => {
      readGraphTheme(theme)
      markHlDirty()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    canvasRef.value.addEventListener('wheel', inter.onWheel, { passive: false })
    window.addEventListener('mouseup', inter.onMouseUp)
    window.addEventListener('keydown', inter.onKeyDown)
    onReady?.({ w: canvasW, h: canvasH })
  })

  onBeforeUnmount(() => {
    const model = getModel()
    const layout = getLayout()
    const inter = getInter()
    layout.stopLayout()
    model.disposeTimers()
    resizeObserver?.disconnect()
    themeObserver?.disconnect()
    canvasRef.value?.removeEventListener('wheel', inter.onWheel)
    window.removeEventListener('mouseup', inter.onMouseUp)
    window.removeEventListener('keydown', inter.onKeyDown)
  })

  return {
    canvasRef,
    wrapRef,
    getCanvasSize: () => ({ w: canvasW, h: canvasH }),
    draw,
    requestDraw,
    invalidate,
    markHlDirty,
    exportImg
  }
}
