<template>
  <div class="graph-tool">
    <div class="graph-tool-header">
      <div class="graph-tool-title">
        <button class="graph-back-btn" title="返回工具列表" @click="$emit('back')"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-toolbox"></i> 工具
        <span class="graph-tool-sep">/</span>
        Graph Editor
      </div>
    </div>

    <div class="graph-tool-body">
      <div class="graph-side">
        <div class="graph-panel">
          <div class="graph-panel-title"><i class="fas fa-edit"></i> 输入</div>
          <div class="graph-field-label">边列表（u v [w]，输入实时生效，# 开头为注释）</div>
          <textarea
            :value="inputText"
            @input="onInputText"
            class="graph-textarea"
            rows="8"
            spellcheck="false"
            placeholder="1 2&#10;2 3 5&#10;4 4&#10;或 JSON：[[1,2],[2,3,5]]"
          ></textarea>
          <div class="graph-field-label">节点标签（可选，每行对应一个节点，_ 跳过）</div>
          <textarea
            :value="labelsText"
            @input="onInputLabels"
            class="graph-textarea"
            rows="3"
            spellcheck="false"
            placeholder="a&#10;_&#10;c"
          ></textarea>
          <div class="graph-field-row">
            <span class="graph-field-label">编号起始</span>
            <select v-model.number="offset" class="graph-select">
              <option :value="1">1（1-indexed）</option>
              <option :value="0">0（0-indexed）</option>
            </select>
          </div>
          <div class="graph-btn-row">
            <button class="graph-btn" @click="loadExample"><i class="fas fa-file-alt"></i> 示例</button>
            <button class="graph-btn" @click="clearInput"><i class="fas fa-eraser"></i> 清空</button>
          </div>
        </div>

        <div class="graph-panel">
          <div class="graph-panel-title"><i class="fas fa-dice"></i> 随机图</div>
          <div class="graph-field-row">
            <span class="graph-field-label">类型</span>
            <select v-model="randMode" class="graph-select">
              <option value="graph">图（随机）</option>
              <option value="tree">树</option>
              <option value="bipartite">二分图</option>
            </select>
          </div>
          <div class="graph-field-row">
            <span class="graph-field-label">节点数 n</span>
            <input v-model.number="randN" type="number" min="1" max="200" class="graph-input" />
          </div>
          <div class="graph-field-row">
            <span class="graph-field-label">边数 m{{ randMode === 'tree' ? '（树自动）' : '' }}</span>
            <input v-model.number="randM" type="number" min="0" max="1000" class="graph-input" :disabled="randMode === 'tree'" />
          </div>
          <label class="graph-check">
            <input v-model="randWeighted" type="checkbox" />
            带权（随机 1-9）
          </label>
          <div class="graph-btn-row">
            <button class="graph-btn primary" @click="randomGraph"><i class="fas fa-dice"></i> 生成</button>
          </div>
        </div>

        <div class="graph-panel">
          <div class="graph-panel-title"><i class="fas fa-sliders-h"></i> 布局参数</div>
          <div class="graph-field-row">
            <span class="graph-field-label">排斥力</span>
            <input type="range" min="0.2" max="20" step="0.5" v-model.number="repulsion" class="graph-slider" @change="onForceChange" />
            <span class="graph-slider-val">{{ repulsion.toFixed(1) }}x</span>
          </div>
          <div class="graph-field-row">
            <span class="graph-field-label">拉力（边）</span>
            <input type="range" min="0.2" max="20" step="0.5" v-model.number="spring" class="graph-slider" @change="onForceChange" />
            <span class="graph-slider-val">{{ spring.toFixed(1) }}x</span>
          </div>
          <div class="graph-field-row">
            <span class="graph-field-label">向心力</span>
            <input type="range" min="0" max="50" step="1" v-model.number="centripetal" class="graph-slider" @change="onForceChange" />
            <span class="graph-slider-val">{{ centripetal.toFixed(1) }}x</span>
          </div>
        </div>

        <div class="graph-panel">
          <div class="graph-panel-title"><i class="fas fa-project-diagram"></i> 分析</div>
          <div class="graph-field-label">高亮</div>
          <select v-model="highlight" class="graph-select">
            <option value="none">无</option>
            <option value="components">连通分量</option>
            <option value="bridges">桥与割点</option>
            <option value="mst">最小生成树</option>
            <option value="bipartite">二分图检测</option>
            <option value="shortest">单源最短路</option>
            <option value="topo">拓扑排序</option>
            <option value="diameter">树的直径</option>
            <option value="centroid">树的重心</option>
            <option value="matching">二分图最大匹配</option>
            <option value="flow">最大流</option>
            <option value="euler">欧拉路径/回路</option>
          </select>
          <div v-if="highlight === 'shortest'" class="graph-field-row">
            <span class="graph-field-label">源点</span>
            <input v-model.number="algoSrc" type="number" min="1" class="graph-input" />
          </div>
          <div v-if="highlight === 'flow'" class="graph-field-row">
            <span class="graph-field-label">源点</span>
            <input v-model.number="algoSrc" type="number" min="1" class="graph-input" />
          </div>
          <div v-if="highlight === 'flow'" class="graph-field-row">
            <span class="graph-field-label">汇点</span>
            <input v-model.number="algoSink" type="number" min="1" class="graph-input" />
          </div>
          <div class="graph-info">{{ info }}</div>
        </div>
      </div>

      <div class="graph-canvas-col">
        <div class="graph-toolbar">
          <div class="graph-tool-group">
            <button
              v-for="t in tools"
              :key="t.value"
              class="graph-tool-btn"
              :class="{ active: mode === t.value }"
              :title="t.label"
              @click="mode = t.value"
            >
              <i :class="t.icon"></i>
            </button>
          </div>
          <div class="graph-tool-divider"></div>
          <div class="graph-tool-group">
            <button
              class="graph-tool-btn"
              :class="{ active: directed }"
              :title="directed ? '当前为有向图，点击切换为无向' : '当前为无向图，点击切换为有向'"
              @click="directed = !directed"
            >
              <i :class="directed ? 'fas fa-long-arrow-alt-right' : 'fas fa-exchange-alt'"></i>
              <span class="graph-tool-text">{{ directed ? '有向' : '无向' }}</span>
            </button>
            <button
              class="graph-tool-btn"
              :class="{ active: !locked }"
              :title="locked ? '已锁定布局，点击解锁' : '自动布局（力导向），点击锁定'"
              @click="toggleLock"
            >
              <i :class="locked ? 'fas fa-lock' : 'fas fa-unlock'"></i>
              <span class="graph-tool-text">{{ locked ? '锁定' : '布局' }}</span>
            </button>
            <button class="graph-tool-btn" title="重新随机排布并自动布局" @click="restartLayout">
              <i class="fas fa-magic"></i>
            </button>
            <button
              class="graph-tool-btn"
              :class="{ active: treeMode }"
              title="树形布局：点击一个节点作为根，按 DFS 树边分层排布"
              @click="toggleTreeMode"
            >
              <i class="fas fa-sitemap"></i>
              <span class="graph-tool-text">树形</span>
            </button>
          </div>
          <div class="graph-tool-divider"></div>
          <div class="graph-tool-group">
            <button class="graph-tool-btn" title="清空画布" @click="clearGraph">
              <i class="fas fa-trash"></i>
            </button>
          </div>
          <div class="graph-tool-spacer"></div>
          <div class="graph-tool-group">
            <button class="graph-tool-btn" title="放大" @click="zoomIn"><i class="fas fa-search-plus"></i></button>
            <button class="graph-tool-btn" title="缩小" @click="zoomOut"><i class="fas fa-search-minus"></i></button>
            <button class="graph-tool-btn" title="适应画布" @click="fitView"><i class="fas fa-expand"></i></button>
          </div>
          <div class="graph-tool-divider"></div>
          <div class="graph-tool-group">
            <button class="graph-tool-btn" title="导出为 PNG 图片" @click="exportImg"><i class="fas fa-file-image"></i></button>
          </div>
        </div>

        <div ref="wrapRef" class="graph-canvas-wrap">
          <canvas
            ref="canvasRef"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseLeave"
            @contextmenu.prevent
          ></canvas>
        </div>

        <div class="graph-hint">
          <i class="fas fa-info-circle"></i>
          {{ hint }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as algos from './graphAlgos.js'
import './graph-editor.css'

defineEmits(['back'])

const NODE_R = 22

const tools = [
  { value: 'edit', label: '编辑：点空白加节点、拖节点移动、从节点拖到另一节点连边', icon: 'fas fa-mouse-pointer' },
  { value: 'node', label: '加节点：点击空白添加节点', icon: 'fas fa-plus' },
  { value: 'edge', label: '加边：点击起点再点击终点', icon: 'fas fa-long-arrow-alt-right' },
  { value: 'delete', label: '删除：点击节点或边删除', icon: 'fas fa-eraser' },
  { value: 'select', label: '选择：点击选择，Delete 删除', icon: 'fas fa-hand-pointer' }
]

const HINTS = {
  edit: '点击空白加节点 · 拖拽节点移动 · 从节点拖到另一节点连边 · 滚轮缩放 · 右键拖动画布平移',
  node: '点击空白添加节点 · 滚轮缩放 · 右键拖动画布平移',
  edge: '点击起点，再点击终点完成连边（可拖拽）；点空白取消 · 滚轮缩放',
  delete: '点击节点或边将其删除 · 滚轮缩放',
  select: '点击选择节点/边 · 拖拽移动 · Delete 删除选中 · 滚轮缩放'
}

const PALETTE = [
  { fill: 'rgba(230,25,75,0.30)', stroke: '#e6194B' },
  { fill: 'rgba(60,180,75,0.30)', stroke: '#3cb44b' },
  { fill: 'rgba(255,200,0,0.38)', stroke: '#b09600' },
  { fill: 'rgba(67,99,216,0.30)', stroke: '#4363d8' },
  { fill: 'rgba(245,130,49,0.32)', stroke: '#e06c12' },
  { fill: 'rgba(145,30,180,0.26)', stroke: '#911eb4' },
  { fill: 'rgba(70,220,220,0.34)', stroke: '#00a8a8' },
  { fill: 'rgba(240,50,230,0.26)', stroke: '#c81fb8' },
  { fill: 'rgba(188,246,12,0.36)', stroke: '#7ea300' },
  { fill: 'rgba(0,128,128,0.26)', stroke: '#008080' },
  { fill: 'rgba(154,99,36,0.28)', stroke: '#9A6324' },
  { fill: 'rgba(128,0,0,0.24)', stroke: '#800000' },
  { fill: 'rgba(0,0,117,0.24)', stroke: '#000075' },
  { fill: 'rgba(128,128,128,0.32)', stroke: '#555555' }
]

const mode = ref('edit')
const directed = ref(false)
const locked = ref(false)
const highlight = ref('none')
const inputText = ref('')
const labelsText = ref('')
const offset = ref(1)
const info = ref('')
const hint = ref(HINTS.edit)
const randN = ref(8)
const randM = ref(10)
const randWeighted = ref(false)
const randMode = ref('graph')
const algoSrc = ref(1)
const algoSink = ref(0)
// 力导向参数倍率（布局参数面板可调）：排斥力 / 边拉力 / 向心力
const repulsion = ref(1)
const spring = ref(1)
const centripetal = ref(1)

const nodes = reactive([])
const edges = reactive([])
let nextNodeId = 1

const view = reactive({ x: 0, y: 0, scale: 1 })
const theme = reactive({
  bg: '#ffffff',
  nodeFill: '#f2f3f5',
  nodeStroke: '#8a8f99',
  text: '#1f2329',
  accent: '#3c8ce7',
  edge: '#8a8f99',
  danger: '#e5484d'
})

const canvasRef = ref(null)
const wrapRef = ref(null)
let ctx = null
let canvasW = 0
let canvasH = 0
let drawPending = false

let hoverNode = null
let hoverEdge = null
let selected = null
let edgeStart = null
let dragNode = null
let dragOffset = { x: 0, y: 0 }
let dragMoved = false
let dragStartWorld = null
let panning = false
let panLast = { x: 0, y: 0 }
let mouseWorld = null
let layoutRaf = null
let hlDirty = true
let resizeObserver = null
let themeObserver = null
let parseTimer = null
let labelsTimer = null

// 高亮计算结果
let compColors = new Map()
let bridgeSet = new Set()
let cutSet = new Set()
let mstSet = new Set()
let bipartSide = new Map()
let spDist = new Map()
let spTree = new Set()
let topoOrder = new Map()
let diaEdges = new Set()
let diaNodes = new Set()
let centSet = new Set()
let matchEdges = new Set()
let matchNodes = new Set()
let matchSides = new Map()
let flowUsed = new Map()
let flowSrc = null
let flowSink = null
let eulerOrder = new Map()
let analysisDetail = ''

watch(mode, (m) => { hint.value = HINTS[m] })
watch(highlight, () => { hlDirty = true; requestDraw() })
watch(directed, () => { hlDirty = true; requestDraw() })
watch(offset, () => parseInput(true, true))
watch([algoSrc, algoSink], () => { hlDirty = true; requestDraw() })

// ---------- 基础工具 ----------
function byId(id) {
  for (const n of nodes) if (n.id === id) return n
  return null
}

function invalidate() {
  hlDirty = true
  refreshInfo()
  requestDraw()
}

function refreshInfo() {
  let s = `节点 ${nodes.length} · 边 ${edges.length}`
  if (analysisDetail) s += ` · ${analysisDetail}`
  info.value = s
}

function requestDraw() {
  if (drawPending) return
  drawPending = true
  requestAnimationFrame(() => {
    drawPending = false
    draw()
  })
}

function canvasPos(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
}

function toWorld(sx, sy) {
  return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale }
}

// ---------- 图的增删 ----------
function addNodeAt(wx, wy) {
  const n = {
    type: 'node',
    id: nextNodeId++,
    x: wx,
    y: wy,
    label: String(nextNodeId - 1),
    vx: 0,
    vy: 0,
    fixed: false,
    color: null
  }
  nodes.push(n)
  selected = n
  syncInputFromGraph()
  invalidate()
  return n
}

function addEdge(u, v) {
  if (u === v) return null
  const e = { type: 'edge', u, v, w: null }
  edges.push(e)
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
  if (selected === n) selected = null
  if (edgeStart === n) edgeStart = null
  if (hoverNode === n) hoverNode = null
  syncInputFromGraph()
  invalidate()
}

function deleteEdge(e) {
  const idx = edges.indexOf(e)
  if (idx >= 0) edges.splice(idx, 1)
  if (selected === e) selected = null
  if (hoverEdge === e) hoverEdge = null
  syncInputFromGraph()
  invalidate()
}

function clearGraph(syncInput = true) {
  nodes.length = 0
  edges.length = 0
  nextNodeId = 1
  selected = null
  edgeStart = null
  dragNode = null
  treeEdgeSet = new Set()
  treeRoot = null
  stopLayout()
  view.x = canvasW / 2
  view.y = canvasH / 2
  view.scale = 1
  if (syncInput) syncInputFromGraph()
  invalidate()
  requestDraw()
}

function clearInput() {
  inputText.value = ''
  labelsText.value = ''
  clearGraph()
}

function onInputText(e) {
  inputText.value = e.target.value
  clearTimeout(parseTimer)
  parseTimer = setTimeout(() => parseInput(true, true), 450)
}

function onInputLabels(e) {
  labelsText.value = e.target.value
  clearTimeout(labelsTimer)
  labelsTimer = setTimeout(applyLabelsLive, 300)
}

function applyLabelsLive() {
  const lines = labelsText.value.split(/\r?\n/)
  lines.forEach((ln, i) => {
    const n = byId(i + 1)
    if (n) {
      const s = ln.trim()
      n.label = s && s !== '_' ? s : String(n.id)
    }
  })
  invalidate()
}

function labelsTextFromGraph() {
  const maxId = nodes.reduce((m, n) => Math.max(m, n.id), 0)
  const lines = []
  for (let i = 1; i <= maxId; i++) {
    const n = byId(i)
    if (!n) lines.push('_')
    else lines.push(n.label === String(i) ? '_' : n.label)
  }
  return lines.join('\n')
}

function syncInputFromGraph() {
  inputText.value = edgesText()
  labelsText.value = labelsTextFromGraph()
}

// ---------- 导出 ----------
// 导出整个图为 PNG：计算节点包围盒 → 离屏 canvas（≤2 倍清晰度）→ 复用 drawEdges/drawNodes 绘制 → 保存对话框
function exportImg() {
  if (!nodes.length) { alert('画布为空，无可导出的图'); return }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  const PAD = 60
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD
  const w = Math.max(10, maxX - minX)
  const h = Math.max(10, maxY - minY)
  const scale = Math.min(2, 2400 / w, 2400 / h)
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.round(w * scale))
  off.height = Math.max(1, Math.round(h * scale))
  const offCtx = off.getContext('2d')
  // 临时替换全局 ctx 与交互态（导出干净版，不带 hover/选中高亮）
  const savedCtx = ctx
  const saved = { hoverNode, hoverEdge, selected, edgeStart, dragNode }
  hoverNode = null; hoverEdge = null; selected = null; edgeStart = null; dragNode = null
  ctx = offCtx
  offCtx.fillStyle = theme.bg
  offCtx.fillRect(0, 0, off.width, off.height)
  offCtx.save()
  offCtx.translate(-minX * scale, -minY * scale)
  offCtx.scale(scale, scale)
  drawEdges()
  drawNodes()
  offCtx.restore()
  ctx = savedCtx
  hoverNode = saved.hoverNode; hoverEdge = saved.hoverEdge; selected = saved.selected
  edgeStart = saved.edgeStart; dragNode = saved.dragNode
  const base64 = off.toDataURL('image/png').split(',')[1]
  window.api.downloadFile(base64, 'graph.png', 'image/png').then(r => {
    if (r.success) alert('已导出图片')
    else if (!r.canceled) alert('导出失败：' + (r.error || '未知错误'))
  }).catch(() => alert('导出失败'))
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

// ---------- 布局 ----------
function placeCircle() {
  const r = Math.max(140, Math.sqrt(Math.max(1, nodes.length)) * 80)
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2
    n.x = Math.cos(a) * r
    n.y = Math.sin(a) * r
    n.vx = 0
    n.vy = 0
  })
}

function fitView() {
  if (!nodes.length) {
    view.x = canvasW / 2
    view.y = canvasH / 2
    view.scale = 1
    requestDraw()
    return
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
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

function stopLayout() {
  if (layoutRaf) cancelAnimationFrame(layoutRaf)
  layoutRaf = null
}

function runLayout() {
  if (locked.value || !nodes.length) return
  stopLayout()
  const maxIter = 3000
  let iter = 0
  const step = () => {
    if (locked.value || !nodes.length) {
      stopLayout()
      return
    }
    let moved = 0
    const dt = 0.035
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (a === dragNode) continue // 拖拽中的节点由鼠标控制，其余节点继续力导向运动
      let fx = 0, fy = 0
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        const b = nodes[j]
        let dx = a.x - b.x, dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 4) {
          dx = (Math.random() - 0.5) * 2
          dy = (Math.random() - 0.5) * 2
          d2 = dx * dx + dy * dy
        }
        const d = Math.sqrt(d2) || 1
        // 斥力：反平方，clamp 上限防距离过近时弹飞；基准系数整体放大（×2），随「排斥力」倍率缩放
        const f = Math.min((5600 * repulsion.value) / d2, 1400 * repulsion.value)
        fx += (dx / d) * f
        fy += (dy / d) * f
      }
      for (const e of edges) {
        let b = null
        if (e.u === a.id) b = byId(e.v)
        else if (e.v === a.id) b = byId(e.u)
        if (!b) continue
        let dx = b.x - a.x, dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 1
        // 拉力（边）：严格按边长计算——力与边实际长度成正比（f ∝ d），长边拉回强、短边弱；
        // 系数 0.004 使默认 1x 下平衡间距约 110px（拉力=排斥力处），避免图被拉成一团
        const f = 0.004 * spring.value * d
        fx += (dx / d) * f
        fy += (dy / d) * f
      }
      // 向心力：把整个图拉回原点，避免节点漂散；强度随「向心力」倍率缩放
      fx -= a.x * 0.0015 * centripetal.value
      fy -= a.y * 0.0015 * centripetal.value
      let nvx = (a.vx || 0) * 0.85 + fx * dt
      let nvy = (a.vy || 0) * 0.85 + fy * dt
      // 速度上限：防止单帧飞离画面
      const VMAX = 60
      nvx = Math.max(-VMAX, Math.min(VMAX, nvx))
      nvy = Math.max(-VMAX, Math.min(VMAX, nvy))
      a.vx = nvx
      a.vy = nvy
      a.x += a.vx
      a.y += a.vy
      moved += Math.abs(a.vx) + Math.abs(a.vy)
    }
    iter++
    draw()
    if (moved > 0.02 && iter < maxIter) {
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
  placeCircle()
  fitView()
  runLayout()
}

// 布局参数滑块调整：未锁定且存在节点时立即用新参数重新布局
function onForceChange() {
  if (locked.value || !nodes.length) return
  runLayout()
}

// ---------- 树形布局（DFS 树） ----------
const treeMode = ref(false)
let treeEdgeSet = new Set()
let treeRoot = null

function toggleTreeMode() {
  treeMode.value = !treeMode.value
  if (treeMode.value) {
    hint.value = '树形布局：点击一个节点作为根，将按 DFS 树边分层排布（点击本按钮可取消）'
    edgeStart = null
  } else {
    treeEdgeSet = new Set()
    treeRoot = null
    hint.value = HINTS[mode.value]
    invalidate()
  }
}

// 选根后：DFS 生成树边 → 分层布局（根在顶部，叶从左到右，父节点在子树中心）
function treeLayout(rootId) {
  const root = byId(rootId)
  if (!root) return
  const parent = new Map() // child -> parent
  const treeChildren = new Map() // node -> [children]
  const depth = new Map()
  const visited = new Set()
  visited.add(rootId)
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
  // 未从根到达的节点（孤立/其他连通分量）：深度 0，各自成树
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      visited.add(n.id)
      depth.set(n.id, 0)
    }
  }
  // 后序分配 x：叶节点从左到右，父节点取子节点中点
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
  // 应用坐标：根 x 归零居中，逐层下移
  const rootX = x.get(rootId) ?? 0
  const LAYER_H = 110
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0
    n.x = (x.get(n.id) ?? 0) - rootX
    n.y = d * LAYER_H
    n.vx = 0
    n.vy = 0
  }
  // 树边集合（高亮用）：每条 parent->child 匹配一条实际边
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
}

// ---------- 随机图 ----------
function randomGraph() {
  const n = Math.max(1, Math.min(200, Math.round(randN.value) || 1))
  clearGraph()
  for (let i = 1; i <= n; i++) {
    nodes.push({ type: 'node', id: i, x: 0, y: 0, label: String(i), vx: 0, vy: 0, fixed: false, color: null })
  }
  nextNodeId = n + 1
  const w = () => (randWeighted.value ? String(1 + Math.floor(Math.random() * 9)) : null)
  if (randMode.value === 'tree') {
    // 随机树：每个点 i 随机一个更小的点作为父亲，边按 父→子 存储
    for (let i = 2; i <= n; i++) {
      const p = 1 + Math.floor(Math.random() * (i - 1))
      edges.push({ type: 'edge', u: p, v: i, w: w() })
    }
  } else if (randMode.value === 'bipartite') {
    const half = Math.max(1, Math.floor(n / 2))
    const right = n - half
    const maxM = half * right
    const target = Math.max(0, Math.min(maxM, Math.round(randM.value) || 0))
    const used = new Set()
    let guard = 0
    while (edges.length < target && guard++ < 3000) {
      const u = 1 + Math.floor(Math.random() * half)
      const v = half + 1 + Math.floor(Math.random() * right)
      const key = `${u}|${v}`
      if (!used.has(key)) {
        used.add(key)
        edges.push({ type: 'edge', u, v, w: w() })
      }
    }
  } else {
    // 图：完全随机连边，不做任何限制（不保证连通、允许重边、方向随机）
    const target = Math.max(0, Math.min(n * (n - 1), Math.round(randM.value) || 0))
    let guard = 0
    while (edges.length < target && guard++ < 5000) {
      const u = 1 + Math.floor(Math.random() * n)
      const v = 1 + Math.floor(Math.random() * n)
      if (u !== v) edges.push({ type: 'edge', u, v, w: w() })
    }
  }
  syncInputFromGraph()
  placeCircle()
  fitView()
  runLayout()
  invalidate()
}

// ---------- 解析输入 ----------
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
    alert('请输入边列表')
    return
  }
  const pairs = []
  const singles = new Set()
  let maxId = 0
  let failed = false

  const pushPair = (u, v, w) => {
    if (u == null || v == null) return
    pairs.push([u, v, w])
    maxId = Math.max(maxId, u, v)
  }

  if (text.startsWith('[')) {
    let arr = null
    try {
      arr = JSON.parse(text)
    } catch {
      failed = true
    }
    if (!failed) {
      if (!Array.isArray(arr) || !arr.length) failed = true
      else {
        const rows = Array.isArray(arr[0]) ? arr : chunk(arr, 2)
        for (const row of rows) {
          const u = toId(row[0])
          const v = toId(row[1])
          pushPair(u, v, row.length > 2 ? String(row[2]) : null)
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
        if (id != null) {
          singles.add(id)
          maxId = Math.max(maxId, id)
        }
      } else {
        const u = toId(tok[0])
        const v = toId(tok[1])
        pushPair(u, v, tok.length > 2 ? tok.slice(2).join(' ') : null)
      }
    }
  }

  if (failed) {
    if (silent) {
      info.value = '输入格式有误，未更新图'
      return
    }
    alert('输入无法解析，请检查格式')
    return
  }
  if (!maxId) {
    if (silent) return
    alert('没有解析到任何节点')
    return
  }
  if (maxId > 600) {
    if (silent) {
      info.value = '节点数过多，未更新图'
      return
    }
    alert(`节点数过多（${maxId}），超过 600 上限`)
    return
  }

  const oldPos = new Map()
  if (preserve) for (const n of nodes) oldPos.set(n.id, { x: n.x, y: n.y })

  clearGraph(false)
  let hadNew = false
  for (let i = 1; i <= maxId; i++) {
    const old = oldPos.get(i)
    nodes.push({
      type: 'node',
      id: i,
      x: old ? old.x : 0,
      y: old ? old.y : 0,
      label: String(i),
      vx: 0,
      vy: 0,
      fixed: false,
      color: null
    })
    if (!old) hadNew = true
  }
  nextNodeId = maxId + 1

  const labLines = labelsText.value.split(/\r?\n/)
  labLines.forEach((ln, i) => {
    const s = ln.trim()
    const n = byId(i + 1)
    if (n && s && s !== '_') n.label = s
  })

  for (const [u, v, w] of pairs) edges.push({ type: 'edge', u, v, w })

  if (preserve) {
    if (hadNew) {
      let cx = 0, cy = 0, cnt = 0
      for (const n of nodes) if (oldPos.has(n.id)) {
        cx += n.x
        cy += n.y
        cnt++
      }
      if (cnt) {
        cx /= cnt
        cy /= cnt
      }
      let k = 0
      for (const n of nodes) {
        if (!oldPos.has(n.id)) {
          const a = (k / Math.max(1, nodes.length - cnt)) * Math.PI * 2
          n.x = cx + Math.cos(a) * 90
          n.y = cy + Math.sin(a) * 90
          k++
        }
      }
      fitView()
      runLayout()
    }
  } else {
    placeCircle()
    fitView()
    runLayout()
  }
  invalidate()
}

function loadExample() {
  inputText.value = [
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
  labelsText.value = ''
  offset.value = 1
  parseInput()
}

// ---------- 算法 ----------
function computeHighlight() {
  compColors = new Map()
  bridgeSet = new Set()
  cutSet = new Set()
  mstSet = new Set()
  bipartSide = new Map()
  spDist = new Map()
  spTree = new Set()
  topoOrder = new Map()
  diaEdges = new Set()
  diaNodes = new Set()
  centSet = new Set()
  matchEdges = new Set()
  matchNodes = new Set()
  matchSides = new Map()
  flowUsed = new Map()
  flowSrc = null
  flowSink = null
  eulerOrder = new Map()
  analysisDetail = ''
  const h = highlight.value
  if (!nodes.length) {
    refreshInfo()
    return
  }
  if (h === 'components') {
    const comp = directed.value ? algos.scc(nodes, edges) : algos.components(nodes, edges, false)
    const unique = new Set(comp.values()).size
    const colorOf = new Map()
    let ci = 0
    for (const n of nodes) {
      const c = comp.get(n.id)
      if (c == null) continue
      if (!colorOf.has(c)) colorOf.set(c, PALETTE[ci++ % PALETTE.length])
      compColors.set(n.id, colorOf.get(c))
    }
    analysisDetail = `共 ${unique} 个${directed.value ? '强连通' : '连通'}分量`
  } else if (h === 'bridges') {
    if (directed.value) {
      analysisDetail = '桥与割点仅支持无向图'
    } else {
      const { bridges, cuts } = algos.bridgesCuts(nodes, edges)
      bridgeSet = bridges
      cutSet = cuts
      analysisDetail = `${bridges.size} 条桥 · ${cuts.size} 个割点`
    }
  } else if (h === 'mst') {
    if (directed.value) {
      analysisDetail = 'MST 仅支持无向图'
    } else {
      const res = algos.mst(nodes, edges)
      if (res === null) analysisDetail = '存在非数字权重，无法计算 MST'
      else {
        mstSet = res
        analysisDetail = `MST 共 ${res.size} 条边`
      }
    }
  } else if (h === 'bipartite') {
    const side = algos.bipartite(nodes, edges)
    if (!side) analysisDetail = '不是二分图（存在奇环）'
    else {
      bipartSide = side
      analysisDetail = '是二分图'
    }
  } else if (h === 'shortest') {
    const src = (byId(algoSrc.value) || nodes[0]).id
    const { dist, tree, negativeCycle } = algos.bellmanFord(nodes, edges, directed.value, src)
    spDist = dist
    spTree = tree
    const reachable = [...dist.values()].filter((d) => d !== Infinity).length
    analysisDetail = negativeCycle
      ? `从 ${src} 出发：检测到负环，距离无效`
      : `从 ${src} 出发：已算得 ${reachable}/${nodes.length} 个节点距离（节点下方为距离）`
  } else if (h === 'topo') {
    if (!directed.value) {
      analysisDetail = '拓扑排序仅支持有向图'
    } else {
      const { order, cycle } = algos.topoSort(nodes, edges)
      if (cycle) analysisDetail = '存在环，无法拓扑排序'
      else {
        topoOrder = order
        analysisDetail = '拓扑序已生成（按顺序着色，节点下方为序号）'
      }
    }
  } else if (h === 'diameter') {
    const d = algos.treeDiameter(nodes, edges)
    diaEdges = d.edges
    diaNodes = d.nodes
    analysisDetail = `直径长度 ${d.len}（${d.a} → ${d.b}）`
  } else if (h === 'centroid') {
    const c = algos.centroids(nodes, edges)
    if (!c.valid) analysisDetail = '重心仅适用于树（m = n-1 且连通）'
    else {
      centSet = new Set(c.ids)
      analysisDetail = `重心：${c.ids.join(', ')}`
    }
  } else if (h === 'matching') {
    const r = algos.maxMatching(nodes, edges)
    if (!r.sides) analysisDetail = '不是二分图，无法匹配'
    else {
      matchEdges = r.matched
      matchNodes = new Set()
      for (const e of r.matched) {
        matchNodes.add(e.u)
        matchNodes.add(e.v)
      }
      matchSides = r.sides
      analysisDetail = `最大匹配 ${r.count} 对（绿色为匹配边）`
    }
  } else if (h === 'flow') {
    const s = (byId(algoSrc.value) || nodes[0]).id
    const t = (byId(algoSink.value) || nodes[nodes.length - 1]).id
    const r = algos.maxFlow(nodes, edges, directed.value, s, t)
    if (!r.ok) analysisDetail = '源/汇无效（需两个不同节点）'
    else {
      flowUsed = r.used
      flowSrc = s
      flowSink = t
      analysisDetail = `从 ${s} 到 ${t} 的最大流 = ${r.flow}`
    }
  } else if (h === 'euler') {
    const r = algos.eulerPath(nodes, edges, directed.value)
    if (!r.exists) {
      analysisDetail = `不存在欧拉路径：${r.reason}`
    } else {
      eulerOrder = new Map(r.trail.map((e, i) => [e, i]))
      const seq = r.seq || []
      const head = seq.slice(0, 12).join(' → ')
      analysisDetail = `${r.circuit ? '欧拉回路' : '欧拉路径'}：${head}${seq.length > 12 ? ' …' : ''}（共 ${r.trail.length} 条边）`
    }
  }
  refreshInfo()
}

// ---------- 绘制 ----------
function edgeGeometry(e) {
  const a = byId(e.u)
  const b = byId(e.v)
  if (!a || !b) return null
  const same = edges.filter((x) => x.u === e.u && x.v === e.v)
  const k = same.length
  const idx = same.indexOf(e)
  const off = k > 1 ? ((k - 1) / 2 - idx) * 9 : 0
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  let dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  return { a, b, cx: mx + px * off, cy: my + py * off }
}

function arrowTip(a, b, cx, cy) {
  let dx = b.x - cx, dy = b.y - cy
  const len = Math.hypot(dx, dy) || 1
  const t = Math.max(0, len - NODE_R - 2) / len
  return { x: cx + dx * t, y: cy + dy * t, dx, dy }
}

function drawArrow(x, y, ang, size, color) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - size * Math.cos(ang - 0.45), y - size * Math.sin(ang - 0.45))
  ctx.lineTo(x - size * Math.cos(ang + 0.45), y - size * Math.sin(ang + 0.45))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function hexagonPath(x, y, r) {
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

function accentFill(alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(theme.accent)
  if (m) {
    const n = parseInt(m[1], 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  return `rgba(60, 140, 231, ${alpha})`
}

function drawEdges() {
  const focus = edgeStart || hoverNode || (selected && selected.type === 'node' ? selected : null)
  for (const e of edges) {
    const g = edgeGeometry(e)
    if (!g) continue
    const { a, b, cx, cy } = g
    let color = theme.edge
    let lw = 1.5
    let dash = null
    let extraLabel = null
    if (hoverEdge === e || selected === e) {
      color = theme.accent
      lw = 2.8
    } else if (highlight.value === 'flow') {
      const f = Math.abs(flowUsed.get(e) || 0)
      const c = algos.weightOf(e)
      if (f > 0) {
        color = theme.accent
        lw = 3
      }
      extraLabel = `${fmtNum(f)}/${c}`
    } else if (mstSet.has(e)) {
      color = '#16a34a'
      lw = 3.2
    } else if (matchEdges.has(e)) {
      color = '#16a34a'
      lw = 3
    } else if (diaEdges.has(e)) {
      color = theme.accent
      lw = 3
    } else if (spTree.has(e)) {
      color = theme.accent
      lw = 2.2
    } else if (treeEdgeSet.has(e)) {
      color = theme.accent
      lw = 3
    } else if (treeEdgeSet.size && !treeEdgeSet.has(e)) {
      // 树布局已执行：非树边（回边/重边）淡化为虚线
      color = theme.edge
      lw = 1.2
      dash = [5, 4]
    } else if (bridgeSet.has(e)) {
      color = theme.danger
      lw = 2.4
      dash = [7, 5]
    } else if (eulerOrder.has(e)) {
      const maxIdx = Math.max(0, eulerOrder.size - 1)
      const hue = maxIdx > 0 ? (eulerOrder.get(e) / maxIdx) * 300 : 0
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
    if (directed.value) {
      const tip = arrowTip(a, b, cx, cy)
      const ang = Math.atan2(tip.dy, tip.dx)
      drawArrow(tip.x, tip.y, ang, 9 + lw, color)
    }
    if (extraLabel) {
      ctx.fillStyle = theme.text
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(extraLabel, cx, cy - 6)
    } else if (e.w != null && e.w !== '' && highlight.value !== 'flow') {
      ctx.fillStyle = theme.text
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(e.w), cx, cy - 6)
    }
  }
}

function drawRubberBand() {
  if (!edgeStart || !mouseWorld) return
  ctx.beginPath()
  ctx.moveTo(edgeStart.x, edgeStart.y)
  ctx.lineTo(mouseWorld.x, mouseWorld.y)
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])
  if (directed.value) {
    const ang = Math.atan2(mouseWorld.y - edgeStart.y, mouseWorld.x - edgeStart.x)
    drawArrow(mouseWorld.x, mouseWorld.y, ang, 10, theme.accent)
  }
}

function drawNodes() {
  const focus = edgeStart || hoverNode || (selected && selected.type === 'node' ? selected : null)
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
    const pc = compColors.get(n.id)
    if (pc) {
      fill = pc.fill
      stroke = pc.stroke
      lw = 2
    }
    if (bipartSide.has(n.id)) {
      const side = bipartSide.get(n.id)
      fill = side === 0 ? 'rgba(67,99,216,0.32)' : 'rgba(230,25,75,0.32)'
      stroke = side === 0 ? '#4363d8' : '#e6194B'
      lw = 2
    }
    if (cutSet.has(n.id)) {
      hex = true
      stroke = theme.danger
      lw = 2.8
    }
    if (highlight.value === 'shortest') {
      const d = spDist.get(n.id)
      if (d !== undefined) {
        if (d === Infinity) {
          sub = '∞'
        } else {
          let maxD = 0
          for (const v of spDist.values()) {
            if (v !== Infinity && v > maxD) maxD = v
          }
          const alpha = maxD > 0 ? 0.15 + 0.38 * (1 - d / maxD) : 0.4
          fill = accentFill(alpha)
          sub = fmtNum(d)
        }
      }
    } else if (highlight.value === 'topo') {
      const o = topoOrder.get(n.id)
      if (o !== undefined) {
        const maxO = Math.max(0, topoOrder.size - 1)
        const hue = maxO > 0 ? (o / maxO) * 300 : 0
        stroke = `hsl(${hue}, 75%, 45%)`
        lw = 2.4
        sub = String(o)
      }
    } else if (highlight.value === 'diameter') {
      if (diaNodes.has(n.id)) {
        stroke = theme.accent
        lw = 3
      }
    } else if (highlight.value === 'centroid') {
      if (centSet.has(n.id)) {
        stroke = '#f58231'
        lw = 3.2
      }
    } else if (highlight.value === 'matching') {
      if (matchNodes.has(n.id)) {
        stroke = '#16a34a'
        lw = 2.8
      }
    } else if (highlight.value === 'flow') {
      if (n.id === flowSrc) {
        stroke = '#16a34a'
        lw = 3
      } else if (n.id === flowSink) {
        stroke = theme.danger
        lw = 3
      }
    }
    if (isFocus || isNeighbor || selected === n || edgeStart === n) {
      stroke = theme.accent
      lw = 3
    }
    if (hex) hexagonPath(n.x, n.y, NODE_R)
    else {
      ctx.beginPath()
      ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2)
    }
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = lw
    ctx.strokeStyle = stroke
    ctx.stroke()
    ctx.fillStyle = theme.text
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n.label), n.x, n.y + 0.5)
    if (sub !== null) {
      ctx.fillStyle = theme.edge
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(sub, n.x, n.y + NODE_R + 10)
    }
  }
}

function draw() {
  if (!ctx) return
  if (hlDirty) {
    hlDirty = false
    computeHighlight()
  }
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.save()
  ctx.translate(view.x, view.y)
  ctx.scale(view.scale, view.scale)
  drawEdges()
  drawRubberBand()
  drawNodes()
  ctx.restore()
}

// ---------- 交互 ----------
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
    const g = edgeGeometry(e)
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
    // 树形布局：点击节点作为根
    if (n) {
      treeLayout(n.id)
      fitView()
      stopLayout()
      locked.value = true // 树布局后锁定，避免力导向打乱
      treeMode.value = false
      hint.value = HINTS[mode.value]
      invalidate()
    }
    return
  }
  if (n) {
    if (mode.value === 'edge') {
      if (edgeStart) {
        if (edgeStart !== n) addEdge(edgeStart.id, n.id)
        edgeStart = null
      } else {
        edgeStart = n
      }
      selected = n
      invalidate()
      return
    }
    selected = n
    dragNode = n
    dragOffset = { x: w.x - n.x, y: w.y - n.y }
    dragMoved = false
    dragStartWorld = { x: w.x, y: w.y }
    // 拖拽时不再停止布局：其余节点继续力导向运动，只有被拖节点由鼠标控制
    invalidate()
    return
  }
  if (ed && (mode.value === 'select' || mode.value === 'edit')) {
    selected = ed
    invalidate()
    return
  }
  if (mode.value === 'edit' || mode.value === 'node') {
    addNodeAt(w.x, w.y)
  } else if (mode.value === 'edge') {
    edgeStart = null
    invalidate()
  } else {
    selected = null
    invalidate()
  }
}

function onMouseMove(e) {
  const { sx, sy } = canvasPos(e)
  mouseWorld = toWorld(sx, sy)
  if (panning) {
    view.x += sx - panLast.x
    view.y += sy - panLast.y
    panLast = { x: sx, y: sy }
    requestDraw()
    return
  }
  if (dragNode) {
    if (!dragMoved) {
      const dx = mouseWorld.x - dragStartWorld.x
      const dy = mouseWorld.y - dragStartWorld.y
      if (dx * dx + dy * dy > 100) dragMoved = true
    }
    dragNode.x = mouseWorld.x - dragOffset.x
    dragNode.y = mouseWorld.y - dragOffset.y
    requestDraw()
    return
  }
  hoverNode = hitNode(mouseWorld)
  hoverEdge = hoverNode ? null : hitEdge(mouseWorld)
  if (canvasRef.value) {
    canvasRef.value.style.cursor = hoverNode || hoverEdge ? 'pointer' : 'crosshair'
  }
  requestDraw()
}

function onMouseUp(e) {
  if (e.button === 2 || e.button === 1) {
    panning = false
    return
  }
  if (dragNode) {
    const from = dragNode
    dragNode = null
    if (dragMoved) {
      const target = hitNode(mouseWorld)
      if (target && target !== from && mode.value === 'edit') {
        addEdge(from.id, target.id)
      }
    }
    invalidate()
    if (!locked.value) runLayout()
  }
}

function onMouseLeave() {
  hoverNode = null
  hoverEdge = null
  mouseWorld = null
  requestDraw()
}

function onWheel(e) {
  e.preventDefault()
  const { sx, sy } = canvasPos(e)
  const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.02 : 0.0016))
  zoomAt(sx, sy, f)
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
  zoomAt(canvasW / 2, canvasH / 2, 1.25)
}

function zoomOut() {
  zoomAt(canvasW / 2, canvasH / 2, 0.8)
}

function onKeyDown(e) {
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selected) {
      e.preventDefault()
      if (selected.type === 'node') deleteNode(selected)
      else deleteEdge(selected)
    }
  } else if (e.key === 'Escape') {
    if (edgeStart) {
      edgeStart = null
      invalidate()
    } else if (selected) {
      selected = null
      invalidate()
    }
  }
}

// ---------- 主题与尺寸 ----------
function readTheme() {
  const cs = getComputedStyle(document.documentElement)
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback
  theme.bg = v('--bg-app', '#ffffff')
  theme.nodeFill = v('--bg-sidebar', '#f2f3f5')
  theme.nodeStroke = v('--text-secondary', '#8a8f99')
  theme.text = v('--text-primary', '#1f2329')
  theme.accent = v('--accent', '#3c8ce7')
  theme.edge = v('--text-secondary', '#8a8f99')
  theme.danger = v('--danger', '#e5484d')
}

function resizeCanvas() {
  const wrap = wrapRef.value
  if (!wrap) return
  const dpr = window.devicePixelRatio || 1
  canvasW = wrap.clientWidth
  canvasH = wrap.clientHeight
  const cv = canvasRef.value
  cv.width = Math.max(1, Math.round(canvasW * dpr))
  cv.height = Math.max(1, Math.round(canvasH * dpr))
  cv.style.width = canvasW + 'px'
  cv.style.height = canvasH + 'px'
  requestDraw()
}

onMounted(async () => {
  readTheme()
  ctx = canvasRef.value.getContext('2d')
  await nextTick()
  resizeCanvas()
  resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(wrapRef.value)
  themeObserver = new MutationObserver(() => {
    readTheme()
    requestDraw()
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
  canvasRef.value.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  view.x = canvasW / 2
  view.y = canvasH / 2
  loadExample()
})

onBeforeUnmount(() => {
  stopLayout()
  if (resizeObserver) resizeObserver.disconnect()
  if (themeObserver) themeObserver.disconnect()
  canvasRef.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('keydown', onKeyDown)
})
</script>
