import * as algos from './graphAlgos.js'
import { NODE_R, GRAPH_PALETTE, GRAPH_PALETTE_LIGHT, GRAPH_PALETTE_DARK } from './graphConstants.js'

/** 读取主题语义 CSS 令牌，供 Canvas2D 渲染与 PNG 导出使用 */
export function readGraphTheme(target) {
  const cs = getComputedStyle(document.documentElement)
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback
  const isDark = document.documentElement.classList.contains('dark') ||
                 document.documentElement.getAttribute('data-theme')?.includes('dark') ||
                 v('--is-dark', '').trim() === 'true' ||
                 (cs.getPropertyValue('color-scheme').trim() === 'dark')

  target.isDark = isDark
  target.bg = v('--surface-0', isDark ? '#141619' : '#ffffff')
  target.nodeFill = v('--surface-raised', isDark ? '#23272e' : '#f2f3f5')
  target.nodeFillHalo = isDark ? 'rgba(35, 39, 46, 0.92)' : 'rgba(255, 255, 255, 0.92)'
  target.nodeStroke = v('--line-strong', isDark ? '#474d58' : '#8a8f99')
  target.text = v('--fg', isDark ? '#f0f2f5' : '#1f2329')
  target.accent = v('--brand', '#3c8ce7')
  target.edge = v('--line-strong', isDark ? '#4b5260' : '#8a8f99')
  target.danger = v('--status-danger', isDark ? '#f87171' : '#e5484d')
  target.success = v('--status-success', isDark ? '#4ade80' : '#16a34a')
  target.weightColor = v('--status-warning', isDark ? '#fbbf24' : '#d97706')
  target.gridDot = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.11)'
}

export function createEmptyHighlight() {
  return {
    compColors: new Map(),
    bridgeSet: new Set(),
    cutSet: new Set(),
    mstSet: new Set(),
    bipartSide: new Map(),
    spDist: new Map(),
    spTree: new Set(),
    topoOrder: new Map(),
    diaEdges: new Set(),
    diaNodes: new Set(),
    centSet: new Set(),
    matchEdges: new Set(),
    matchNodes: new Set(),
    flowUsed: new Map(),
    flowSrc: null,
    flowSink: null,
    eulerOrder: new Map()
  }
}

/**
 * 计算高亮状态与结构化分析结果。
 * @returns {{ hl: object, analysisDetail: string, analysis: {
 *   status: 'ok'|'warn'|'error'|'info', summary: string,
 *   metrics: Array<{ label: string, value: string }>,
 *   lists: Array<{ label: string, items: string[] }>
 * } }}
 */
export function computeHighlightState({ nodes, edges, highlight, directed, algoSrc, algoSink, byId, isDark = false }) {
  const hl = createEmptyHighlight()
  const analysis = { status: 'info', summary: '', metrics: [], lists: [] }
  if (!nodes.length) {
    analysis.status = 'warn'
    analysis.summary = '画布为空，请先输入边列表或生成随机图'
    return { hl, analysisDetail: analysis.summary, analysis }
  }

  const palette = isDark ? GRAPH_PALETTE_DARK : (GRAPH_PALETTE_LIGHT || GRAPH_PALETTE)
  const nodeName = (id) => String(id)
  const edgeName = (e) => {
    const w = algos.numericWeight(e)
    return `${nodeName(e.u)} — ${nodeName(e.v)}${w == null ? '' : ' · w=' + fmtNum(w)}`
  }
  const byNumeric = (a, b) => a - b
  const setStatus = (status, summary) => {
    analysis.status = status
    analysis.summary = summary
  }

  if (highlight === 'components') {
    const comp = directed ? algos.scc(nodes, edges) : algos.components(nodes, edges, false)
    const groups = new Map()
    for (const n of nodes) {
      const c = comp.get(n.id)
      if (c == null) continue
      if (!groups.has(c)) groups.set(c, [])
      groups.get(c).push(n.id)
    }
    const unique = groups.size
    const colorOf = new Map()
    let ci = 0
    for (const n of nodes) {
      const c = comp.get(n.id)
      if (c == null) continue
      if (!colorOf.has(c)) colorOf.set(c, palette[ci++ % palette.length])
      hl.compColors.set(n.id, colorOf.get(c))
    }
    const ordered = [...groups.values()].sort((a, b) => b.length - a.length)
    setStatus('ok', `共 ${unique} 个${directed ? '强连通' : '连通'}分量`)
    analysis.metrics = [
      { label: '分量数', value: String(unique) },
      { label: '最大分量', value: `${ordered[0] ? ordered[0].length : 0} 个节点` }
    ]
    analysis.lists = [{
      label: '每个分量的节点',
      items: ordered.map((g, i) => `C${i + 1}（${g.length}）：${g.slice().sort(byNumeric).map(nodeName).join(', ')}`)
    }]
  } else if (highlight === 'bridges') {
    if (directed) {
      setStatus('warn', '桥与割点仅支持无向图')
    } else {
      const { bridges, cuts } = algos.bridgesCuts(nodes, edges)
      hl.bridgeSet = bridges
      hl.cutSet = cuts
      setStatus(bridges.size ? 'ok' : 'info', `${bridges.size} 条桥 · ${cuts.size} 个割点`)
      analysis.metrics = [
        { label: '桥', value: `${bridges.size} 条` },
        { label: '割点', value: `${cuts.size} 个` }
      ]
      analysis.lists = [
        { label: '桥（删除后图不连通）', items: [...bridges].map(edgeName) },
        { label: '割点（删除后分量增多）', items: [...cuts].sort(byNumeric).map(nodeName) }
      ]
      if (!bridges.size && !cuts.size) {
        analysis.lists = [{ label: '结论', items: ['图中没有桥，也没有割点（边双连通）'] }]
      }
    }
  } else if (highlight === 'mst') {
    if (directed) {
      setStatus('warn', 'MST 仅支持无向图')
    } else {
      const res = algos.mst(nodes, edges)
      if (res === null) {
        setStatus('error', '存在非数字权重，无法计算 MST')
      } else {
        hl.mstSet = res
        const comps = algos.components(nodes, edges, false)
        const compCount = new Set(comps.values()).size
        const covered = new Set()
        let total = 0
        for (const e of res) {
          covered.add(e.u)
          covered.add(e.v)
          total += algos.numericWeight(e) || 0
        }
        const forest = compCount > 1
        setStatus(forest ? 'warn' : 'ok', `MST 共 ${res.size} 条边${forest ? `（森林，${compCount} 个连通分量）` : ''}`)
        analysis.metrics = [
          { label: '边数', value: String(res.size) },
          { label: '总权重', value: fmtNum(Math.round(total * 100) / 100) },
          { label: '覆盖节点', value: `${covered.size}/${nodes.length}` }
        ]
        analysis.lists = [{
          label: 'MST 边集（按权重升序）',
          items: [...res]
            .sort((a, b) => (algos.numericWeight(a) || 0) - (algos.numericWeight(b) || 0))
            .map(edgeName)
        }]
      }
    }
  } else if (highlight === 'bipartite') {
    const side = algos.bipartite(nodes, edges)
    if (!side) {
      setStatus('error', '不是二分图（存在奇环）')
    } else {
      hl.bipartSide = side
      const left = []
      const right = []
      for (const n of nodes) {
        if (side.get(n.id) === 0) left.push(n.id)
        else if (side.get(n.id) === 1) right.push(n.id)
      }
      setStatus('ok', '是二分图')
      analysis.metrics = [
        { label: '左部', value: `${left.length} 个节点` },
        { label: '右部', value: `${right.length} 个节点` }
      ]
      analysis.lists = [{
        label: '二分划分',
        items: [
          `A（${left.length}）：${left.slice().sort(byNumeric).map(nodeName).join(', ') || '空'}`,
          `B（${right.length}）：${right.slice().sort(byNumeric).map(nodeName).join(', ') || '空'}`
        ]
      }]
    }
  } else if (highlight === 'shortest') {
    const src = (byId(algoSrc) || nodes[0]).id
    const { dist, tree, negativeCycle } = algos.bellmanFord(nodes, edges, directed, src)
    hl.spDist = dist
    hl.spTree = tree
    const reachable = [...dist.values()].filter((d) => d !== Infinity).length
    const finite = [...dist.values()].filter((d) => d !== Infinity)
    const farthest = finite.length ? Math.max(...finite) : 0
    if (negativeCycle) {
      setStatus('error', `从 ${nodeName(src)} 出发：检测到负环，距离无效`)
    } else {
      setStatus('ok', `从 ${nodeName(src)} 出发：${reachable}/${nodes.length} 个节点可达`)
      analysis.metrics = [
        { label: '源点', value: nodeName(src) },
        { label: '可达节点', value: `${reachable}/${nodes.length}` },
        { label: '最远距离', value: reachable ? fmtNum(farthest) : '—' }
      ]
      const unreachable = nodes.filter((n) => dist.get(n.id) === Infinity).length
      analysis.lists = [{
        label: '各点最短距离（源点距离为 0）',
        items: nodes
          .map((n) => ({ id: n.id, d: dist.get(n.id) }))
          .sort((a, b) => a.d - b.d)
          .map((x) => `${nodeName(x.id)} · d=${fmtNum(x.d)}`)
      }]
      if (unreachable) {
        analysis.lists.push({ label: '不可达节点', items: [`共 ${unreachable} 个（∞）`] })
      }
    }
  } else if (highlight === 'topo') {
    if (!directed) {
      setStatus('warn', '拓扑排序仅支持有向图')
    } else {
      const { order, cycle } = algos.topoSort(nodes, edges)
      if (cycle) {
        setStatus('error', '存在环，无法拓扑排序')
      } else {
        hl.topoOrder = order
        const seq = [...order.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
        setStatus('ok', `拓扑序已生成（共 ${seq.length} 个节点）`)
        analysis.metrics = [{ label: '节点数', value: String(seq.length) }]
        analysis.lists = [
          { label: '拓扑序列', items: [seq.map(nodeName).join(' → ')] },
          { label: '入度为 0 的起点', items: seq.length ? [nodeName(seq[0])] : [] }
        ]
      }
    }
  } else if (highlight === 'diameter') {
    const d = algos.treeDiameter(nodes, edges)
    hl.diaEdges = d.edges
    hl.diaNodes = d.nodes
    setStatus(d.len ? 'ok' : 'info', `直径长度 ${d.len}`)
    analysis.metrics = [
      { label: '直径', value: `${d.len} 条边` },
      { label: '端点', value: d.a == null ? '—' : `${nodeName(d.a)} ↔ ${nodeName(d.b)}` }
    ]
    analysis.lists = [{
      label: '直径路径',
      items: (d.seq && d.seq.length ? d.seq.map(nodeName).join(' → ') : '—').split('\n')
    }]
  } else if (highlight === 'centroid') {
    const c = algos.centroids(nodes, edges)
    if (!c.valid) {
      setStatus('warn', '重心仅适用于树（m = n-1 且连通）')
    } else {
      hl.centSet = new Set(c.ids)
      setStatus('ok', `重心 ${c.ids.length} 个：${c.ids.map(nodeName).join(', ')}`)
      analysis.metrics = [{ label: '重心数', value: String(c.ids.length) }]
      analysis.lists = [{ label: '重心节点', items: c.ids.slice().sort(byNumeric).map(nodeName) }]
    }
  } else if (highlight === 'matching') {
    const r = algos.maxMatching(nodes, edges)
    if (!r.sides) {
      setStatus('error', '不是二分图，无法匹配')
    } else {
      hl.matchEdges = r.matched
      hl.matchNodes = new Set()
      for (const e of r.matched) {
        hl.matchNodes.add(e.u)
        hl.matchNodes.add(e.v)
      }
      const coveredNodes = hl.matchNodes.size
      setStatus('ok', `最大匹配 ${r.count} 对`)
      analysis.metrics = [
        { label: '匹配边', value: `${r.count} 条` },
        { label: '覆盖节点', value: `${coveredNodes}/${nodes.length}` }
      ]
      analysis.lists = [{
        label: '匹配边',
        items: [...r.matched].map(edgeName)
      }]
    }
  } else if (highlight === 'flow') {
    const s = (byId(algoSrc) || nodes[0]).id
    const t = (byId(algoSink) || nodes[nodes.length - 1]).id
    const r = algos.maxFlow(nodes, edges, directed, s, t)
    if (!r.ok) {
      setStatus('error', '源/汇无效（需两个不同且存在的节点）')
    } else {
      hl.flowUsed = r.used
      hl.flowSrc = s
      hl.flowSink = t
      const usedEdges = [...r.used.entries()].filter(([, f]) => f > 0)
      setStatus('ok', `从 ${nodeName(s)} 到 ${nodeName(t)} 的最大流 = ${r.flow}`)
      analysis.metrics = [
        { label: '最大流', value: fmtNum(r.flow) },
        { label: '饱和边', value: `${usedEdges.length} 条` }
      ]
      analysis.lists = [{
        label: '各边流量 / 容量',
        items: usedEdges.map(([e, f]) => `${edgeName(e)} · ${fmtNum(f)}/${fmtNum(algos.weightOf(e))}`)
      }]
      if (!usedEdges.length) {
        analysis.lists = [{ label: '结论', items: ['源点不可达汇点，流值为 0'] }]
      }
    }
  } else if (highlight === 'euler') {
    const r = algos.eulerPath(nodes, edges, directed)
    if (!r.exists) {
      setStatus('error', `不存在欧拉路径：${r.reason}`)
    } else {
      hl.eulerOrder = new Map(r.trail.map((e, i) => [e, i]))
      const seq = r.seq || []
      setStatus('ok', `${r.circuit ? '存在欧拉回路' : '存在欧拉路径'}（${r.trail.length} 条边）`)
      analysis.metrics = [
        { label: '类型', value: r.circuit ? '回路' : '路径' },
        { label: '边数', value: String(r.trail.length) },
        { label: '经过节点', value: String(seq.length) }
      ]
      analysis.lists = [{ label: '遍历序列', items: [seq.map(nodeName).join(' → ')] }]
    }
  }

  if (!analysis.summary) {
    analysis.summary = '选择一种算法开始分析'
  }
  return { hl, analysisDetail: analysis.summary, analysis }
}


export function edgeGeometry(e, edges, byId) {
  const a = byId(e.u)
  const b = byId(e.v)
  if (!a || !b) return null
  const same = edges.filter((x) => (x.u === e.u && x.v === e.v) || (x.u === e.v && x.v === e.u))
  const k = same.length
  const idx = same.indexOf(e)
  const off = k > 1 ? ((k - 1) / 2 - idx) * 14 : 0
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { a, b, cx: mx + (-dy / len) * off, cy: my + (dx / len) * off }
}

function arrowTip(a, b, cx, cy) {
  const dx = b.x - cx
  const dy = b.y - cy
  const len = Math.hypot(dx, dy) || 1
  const t = Math.max(0, len - NODE_R - 2) / len
  return { x: cx + dx * t, y: cy + dy * t, dx, dy }
}

function drawArrow(ctx, x, y, ang, size, color) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - size * Math.cos(ang - 0.45), y - size * Math.sin(ang - 0.45))
  ctx.lineTo(x - size * Math.cos(ang + 0.45), y - size * Math.sin(ang + 0.45))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function hexagonPath(ctx, x, y, r) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function fmtNum(n) {
  if (!isFinite(n)) return '∞'
  return n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100)
}

function accentFill(accent, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(accent)
  if (m) {
    const n = parseInt(m[1], 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  return `rgba(60, 140, 231, ${alpha})`
}

function drawTextWithHalo(ctx, text, x, y, { fillStyle, haloColor, font, align = 'center', baseline = 'middle', haloWidth = 4 }) {
  if (text == null || text === '') return
  ctx.save()
  ctx.font = font
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.strokeStyle = haloColor
  ctx.lineWidth = haloWidth
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fillStyle
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawDotGrid(ctx, canvasW, canvasH, view, theme) {
  const baseStep = 40
  let effectiveStep = baseStep
  while (effectiveStep * view.scale < 18) {
    effectiveStep *= 2
  }
  const minX = -view.x / view.scale
  const maxX = (canvasW - view.x) / view.scale
  const minY = -view.y / view.scale
  const maxY = (canvasH - view.y) / view.scale

  const startX = Math.floor(minX / effectiveStep) * effectiveStep
  const endX = Math.ceil(maxX / effectiveStep) * effectiveStep
  const startY = Math.floor(minY / effectiveStep) * effectiveStep
  const endY = Math.ceil(maxY / effectiveStep) * effectiveStep

  const dotR = Math.max(1, 1.25 / view.scale)

  ctx.save()
  ctx.fillStyle = theme.gridDot || 'rgba(128, 128, 128, 0.12)'
  ctx.beginPath()
  for (let x = startX; x <= endX; x += effectiveStep) {
    for (let y = startY; y <= endY; y += effectiveStep) {
      ctx.moveTo(x + dotR, y)
      ctx.arc(x, y, dotR, 0, Math.PI * 2)
    }
  }
  ctx.fill()
  ctx.restore()
}

function drawEdges(ctx, { nodes, edges, byId, theme, interaction, hl, treeEdgeSet, highlight, directed }) {
  const focus = interaction.edgeStart || interaction.hoverNode || (interaction.selected?.type === 'node' ? interaction.selected : null)
  for (const e of edges) {
    const g = edgeGeometry(e, edges, byId)
    if (!g) continue
    const { a, b, cx, cy } = g
    let color = theme.edge
    let lw = 1.5
    let dash = null
    let extraLabel = null
    if (interaction.hoverEdge === e || interaction.selected === e) {
      color = theme.accent
      lw = 2.8
    } else if (highlight === 'flow') {
      const f = Math.abs(hl.flowUsed.get(e) || 0)
      const c = algos.weightOf(e)
      if (f > 0) {
        color = theme.accent
        lw = 3
      }
      extraLabel = `${fmtNum(f)}/${c}`
    } else if (hl.mstSet.has(e)) {
      color = theme.success || '#16a34a'
      lw = 3.2
    } else if (hl.matchEdges.has(e)) {
      color = theme.success || '#16a34a'
      lw = 3
    } else if (hl.diaEdges.has(e)) {
      color = theme.accent
      lw = 3
    } else if (hl.spTree.has(e)) {
      color = theme.accent
      lw = 2.2
    } else if (treeEdgeSet.has(e)) {
      color = theme.accent
      lw = 3
    } else if (treeEdgeSet.size && !treeEdgeSet.has(e)) {
      color = theme.edge
      lw = 1.2
      dash = [5, 4]
    } else if (hl.bridgeSet.has(e)) {
      color = theme.danger
      lw = 2.4
      dash = [7, 5]
    } else if (hl.eulerOrder.has(e)) {
      const maxIdx = Math.max(0, hl.eulerOrder.size - 1)
      const hue = maxIdx > 0 ? (hl.eulerOrder.get(e) / maxIdx) * 300 : 0
      color = `hsl(${hue}, 75%, 48%)`
      lw = 2.4
    } else if (focus && (e.u === focus.id || e.v === focus.id)) {
      color = theme.accent
      lw = 2.2
    }
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo(cx, cy, b.x, b.y)
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.setLineDash(dash || [])
    ctx.stroke()
    ctx.setLineDash([])
    if (directed) {
      const tip = arrowTip(a, b, cx, cy)
      const ang = Math.atan2(tip.dy, tip.dx)
      drawArrow(ctx, tip.x, tip.y, ang, 9 + lw, color)
    }
    if (extraLabel) {
      drawTextWithHalo(ctx, extraLabel, cx, cy - 6, {
        fillStyle: theme.text,
        haloColor: theme.bg,
        font: '600 11px system-ui, sans-serif',
        haloWidth: 4
      })
    } else if (e.w != null && e.w !== '' && highlight !== 'flow') {
      drawTextWithHalo(ctx, String(e.w), cx, cy - 6, {
        fillStyle: theme.text,
        haloColor: theme.bg,
        font: '600 11px system-ui, sans-serif',
        haloWidth: 4
      })
    }
  }
}

function drawRubberBand(ctx, { theme, interaction, directed }) {
  if (!interaction.edgeStart || !interaction.mouseWorld) return
  ctx.beginPath()
  ctx.moveTo(interaction.edgeStart.x, interaction.edgeStart.y)
  ctx.lineTo(interaction.mouseWorld.x, interaction.mouseWorld.y)
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])
  if (directed) {
    const ang = Math.atan2(interaction.mouseWorld.y - interaction.edgeStart.y, interaction.mouseWorld.x - interaction.edgeStart.x)
    drawArrow(ctx, interaction.mouseWorld.x, interaction.mouseWorld.y, ang, 10, theme.accent)
  }
}

function drawNodes(ctx, { nodes, edges, theme, interaction, hl, highlight }) {
  const focus = interaction.edgeStart || interaction.hoverNode || (interaction.selected?.type === 'node' ? interaction.selected : null)
  const adj = new Set()
  if (focus) {
    for (const e of edges) {
      if (e.u === focus.id) adj.add(e.v)
      if (e.v === focus.id) adj.add(e.u)
    }
  }
  for (const n of nodes) {
    const isFocus = focus === n
    const isNeighbor = focus && adj.has(n.id)
    let fill = theme.nodeFill
    let stroke = theme.nodeStroke
    let lw = 1.5
    let hex = false
    let sub = null
    const pc = hl.compColors.get(n.id)
    if (pc) {
      fill = pc.fill
      stroke = pc.stroke
      lw = 2
    }
    if (hl.bipartSide.has(n.id)) {
      const side = hl.bipartSide.get(n.id)
      if (theme.isDark) {
        fill = side === 0 ? 'rgba(96,165,250,0.35)' : 'rgba(244,63,94,0.35)'
        stroke = side === 0 ? '#93c5fd' : '#fb7185'
      } else {
        fill = side === 0 ? 'rgba(67,99,216,0.25)' : 'rgba(230,25,75,0.25)'
        stroke = side === 0 ? '#4363d8' : '#e6194B'
      }
      lw = 2
    }
    if (hl.cutSet.has(n.id)) {
      hex = true
      stroke = theme.danger
      lw = 2.8
    }
    if (highlight === 'shortest') {
      const d = hl.spDist.get(n.id)
      if (d !== undefined) {
        if (d === Infinity) sub = '∞'
        else {
          let maxD = 0
          for (const v of hl.spDist.values()) {
            if (v !== Infinity && v > maxD) maxD = v
          }
          const alpha = maxD > 0 ? 0.15 + 0.38 * (1 - d / maxD) : 0.4
          fill = accentFill(theme.accent, alpha)
          sub = fmtNum(d)
        }
      }
    } else if (highlight === 'topo') {
      const o = hl.topoOrder.get(n.id)
      if (o !== undefined) {
        const maxO = Math.max(0, hl.topoOrder.size - 1)
        const hue = maxO > 0 ? (o / maxO) * 300 : 0
        stroke = `hsl(${hue}, 75%, 45%)`
        lw = 2.4
        sub = String(o)
      }
    } else if (highlight === 'diameter' && hl.diaNodes.has(n.id)) {
      stroke = theme.accent
      lw = 3
    } else if (highlight === 'centroid' && hl.centSet.has(n.id)) {
      stroke = theme.isDark ? '#fb923c' : '#ea580c'
      lw = 3.2
    } else if (highlight === 'matching' && hl.matchNodes.has(n.id)) {
      stroke = theme.success || '#16a34a'
      lw = 2.8
    } else if (highlight === 'flow') {
      if (n.id === hl.flowSrc) {
        stroke = theme.success || '#16a34a'
        lw = 3
      } else if (n.id === hl.flowSink) {
        stroke = theme.danger
        lw = 3
      }
    }
    if (isFocus || isNeighbor || interaction.selected === n || interaction.edgeStart === n) {
      stroke = theme.accent
      lw = 3
    }
    if (hex) hexagonPath(ctx, n.x, n.y, NODE_R)
    else {
      ctx.beginPath()
      ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2)
    }
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = lw
    ctx.strokeStyle = stroke
    ctx.stroke()
    drawTextWithHalo(ctx, String(n.id), n.x, n.y + 0.5, {
      fillStyle: theme.text,
      haloColor: theme.nodeFillHalo || theme.bg,
      font: '600 13px system-ui, sans-serif',
      haloWidth: 3
    })
    if (n.weight != null && Number.isFinite(Number(n.weight))) {
      drawTextWithHalo(ctx, fmtNum(Number(n.weight)), n.x + NODE_R * 0.78, n.y - NODE_R * 0.78, {
        fillStyle: theme.weightColor || (theme.isDark ? '#fbbf24' : '#d97706'),
        haloColor: theme.bg,
        font: '600 11px system-ui, sans-serif',
        align: 'left',
        baseline: 'bottom',
        haloWidth: 3.5
      })
    }
    if (sub !== null) {
      drawTextWithHalo(ctx, sub, n.x, n.y + NODE_R + 10, {
        fillStyle: theme.accent,
        haloColor: theme.bg,
        font: '600 11px system-ui, sans-serif',
        haloWidth: 3.5
      })
    }
  }
}

export function drawGraphScene(ctx, { canvasW, canvasH, view, theme, nodes, edges, byId, interaction, hl, treeEdgeSet, highlight, directed }) {
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.save()
  ctx.translate(view.x, view.y)
  ctx.scale(view.scale, view.scale)
  drawDotGrid(ctx, canvasW, canvasH, view, theme)
  drawEdges(ctx, { nodes, edges, byId, theme, interaction, hl, treeEdgeSet, highlight, directed })
  drawRubberBand(ctx, { theme, interaction, directed })
  drawNodes(ctx, { nodes, edges, theme, interaction, hl, highlight })
  ctx.restore()
}

export async function exportGraphPng({ nodes, edges, byId, theme, hl, treeEdgeSet, highlight, directed, dialog, toast }) {
  if (!nodes.length) {
    await dialog.alert('画布为空，无可导出的图')
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
  const PAD = 60
  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD
  const w = Math.max(10, maxX - minX)
  const h = Math.max(10, maxY - minY)
  const scale = Math.min(2, 2400 / w, 2400 / h)
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.round(w * scale))
  off.height = Math.max(1, Math.round(h * scale))
  const offCtx = off.getContext('2d')
  offCtx.fillStyle = theme.bg
  offCtx.fillRect(0, 0, off.width, off.height)
  offCtx.save()
  offCtx.translate(-minX * scale, -minY * scale)
  offCtx.scale(scale, scale)
  const cleanInteraction = { hoverNode: null, hoverEdge: null, selected: null, edgeStart: null, mouseWorld: null }
  drawEdges(offCtx, { nodes, edges, byId, theme, interaction: cleanInteraction, hl, treeEdgeSet, highlight, directed })
  drawNodes(offCtx, { nodes, edges, theme, interaction: cleanInteraction, hl, highlight })
  offCtx.restore()
  const base64 = off.toDataURL('image/png').split(',')[1]
  try {
    const r = await window.api.downloadFile(base64, 'graph.png', 'image/png')
    if (r.success) toast.showToast('已导出图片', 'success', 1800)
    else if (!r.canceled) await dialog.alert('导出失败：' + (r.error || '未知错误'))
  } catch {
    await dialog.alert('导出失败')
  }
}
