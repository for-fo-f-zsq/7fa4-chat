import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  NODE_R,
  GRAPH_TOOLS,
  GRAPH_HINTS,
  GRAPH_PALETTE_LIGHT,
  GRAPH_PALETTE_DARK
} from '../graphConstants.js'
import * as algos from '../graphAlgos.js'
import {
  computeHighlightState,
  edgeGeometry
} from '../graphRenderer.js'
import {
  parseNodeWeight,
  isValidNodeWeightInput,
  migrateLegacyNodeWeight,
  parseNodeWeightsLines,
  formatNodeWeightsLines
} from '../graphWeights.js'
import {
  DEFAULT_PHYSICS_PARAMS,
  computeConservativeForces,
  stepVelocityVerlet,
  computePhysicsState
} from '../graphPhysics.js'

console.log('--- 开始 Graph Editor 单元测试 ---')

// 1. 验证版本号
console.log('1. 验证 tool.json 版本号...')
const toolJsonPath = path.resolve('tools/graph_editor/tool.json')
const toolJson = JSON.parse(fs.readFileSync(toolJsonPath, 'utf-8'))
// 只校验格式，不钉死具体版本：钉死会让每次发版都必须改测试，反而掩盖真正的回归
assert.match(toolJson.version, /^\d+\.\d+\.\d+$/, 'tool.json 版本号应为 x.y.z')
console.log(`✓ tool.json 版本号格式正确（当前 ${toolJson.version}）`)

// 2. 验证工具模式与提示
console.log('2. 验证模式工具与提示文案...')
const toolValues = GRAPH_TOOLS.map((t) => t.value)
assert(toolValues.includes('select'), '应包含 select (选择) 模式')
assert(toolValues.includes('node'), '应包含 node (加节点) 模式')
assert(toolValues.includes('edge'), '应包含 edge (加边) 模式')
assert(toolValues.includes('delete'), '应包含 delete (擦除) 模式')
assert(toolValues.includes('edit'), '应包含 edit (综合编辑) 模式')

assert(GRAPH_HINTS.select.includes('双击直接编辑'), 'select 提示应包含双击直接编辑提示')
assert(GRAPH_HINTS.node.includes('双击'), 'node 提示应包含双击提示')
assert(GRAPH_HINTS.edge.includes('双击'), 'edge 提示应包含双击提示')
console.log('✓ 工具模式与提示文案通过')

// 3. 验证深浅色调色板
console.log('3. 验证深浅色高对比调色板...')
assert(Array.isArray(GRAPH_PALETTE_LIGHT) && GRAPH_PALETTE_LIGHT.length >= 8, '浅色色板至少包含 8 种颜色')
assert(Array.isArray(GRAPH_PALETTE_DARK) && GRAPH_PALETTE_DARK.length >= 8, '深色色板至少包含 8 种颜色')
for (const p of GRAPH_PALETTE_DARK) {
  assert(p.fill && p.stroke, '深色色板项应具备 fill 和 stroke')
}
console.log('✓ 深浅色调色板通过')

// 4. 验证边几何中点计算 (用于悬浮气泡定位与连线绘制)
console.log('4. 验证边几何中点与曲率计算 (edgeGeometry)...')
const testNodes = [
  { id: 1, x: 0, y: 0 },
  { id: 2, x: 100, y: 100 }
]
const byId = (id) => testNodes.find((n) => n.id === id)
const testEdges = [{ u: 1, v: 2, w: 5 }]
const g = edgeGeometry(testEdges[0], testEdges, byId)
assert(g, '应该成功计算几何属性')
assert.equal(g.cx, 50, '中点 X 坐标应为 50')
assert.equal(g.cy, 50, '中点 Y 坐标应为 50')
console.log('✓ 边几何中点计算通过')

// 5. 验证图算法计算与深浅色高亮状态
console.log('5. 验证图论算法与高亮状态生成 (computeHighlightState)...')
const n1 = { id: 1, x: 0, y: 0, label: '1' }
const n2 = { id: 2, x: 100, y: 0, label: '2' }
const n3 = { id: 3, x: 200, y: 0, label: '3' }
const sampleNodes = [n1, n2, n3]
const sampleEdges = [
  { u: 1, v: 2, w: 4 },
  { u: 2, v: 3, w: 2 },
  { u: 1, v: 3, w: 10 }
]
const sampleById = (id) => sampleNodes.find((n) => n.id === id)

// 5.1 MST 计算
const mstRes = computeHighlightState({
  nodes: sampleNodes,
  edges: sampleEdges,
  highlight: 'mst',
  directed: false,
  algoSrc: 1,
  algoSink: 3,
  byId: sampleById,
  isDark: false
})
assert.equal(mstRes.hl.mstSet.size, 2, '3 个节点的连通图 MST 应包含 2 条边')
assert(mstRes.analysisDetail.includes('MST 共 2 条边'), '详情应显示 2 条边')
// 结构化分析结果：指标 + 明细列表都要有内容，而不是一句话总结
assert.equal(mstRes.analysis.status, 'ok', '连通图 MST 状态应为 ok')
const mstWeight = mstRes.analysis.metrics.find((m) => m.label === '总权重')
assert.equal(mstWeight.value, '6', 'MST 总权重应为 6 (4 + 2)')
assert.equal(mstRes.analysis.lists.length, 1, 'MST 应给出一组边集明细')
assert.equal(mstRes.analysis.lists[0].items.length, 2, 'MST 边集明细条数应等于边数')
assert(mstRes.analysis.lists[0].items[0].includes('w='), '边集明细应包含权重')

// 5.2 单源最短路计算 (Bellman-Ford)
const spRes = computeHighlightState({
  nodes: sampleNodes,
  edges: sampleEdges,
  highlight: 'shortest',
  directed: false,
  algoSrc: 1,
  algoSink: 3,
  byId: sampleById,
  isDark: false
})
assert.equal(spRes.hl.spDist.get(1), 0, '源点距离为 0')
assert.equal(spRes.hl.spDist.get(2), 4, '节点 2 距离为 4')
assert.equal(spRes.hl.spDist.get(3), 6, '节点 3 距离为 6 (1->2->3 为 4+2=6, 优于 1->3 的 10)')
assert.equal(spRes.analysis.metrics.find((m) => m.label === '最远距离').value, '6', '最远距离应为 6')
const spItems = spRes.analysis.lists[0].items
assert.equal(spItems.length, 3, '每个节点都应有一条最短距离明细')
assert(spItems.some((s) => s.includes('d=6')), '明细应包含具体距离值 d=6')
assert(spItems[0].includes('d=0'), '明细应按距离升序，源点排在最前')

// 5.3 连通分量与深色模式颜色适配
const compDark = computeHighlightState({
  nodes: sampleNodes,
  edges: sampleEdges,
  highlight: 'components',
  directed: false,
  algoSrc: 1,
  algoSink: 3,
  byId: sampleById,
  isDark: true
})
assert.equal(compDark.hl.compColors.size, 3, '所有节点应有分量着色')
const c1 = compDark.hl.compColors.get(1)
assert(GRAPH_PALETTE_DARK.includes(c1), '深色模式下应使用 GRAPH_PALETTE_DARK 色彩')

// 5.4 二分图判定与奇环识别
const bipOdd = computeHighlightState({
  nodes: sampleNodes,
  edges: sampleEdges, // 1-2-3-1 三角形奇环
  highlight: 'bipartite',
  directed: false,
  algoSrc: 1,
  algoSink: 3,
  byId: sampleById,
  isDark: true
})
assert.equal(bipOdd.hl.bipartSide.size, 0, '三角形奇环不是二分图')
assert(bipOdd.analysisDetail.includes('不是二分图'), '应识别奇环并提示不是二分图')

// 二分图 (无奇环)
const bipEven = computeHighlightState({
  nodes: sampleNodes,
  edges: [
    { u: 1, v: 2, w: 4 },
    { u: 2, v: 3, w: 2 }
  ],
  highlight: 'bipartite',
  directed: false,
  algoSrc: 1,
  algoSink: 3,
  byId: sampleById,
  isDark: true
})
assert.equal(bipEven.hl.bipartSide.size, 3, '树/链为二分图，3 个节点均应完成二分染色')
assert(bipEven.analysisDetail.includes('是二分图'), '详情应显示是二分图')

console.log('✓ 图论算法与高亮状态生成通过')

// 6. 验证权重解析与边界情况
console.log('6. 验证权重解析 algos.weightOf...')
assert.equal(algos.weightOf({ w: 7 }), 7, '数字权重应正确解析')
assert.equal(algos.weightOf({ w: '8.5' }), 8.5, '字符串数字应正确转换为浮点数')
assert.equal(algos.weightOf({ w: null }), 1, 'null 权重应默认视为 1')
assert.equal(algos.weightOf({ w: '' }), 1, '空字符串权重应默认视为 1')
assert.equal(algos.weightOf({ w: 'abc' }), 1, '非数字字符串权重应回退为 1')
console.log('✓ 权重解析验证通过')

// 7. 算法边界：环、孤立点、越界端点、奇度点
console.log('7. 验证图论算法边界情况...')

// 三角形（含环）+ 孤立点：边数 = n-1，但绝不是树，过去会让 centroids 无限入栈
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const edges = [
    { u: 1, v: 2 },
    { u: 2, v: 3 },
    { u: 3, v: 1 }
  ]
  const res = algos.centroids(nodes, edges)
  assert.equal(res.valid, false, '含环的图不是树，重心必须判为无效')
  assert.deepEqual(res.ids, [], '无效图不应给出重心')
}

// 真正的树仍然有效
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 3 }]
  const res = algos.centroids(nodes, edges)
  assert.equal(res.valid, true, '链 1-2-3 是树')
  assert.deepEqual(res.ids, [2], '链的中心是中间节点')
}

// K1,4：4 个奇度点，不存在欧拉路径（旧的无向分支把 in+out 当度，恒为偶数 → 误判存在）
{
  const nodes = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const edges = [1, 2, 3, 4].map((v) => ({ u: 0, v }))
  const res = algos.eulerPath(nodes, edges, false)
  assert.equal(res.exists, false, 'K1,4 有 4 个奇度点，不存在欧拉路径')
}

// 一条链 1-2-3：两个奇度点，存在欧拉路径
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 3 }]
  const res = algos.eulerPath(nodes, edges, false)
  assert.equal(res.exists, true, '链 1-2-3 存在欧拉路径')
  assert.equal(res.seq.length, 3, '路径应覆盖 3 个点')
}

// 越界端点不能抛异常（过去 adj.get(u).push 直接 TypeError）
{
  const nodes = [{ id: 1 }, { id: 2 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 99 }]
  assert.doesNotThrow(() => algos.topoSort(nodes, edges), 'topoSort 不应因脏边抛异常')
  assert.doesNotThrow(() => algos.eulerPath(nodes, edges, true), 'eulerPath 不应因脏边抛异常')
  assert.doesNotThrow(() => algos.maxFlow(nodes, edges, true, 1, 2), 'maxFlow 不应因脏边抛异常')
}
console.log('✓ 算法边界情况通过')

// 8. 算法覆盖：拓扑 / 生成树 / 最短路 / 连通性 / 匹配 / 最大流
console.log('8. 验证主流程算法的正确性...')

// 拓扑排序：DAG 的序号必须单调，成环必须被标记
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 3 }]
  const res = algos.topoSort(nodes, edges)
  assert.equal(res.cycle, false, 'DAG 不应判为有环')
  assert.ok(res.order.get(1) < res.order.get(2), '1 必须排在 2 之前')
  assert.ok(res.order.get(2) < res.order.get(3), '2 必须排在 3 之前')
  assert.equal(res.order.size, 3, '所有节点都要有拓扑序号')
}
{
  const nodes = [{ id: 1 }, { id: 2 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 1 }]
  const res = algos.topoSort(nodes, edges)
  assert.equal(res.cycle, true, '1↔2 成环，必须判为有环')
  assert.equal(res.order.size, 0, '有环时不应给出拓扑序号')
}

// MST：三角形取两条较轻的边；非全数字权重返回 null
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [
    { u: 1, v: 2, w: 4 },
    { u: 2, v: 3, w: 2 },
    { u: 1, v: 3, w: 10 }
  ]
  const res = algos.mst(nodes, edges)
  assert.ok(res instanceof Set, 'MST 应返回边集合')
  assert.equal(res.size, 2, '3 个点的生成树应含 2 条边')
  let total = 0
  for (const e of res) total += algos.numericWeight(e)
  assert.equal(total, 6, 'MST 总权重应为 2 + 4')
  assert.ok(!res.has(edges[2]), '权重 10 的边不应进入 MST')
}
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const edges = [
    { u: 1, v: 2, w: 1 },
    { u: 3, v: 4, w: 2 }
  ]
  const res = algos.mst(nodes, edges)
  assert.equal(res.size, 2, '非连通图应对每个分量各求一棵树')
}
{
  const nodes = [{ id: 1 }, { id: 2 }]
  assert.equal(algos.mst(nodes, [{ u: 1, v: 2 }]), null, '缺权重时应返回 null 而不是瞎猜')
}

// Bellman-Ford：负权可算，负环必须被标记
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [
    { u: 1, v: 2, w: 4 },
    { u: 2, v: 3, w: -3 }
  ]
  const res = algos.bellmanFord(nodes, edges, true, 1)
  assert.equal(res.negativeCycle, false, '无负环')
  assert.equal(res.dist.get(2), 4, 'dist(2) 应为 4')
  assert.equal(res.dist.get(3), 1, 'dist(3) 应为 4 + (-3) = 1')
}
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [
    { u: 1, v: 2, w: 1 },
    { u: 2, v: 3, w: -2 },
    { u: 3, v: 2, w: -2 }
  ]
  const res = algos.bellmanFord(nodes, edges, true, 1)
  assert.equal(res.negativeCycle, true, '2→3→2 权值和为 -4，应识别为负环')
}

// 连通分量 / 强连通分量
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const edges = [{ u: 1, v: 2 }, { u: 3, v: 4 }]
  const comp = algos.components(nodes, edges, false)
  assert.equal(new Set(comp.values()).size, 2, '两对互不相连的点应为 2 个连通分量')
  assert.equal(comp.get(1), comp.get(2), '同一条边两端必须同属一个分量')
  const directed = algos.components(nodes, edges, true)
  assert.equal(new Set(directed.values()).size, 2, '有向模式下分量数仍为 2')
}
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 1 }]
  const comp = algos.scc(nodes, edges)
  assert.equal(comp.get(1), comp.get(2), '1 与 2 互相可达，属同一强连通分量')
  assert.notEqual(comp.get(1), comp.get(3), '孤立点自成分量')
  assert.equal(new Set(comp.values()).size, 2, '应为 2 个强连通分量')
}

// 桥与割点：一条 4 点链，3 条边全是桥，中间两点是割点
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 3 }, { u: 3, v: 4 }]
  const res = algos.bridgesCuts(nodes, edges)
  assert.equal(res.bridges.size, 3, '链上每条边都是桥')
  assert.deepEqual([...res.cuts].sort(), [2, 3], '割点应为 2 和 3')
}
// 环上的边不是桥
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 3 }, { u: 3, v: 1 }]
  const res = algos.bridgesCuts(nodes, edges)
  assert.equal(res.bridges.size, 0, '三角形没有桥')
}

// 树的直径
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 3 }, { u: 3, v: 4 }]
  const res = algos.treeDiameter(nodes, edges)
  assert.equal(res.len, 3, '4 点链的直径是 3 条边')
  assert.equal(new Set([res.a, res.b]).size, 2, '直径两端应是两个不同节点')
  assert.deepEqual([Math.min(res.a, res.b), Math.max(res.a, res.b)], [1, 4], '端点应为 1 与 4')
}

// 二分图 / 最大匹配
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const odd = [{ u: 1, v: 2 }, { u: 2, v: 3 }, { u: 3, v: 1 }]
  assert.equal(algos.bipartite(nodes, odd), null, '奇环不是二分图')
  const even = [{ u: 1, v: 2 }, { u: 2, v: 3 }]
  const sides = algos.bipartite(nodes, even)
  assert.ok(sides, '链是二分图')
  assert.notEqual(sides.get(1), sides.get(2), '相邻点必须在不同侧')
}
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [{ u: 1, v: 2 }, { u: 2, v: 3 }]
  assert.equal(algos.maxMatching(nodes, edges).count, 1, '3 点链的最大匹配是 1')
}
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  const edges = [
    { u: 1, v: 2 },
    { u: 2, v: 3 },
    { u: 3, v: 4 },
    { u: 4, v: 1 }
  ]
  assert.equal(algos.maxMatching(nodes, edges).count, 2, '四元环的最大匹配是 2')
}

// 最大流：Dinic 的流量应等于最小割
{
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const edges = [
    { u: 1, v: 2, w: 3 },
    { u: 2, v: 3, w: 2 },
    { u: 1, v: 3, w: 1 }
  ]
  const res = algos.maxFlow(nodes, edges, true, 1, 3)
  assert.equal(res.ok, true, '源汇合法时应返回 ok')
  assert.equal(res.flow, 3, '最小割 = 1 + 2 = 3')
}
// 无向边的双向容量
{
  const nodes = [{ id: 1 }, { id: 2 }]
  const edges = [{ u: 1, v: 2, w: 5 }]
  assert.equal(algos.maxFlow(nodes, edges, false, 1, 2).flow, 5, '无向边容量应等于权重')
}
// 源点等于汇点 / 非法端点：返回 ok=false 而不是抛错
{
  const nodes = [{ id: 1 }, { id: 2 }]
  const edges = [{ u: 1, v: 2, w: 5 }]
  assert.equal(algos.maxFlow(nodes, edges, true, 1, 1).ok, false, '源点等于汇点应判为无效')
  assert.equal(algos.maxFlow(nodes, edges, true, 1, 9).ok, false, '汇点不存在应判为无效')
}
console.log('✓ 主流程算法覆盖通过')

// 9. 验证节点点权解析、按行回显与历史 label 兼容迁移 (#13)
console.log('9. 验证节点点权解析、更新与历史兼容...')
{
  assert.equal(parseNodeWeight('42'), 42, '整数字符串应解析为数字')
  assert.equal(parseNodeWeight(' -3.5 '), -3.5, '负数与浮点字符串应正确解析')
  assert.equal(parseNodeWeight(0), 0, '数字 0 应保留为 0')
  assert.equal(parseNodeWeight('_'), null, '下划线 _ 应视为无点权')
  assert.equal(parseNodeWeight(''), null, '空字符串应视为无点权')
  assert.equal(parseNodeWeight('abc'), null, '非数字字符串应解析为 null')

  assert.equal(isValidNodeWeightInput('12.5'), true, '合法数字输入校验应通过')
  assert.equal(isValidNodeWeightInput('_'), true, '清除符号 _ 输入校验应通过')
  assert.equal(isValidNodeWeightInput(''), true, '空输入校验应通过')
  assert.equal(isValidNodeWeightInput('NaN'), false, 'NaN 应判为无效点权输入')
  assert.equal(isValidNodeWeightInput('hello'), false, '非数字文本应判为无效点权输入')

  // 历史 JSON label 迁移
  assert.equal(migrateLegacyNodeWeight({ id: 1, label: '1' }, 1), null, '历史默认 label=id 应迁移为无点权')
  assert.equal(migrateLegacyNodeWeight({ id: 1, label: '99' }, 1), 99, '历史数字 label 应迁移为点权 99')
  assert.equal(migrateLegacyNodeWeight({ id: 1, label: 'nodeA' }, 1), null, '历史非数字 label 应忽略为 null')
  assert.equal(migrateLegacyNodeWeight({ id: 2, weight: 2, label: '99' }, 2), 2, '显式 weight 字段应优先于历史 label')

  // 按行解析与回显
  const parsedMap = parseNodeWeightsLines('10\n_\n-7.5\nabc')
  assert.equal(parsedMap.get(1), 10)
  assert.equal(parsedMap.get(2), null)
  assert.equal(parsedMap.get(3), -7.5)
  assert.equal(parsedMap.get(4), null)

  const wNodes = [
    { id: 1, weight: 10 },
    { id: 2, weight: null },
    { id: 3, weight: -7.5 },
    { id: 4, weight: null }
  ]
  assert.equal(formatNodeWeightsLines(wNodes), '10\n_\n-7.5', '按行回显应精确对齐节点编号并省略尾部空权')
  assert.equal(formatNodeWeightsLines([{ id: 1, weight: null }]), '', '全部无点权时应回显为空串')
}
console.log('✓ 节点点权解析与兼容迁移通过')

// 10. 验证物理引擎：牛顿第三定律、零阻力守恒、阻力收敛与单边胡克弹簧 (#14)
console.log('10. 验证保守物理引擎与保辛积分...')
{
  const pNodes = [
    { id: 1, x: -90, y: 15, vx: 4.5, vy: -2.0, mass: 1.5 },
    { id: 2, x: 70, y: -35, vx: -1.5, vy: 3.0, mass: 1.0 },
    { id: 3, x: 15, y: 110, vx: -2.0, vy: -1.0, mass: 2.0 },
    { id: 4, x: -40, y: -95, vx: 0.5, vy: 1.0, mass: 1.0 }
  ]
  const pEdges = [
    { u: 1, v: 2, restLength: 110, stiffness: 1.4 },
    { u: 2, v: 3, restLength: 140, stiffness: 0.8 },
    { u: 3, v: 4 },
    { u: 1, v: 3, stiffness: 1.2 }
  ]
  const zeroDampParams = {
    ...DEFAULT_PHYSICS_PARAMS,
    repulsion: 1.2,
    stiffness: 1.0,
    restLength: 120,
    damping: 0,
    dt: 0.02
  }

  // 10.1 合外力为零（牛顿第三定律）
  const { fx, fy } = computeConservativeForces(pNodes, pEdges, zeroDampParams)
  let sumFx = 0
  let sumFy = 0
  for (let i = 0; i < pNodes.length; i++) {
    sumFx += fx[i]
    sumFy += fy[i]
  }
  assert(Math.abs(sumFx) < 1e-10, `合外力 X 应为 0，实际 ${sumFx}`)
  assert(Math.abs(sumFy) < 1e-10, `合外力 Y 应为 0，实际 ${sumFy}`)

  // 10.2 零阻力下：总动量与总机械能（T + V_s + V_r）严格守恒
  const s0 = computePhysicsState(pNodes, pEdges, zeroDampParams)
  let minE = s0.totalEnergy
  let maxE = s0.totalEnergy
  for (let step = 0; step < 600; step++) {
    stepVelocityVerlet(pNodes, pEdges, zeroDampParams)
    const s = computePhysicsState(pNodes, pEdges, zeroDampParams)
    if (s.totalEnergy < minE) minE = s.totalEnergy
    if (s.totalEnergy > maxE) maxE = s.totalEnergy
    const dpx = Math.abs(s.momentum.px - s0.momentum.px)
    const dpy = Math.abs(s.momentum.py - s0.momentum.py)
    assert(dpx < 1e-10 && dpy < 1e-10, `零阻力第 ${step} 步总动量应严格守恒 (dpx=${dpx}, dpy=${dpy})`)
  }
  const relEnergyDrift = (maxE - minE) / Math.max(1e-9, s0.totalEnergy)
  assert(relEnergyDrift < 1e-3, `零阻力 600 步总能量相对波动应极小，实际 ${(relEnergyDrift * 100).toFixed(5)}%`)

  // 10.3 近距软化防奇点：两节点完全重合时也不应出现 NaN 或异常发散
  const overlapNodes = [
    { id: 1, x: 0, y: 0, vx: 0, vy: 0 },
    { id: 2, x: 0, y: 0, vx: 0, vy: 0 }
  ]
  const overlapStep = stepVelocityVerlet(overlapNodes, [{ u: 1, v: 2 }], zeroDampParams)
  assert(Number.isFinite(overlapStep.kineticEnergy) && Number.isFinite(overlapNodes[0].x), '节点重合时不应对奇点产生 NaN')

  // 10.4 开启粘性阻力后：动能单调/总体衰减收敛至平衡态，单边原长生效
  const springNodes = [
    { id: 1, x: -120, y: 0, vx: 0, vy: 0 },
    { id: 2, x: 120, y: 0, vx: 0, vy: 0 }
  ]
  const springEdges = [{ u: 1, v: 2, restLength: 160, stiffness: 2.0 }]
  const dampedParams = {
    ...DEFAULT_PHYSICS_PARAMS,
    repulsion: 0, // 纯单边胡克弹簧验证平衡原长
    gravity: 0,
    damping: 1.8,
    dt: 0.04
  }
  let peakKinetic = 0
  let finalStats = null
  for (let step = 0; step < 300; step++) {
    stepVelocityVerlet(springNodes, springEdges, dampedParams)
    const st = computePhysicsState(springNodes, springEdges, dampedParams)
    if (st.kineticEnergy > peakKinetic) peakKinetic = st.kineticEnergy
    finalStats = st
  }
  assert(peakKinetic > 10, '初始拉伸的弹簧应先获得显著动能')
  assert(finalStats.kineticEnergy < 1e-4, `开启阻力后动能应衰减趋近于 0，实际 ${finalStats.kineticEnergy}`)
  const finalDist = Math.hypot(springNodes[1].x - springNodes[0].x, springNodes[1].y - springNodes[0].y)
  assert(Math.abs(finalDist - 160) < 0.1, `纯弹簧平衡距离应收敛至单边配置原长 L_e=160，实际 ${finalDist}`)

  // 10.5 质心向心引力：两个非连通分量受斥力也不会无限远离，应收敛至有界距离
  const disconnNodes = [
    { id: 1, x: -40, y: 0, vx: 0, vy: 0 },
    { id: 2, x: 40, y: 0, vx: 0, vy: 0 }
  ]
  for (let step = 0; step < 300; step++) {
    stepVelocityVerlet(disconnNodes, [], DEFAULT_PHYSICS_PARAMS)
  }
  const sep = Math.hypot(disconnNodes[1].x - disconnNodes[0].x, disconnNodes[1].y - disconnNodes[0].y)
  assert(sep > 80 && sep < 500, `非连通节点在向心力与斥力平衡下应保持有限距离，实际 ${sep}`)
}
console.log('✓ 保守物理引擎与保辛积分验证通过')

// 11. 验证侧栏双选项卡合并 (#12) 与 GeoGebra 闪烁修复 (#8)
console.log('11. 验证侧栏结构合并与 GeoGebra 防闪烁修复...')
{
  const sidebarSrc = fs.readFileSync(path.resolve('src/renderer/src/views/tools/graph/components/GraphSidebar.vue'), 'utf-8')
  assert(sidebarSrc.includes("key: 'structure', label: '图结构与分析'"), '侧栏应包含「图结构与分析」选项卡')
  assert(sidebarSrc.includes("key: 'physics', label: '物理布局'"), '侧栏应包含「物理布局」选项卡')
  assert(!sidebarSrc.includes("key: 'algo'"), '侧栏不应再保留独立的 algo 选项卡')
  assert(!sidebarSrc.includes('centripetal'), '物理面板应移除非保守向心力参数')

  const ggbHtml = fs.readFileSync(path.resolve('tools/math/geogebra/calculator.html'), 'utf-8')
  assert(!ggbHtml.includes('dispatchEvent(new Event("resize"))'), 'calculator.html 不得在 resize 处理中派发 resize 事件')
  assert(!ggbHtml.includes('.observe(document.getElementById("ggb-element"))'), 'calculator.html 不得监听 #ggb-element 内部 DOM 变动')
  assert(ggbHtml.includes('lastW') && ggbHtml.includes('lastH'), 'calculator.html 应判定视口真实尺寸变化后再 setSize')
}
console.log('✓ 侧栏结构合并与 GeoGebra 防闪烁修复验证通过')

// 12. 点权算法（带权重心、树上最大权独立集、子树点权和、DAG 最大点权路、SCC 缩点点权 DP、分量点权和）
console.log('12. 验证点权驱动图论算法...')
{
  const wTreeNodes = [
    { id: 1, weight: 1, x: 0, y: 0 },
    { id: 2, weight: 2, x: 0, y: 0 },
    { id: 3, weight: 100, x: 0, y: 0 },
    { id: 4, weight: 3, x: 0, y: 0 }
  ]
  const wTreeEdges = [
    { u: 1, v: 2 },
    { u: 2, v: 3 },
    { u: 3, v: 4 }
  ]
  const wById = (id) => wTreeNodes.find((n) => n.id === id) || null

  // 12.1 带权重心：节点 3 点权 100，应成为唯一重心
  const wCent = computeHighlightState({
    nodes: wTreeNodes,
    edges: wTreeEdges,
    highlight: 'centroid',
    directed: false,
    algoSrc: 1,
    algoSink: 4,
    byId: wById,
    isDark: false
  })
  assert.deepEqual([...wCent.hl.centSet], [3], '带权重心应选中权重占绝对优势的节点 3')
  assert(wCent.analysisDetail.includes('带权重心'), '摘要应标明带权重心')

  // 12.2 树上最大权独立集：节点 1(1) + 节点 3(100) = 101 > 节点 2(2) + 节点 4(3) = 5
  const mwis = computeHighlightState({
    nodes: wTreeNodes,
    edges: wTreeEdges,
    highlight: 'tree_mwis',
    directed: false,
    algoSrc: 1,
    algoSink: 4,
    byId: wById,
    isDark: false
  })
  assert.equal(mwis.analysis.status, 'ok')
  assert.equal(mwis.analysis.metrics.find((m) => m.label === '最大点权和').value, '101')
  assert.deepEqual([...mwis.hl.selectedNodes].sort((a, b) => a - b), [1, 3])

  // 12.3 子树点权和（以节点 2 为根）：1(1) 在左，3(100)+4(3)=103 在右，根总重=106
  const subRes = computeHighlightState({
    nodes: wTreeNodes,
    edges: wTreeEdges,
    highlight: 'subtree',
    directed: false,
    algoSrc: 2,
    algoSink: 4,
    byId: wById,
    isDark: false
  })
  assert.equal(subRes.hl.rootNode, 2)
  assert.equal(subRes.hl.nodeSubLabels.get(3), 'sum=103')
  assert.equal(subRes.analysis.metrics.find((m) => m.label === '根总点权和').value, '106')

  // 12.4 DAG 最大点权路：含负点权节点，1(5) -> 2(-10) -> 4(8) vs 1(5) -> 3(4) -> 4(8) = 17
  const dagNodes = [
    { id: 1, weight: 5, x: 0, y: 0 },
    { id: 2, weight: -10, x: 0, y: 0 },
    { id: 3, weight: 4, x: 0, y: 0 },
    { id: 4, weight: 8, x: 0, y: 0 }
  ]
  const dagEdges = [
    { u: 1, v: 2 },
    { u: 2, v: 4 },
    { u: 1, v: 3 },
    { u: 3, v: 4 }
  ]
  const dagRes = computeHighlightState({
    nodes: dagNodes,
    edges: dagEdges,
    highlight: 'dag_lp',
    directed: true,
    algoSrc: 1,
    algoSink: 4,
    byId: (id) => dagNodes.find((n) => n.id === id) || null,
    isDark: false
  })
  assert.equal(dagRes.analysis.status, 'ok')
  assert.equal(dagRes.analysis.metrics.find((m) => m.label === '最大点权和').value, '17')
  assert.deepEqual([...dagRes.hl.pathNodes].sort((a, b) => a - b), [1, 3, 4])

  // 12.5 强连通分量缩点 + DAG 点权 DP：1<->2（权 3+4=7）-> 3（权 5），总链权=12
  const sccNodes = [
    { id: 1, weight: 3, x: 0, y: 0 },
    { id: 2, weight: 4, x: 0, y: 0 },
    { id: 3, weight: 5, x: 0, y: 0 }
  ]
  const sccEdges = [
    { u: 1, v: 2 },
    { u: 2, v: 1 },
    { u: 2, v: 3 }
  ]
  const sccRes = computeHighlightState({
    nodes: sccNodes,
    edges: sccEdges,
    highlight: 'scc_dag',
    directed: true,
    algoSrc: 1,
    algoSink: 3,
    byId: (id) => sccNodes.find((n) => n.id === id) || null,
    isDark: false
  })
  assert.equal(sccRes.analysis.status, 'ok')
  assert.equal(sccRes.analysis.metrics.find((m) => m.label === 'SCC 数量').value, '2')
  assert.equal(sccRes.analysis.metrics.find((m) => m.label === '最大路径点权和').value, '12')

  // 12.6 连通分量展示全图点权和
  const compWithW = computeHighlightState({
    nodes: sccNodes,
    edges: sccEdges,
    highlight: 'components',
    directed: true,
    algoSrc: 1,
    algoSink: 3,
    byId: (id) => sccNodes.find((n) => n.id === id) || null,
    isDark: false
  })
  assert.equal(compWithW.analysis.metrics.find((m) => m.label === '全图点权和').value, '12')
  assert(compWithW.analysis.lists[0].items.some((t) => t.includes('权=7')))
}
console.log('✓ 点权算法与可视化高亮验证通过')

console.log('--- 全部 Graph Editor 单元测试验证通过！ ---')
