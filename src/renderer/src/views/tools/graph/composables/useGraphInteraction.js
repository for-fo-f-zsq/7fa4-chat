import { ref, reactive } from 'vue'
import { NODE_R, GRAPH_HINTS } from '../graphConstants.js'
import { edgeGeometry } from '../graphRenderer.js'

export function useGraphInteraction({
  mode,
  nodes,
  edges,
  byId,
  view,
  treeMode,
  locked,
  dirty,
  getCanvasEl,
  addNodeAt,
  addEdge,
  deleteNode,
  deleteEdge,
  updateNodeWeight,
  updateEdgeWeight,
  updateEdgePhysics,
  treeLayout,
  fitView,
  stopLayout,
  runLayout,
  zoomAt,
  markDirty,
  invalidate,
  requestDraw,
  onTreeFinish,
  onSave,
  toast
}) {
  const inlineEdit = ref(null)

  const interaction = reactive({
    hoverNode: null,
    hoverEdge: null,
    selected: null,
    edgeStart: null,
    dragNode: null,
    mouseWorld: null
  })

  let dragOffset = { x: 0, y: 0 }
  let dragMoved = false
  let dragStartWorld = null
  let panning = false
  let panLast = { x: 0, y: 0 }

  function canvasPos(e) {
    const rect = getCanvasEl().getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }

  function toWorld(sx, sy) {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale }
  }

  function hitNode(w) {
    const r = NODE_R + 6 / view.scale
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (Math.hypot(w.x - n.x, w.y - n.y) <= r) return n
    }
    return null
  }

  function distToSeg(p, a, b) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    if (!l2) return Math.hypot(p.x - a.x, p.y - a.y)
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }

  function hitEdge(w) {
    const tol = 7 / view.scale
    let best = null
    let bestD = Infinity
    for (const e of edges) {
      const g = edgeGeometry(e, edges, byId)
      if (!g) continue
      let prev = null
      const pts = 10
      for (let i = 0; i <= pts; i++) {
        const t = i / pts
        const x = (1 - t) * (1 - t) * g.a.x + 2 * (1 - t) * t * g.cx + t * t * g.b.x
        const y = (1 - t) * (1 - t) * g.a.y + 2 * (1 - t) * t * g.cy + t * t * g.b.y
        const p = { x, y }
        if (prev) {
          const d = distToSeg(w, prev, p)
          if (d < bestD) {
            bestD = d
            best = e
          }
        }
        prev = p
      }
    }
    return bestD <= tol ? best : null
  }

  function clearForTarget(target) {
    if (target == null) {
      interaction.selected = null
      interaction.edgeStart = null
      interaction.dragNode = null
      interaction.hoverNode = null
      interaction.hoverEdge = null
      inlineEdit.value = null
      return
    }
    if (interaction.selected === target) interaction.selected = null
    if (interaction.edgeStart === target) interaction.edgeStart = null
    if (interaction.hoverNode === target) interaction.hoverNode = null
    if (interaction.hoverEdge === target) interaction.hoverEdge = null
    if (inlineEdit.value?.target === target) inlineEdit.value = null
  }

  function onDoubleClick(e) {
    if (e.button !== 0) return
    const { sx, sy } = canvasPos(e)
    const w = toWorld(sx, sy)
    const n = hitNode(w)
    if (n) {
      inlineEdit.value = {
        type: 'node',
        target: n,
        text: n.weight == null ? '' : String(n.weight)
      }
      return
    }
    const ed = hitEdge(w)
    if (ed) {
      inlineEdit.value = {
        type: 'edge',
        target: ed,
        text: ed.w == null ? '' : String(ed.w),
        restLength: ed.restLength == null ? '' : String(ed.restLength),
        stiffness: ed.stiffness == null ? '' : String(ed.stiffness)
      }
      return
    }
  }

  function commitInlineEdit(payload) {
    if (!inlineEdit.value) return
    const current = inlineEdit.value
    const isObj = payload && typeof payload === 'object'
    const newVal = isObj ? payload.text : payload
    if (current.type === 'node') {
      const res = updateNodeWeight?.(current.target, newVal)
      if (res && !res.ok) {
        toast?.showToast?.(res.error || '点权须为数字', 'warn', 1600)
        return
      }
      toast?.showToast?.('已更新节点点权', 'success', 1200)
    } else if (current.type === 'edge') {
      updateEdgeWeight?.(current.target, newVal)
      if (isObj && (payload.restLength !== undefined || payload.stiffness !== undefined)) {
        updateEdgePhysics?.(current.target, {
          restLength: payload.restLength,
          stiffness: payload.stiffness
        })
      }
      toast?.showToast?.('已更新边属性', 'success', 1200)
    }
    inlineEdit.value = null
  }

  function cancelInlineEdit() {
    inlineEdit.value = null
  }

  function onMouseDown(e) {
    const { sx, sy } = canvasPos(e)
    if (e.button === 2 || e.button === 1) {
      panning = true
      panLast = { x: sx, y: sy }
      e.preventDefault()
      return
    }
    if (e.button !== 0) return
    const w = toWorld(sx, sy)
    const n = hitNode(w)
    const ed = hitEdge(w)
    if (mode.value === 'delete') {
      if (n) deleteNode(n)
      else if (ed) deleteEdge(ed)
      return
    }
    if (treeMode.value) {
      if (n) {
        treeLayout(n.id)
        fitView()
        stopLayout()
        locked.value = true
        treeMode.value = false
        onTreeFinish(GRAPH_HINTS[mode.value])
        invalidate()
      }
      return
    }
    if (n) {
      if (mode.value === 'edge') {
        if (interaction.edgeStart) {
          if (interaction.edgeStart !== n) addEdge(interaction.edgeStart.id, n.id)
          interaction.edgeStart = null
        } else {
          interaction.edgeStart = n
        }
        interaction.selected = n
        invalidate()
        return
      }
      interaction.selected = n
      interaction.dragNode = n
      dragOffset = { x: w.x - n.x, y: w.y - n.y }
      dragMoved = false
      dragStartWorld = { x: w.x, y: w.y }
      invalidate()
      return
    }
    if (ed && (mode.value === 'select' || mode.value === 'edit')) {
      interaction.selected = ed
      invalidate()
      return
    }
    if (mode.value === 'edit' || mode.value === 'node') {
      interaction.selected = addNodeAt(w.x, w.y)
    } else if (mode.value === 'edge') {
      interaction.edgeStart = null
      invalidate()
    } else {
      interaction.selected = null
      invalidate()
    }
  }

  function onMouseMove(e) {
    const { sx, sy } = canvasPos(e)
    interaction.mouseWorld = toWorld(sx, sy)
    if (panning) {
      view.x += sx - panLast.x
      view.y += sy - panLast.y
      panLast = { x: sx, y: sy }
      requestDraw()
      return
    }
    if (interaction.dragNode) {
      if (!dragMoved) {
        const dx = interaction.mouseWorld.x - dragStartWorld.x
        const dy = interaction.mouseWorld.y - dragStartWorld.y
        if (dx * dx + dy * dy > 100) dragMoved = true
      }
      interaction.dragNode.x = interaction.mouseWorld.x - dragOffset.x
      interaction.dragNode.y = interaction.mouseWorld.y - dragOffset.y
      interaction.dragNode.vx = 0
      interaction.dragNode.vy = 0
      requestDraw()
      return
    }
    interaction.hoverNode = hitNode(interaction.mouseWorld)
    interaction.hoverEdge = interaction.hoverNode ? null : hitEdge(interaction.mouseWorld)
    const cv = getCanvasEl()
    if (cv) cv.style.cursor = interaction.hoverNode || interaction.hoverEdge ? 'pointer' : 'crosshair'
    requestDraw()
  }

  function onMouseUp(e) {
    if (e.button === 2 || e.button === 1) {
      panning = false
      return
    }
    if (interaction.dragNode) {
      const from = interaction.dragNode
      interaction.dragNode = null
      if (dragMoved) {
        markDirty()
        const target = interaction.mouseWorld ? hitNode(interaction.mouseWorld) : null
        if (target && target !== from && mode.value === 'edit') {
          addEdge(from.id, target.id)
        }
      }
      invalidate()
      if (!locked.value) runLayout()
    }
  }

  function onMouseLeave() {
    interaction.hoverNode = null
    interaction.hoverEdge = null
    interaction.mouseWorld = null
    requestDraw()
  }

  function onWheel(e) {
    e.preventDefault()
    const { sx, sy } = canvasPos(e)
    const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.02 : 0.0016))
    zoomAt(sx, sy, f)
  }

  function onKeyDown(e) {
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (!dirty.value) {
        toast.showToast('没有需要保存的改动', 'info', 1800)
        return
      }
      Promise.resolve(onSave()).catch(() => {})
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (interaction.selected) {
        e.preventDefault()
        if (interaction.selected.type === 'node') deleteNode(interaction.selected)
        else deleteEdge(interaction.selected)
      }
    } else if (e.key === 'Escape') {
      if (inlineEdit.value) {
        cancelInlineEdit()
        return
      }
      if (interaction.edgeStart) {
        interaction.edgeStart = null
        invalidate()
      } else if (interaction.selected) {
        interaction.selected = null
        invalidate()
      }
    }
  }

  return {
    interaction,
    inlineEdit,
    clearForTarget,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onWheel,
    onKeyDown,
    onDoubleClick,
    commitInlineEdit,
    cancelInlineEdit
  }
}
