import { ref, reactive } from 'vue'
import { EXAMPLE_EDGES } from '../graphConstants.js'
import { useToolFile, b64ToText, textToBase64 } from '../../shared/useToolFile.js'
import {
  parseNodeWeight,
  isValidNodeWeightInput,
  migrateLegacyNodeWeight,
  parseNodeWeightsLines,
  formatNodeWeightsLines
} from '../graphWeights.js'

const GRAPH_FILE_VERSION = 2

export function useGraphModel({
  dialog,
  toast,
  onDirtyChange,
  getCanvasSize,
  onResetLayout,
  onInvalidate,
  onRequestDraw,
  onAfterParseLayout,
  onResetView,
  onClearInteraction,
  onSyncView
}) {
  const nodes = reactive([])
  const edges = reactive([])
  let nextNodeId = 1

  const directed = ref(false)
  const highlight = ref('none')
  const inputText = ref('')
  const weightsText = ref('')
  const offset = ref(1)
  const info = ref('')
  /** 结构化算法分析结果：{ status, summary, metrics, lists } */
  const analysis = ref({ status: 'info', summary: '', metrics: [], lists: [] })
  const randN = ref(8)
  const randM = ref(10)
  const randWeighted = ref(false)
  const randMode = ref('graph')
  const algoSrc = ref(1)
  const algoSink = ref(0)

  let parseTimer = null
  let weightsTimer = null

  const {
    fileName,
    savedName,
    savedPath,
    dirty,
    saveState,
    setSuppressDirty,
    markDirty,
    markClean,
    setSavedMeta,
    saveBase64File
  } = useToolFile({
    defaultName: 'graph.json',
    onDirtyChange
  })

  function byId(id) {
    for (const n of nodes) if (n.id === id) return n
    return null
  }

  function edgesText() {
    const off = offset.value === 0 ? -1 : 0
    const lines = []
    const incident = new Set()
    for (const e of edges) {
      incident.add(e.u)
      incident.add(e.v)
      lines.push(`${e.u + off} ${e.v + off}${e.w != null && e.w !== '' ? ' ' + e.w : ''}`)
    }
    for (const n of nodes) {
      if (!incident.has(n.id)) lines.push(String(n.id + off))
    }
    return lines.join('\n')
  }

  function weightsTextFromGraph() {
    return formatNodeWeightsLines(nodes, byId)
  }

  function syncInputFromGraph() {
    inputText.value = edgesText()
    weightsText.value = weightsTextFromGraph()
  }

  function addNodeAt(wx, wy) {
    const n = {
      type: 'node',
      id: nextNodeId++,
      x: wx,
      y: wy,
      weight: null,
      vx: 0,
      vy: 0,
      fixed: false,
      color: null
    }
    nodes.push(n)
    markDirty()
    syncInputFromGraph()
    onInvalidate()
    return n
  }

  function addEdge(u, v) {
    if (u === v) return null
    const e = { type: 'edge', u, v, w: null, restLength: null, stiffness: null }
    edges.push(e)
    markDirty()
    syncInputFromGraph()
    return e
  }

  function deleteNode(n) {
    const id = n.id
    for (let i = edges.length - 1; i >= 0; i--) {
      if (edges[i].u === id || edges[i].v === id) edges.splice(i, 1)
    }
    const idx = nodes.indexOf(n)
    if (idx >= 0) nodes.splice(idx, 1)
    onClearInteraction?.(n)
    markDirty()
    syncInputFromGraph()
    onInvalidate()
  }

  function deleteEdge(e) {
    const idx = edges.indexOf(e)
    if (idx >= 0) edges.splice(idx, 1)
    onClearInteraction?.(e)
    markDirty()
    syncInputFromGraph()
    onInvalidate()
  }

  function updateNodeWeight(target, newWeight) {
    const n = typeof target === 'object' ? target : byId(target)
    if (!n) return { ok: false, error: '节点不存在' }
    if (!isValidNodeWeightInput(newWeight)) {
      return { ok: false, error: '点权须为数字（或留空 / _ 清除）' }
    }
    n.weight = parseNodeWeight(newWeight)
    markDirty()
    syncInputFromGraph()
    onInvalidate()
    return { ok: true, weight: n.weight }
  }

  function updateEdgeWeight(edge, newWeight) {
    if (!edge) return
    const trimmed = String(newWeight ?? '').trim()
    edge.w = trimmed === '' ? null : (isNaN(Number(trimmed)) ? trimmed : Number(trimmed))
    markDirty()
    syncInputFromGraph()
    onInvalidate()
  }

  function updateEdgePhysics(edge, { restLength, stiffness } = {}) {
    if (!edge) return
    if (restLength !== undefined) {
      const s = String(restLength ?? '').trim()
      const val = s === '' ? null : Number(s)
      edge.restLength = val != null && Number.isFinite(val) && val > 0 ? val : null
    }
    if (stiffness !== undefined) {
      const s = String(stiffness ?? '').trim()
      const val = s === '' ? null : Number(s)
      edge.stiffness = val != null && Number.isFinite(val) && val >= 0 ? val : null
    }
    markDirty()
    onInvalidate()
  }

  function clearGraph(syncInput = true) {
    nodes.length = 0
    edges.length = 0
    nextNodeId = 1
    markDirty()
    onClearInteraction?.(null)
    onResetLayout?.()
    const { w, h } = getCanvasSize()
    onResetView?.(w / 2, h / 2, 1)
    if (syncInput) syncInputFromGraph()
    onInvalidate()
    onRequestDraw()
  }

  function clearInput() {
    inputText.value = ''
    weightsText.value = ''
    clearGraph()
  }

  function onInputText(value) {
    inputText.value = value
    clearTimeout(parseTimer)
    parseTimer = setTimeout(() => parseInput(true, true), 450)
  }

  function onInputWeights(value) {
    weightsText.value = value
    clearTimeout(weightsTimer)
    weightsTimer = setTimeout(applyWeightsLive, 300)
  }

  function applyWeightsLive() {
    const map = parseNodeWeightsLines(weightsText.value)
    for (const n of nodes) {
      n.weight = map.has(n.id) ? map.get(n.id) : null
    }
    markDirty()
    onInvalidate()
  }

  function toId(token) {
    const n = parseInt(token, 10)
    if (isNaN(n)) return null
    return n - offset.value + 1
  }

  function chunk(arr, size) {
    const out = []
    for (let i = 0; i + 1 < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  function parseInput(preserve = false, silent = false) {
    const text = inputText.value.trim()
    if (!text) {
      if (silent) {
        clearGraph(false)
        return
      }
      dialog.alert('请输入边列表')
      return
    }
    const pairs = []
    let maxId = 0
    let failed = false

    const pushPair = (u, v, w) => {
      if (u == null || v == null) return
      pairs.push([u, v, w])
      maxId = Math.max(maxId, u, v)
    }

    if (text.startsWith('[')) {
      let arr = null
      try { arr = JSON.parse(text) } catch { failed = true }
      if (!failed) {
        if (!Array.isArray(arr) || !arr.length) failed = true
        else {
          const rows = Array.isArray(arr[0]) ? arr : chunk(arr, 2)
          for (const row of rows) {
            pushPair(toId(row[0]), toId(row[1]), row.length > 2 ? String(row[2]) : null)
          }
        }
      }
    } else {
      for (const line of text.split(/\r?\n/)) {
        const s = line.trim()
        if (!s || s.startsWith('#')) continue
        const tok = s.split(/\s+/)
        if (tok.length === 1) {
          const id = toId(tok[0])
          if (id != null) maxId = Math.max(maxId, id)
        } else {
          pushPair(toId(tok[0]), toId(tok[1]), tok.length > 2 ? tok.slice(2).join(' ') : null)
        }
      }
    }

    if (failed) {
      if (silent) info.value = '输入格式有误，未更新图'
      else dialog.alert('输入无法解析，请检查格式')
      return
    }
    if (!maxId) {
      if (!silent) dialog.alert('没有解析到任何节点')
      return
    }
    if (maxId > 600) {
      if (silent) info.value = '节点数过多，未更新图'
      else dialog.alert(`节点数过多（${maxId}），超过 600 上限`)
      return
    }

    const oldPos = new Map()
    const oldEdgeProps = new Map()
    if (preserve) {
      for (const n of nodes) oldPos.set(n.id, { x: n.x, y: n.y, weight: n.weight })
      for (const e of edges) {
        if (e.restLength != null || e.stiffness != null) {
          const key = `${e.u}|${e.v}`
          if (!oldEdgeProps.has(key)) oldEdgeProps.set(key, [])
          oldEdgeProps.get(key).push({ restLength: e.restLength, stiffness: e.stiffness })
        }
      }
    }

    clearGraph(false)
    let hadNew = false
    for (let i = 1; i <= maxId; i++) {
      const old = oldPos.get(i)
      nodes.push({
        type: 'node',
        id: i,
        x: old ? old.x : 0,
        y: old ? old.y : 0,
        weight: old ? (old.weight ?? null) : null,
        vx: 0,
        vy: 0,
        fixed: false,
        color: null
      })
      if (!old) hadNew = true
    }
    nextNodeId = maxId + 1

    if (weightsText.value.trim()) {
      const weightMap = parseNodeWeightsLines(weightsText.value)
      for (const n of nodes) {
        n.weight = weightMap.has(n.id) ? weightMap.get(n.id) : null
      }
    }

    for (const [u, v, w] of pairs) {
      const key = `${u}|${v}`
      const savedList = oldEdgeProps.get(key)
      const saved = savedList && savedList.length ? savedList.shift() : null
      edges.push({
        type: 'edge',
        u,
        v,
        w,
        restLength: saved ? saved.restLength : null,
        stiffness: saved ? saved.stiffness : null
      })
    }

    if (preserve && hadNew) {
      let cx = 0
      let cy = 0
      let cnt = 0
      for (const n of nodes) if (oldPos.has(n.id)) { cx += n.x; cy += n.y; cnt++ }
      if (cnt) { cx /= cnt; cy /= cnt }
      let k = 0
      for (const n of nodes) {
        if (!oldPos.has(n.id)) {
          const a = (k / Math.max(1, nodes.length - cnt)) * Math.PI * 2
          n.x = cx + Math.cos(a) * 90
          n.y = cy + Math.sin(a) * 90
          k++
        }
      }
      onAfterParseLayout?.(true)
    } else if (!preserve) {
      onAfterParseLayout?.(false)
    }
    onInvalidate()
    markDirty()
  }

  function randomGraph() {
    const n = Math.max(1, Math.min(200, Math.round(randN.value) || 1))
    clearGraph()
    for (let i = 1; i <= n; i++) {
      nodes.push({ type: 'node', id: i, x: 0, y: 0, weight: null, vx: 0, vy: 0, fixed: false, color: null })
    }
    nextNodeId = n + 1
    const w = () => (randWeighted.value ? String(1 + Math.floor(Math.random() * 9)) : null)
    const mkEdge = (u, v) => ({ type: 'edge', u, v, w: w(), restLength: null, stiffness: null })
    if (randMode.value === 'tree') {
      for (let i = 2; i <= n; i++) {
        const p = 1 + Math.floor(Math.random() * (i - 1))
        edges.push(mkEdge(p, i))
      }
    } else if (randMode.value === 'bipartite') {
      const half = Math.max(1, Math.floor(n / 2))
      const right = n - half
      const target = Math.max(0, Math.min(half * right, Math.round(randM.value) || 0))
      const used = new Set()
      let guard = 0
      while (edges.length < target && guard++ < 3000) {
        const u = 1 + Math.floor(Math.random() * half)
        const v = half + 1 + Math.floor(Math.random() * right)
        const key = `${u}|${v}`
        if (!used.has(key)) {
          used.add(key)
          edges.push(mkEdge(u, v))
        }
      }
    } else {
      const target = Math.max(0, Math.min(n * (n - 1), Math.round(randM.value) || 0))
      let guard = 0
      while (edges.length < target && guard++ < 5000) {
        const u = 1 + Math.floor(Math.random() * n)
        const v = 1 + Math.floor(Math.random() * n)
        if (u !== v) edges.push(mkEdge(u, v))
      }
    }
    syncInputFromGraph()
    onAfterParseLayout?.(false)
    onInvalidate()
    markDirty()
  }

  function loadExample() {
    inputText.value = EXAMPLE_EDGES
    weightsText.value = ''
    offset.value = 1
    parseInput()
  }

  function graphSnapshot(view) {
    return {
      v: GRAPH_FILE_VERSION,
      app: '7fa4-chat/graph-editor',
      offset: offset.value,
      directed: directed.value,
      view: { x: view.x, y: view.y, scale: view.scale },
      nodes: nodes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        ...(n.weight != null ? { weight: n.weight } : {})
      })),
      edges: edges.map((e) => ({
        u: e.u,
        v: e.v,
        w: e.w,
        ...(e.restLength != null ? { restLength: e.restLength } : {}),
        ...(e.stiffness != null ? { stiffness: e.stiffness } : {})
      }))
    }
  }

  async function save(view) {
    if (!nodes.length) {
      await dialog.alert('画布为空，无可保存的图')
      return
    }
    const json = JSON.stringify(graphSnapshot(view), null, 2)
    const name = (fileName.value && fileName.value.trim()) || 'graph.json'
    await saveBase64File({
      base64: textToBase64(json),
      name,
      mime: 'application/json'
    })
  }

  async function openFile() {
    if (dirty.value) {
      const ok = await dialog.confirm('当前图未保存，载入文件将丢弃现有内容，确定继续？')
      if (!ok) return
    }
    let r = null
    try {
      r = await window.api.selectFile()
    } catch {
      await dialog.alert('打开失败：无法选择文件')
      return
    }
    if (!r || !r.success || !r.data) return
    let data = null
    try {
      data = JSON.parse(b64ToText(r.data))
    } catch {
      await dialog.alert('打开失败：文件不是有效的 JSON')
      return
    }
    if (!data || !Array.isArray(data.nodes)) {
      await dialog.alert('打开失败：文件不是图编辑器保存的格式')
      return
    }
    const cleanNodes = []
    const seen = new Set()
    for (const raw of data.nodes) {
      const id = Number(raw && raw.id)
      if (!Number.isInteger(id) || id < 1 || id > 600 || seen.has(id)) continue
      seen.add(id)
      cleanNodes.push({
        type: 'node',
        id,
        x: Number(raw.x) || 0,
        y: Number(raw.y) || 0,
        weight: migrateLegacyNodeWeight(raw, id),
        vx: 0,
        vy: 0,
        fixed: false,
        color: null
      })
    }
    if (!cleanNodes.length) {
      await dialog.alert('打开失败：文件里没有有效节点')
      return
    }
    const cleanEdges = []
    for (const raw of (Array.isArray(data.edges) ? data.edges : [])) {
      const u = Number(raw && raw.u)
      const v = Number(raw && raw.v)
      if (!seen.has(u) || !seen.has(v) || u === v) continue
      const rl = raw.restLength != null && Number.isFinite(Number(raw.restLength)) && Number(raw.restLength) > 0
        ? Number(raw.restLength)
        : null
      const st = raw.stiffness != null && Number.isFinite(Number(raw.stiffness)) && Number(raw.stiffness) >= 0
        ? Number(raw.stiffness)
        : null
      cleanEdges.push({
        type: 'edge',
        u,
        v,
        w: raw.w == null || raw.w === '' ? null : String(raw.w),
        restLength: rl,
        stiffness: st
      })
      if (cleanEdges.length >= 2000) break
    }
    nodes.length = 0
    edges.length = 0
    for (const n of cleanNodes) nodes.push(n)
    for (const e of cleanEdges) edges.push(e)
    nextNodeId = cleanNodes.reduce((m, n) => Math.max(m, n.id), 0) + 1
    offset.value = data.offset === 0 ? 0 : 1
    directed.value = data.directed === true
    onResetLayout?.()
    onClearInteraction?.(null)
    onSyncView?.(data.view)
    syncInputFromGraph()
    onInvalidate()
    onRequestDraw()
    setSavedMeta({ name: r.name || 'graph.json', path: r.path || '' })
    toast.showToast('已载入 ' + (r.name || '文件'), 'info', 1800)
  }

  function disposeTimers() {
    clearTimeout(parseTimer)
    clearTimeout(weightsTimer)
  }

  return {
    nodes,
    edges,
    directed,
    highlight,
    inputText,
    weightsText,
    offset,
    info,
    analysis,
    randN,
    randM,
    randWeighted,
    randMode,
    algoSrc,
    algoSink,
    savedName,
    savedPath,
    dirty,
    saveState,
    setSuppressDirty,
    markDirty,
    markClean,
    byId,
    addNodeAt,
    addEdge,
    deleteNode,
    deleteEdge,
    updateNodeWeight,
    updateEdgeWeight,
    updateEdgePhysics,
    syncInputFromGraph,
    clearGraph,
    clearInput,
    onInputText,
    onInputWeights,
    parseInput,
    randomGraph,
    loadExample,
    save,
    openFile,
    disposeTimers
  }
}
