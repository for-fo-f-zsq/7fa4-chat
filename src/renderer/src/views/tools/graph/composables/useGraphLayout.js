import { ref, reactive } from 'vue'
import {
  DEFAULT_PHYSICS_PARAMS,
  stepVelocityVerlet,
  computePhysicsState
} from '../graphPhysics.js'

export function useGraphLayout({
  nodes,
  edges,
  byId,
  getCanvasSize,
  getDragNode,
  markDirty,
  invalidate,
  requestDraw,
  drawNow,
  onClearInteraction,
  onHintChange,
  defaultHint
}) {
  const locked = ref(false)
  const repulsion = ref(DEFAULT_PHYSICS_PARAMS.repulsion)
  const stiffness = ref(DEFAULT_PHYSICS_PARAMS.stiffness)
  const restLength = ref(DEFAULT_PHYSICS_PARAMS.restLength)
  const damping = ref(DEFAULT_PHYSICS_PARAMS.damping)
  const dt = ref(DEFAULT_PHYSICS_PARAMS.dt)
  const autoCenter = ref(false)
  const treeMode = ref(false)
  const view = reactive({ x: 0, y: 0, scale: 1 })
  const physicsStats = reactive({
    kineticEnergy: 0,
    springEnergy: 0,
    repulsionEnergy: 0,
    potentialEnergy: 0,
    totalEnergy: 0,
    momentumNorm: 0
  })

  let layoutRaf = null
  let treeEdgeSet = new Set()
  let treeRoot = null

  function currentParams() {
    return {
      repulsion: repulsion.value,
      stiffness: stiffness.value,
      restLength: restLength.value,
      damping: damping.value,
      dt: dt.value,
      softening: DEFAULT_PHYSICS_PARAMS.softening,
      repulsionScale: DEFAULT_PHYSICS_PARAMS.repulsionScale
    }
  }

  function refreshPhysicsStats() {
    const state = computePhysicsState(nodes, edges, currentParams())
    physicsStats.kineticEnergy = state.kineticEnergy
    physicsStats.springEnergy = state.springEnergy
    physicsStats.repulsionEnergy = state.repulsionEnergy
    physicsStats.potentialEnergy = state.potentialEnergy
    physicsStats.totalEnergy = state.totalEnergy
    physicsStats.momentumNorm = state.momentum.norm
    return state
  }

  function placeCircle() {
    const r = Math.max(140, Math.sqrt(Math.max(1, nodes.length)) * 80)
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2
      n.x = Math.cos(a) * r
      n.y = Math.sin(a) * r
      n.vx = 0
      n.vy = 0
    })
    refreshPhysicsStats()
  }

  function centerViewOnCom() {
    const { w: canvasW, h: canvasH } = getCanvasSize()
    if (!nodes.length) {
      view.x = canvasW / 2
      view.y = canvasH / 2
      requestDraw()
      return
    }
    const { centerOfMass } = computePhysicsState(nodes, edges, currentParams())
    view.x = canvasW / 2 - centerOfMass.x * view.scale
    view.y = canvasH / 2 - centerOfMass.y * view.scale
    requestDraw()
  }

  function fitView() {
    const { w: canvasW, h: canvasH } = getCanvasSize()
    if (!nodes.length) {
      view.x = canvasW / 2
      view.y = canvasH / 2
      view.scale = 1
      requestDraw()
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x > maxX) maxX = n.x
      if (n.y > maxY) maxY = n.y
    }
    const pad = 80
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    const s = Math.min(canvasW / (w + pad * 2), canvasH / (h + pad * 2))
    view.scale = Math.max(0.15, Math.min(2.5, s))
    view.x = canvasW / 2 - ((minX + maxX) / 2) * view.scale
    view.y = canvasH / 2 - ((minY + maxY) / 2) * view.scale
    requestDraw()
  }

  function zoomAt(sx, sy, factor) {
    const ns = Math.max(0.15, Math.min(5, view.scale * factor))
    const k = ns / view.scale
    view.x = sx - (sx - view.x) * k
    view.y = sy - (sy - view.y) * k
    view.scale = ns
    requestDraw()
  }

  function zoomIn() {
    const { w, h } = getCanvasSize()
    zoomAt(w / 2, h / 2, 1.25)
  }

  function zoomOut() {
    const { w, h } = getCanvasSize()
    zoomAt(w / 2, h / 2, 0.8)
  }

  function stopLayout() {
    if (layoutRaf) cancelAnimationFrame(layoutRaf)
    layoutRaf = null
  }

  function runLayout() {
    if (locked.value || !nodes.length) return
    stopLayout()
    const maxIter = 6000
    let iter = 0
    const step = () => {
      if (locked.value || !nodes.length) {
        stopLayout()
        return
      }
      const dragNode = getDragNode()
      const params = currentParams()
      const { maxSpeed, maxForce } = stepVelocityVerlet(nodes, edges, params, {
        pinnedNode: dragNode
      })
      const state = refreshPhysicsStats()

      if (autoCenter.value && !dragNode) {
        const { w: canvasW, h: canvasH } = getCanvasSize()
        view.x = canvasW / 2 - state.centerOfMass.x * view.scale
        view.y = canvasH / 2 - state.centerOfMass.y * view.scale
      }

      iter++
      drawNow()

      const settled = params.damping > 0 && iter > 12 && maxSpeed < 0.08 && maxForce < 0.15
      if (settled) {
        for (const n of nodes) {
          n.vx = 0
          n.vy = 0
        }
        refreshPhysicsStats()
        stopLayout()
        return
      }
      if (iter < maxIter || params.damping === 0) {
        layoutRaf = requestAnimationFrame(step)
      } else {
        stopLayout()
      }
    }
    layoutRaf = requestAnimationFrame(step)
  }

  function toggleLock() {
    locked.value = !locked.value
    if (locked.value) stopLayout()
    else runLayout()
  }

  function restartLayout() {
    if (locked.value) return
    markDirty()
    placeCircle()
    fitView()
    runLayout()
  }

  function onForceChange() {
    refreshPhysicsStats()
    if (locked.value || !nodes.length) return
    runLayout()
  }

  function resetPhysics() {
    repulsion.value = DEFAULT_PHYSICS_PARAMS.repulsion
    stiffness.value = DEFAULT_PHYSICS_PARAMS.stiffness
    restLength.value = DEFAULT_PHYSICS_PARAMS.restLength
    damping.value = DEFAULT_PHYSICS_PARAMS.damping
    dt.value = DEFAULT_PHYSICS_PARAMS.dt
    onForceChange()
  }

  function clearTreeState() {
    treeMode.value = false
    treeEdgeSet = new Set()
    treeRoot = null
  }

  function toggleTreeMode() {
    treeMode.value = !treeMode.value
    if (treeMode.value) {
      onHintChange('树形布局：点击一个节点作为根，将按 DFS 树边分层排布（点击本按钮可取消）')
      onClearInteraction?.()
    } else {
      treeEdgeSet = new Set()
      treeRoot = null
      onHintChange(defaultHint())
      invalidate()
    }
  }

  function treeLayout(rootId) {
    const root = byId(rootId)
    if (!root) return
    const parent = new Map()
    const treeChildren = new Map()
    const depth = new Map()
    const visited = new Set([rootId])
    depth.set(rootId, 0)
    const st = [[rootId, 0]]
    while (st.length) {
      const [u, d] = st.pop()
      for (const e of edges) {
        let v = null
        if (e.u === u) v = e.v
        else if (e.v === u) v = e.u
        if (v == null || visited.has(v)) continue
        visited.add(v)
        parent.set(v, u)
        depth.set(v, d + 1)
        if (!treeChildren.has(u)) treeChildren.set(u, [])
        treeChildren.get(u).push(v)
        st.push([v, d + 1])
      }
    }
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        visited.add(n.id)
        depth.set(n.id, 0)
      }
    }
    const x = new Map()
    let leaf = 0
    const XGAP = 60
    const post = (node) => {
      const ch = treeChildren.get(node) || []
      if (!ch.length) {
        x.set(node, leaf * XGAP)
        leaf++
        return
      }
      for (const c of ch) post(c)
      const xs = ch.map((c) => x.get(c))
      x.set(node, (Math.min(...xs) + Math.max(...xs)) / 2)
    }
    post(rootId)
    for (const n of nodes) if (!parent.has(n.id) && n.id !== rootId) post(n.id)
    const rootX = x.get(rootId) ?? 0
    const LAYER_H = 110
    for (const n of nodes) {
      const d = depth.get(n.id) ?? 0
      n.x = (x.get(n.id) ?? 0) - rootX
      n.y = d * LAYER_H
      n.vx = 0
      n.vy = 0
    }
    treeEdgeSet = new Set()
    for (const [child, par] of parent) {
      for (const e of edges) {
        if ((e.u === par && e.v === child) || (e.u === child && e.v === par)) {
          treeEdgeSet.add(e)
          break
        }
      }
    }
    treeRoot = rootId
    refreshPhysicsStats()
  }

  return {
    locked,
    repulsion,
    stiffness,
    restLength,
    damping,
    dt,
    autoCenter,
    physicsStats,
    treeMode,
    view,
    getTreeEdgeSet: () => treeEdgeSet,
    getTreeRoot: () => treeRoot,
    clearTreeState,
    placeCircle,
    centerViewOnCom,
    fitView,
    zoomAt,
    zoomIn,
    zoomOut,
    stopLayout,
    runLayout,
    toggleLock,
    restartLayout,
    onForceChange,
    resetPhysics,
    refreshPhysicsStats,
    toggleTreeMode,
    treeLayout
  }
}
