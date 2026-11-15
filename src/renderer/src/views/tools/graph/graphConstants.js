export const NODE_R = 22

export const GRAPH_TOOLS = [
  { value: 'select', label: '选择：点击选中、拖拽移动、Delete 删除', icon: 'fas fa-mouse-pointer' },
  { value: 'node', label: '加节点：点击空白添加新节点', icon: 'fas fa-plus' },
  { value: 'edge', label: '加边：点击起点再点击终点连边', icon: 'fas fa-long-arrow-alt-right' },
  { value: 'delete', label: '擦除：点击节点或边直接删除', icon: 'fas fa-eraser' },
  { value: 'edit', label: '综合编辑：点空白加点、拖拽移动与连边', icon: 'fas fa-pen-fancy' }
]

export const GRAPH_HINTS = {
  select: '点击选择节点/边 · 拖拽移动 · Delete 删除选中 · 双击直接编辑标签/边权 · 滚轮缩放',
  node: '点击空白处添加新节点 · 双击节点直接编辑标签 · 滚轮缩放',
  edge: '点击起点，再点击终点完成连边（可拖拽）；点空白取消 · 双击边直接编辑边权',
  delete: '点击任意节点或边将其删除 · 滚轮缩放',
  edit: '点击空白加点 · 拖拽节点移动 · 从节点拖到另一节点连边 · 双击直接编辑标签/边权'
}

export const GRAPH_PALETTE_LIGHT = [
  { fill: 'rgba(230,25,75,0.22)', stroke: '#e6194B' },
  { fill: 'rgba(60,180,75,0.22)', stroke: '#2e963c' },
  { fill: 'rgba(245,158,11,0.25)', stroke: '#d97706' },
  { fill: 'rgba(67,99,216,0.22)', stroke: '#3b5ed1' },
  { fill: 'rgba(245,130,49,0.24)', stroke: '#d95d08' },
  { fill: 'rgba(145,30,180,0.20)', stroke: '#8317a3' },
  { fill: 'rgba(13,148,136,0.22)', stroke: '#0f766e' },
  { fill: 'rgba(219,39,119,0.20)', stroke: '#be185d' },
  { fill: 'rgba(126,34,206,0.22)', stroke: '#6b21a8' },
  { fill: 'rgba(3,105,161,0.22)', stroke: '#0284c7' }
]

export const GRAPH_PALETTE_DARK = [
  { fill: 'rgba(244,63,94,0.35)', stroke: '#fb7185' },
  { fill: 'rgba(34,197,94,0.35)', stroke: '#4ade80' },
  { fill: 'rgba(234,179,8,0.35)', stroke: '#facc15' },
  { fill: 'rgba(96,165,250,0.35)', stroke: '#93c5fd' },
  { fill: 'rgba(251,146,60,0.35)', stroke: '#fdba74' },
  { fill: 'rgba(192,132,252,0.35)', stroke: '#d8b4fe' },
  { fill: 'rgba(45,212,191,0.35)', stroke: '#5eead4' },
  { fill: 'rgba(244,114,182,0.35)', stroke: '#f472b6' },
  { fill: 'rgba(167,139,250,0.35)', stroke: '#c4b5fd' },
  { fill: 'rgba(56,189,248,0.35)', stroke: '#7dd3fc' }
]

export const GRAPH_PALETTE = GRAPH_PALETTE_LIGHT

export const OFFSET_OPTIONS = [
  { value: 1, label: '1（1-indexed）' },
  { value: 0, label: '0（0-indexed）' }
]

export const RAND_MODE_OPTIONS = [
  { value: 'graph', label: '图（随机）' },
  { value: 'tree', label: '树' },
  { value: 'bipartite', label: '二分图' }
]

export const HIGHLIGHT_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'components', label: '连通分量' },
  { value: 'bridges', label: '桥与割点' },
  { value: 'mst', label: '最小生成树' },
  { value: 'bipartite', label: '二分图检测' },
  { value: 'shortest', label: '单源最短路' },
  { value: 'topo', label: '拓扑排序' },
  { value: 'diameter', label: '树的直径' },
  { value: 'centroid', label: '树的重心' },
  { value: 'matching', label: '二分图最大匹配' },
  { value: 'flow', label: '最大流' },
  { value: 'euler', label: '欧拉路径/回路' }
]

export const EXAMPLE_EDGES = [
  '1 2 4',
  '1 3 2',
  '2 3 1',
  '2 4 5',
  '3 4 8',
  '3 5 10',
  '4 5 2',
  '5 6 1',
  '6 4 3'
].join('\n')
