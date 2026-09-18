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

function buildAdj(nodes, edges, directed) {
  const adj = new Map()
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
  for (const e of edges) {
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
  let cur = second.far
  while (cur != null) {
    pathNodes.add(cur)
    const p = second.prev.get(cur)
    if (!p) break
    pathEdges.add(p.e)
    cur = p.from
  }
  return { edges: pathEdges, nodes: pathNodes, len: second.dist.get(second.far), a: first.far, b: second.far }
}

// 树的重心（仅对树有意义：m === n-1 且连通）
export function centroids(nodes, edges) {
  const n = nodes.length
  if (!n || edges.length !== n - 1) return { ids: [], valid: false }
  const adj = buildAdj(nodes, edges, false)
  const parent = new Map()
  const order = []
  const st = [nodes[0].id]
  parent.set(nodes[0].id, null)
  while (st.length) {
    const v = st.pop()
    order.push(v)
    for (const { to } of adj.get(v) || []) {
      if (to !== parent.get(v)) {
        parent.set(to, v)
        st.push(to)
      }
    }
  }
  if (order.length !== n) return { ids: [], valid: false }
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
  return { ids, valid: true }
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
      if ((d.in + d.out) % 2 === 1) {
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
