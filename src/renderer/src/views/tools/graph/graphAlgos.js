// OI 图论算法模板（纯函数，供 GraphEditor 调用）

export function numericWeight(e) {
  if (e.w == null || e.w === '') return null
  const n = Number(e.w)
  return isNaN(n) ? null : n
}

export function weightOf(e) {
  const n = numericWeight(e)
  return n == null ? 1 : n
}

export function numericNodeWeight(n) {
  if (!n || n.weight == null || n.weight === '') return null
  const v = Number(n.weight)
  return Number.isFinite(v) ? v : null
}

export function nodeWeightOf(n, fallback = 0) {
  const v = numericNodeWeight(n)
  return v == null ? fallback : v
}

/**
 * 丢掉端点不在节点集合里的脏边。文本解析与手输都可能带出这种边，
 * 各算法里 `adj.get(u).push(...)` 会直接抛 TypeError 并让整个工具白屏。
 */
function validEdges(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id))
  return edges.filter((e) => ids.has(e.u) && ids.has(e.v))
}

function buildAdj(nodes, edges, directed) {  const adj = new Map()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    if (!adj.has(e.u)) adj.set(e.u, [])
    adj.get(e.u).push({ to: e.v, e })
    if (!directed) {
      if (!adj.has(e.v)) adj.set(e.v, [])
      adj.get(e.v).push({ to: e.u, e })
    }
  }
  return adj
}

// 连通分量（无向）；有向图请用 scc
export function components(nodes, edges, directed = false) {
  const adj = buildAdj(nodes, edges, directed)
  const comp = new Map()
  let c = 0
  for (const n of nodes) {
    if (comp.has(n.id)) continue
    const st = [n.id]
    comp.set(n.id, c)
    while (st.length) {
      const v = st.pop()
      for (const { to } of adj.get(v) || []) {
        if (!comp.has(to)) {
          comp.set(to, c)
          st.push(to)
        }
      }
    }
    c++
  }
  return comp
}

// 强连通分量（Tarjan，有向图）
export function scc(nodes, edges) {
  const adj = buildAdj(nodes, edges, true)
  const disc = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const comp = new Map()
  let timer = 0
  let c = 0
  const dfs = (v) => {
    const t = ++timer
    disc.set(v, t)
    low.set(v, t)
    stack.push(v)
    onStack.add(v)
    for (const { to } of adj.get(v) || []) {
      if (!disc.has(to)) {
        dfs(to)
        low.set(v, Math.min(low.get(v), low.get(to)))
      } else if (onStack.has(to)) {
        low.set(v, Math.min(low.get(v), disc.get(to)))
      }
    }
    if (low.get(v) === disc.get(v)) {
      while (true) {
        const w = stack.pop()
        onStack.delete(w)
        comp.set(w, c)
        if (w === v) break
      }
      c++
    }
  }
  for (const n of nodes) if (!disc.has(n.id)) dfs(n.id)
  return comp
}

// 桥与割点（无向图）
export function bridgesCuts(nodes, edges) {
  const adj = buildAdj(nodes, edges, false)
  const tin = new Map()
  const low = new Map()
  const vis = new Set()
  const bridges = new Set()
  const cuts = new Set()
  let timer = 0
  const dfs = (v, pe) => {
    vis.add(v)
    const t = ++timer
    tin.set(v, t)
    low.set(v, t)
    let children = 0
    for (const { to, e } of adj.get(v) || []) {
      if (e === pe) continue
      if (!vis.has(to)) {
        children++
        dfs(to, e)
        low.set(v, Math.min(low.get(v), low.get(to)))
        if (low.get(to) > tin.get(v)) bridges.add(e)
        if (pe != null && low.get(to) >= tin.get(v)) cuts.add(v)
      } else {
        low.set(v, Math.min(low.get(v), tin.get(to)))
      }
    }
    if (pe == null && children > 1) cuts.add(v)
  }
  for (const n of nodes) if (!vis.has(n.id)) dfs(n.id, null)
  return { bridges, cuts }
}

// 最小生成树（Kruskal，按连通分量分别求）；非全数字权重返回 null
export function mst(nodes, edges) {
  const comp = components(nodes, edges, false)
  const eligible = edges.filter((e) => comp.get(e.u) === comp.get(e.v))
  if (eligible.some((e) => numericWeight(e) == null)) return null
  const sorted = eligible.slice().sort((a, b) => numericWeight(a) - numericWeight(b))
  const parent = new Map()
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return false
    parent.set(ra, rb)
    return true
  }
  for (const n of nodes) parent.set(n.id, n.id)
  const res = new Set()
  for (const e of sorted) if (union(e.u, e.v)) res.add(e)
  return res
}

// 二分图检测：返回 Map<id, 0|1>，非二分图返回 null
export function bipartite(nodes, edges) {
  const adj = buildAdj(nodes, edges, false)
  const side = new Map()
  for (const n of nodes) {
    if (side.has(n.id)) continue
    side.set(n.id, 0)
    const q = [n.id]
    while (q.length) {
      const v = q.shift()
      for (const { to } of adj.get(v) || []) {
        if (!side.has(to)) {
          side.set(to, side.get(v) ^ 1)
          q.push(to)
        } else if (side.get(to) === side.get(v)) {
          return null
        }
      }
    }
  }
  return side
}

// 单源最短路（Bellman-Ford，支持负权，可检测负环）
export function bellmanFord(nodes, edges, directed, src) {
  const dist = new Map()
  for (const n of nodes) dist.set(n.id, Infinity)
  dist.set(src, 0)
  const arcs = []
  for (const e of edges) {
    const w = weightOf(e)
    arcs.push({ from: e.u, to: e.v, e, w })
    if (!directed) arcs.push({ from: e.v, to: e.u, e, w })
  }
  const relaxBy = new Map()
  let negativeCycle = false
  const n = nodes.length
  for (let i = 0; i < n; i++) {
    let changed = false
    for (const a of arcs) {
      const d = dist.get(a.from)
      if (d !== Infinity && d + a.w < dist.get(a.to)) {
        dist.set(a.to, d + a.w)
        relaxBy.set(a.to, a.e)
        changed = true
      }
    }
    if (!changed) break
    if (i === n - 1) negativeCycle = true
  }
  const tree = new Set(relaxBy.values())
  return { dist, tree, negativeCycle }
}

// 拓扑排序（有向图）；返回 { order: Map<id, 序号>, cycle }
export function topoSort(nodes, edges) {
  const indeg = new Map()
  const adj = new Map()
  for (const n of nodes) {
    indeg.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of validEdges(nodes, edges)) {
    adj.get(e.u).push(e.v)
    indeg.set(e.v, (indeg.get(e.v) || 0) + 1)
  }
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const order = []
  let head = 0
  while (head < q.length) {
    const v = q[head++]
    order.push(v)
    for (const to of adj.get(v) || []) {
      indeg.set(to, indeg.get(to) - 1)
      if (indeg.get(to) === 0) q.push(to)
    }
  }
  if (order.length !== nodes.length) return { order: new Map(), cycle: true }
  const rank = new Map()
  order.forEach((id, i) => rank.set(id, i))
  return { order: rank, cycle: false }
}

// 树的直径（两次 BFS，取第一个连通分量）
export function treeDiameter(nodes, edges) {
  const adj = buildAdj(nodes, edges, false)
  if (!nodes.length) return { edges: new Set(), nodes: new Set(), len: 0, a: null, b: null }
  const bfs = (start) => {
    const dist = new Map([[start, 0]])
    const prev = new Map()
    const q = [start]
    let far = start
    for (let i = 0; i < q.length; i++) {
      const v = q[i]
      if (dist.get(v) > dist.get(far)) far = v
      for (const { to, e } of adj.get(v) || []) {
        if (!dist.has(to)) {
          dist.set(to, dist.get(v) + 1)
          prev.set(to, { from: v, e })
          q.push(to)
        }
      }
    }
    return { dist, prev, far }
  }
  const first = bfs(nodes[0].id)
  const second = bfs(first.far)
  const pathNodes = new Set()
  const pathEdges = new Set()
  const rev = []
  let cur = second.far
  while (cur != null) {
    pathNodes.add(cur)
    rev.push(cur)
    const p = second.prev.get(cur)
    if (!p) break
    pathEdges.add(p.e)
    cur = p.from
  }
  return {
    edges: pathEdges,
    nodes: pathNodes,
    seq: rev.reverse(),
    len: second.dist.get(second.far),
    a: first.far,
    b: second.far
  }
}

// 树的重心（仅对无向连通树有意义：m === n-1 且连通；若节点含数字点权则按带权重心计算）
export function centroids(nodes, edges) {
  edges = validEdges(nodes, edges)
  const n = nodes.length
  if (!n || edges.length !== n - 1) return { ids: [], valid: false, weighted: false }
  const adj = buildAdj(nodes, edges, false)
  const parent = new Map()
  const order = []
  const st = [nodes[0].id]
  // 必须用 visited 去重：只比 parent 的话，含环的图（三角形）会把节点反复入栈，
  // order 无限增长，主线程直接冻死。边数 = n-1 并不保证是树（还有孤立点的情况）。
  const seen = new Set([nodes[0].id])
  parent.set(nodes[0].id, null)
  while (st.length) {
    const v = st.pop()
    order.push(v)
    for (const { to } of adj.get(v) || []) {
      if (seen.has(to)) continue
      seen.add(to)
      parent.set(to, v)
      st.push(to)
    }
  }
  if (order.length !== n) return { ids: [], valid: false, weighted: false }

  const hasNodeWeights = nodes.some((node) => numericNodeWeight(node) !== null)
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const weightAt = (id) => {
    if (!hasNodeWeights) return 1
    return Math.max(0, nodeWeightOf(nodeMap.get(id), 0))
  }
  let totalWeight = 0
  for (const node of nodes) totalWeight += weightAt(node.id)
  if (hasNodeWeights && totalWeight <= 0) {
    // 全部为 0 或负点权时退回等权重心，避免全树重为 0 让所有节点都被标成重心
    totalWeight = n
    return unweightedCentroids(nodes, adj, parent, order, n)
  }

  const subSum = new Map()
  const maxParts = new Map()
  let bestMaxPart = Infinity
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i]
    let s = weightAt(v)
    let maxPart = 0
    for (const { to } of adj.get(v) || []) {
      if (to === parent.get(v)) continue
      const cs = subSum.get(to) || 0
      s += cs
      maxPart = Math.max(maxPart, cs)
    }
    subSum.set(v, s)
    maxPart = Math.max(maxPart, totalWeight - s)
    maxParts.set(v, maxPart)
    if (maxPart < bestMaxPart) bestMaxPart = maxPart
  }
  const ids = []
  for (const [id, mp] of maxParts) {
    if (Math.abs(mp - bestMaxPart) <= 1e-9 || (!hasNodeWeights && mp <= totalWeight / 2)) {
      ids.push(id)
    }
  }
  return { ids, valid: true, weighted: hasNodeWeights, totalWeight, maxPart: bestMaxPart }
}

function unweightedCentroids(nodes, adj, parent, order, n) {
  const size = new Map()
  const ids = []
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i]
    let s = 1
    let maxPart = 0
    for (const { to } of adj.get(v) || []) {
      if (to === parent.get(v)) continue
      const cs = size.get(to) || 0
      s += cs
      maxPart = Math.max(maxPart, cs)
    }
    size.set(v, s)
    maxPart = Math.max(maxPart, n - s)
    if (maxPart <= n / 2) ids.push(v)
  }
  return { ids, valid: true, weighted: false, totalWeight: n }
}

// 二分图最大匹配（匈牙利算法）
export function maxMatching(nodes, edges) {
  const sides = bipartite(nodes, edges)
  if (!sides) return { matched: new Set(), count: 0, sides: null }
  const adj = buildAdj(nodes, edges, false)
  const match = new Map()
  const dfs = (v, vis) => {
    for (const { to } of adj.get(v) || []) {
      if (vis.has(to)) continue
      vis.add(to)
      if (!match.has(to) || dfs(match.get(to), vis)) {
        match.set(to, v)
        match.set(v, to)
        return true
      }
    }
    return false
  }
  let count = 0
  for (const n of nodes) {
    if (sides.get(n.id) === 0 && !match.has(n.id)) {
      if (dfs(n.id, new Set())) count++
    }
  }
  const matched = new Set()
  for (const [a, b] of match) {
    if (a < b) {
      const e = edges.find((x) => (x.u === a && x.v === b) || (x.u === b && x.v === a))
      if (e) matched.add(e)
    }
  }
  return { matched, count, sides }
}

// 最大流（Dinic）；容量 = 边权（无权重为 1）；无向边视为双向容量
export function maxFlow(nodes, edges, directed, s, t) {
  edges = validEdges(nodes, edges)
  const adj = new Map()
  for (const n of nodes) adj.set(n.id, [])
  const allArcs = []
  const addArc = (u, v, c, e) => {
    const a = { to: v, cap: c, rev: null, e }
    const b = { to: u, cap: 0, rev: null, e: null }
    a.rev = b
    b.rev = a
    adj.get(u).push(a)
    adj.get(v).push(b)
    allArcs.push(a)
  }
  for (const e of edges) {
    const c = weightOf(e)
    addArc(e.u, e.v, c, e)
    if (!directed) addArc(e.v, e.u, c, e)
  }
  if (!adj.has(s) || !adj.has(t) || s === t) return { flow: 0, used: new Map(), ok: false }
  let flow = 0
  while (true) {
    const level = new Map()
    const q = [s]
    level.set(s, 0)
    for (let i = 0; i < q.length; i++) {
      const v = q[i]
      for (const a of adj.get(v) || []) {
        if (a.cap > 0 && !level.has(a.to)) {
          level.set(a.to, level.get(v) + 1)
          q.push(a.to)
        }
      }
    }
    if (!level.has(t)) break
    const it = new Map()
    for (const n of nodes) it.set(n.id, 0)
    const dfs = (v, f) => {
      if (v === t) return f
      const list = adj.get(v)
      for (; it.get(v) < list.length; it.set(v, it.get(v) + 1)) {
        const a = list[it.get(v)]
        if (a.cap > 0 && level.get(a.to) === level.get(v) + 1) {
          const d = dfs(a.to, Math.min(f, a.cap))
          if (d > 0) {
            a.cap -= d
            a.rev.cap += d
            return d
          }
        }
      }
      return 0
    }
    while (true) {
      const f = dfs(s, Infinity)
      if (!f) break
      flow += f
    }
  }
  const used = new Map()
  for (const a of allArcs) {
    if (a.e) used.set(a.e, (used.get(a.e) || 0) + (weightOf(a.e) - a.cap))
  }
  return { flow, used, ok: true }
}

// 欧拉路径/回路（Hierholzer）
export function eulerPath(nodes, edges, directed) {
  edges = validEdges(nodes, edges)
  if (!edges.length) return { exists: false, trail: [], seq: [], reason: '没有边' }
  const adj = new Map()
  const deg = new Map()
  for (const n of nodes) {
    adj.set(n.id, [])
    deg.set(n.id, { in: 0, out: 0 })
  }
  for (const e of edges) {
    adj.get(e.u).push({ to: e.v, e, used: false })
    deg.get(e.u).out++
    deg.get(e.v).in++
    if (!directed) {
      adj.get(e.v).push({ to: e.u, e, used: false })
      deg.get(e.v).out++
      deg.get(e.u).in++
    }
  }
  let start = null
  let odd = 0
  if (directed) {
    for (const n of nodes) {
      const d = deg.get(n.id)
      if (d.out - d.in === 1) start = n.id
      else if (d.out - d.in === -1) odd++
      else if (d.out !== d.in) return { exists: false, trail: [], seq: [], reason: '度数不平衡，不存在欧拉路径' }
    }
    if (start == null) {
      for (const n of nodes) if (deg.get(n.id).out > 0) { start = n.id; break }
    }
    if (odd > 1) return { exists: false, trail: [], seq: [], reason: '度数不平衡，不存在欧拉路径' }
  } else {
    for (const n of nodes) {
      const d = deg.get(n.id)
      // 无向边在两组计数器里都 +1，所以 d.out 就是点的度；用 in+out 判断奇偶永远为偶，
      // 会让 K1,4 这种 4 个奇度点的图被判成「存在欧拉路径」。
      if (d.out % 2 === 1) {
        odd++
        start = n.id
      }
    }
    if (odd > 2) return { exists: false, trail: [], seq: [], reason: `奇度点有 ${odd} 个，不存在欧拉路径` }
    if (start == null) {
      for (const n of nodes) if (deg.get(n.id).out > 0) { start = n.id; break }
    }
  }
  // 连通性检查（只看有边连通的点）
  const active = new Set()
  for (const e of edges) {
    active.add(e.u)
    active.add(e.v)
  }
  const seen = new Set([start])
  const q = [start]
  for (let i = 0; i < q.length; i++) {
    const v = q[i]
    for (const { to } of adj.get(v) || []) {
      if (!seen.has(to) && active.has(to)) {
        seen.add(to)
        q.push(to)
      }
    }
  }
  if (seen.size !== active.size) return { exists: false, trail: [], seq: [], reason: '图不连通，不存在欧拉路径' }
  // Hierholzer
  const trail = []
  const walk = [start]
  const stack = [{ v: start, e: null }]
  while (stack.length) {
    const top = stack[stack.length - 1]
    const list = adj.get(top.v)
    let a = null
    for (const x of list) {
      if (!x.used) {
        a = x
        break
      }
    }
    if (a) {
      a.used = true
      if (!directed) {
        const rl = adj.get(a.to)
        for (const r of rl) {
          if (r.e === a.e && r.to === top.v && !r.used) {
            r.used = true
            break
          }
        }
      }
      stack.push({ v: a.to, e: a.e })
      walk.push(a.to)
    } else {
      const popped = stack.pop()
      if (popped.e) trail.push(popped.e)
    }
  }
  trail.reverse()
  if (trail.length !== edges.length) return { exists: false, trail: [], seq: [], reason: '存在未遍历的边（图不连通）' }
  const isCircuit = directed
    ? deg.get(start).out === deg.get(start).in
    : (deg.get(start).in + deg.get(start).out) % 2 === 0
  return { exists: true, trail, seq: walk, circuit: isCircuit }
}

// 树上最大权独立集（Tree DP / 没有上司的舞会，适用于无向树/森林）
export function treeMwis(nodes, edges, directed = false) {
  if (directed) return { valid: false, reason: '请关闭「有向图」开关后在无向树/森林上运行' }
  edges = validEdges(nodes, edges)
  if (!nodes.length) return { valid: false, reason: '画布为空' }
  for (const e of edges) {
    if (e.u === e.v) return { valid: false, reason: '包含自环（非无向树/森林）' }
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const adj = buildAdj(nodes, edges, false)
  const seen = new Set()
  const roots = []
  const parent = new Map()
  const parentEdge = new Map()
  const children = new Map()
  const postOrder = []

  for (const n of nodes) children.set(n.id, [])

  for (const n of nodes) {
    if (seen.has(n.id)) continue
    roots.push(n.id)
    const stack = [n.id]
    const compOrder = []
    seen.add(n.id)
    parent.set(n.id, null)
    parentEdge.set(n.id, null)
    while (stack.length) {
      const u = stack.pop()
      compOrder.push(u)
      for (const { to, e } of adj.get(u) || []) {
        if (e === parentEdge.get(u)) continue
        if (seen.has(to)) {
          return { valid: false, reason: '检测到环（包含重边或环的图无法直接跑树形 DP）' }
        }
        seen.add(to)
        parent.set(to, u)
        parentEdge.set(to, e)
        children.get(u).push(to)
        stack.push(to)
      }
    }
    for (let i = compOrder.length - 1; i >= 0; i--) postOrder.push(compOrder[i])
  }

  const dp0 = new Map()
  const dp1 = new Map()
  for (const u of postOrder) {
    const w = nodeWeightOf(nodeMap.get(u), 0)
    let sum0 = 0
    let sum1 = w
    for (const v of children.get(u) || []) {
      sum0 += Math.max(dp0.get(v), dp1.get(v))
      sum1 += dp0.get(v)
    }
    dp0.set(u, sum0)
    dp1.set(u, sum1)
  }

  const chosenSet = new Set()
  let maxWeight = 0
  for (const r of roots) {
    const takeRoot = dp1.get(r) > dp0.get(r)
    maxWeight += Math.max(dp0.get(r), dp1.get(r))
    const q = [{ id: r, take: takeRoot }]
    for (let i = 0; i < q.length; i++) {
      const { id, take } = q[i]
      if (take) chosenSet.add(id)
      for (const ch of children.get(id) || []) {
        const takeChild = take ? false : dp1.get(ch) > dp0.get(ch)
        q.push({ id: ch, take: takeChild })
      }
    }
  }
  return { valid: true, chosenSet, maxWeight, dp0, dp1 }
}

// 子树点权和（从指定根节点出发：无向图要求所在连通块为树；有向图要求可达子图为外向树）
export function subtreeWeights(nodes, edges, directed = false, rootId = null) {
  edges = validEdges(nodes, edges)
  if (!nodes.length) return { valid: false, reason: '画布为空' }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const root = nodeMap.has(rootId) ? rootId : nodes[0].id
  for (const e of edges) {
    if (e.u === e.v && e.u === root) return { valid: false, reason: '包含自环（非树结构）' }
  }

  const adj = buildAdj(nodes, edges, directed)
  const seen = new Set([root])
  const parentEdge = new Map([[root, null]])
  const children = new Map([[root, []]])
  const order = []
  const treeEdges = new Set()

  const q = [root]
  for (let i = 0; i < q.length; i++) {
    const u = q[i]
    order.push(u)
    for (const { to, e } of adj.get(u) || []) {
      if (!directed && e === parentEdge.get(u)) continue
      if (seen.has(to)) {
        return {
          valid: false,
          reason: directed ? '从根节点可达的有向子图含环或合流边，不是有根外向树' : '根节点所在连通块含环，非树结构'
        }
      }
      seen.add(to)
      parentEdge.set(to, e)
      children.get(u).push(to)
      children.set(to, [])
      treeEdges.add(e)
      q.push(to)
    }
  }

  const subSum = new Map()
  const subSize = new Map()
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i]
    let sum = nodeWeightOf(nodeMap.get(u), 0)
    let sz = 1
    for (const ch of children.get(u) || []) {
      sum += subSum.get(ch) || 0
      sz += subSize.get(ch) || 0
    }
    subSum.set(u, sum)
    subSize.set(u, sz)
  }

  return { valid: true, rootId: root, subSum, subSize, treeEdges, order }
}

// DAG 最大点权路径（按拓扑序 DP：dp[v] = w[v] + max(0, max_{u->v} dp[u])）
export function dagMaxNodePath(nodes, edges) {
  edges = validEdges(nodes, edges)
  if (!nodes.length) return { valid: false, cycle: false, reason: '画布为空' }
  const { order, cycle } = topoSort(nodes, edges)
  if (cycle) return { valid: false, cycle: true, reason: '图存在环（不是 DAG），可改用「缩点点权 DP」' }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const inEdges = new Map(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (e.u === e.v) return { valid: false, cycle: true, reason: '图存在自环' }
    inEdges.get(e.v)?.push(e)
  }

  const seq = [...order.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
  const dp = new Map()
  const prev = new Map()
  let bestEnd = seq[0]
  let bestWeight = -Infinity

  for (const v of seq) {
    const w = nodeWeightOf(nodeMap.get(v), 0)
    let bestPre = 0
    let preInfo = null
    for (const e of inEdges.get(v) || []) {
      const cand = dp.get(e.u)
      if (cand > bestPre) {
        bestPre = cand
        preInfo = { from: e.u, e }
      }
    }
    const val = w + bestPre
    dp.set(v, val)
    if (preInfo) prev.set(v, preInfo)
    if (val > bestWeight) {
      bestWeight = val
      bestEnd = v
    }
  }

  const pathSeq = []
  const pathNodes = new Set()
  const pathEdges = new Set()
  let cur = bestEnd
  while (cur != null) {
    pathSeq.push(cur)
    pathNodes.add(cur)
    const p = prev.get(cur)
    if (!p) break
    pathEdges.add(p.e)
    cur = p.from
  }
  pathSeq.reverse()
  return { valid: true, cycle: false, maxWeight: bestWeight, pathSeq, pathNodes, pathEdges, dp }
}

// Tarjan 强连通分量缩点 + DAG 最大点权和 DP（支持任意有向图含环）
export function sccDagDp(nodes, edges) {
  edges = validEdges(nodes, edges)
  if (!nodes.length) return { valid: false, reason: '画布为空' }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const comp = scc(nodes, edges)
  const sccMembers = new Map()
  const sccWeights = new Map()
  for (const n of nodes) {
    const c = comp.get(n.id)
    if (!sccMembers.has(c)) {
      sccMembers.set(c, [])
      sccWeights.set(c, 0)
    }
    sccMembers.get(c).push(n.id)
    sccWeights.set(c, sccWeights.get(c) + nodeWeightOf(nodeMap.get(n.id), 0))
  }

  const sccCount = sccMembers.size
  const inDegree = new Map()
  const outMap = new Map() // cu -> Map<cv, edge[]>
  for (const c of sccMembers.keys()) {
    inDegree.set(c, 0)
    outMap.set(c, new Map())
  }
  for (const e of edges) {
    const cu = comp.get(e.u)
    const cv = comp.get(e.v)
    if (cu == null || cv == null || cu === cv) continue
    if (!outMap.get(cu).has(cv)) {
      outMap.get(cu).set(cv, [])
      inDegree.set(cv, inDegree.get(cv) + 1)
    }
    outMap.get(cu).get(cv).push(e)
  }

  const q = []
  for (const [c, deg] of inDegree) if (deg === 0) q.push(c)
  const topo = []
  for (let i = 0; i < q.length; i++) {
    const cu = q[i]
    topo.push(cu)
    for (const cv of outMap.get(cu).keys()) {
      inDegree.set(cv, inDegree.get(cv) - 1)
      if (inDegree.get(cv) === 0) q.push(cv)
    }
  }

  const inSccs = new Map()
  for (const c of topo) inSccs.set(c, [])
  for (const cu of topo) {
    for (const [cv, es] of outMap.get(cu)) {
      inSccs.get(cv).push({ from: cu, edges: es })
    }
  }

  const dp = new Map()
  const prevScc = new Map()
  let bestScc = topo[0]
  let bestWeight = -Infinity

  for (const c of topo) {
    const w = sccWeights.get(c)
    let bestPre = 0
    let pre = null
    for (const { from, edges: es } of inSccs.get(c) || []) {
      const cand = dp.get(from)
      if (cand > bestPre) {
        bestPre = cand
        pre = { from, edges: es }
      }
    }
    const val = w + bestPre
    dp.set(c, val)
    if (pre) prevScc.set(c, pre)
    if (val > bestWeight) {
      bestWeight = val
      bestScc = c
    }
  }

  const bestSccSeq = []
  const pathEdges = new Set()
  const pathSccs = new Set()
  let cur = bestScc
  while (cur != null) {
    bestSccSeq.push(cur)
    pathSccs.add(cur)
    const p = prevScc.get(cur)
    if (!p) break
    if (p.edges && p.edges.length) pathEdges.add(p.edges[0])
    cur = p.from
  }
  bestSccSeq.reverse()

  return {
    valid: true,
    comp,
    sccCount,
    sccMembers,
    sccWeights,
    dp,
    bestSccSeq,
    bestWeight,
    pathEdges,
    pathSccs
  }
}
