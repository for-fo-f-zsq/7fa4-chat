<script setup>
/**
 * 总览：与原「用户统计」页对齐的核心分析视图 + 运营待办。
 *
 * 数据来源：
 *  - legacyApi.stats()      → /api/stats  两次调用（明细与聚合分开，语义清晰）
 *  - legacyApi.statsUsers() → 同上，取 records/持久化用户明细（**仅登录可见**）
 *  - legacyApi.listFeedback() / adminPosters() → 运营队列
 *  - api.getAudit()         → 最近管理动作
 *
 * ⚠️ 从旧 dev-index.html 找回的功能（2026-10-02 重写时曾丢失）：
 *    ① KPI「昨日活跃」「近 7 日日均活跃」 ② 日活 + **累计用户**双线图
 *    ③ **用户明细表**（用户/UID/学校/版本/活跃天数/最后活跃），仅登录可见。
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { legacyApi } from '@/lib/legacy-api.js'
import { api } from '@/lib/api.js'
import { session, can, registerPoller, unregisterPoller, markSynced } from '@/lib/store.js'
import { relTime, roleLabel, errText } from '@/lib/util.js'
import TableSkeleton from '@/components/TableSkeleton.vue'
import EmptyState from '@/components/EmptyState.vue'

const stats = ref(null)
const userInfo = ref({ admin: false, adminUser: '', total: 0, users: [] })
const posterCounts = ref({ pending: 0, approved: 0, rejected: 0, pinned: 0 })
const feedbackList = ref([])
const loading = ref(true)
const loadError = ref('')
const recentAudit = ref([])

// 用户明细表：默认按最后活跃倒序（最近在用的排前面）
const userSort = ref('lastSeen')
const userQuery = ref('')
const USER_PAGE = 25
const userPage = ref(1)

async function loadStats(silent) {
  if (!silent) loading.value = true
  try {
    const [st, u, pending, approved, rejected] = await Promise.all([
      legacyApi.stats(),
      legacyApi.statsUsers().catch(() => ({ admin: false, adminUser: '', total: 0, users: [] })),
      legacyApi.adminPosters('pending').catch(() => ({ items: [] })),
      legacyApi.adminPosters('approved').catch(() => ({ items: [] })),
      legacyApi.adminPosters('rejected').catch(() => ({ items: [] })),
    ])
    stats.value = st
    userInfo.value = u
    posterCounts.value = {
      pending: pending.items.length,
      approved: approved.items.length,
      rejected: rejected.items.length,
      pinned: approved.items.filter((p) => p.pinned).length,
    }
    loadError.value = ''
  } catch (e) {
    if (!silent) loadError.value = errText(e)
  } finally {
    loading.value = false
  }
}

async function loadFeedback() {
  try {
    feedbackList.value = await legacyApi.listFeedback()
  } catch {
    feedbackList.value = null
  }
}

async function loadAudit() {
  if (!can('audit.view')) return
  try {
    const r = await api.getAudit({ limit: 8 })
    recentAudit.value = (r && r.items) || []
  } catch {
    /* 审计不可读不该影响总览 */
  }
}

async function refreshAll() {
  await Promise.all([loadStats(true), loadFeedback(), loadAudit()])
  markSynced()
}

onMounted(async () => {
  await Promise.all([loadStats(false), loadFeedback(), loadAudit()])
  // 折线图高度跟随容器宽度（窗口缩放 / 半屏时保持观感，避免被压成一条）
  syncChartHeight()
  if (typeof ResizeObserver !== 'undefined') {
    chartRo = new ResizeObserver(() => syncChartHeight())
    nextTick(() => { if (chartBox.value) chartRo.observe(chartBox.value) })
  }
  window.addEventListener('resize', syncChartHeight)
  registerPoller('overview', refreshAll)
})
onBeforeUnmount(() => {
  unregisterPoller('overview')
  window.removeEventListener('resize', syncChartHeight)
  if (chartRo) { chartRo.disconnect(); chartRo = null }
})

// ---------- 派生数字（口径与原页一致） ----------
const agg = computed(() => {
  const s = (stats.value && stats.value.stats) || {}
  const last30 = Array.isArray(s.last_30_days) ? s.last_30_days : []
  // 累计用户序列（旧页蓝线）：[{date,total}]，与 last_30_days 等长
  const cum = Array.isArray(s.cumulative) ? s.cumulative : []

  const series = last30.map((d) => d.active || 0)
  const today = series.length ? series[series.length - 1] : 0
  const yest = series.length > 1 ? series[series.length - 2] : 0
  const last7 = series.slice(-7)
  const avg7 = last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : 0
  const total7 = last7.reduce((a, b) => a + b, 0)
  const total30 = series.reduce((a, b) => a + b, 0)

  const pc = posterCounts.value
  const fb = feedbackList.value || []

  return {
    totalUsers: s.total_users != null ? s.total_users : stats.value?.total || 0,
    today,
    yest,
    avg7,
    total7,
    total30,
    pending: pc.pending || 0,
    approved: pc.approved || 0,
    rejected: pc.rejected || 0,
    pinned: pc.pinned || 0,
    fbTotal: fb.length,
    versions: Object.entries(s.version_weekly || {}).sort((a, b) => b[1] - a[1]),
    last30,
    cum,
    series,
    // 今日 vs 昨日（旧页文案口径：今日多则为「较昨日 +N」）
    todayTrend: today - yest,
  }
})

// 主 KPI：回到旧页的四张「用户」卡（运营数字下沉到下面的待办区）
// icon 为 Font Awesome 类名（自托管）
const cards = computed(() => [
  { key: 'users', label: '累计访问用户', value: agg.value.totalUsers, icon: 'fa-users', tone: 'accent' },
  { key: 'today', label: '今日活跃', value: agg.value.today, icon: 'fa-fire', tone: 'ok',
    sub: agg.value.todayTrend > 0 ? '较昨日 +' + agg.value.todayTrend
      : agg.value.todayTrend < 0 ? '较昨日 ' + agg.value.todayTrend : '与昨日持平' },
  { key: 'yest', label: '昨日活跃', value: agg.value.yest, icon: 'fa-arrow-trend-up', tone: 'warn',
    sub: '按北京时间统计' },
  { key: 'avg7', label: '近 7 日日均活跃', value: agg.value.avg7.toFixed(1), icon: 'fa-chart-line', tone: 'accent',
    sub: '近7日累计 ' + agg.value.total7 + ' 人次' },
])

// ---------- 双线趋势图（日活 + 累计用户，纯 SVG + 悬停提示） ----------
/**
 * 折线图可视高度：按当前容器宽度反算，保持约 2.78:1（640:230）的观感。
 * 这样无论是半屏还是宽屏，「缩小后」都不会变成一条压扁的细线。
 * ⚠️ 必须声明在 chart 之前：虽然 computed 是惰性求值，但写在后面容易被误读成 TDZ 风险。
 */
const H = ref(230)
const chartBox = ref(null)
let chartRo = null
function syncChartHeight() {
  const el = chartBox.value
  if (!el) return
  const w = el.clientWidth
  if (!w) return
  const h = Math.round(Math.min(300, Math.max(200, w / 2.78)))
  if (h !== H.value) H.value = h
}

/**
 * 口径与原「用户统计」页一致：**两条线共用同一个纵轴**（取两者最大值），
 * 这是旧页的做法，保持视觉一致。图本身是左侧宽栏（1.7fr），右侧留给版本环图。
 */
const chart = computed(() => {
  const series = agg.value.series
  if (!series.length) return null
  const cum = agg.value.cum
  // W:H 比例决定折线图在给定高度下的视觉密度。
  // ⚠️ SVG 用了 preserveAspectRatio="none"，实际宽高比由 CSS 决定，
  //    但一屏宽度很宽时（如 1440 宽栏的 1.7fr ≈ 780px），若高度不变就会被压扁。
  //    所以用 ResizeObserver 测出真实渲染宽度，再按 2.78:1 反算高度（钳制在 200~300px）。
  const W = 640
  const PAD_L = 34, PAD_R = 12, PAD_T = 12, PAD_B = 12
  const plotW = W - PAD_L - PAD_R
  const stepX = plotW / Math.max(1, series.length - 1)
  const xAt = (i) => PAD_L + i * stepX
  const plotH = H.value - PAD_T - PAD_B

  // 两条线共用纵轴（旧页做法）：取日活与累计两者的最大值，向上取整到好看档位
  const cumVals = cum.length === series.length ? cum.map((d) => d.total || 0) : []
  const max = niceCeil(Math.max(5, ...series, ...cumVals))
  const y = (v) => PAD_T + plotH - (v / max) * plotH

  const pts = series.map((v, i) => [xAt(i), y(v)])
  const path = (arr) => arr.map(([x, yy], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + yy.toFixed(1)).join(' ')
  const line = path(pts)
  const area = line + ' L' + xAt(series.length - 1).toFixed(1) + ' ' + (PAD_T + plotH) + ' L' + PAD_L + ' ' + (PAD_T + plotH) + ' Z'

  const cumPts = cum.length === series.length ? cum.map((d, i) => [xAt(i), y(d.total || 0)]) : []
  const cumLine = cumPts.length ? path(cumPts) : ''
  const cumLast = cumPts.length ? cumPts[cumPts.length - 1] : null

  // X 轴刻度：首、末 + 每 5 天一个（旧页规则）
  const ticks = []
  for (let i = 0; i < series.length; i++) {
    if (i % 5 === 0 || i === series.length - 1) {
      ticks.push({ x: xAt(i), label: (agg.value.last30[i]?.date || '').slice(5) })
    }
  }

  // 纵轴刻度：4 档等分（0 / 1/3 / 2/3 / 满）。
  // ⚠️ max 已由 niceCeil 保证「刚好包住两条线的最高点且是整齐档位」，
  //    所以顶部那档不会被浪费（早期 bug：max 取 150 而实际峰值 121，顶部空一大截）。
  const axisTicks = [0, 1 / 3, 2 / 3, 1].map((f) => ({
    y: PAD_T + f * plotH,
    value: Math.round(max * (1 - f)),
  }))

  return {
    W, H: H.value, line, area, cumLine, cumLast, ticks, axisTicks, max,
    padL: PAD_L, padR: PAD_R, padT: PAD_T, plotH, plotW, stepX, xAt, y,
    series, cumVals,
    // 实际峰值（用于判断顶部留白是否合理）
    peak: Math.max(0, ...series, ...cumVals),
  }
})

// ---------- 版本分布环图（Donut，原页同名功能） ----------
/** 与原页一致的配色序列（8 色循环） */
const PIE_COLORS = ['#4f7dff', '#8b5cf6', '#07c160', '#f59e0b', '#e64340', '#06b6d4', '#ec4899', '#84cc16']

/**
 * 生成圆环扇区。
 *
 * ⚠️ 用 SVG stroke-dasharray 画环比手算 arc 路径更省事，且 100% 时不会有接缝。
 * ⚠️ 但扇区之间必须留「视觉间隙」：占比 1% 的扇区弧长只有约 3.9px，
 *    和相邻圆环挤在一起根本分不出来（用户截图里就是这个观感）。
 *    这里给每段实线两端各切掉 GAP/2，让相邻扇区之间有明确的缝。
 */
const donut = computed(() => {
  const entries = agg.value.versions // 已按人数倒序
  const total = entries.reduce((s, [, n]) => s + n, 0)
  if (!total) return null
  const R = 62
  const C = 2 * Math.PI * R
  // 扇区间隙（弧长像素）。段太短时不再切，否则会变成负长度。
  const GAP = entries.length > 1 ? 2.2 : 0
  let offset = 0
  const segs = entries.map(([v, n], i) => {
    const frac = n / total
    const full = frac * C
    // 很短的小扇区不切缝（切了会看不见），长扇区正常切
    const len = full > GAP * 2 ? full - GAP : full
    const seg = {
      version: v, count: n,
      pct: (frac * 100).toFixed(1),
      color: PIE_COLORS[i % PIE_COLORS.length],
      // dasharray = "实线长 空白长"，空白用剩余周长即可
      dash: len.toFixed(2) + ' ' + Math.max(0, C - len).toFixed(2),
      // 起点偏移：用「已累计占比」而非切缝后的长度，保证与真实占比对齐
      offset: (-offset * C).toFixed(2),
      // 微小扇区（<2%）在环上几乎不可见，标记出来让图例可以提示
      tiny: frac < 0.02,
    }
    offset += frac
    return seg
  })
  return { R, C, total, segs }
})

// ---------- 图表悬停（用户反馈：鼠标放上去没有当天信息） ----------
const hoverIdx = ref(-1)
/**
 * 把鼠标位置换算成数据下标。
 * ⚠️ SVG 用了 preserveAspectRatio="none"，会被横向拉伸，所以不能用 offsetX 直接除宽，
 *    必须走 getBoundingClientRect 拿到「实际渲染宽」再按比例映射回 viewBox 坐标。
 */
function onChartMove(e) {
  const c = chart.value
  if (!c) return
  const rect = e.currentTarget.getBoundingClientRect()
  if (!rect.width) return
  // 渲染坐标 → viewBox 坐标
  const vx = ((e.clientX - rect.left) / rect.width) * c.W
  // viewBox 坐标 → 数据下标（四舍五入到最近的采样点）
  const i = Math.round((vx - c.padL) / c.stepX)
  hoverIdx.value = i < 0 || i >= c.series.length ? -1 : i
}
function onChartLeave() { hoverIdx.value = -1 }

/** 悬停详情：日期 + 两条线的值 */
const hoverInfo = computed(() => {
  const i = hoverIdx.value
  const c = chart.value
  if (i < 0 || !c) return null
  const d = agg.value.last30[i] || {}
  const cumTotal = c.cumVals.length ? c.cumVals[i] : null
  return {
    i,
    x: c.xAt(i),
    yOk: c.y(c.series[i]),
    yCum: cumTotal != null ? c.y(cumTotal) : null,
    active: c.series[i],
    date: d.date || '',
    cum: cumTotal,
    // 提示框靠右时向左翻转，避免溢出卡片
    flip: i > c.series.length - 8,
  }
})

/**
 * 把纵轴上限取整到「整齐档位」，且**尽量贴近真实峰值**。
 *
 * ⚠️ 早期实现直接用 [10,20,25,50,100,200,...] 找第一个 ≥ v 的档，
 *    峰值 121 会被抬到 150 —— 顶部 1/5 的画布永远空着，刻度读数也难看。
 * 现在改为：取 1/2/2.5/5 × 10^n 中**最小且 ≥ v** 的那一档，
 * 并把步长再细分到 4 等分（刻度就是 0 / max/3 / 2max/3 / max）。
 */
function niceCeil(v) {
  if (!(v > 0)) return 10
  if (v <= 10) return 10
  const exp = Math.floor(Math.log10(v))
  const pow = Math.pow(10, exp)
  // 候选倍率密一点，避免 121 → 150 这种 19% 的顶部浪费
  for (const m of [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const cand = m * pow
    if (cand >= v) return Math.round(cand)
  }
  return Math.ceil(v / pow) * pow
}

// ---------- 用户明细 ----------
const filteredUsers = computed(() => {
  const q = userQuery.value.trim().toLowerCase()
  let list = userInfo.value.users
  if (q) {
    list = list.filter((u) =>
      String(u.name).toLowerCase().includes(q) ||
      String(u.uid).includes(q) ||
      String(u.school).toLowerCase().includes(q) ||
      String(u.version).includes(q)
    )
  }
  const by = userSort.value
  return list.slice().sort((a, b) => {
    if (by === 'lastSeen') return (b.lastSeen || 0) - (a.lastSeen || 0)
    if (by === 'activeDays') return (b.activeDays || 0) - (a.activeDays || 0)
    if (by === 'uid') return (a.uid || 0) - (b.uid || 0)
    if (by === 'name') return String(a.name).localeCompare(String(b.name), 'zh')
    return 0
  })
})
const userPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / USER_PAGE)))
const pagedUsers = computed(() =>
  filteredUsers.value.slice((userPage.value - 1) * USER_PAGE, userPage.value * USER_PAGE)
)
// 筛选/排序变化时回到第 1 页，避免停在空页
function onFilterChange() { userPage.value = 1 }

const initialOf = (u) => {
  const n = String(u.name || '').trim()
  return n ? n.charAt(0).toUpperCase() : '?'
}
</script>

<template>
  <div class="col" style="gap: 18px">
    <!-- 欢迎条 -->
    <div class="card welcome">
      <div>
        <h2 class="welcome__title">
          你好，{{ session.user?.display_name || session.user?.username }}
        </h2>
        <p class="muted" style="font-size: 13px">
          当前身份：{{ roleLabel(session.user?.role) }} ·
          上次登录 {{ relTime(session.user?.last_login_at) }}
        </p>
      </div>
      <div class="row wrap">
        <span class="badge" :class="session.polling ? 'badge--ok' : 'badge--muted'">
          {{ session.polling ? '自动刷新中' : '已暂停刷新' }}
        </span>
        <span class="badge badge--accent">
          每 {{ Math.round((session.config.poll_interval_ms || 15000) / 1000) }} 秒同步
        </span>
      </div>
    </div>

    <div v-if="loadError" class="card">
      <EmptyState icon="fa-triangle-exclamation" title="统计数据加载失败" :sub="loadError">
        <button class="btn btn--sm" @click="loadStats(false)"><i class="fa-solid fa-arrow-rotate-right" /><span>重试</span></button>
      </EmptyState>
    </div>
    <template v-else>
      <!-- 主 KPI（与原用户统计页一致的四张用户卡） -->
      <div class="grid">
        <div v-for="c in cards" :key="c.key" class="card stat">
          <div class="stat__icon" :class="'stat__icon--' + c.tone">
            <i class="fa-solid" :class="c.icon" />
          </div>
          <div class="grow">
            <div v-if="loading" class="skeleton" style="width: 58px; height: 22px" />
            <div v-else class="stat__value">{{ c.value }}</div>
            <div class="stat__label">{{ c.label }}</div>
            <div v-if="c.sub && !loading" class="stat__sub">{{ c.sub }}</div>
          </div>
        </div>
      </div>

      <!-- 趋势图 + 版本环图：左右并排（原页 charts-row = 1.7fr : 1fr） -->
      <div class="charts-row">
        <!-- 左：近 30 天活跃与累计趋势（宽栏） -->
        <div class="card">
          <div class="card__head">
            <div>
              <div class="card__title">近 30 天活跃与累计趋势</div>
              <div class="card__sub">绿线：每日活跃 · 蓝线：累计用户</div>
            </div>
            <div class="row" style="gap: 12px">
              <span class="legend"><i class="legend__dot" style="background: var(--ok)" />每日活跃</span>
              <span class="legend"><i class="legend__dot" style="background: var(--accent)" />累计用户</span>
            </div>
          </div>
          <div class="card__body">
            <div v-if="loading" class="skeleton" style="height: 230px" />
            <div v-else-if="!chart" class="muted" style="font-size: 13px">暂无数据</div>
            <template v-else>
              <div class="chart-wrap" ref="chartBox">
                <svg
                  :viewBox="`0 0 ${chart.W} ${chart.H}`" class="chart" preserveAspectRatio="none"
                  :style="{ height: chart.H + 'px' }"
                  @mousemove="onChartMove" @mouseleave="onChartLeave"
                >
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="var(--ok)" stop-opacity="0.26" />
                      <stop offset="100%" stop-color="var(--ok)" stop-opacity="0.02" />
                    </linearGradient>
                  </defs>
                  <!-- 横向网格 + 纵轴刻度数字（同一 SVG，避免与拉伸错位） -->
                  <g v-for="(t, i) in chart.axisTicks" :key="'g' + i">
                    <line
                      :x1="chart.padL" :y1="t.y" :x2="chart.W - chart.padR" :y2="t.y"
                      stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"
                    />
                    <text :x="chart.padL - 6" :y="t.y + 3.5" text-anchor="end" class="chart-ax">{{ t.value }}</text>
                  </g>

                  <!-- 悬停十字线（画在折线下方，不遮线） -->
                  <line
                    v-if="hoverInfo"
                    :x1="hoverInfo.x" :y1="chart.padT" :x2="hoverInfo.x" :y2="chart.padT + chart.plotH"
                    stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="2 3"
                  />

                  <path :d="chart.area" fill="url(#areaGrad)" />
                  <path
                    :d="chart.line" fill="none" stroke="var(--ok)" stroke-width="2"
                    stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
                  />
                  <template v-if="chart.cumLine">
                    <path
                      :d="chart.cumLine" fill="none" stroke="var(--accent)" stroke-width="2"
                      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"
                    />
                    <circle :cx="chart.cumLast[0]" :cy="chart.cumLast[1]" r="3.5" fill="var(--accent)" />
                  </template>

                  <!-- 悬停圆点（画在最上层） -->
                  <template v-if="hoverInfo">
                    <circle
                      :cx="hoverInfo.x" :cy="hoverInfo.yOk" r="4"
                      fill="var(--bg-elev)" stroke="var(--ok)" stroke-width="2"
                    />
                    <circle
                      v-if="hoverInfo.yCum != null" r="4"
                      :cx="hoverInfo.x" :cy="hoverInfo.yCum"
                      fill="var(--bg-elev)" stroke="var(--accent)" stroke-width="2"
                    />
                  </template>
                </svg>

                <!-- 悬停提示框（HTML 覆盖层：文字不被 preserveAspectRatio 拉伸，且可换行） -->
                <div
                  v-if="hoverInfo"
                  class="chart-tip"
                  :class="{ 'chart-tip--flip': hoverInfo.flip }"
                  :style="{ left: (hoverInfo.x / chart.W * 100) + '%' }"
                >
                  <div class="chart-tip__date">{{ hoverInfo.date }}</div>
                  <div class="chart-tip__row">
                    <i class="legend__dot" style="background: var(--ok)" />
                    每日活跃 <b>{{ hoverInfo.active }}</b>
                  </div>
                  <div v-if="hoverInfo.cum != null" class="chart-tip__row">
                    <i class="legend__dot" style="background: var(--accent)" />
                    累计用户 <b>{{ hoverInfo.cum }}</b>
                  </div>
                </div>
              </div>

              <!-- X 轴刻度用 flex 定位会与 SVG 拉伸不一致，这里也画成独立 SVG -->
              <svg :viewBox="`0 0 ${chart.W} 16`" class="chart-axis" preserveAspectRatio="none" aria-hidden="true">
                <text
                  v-for="(t, i) in chart.ticks" :key="i"
                  :x="t.x" y="11" text-anchor="middle" class="chart-axis__t"
                >{{ t.label }}</text>
              </svg>
            </template>
          </div>
        </div>

        <!-- 右：近一周活跃用户版本分布（环图，原页同名功能） -->
        <div class="card">
          <div class="card__head">
            <div>
              <div class="card__title">近一周活跃用户版本分布</div>
              <div class="card__sub">未上报版本的客户端按 3.2.3 计</div>
            </div>
          </div>
          <div class="card__body">
            <div v-if="loading" class="skeleton" style="height: 168px" />
            <EmptyState v-else-if="!donut" icon="fa-box" title="近一周暂无上报" />
            <div v-else class="pie-wrap">
              <!-- 环图：用 stroke-dasharray 逐段画，段间留缝，避免小扇区糊在一起 -->
              <svg viewBox="0 0 168 168" class="pie" role="img" aria-label="版本分布环图">
                <g transform="translate(84,84) rotate(-90)">
                  <circle r="62" fill="none" stroke="var(--bg-sunken)" stroke-width="20" />
                  <circle
                    v-for="(s, i) in donut.segs" :key="i"
                    r="62" fill="none" :stroke="s.color" stroke-width="20"
                    :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset"
                    :class="{ 'pie__seg--tiny': s.tiny }"
                  />
                </g>
                <text x="84" y="79" text-anchor="middle" class="pie__total">{{ donut.total }}</text>
                <text x="84" y="95" text-anchor="middle" class="pie__cap">活跃用户</text>
              </svg>
              <div class="pie-legend">
                <div v-for="(s, i) in donut.segs" :key="i" class="pie-legend__item">
                  <!-- 色块而非小圆点：小圆点在 8 行密排时几乎看不出颜色 -->
                  <i class="pie-legend__sw" :style="{ background: s.color }" />
                  <span class="pie-legend__v mono">v{{ s.version }}</span>
                  <b class="pie-legend__n">{{ s.count }} 人</b>
                  <span class="pie-legend__pct">{{ s.pct }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 用户明细（旧页核心；仅登录可见，服务端未登录不返回 records） -->
      <div class="card">
        <div class="card__head">
          <div>
            <div class="card__title">用户明细</div>
            <div class="card__sub">
              <template v-if="userInfo.admin">共 {{ userInfo.total }} 人 · 数据来自客户端匿名上报</template>
              <template v-else>仅管理员登录后可见</template>
            </div>
          </div>
          <div v-if="userInfo.admin" class="row" style="gap: 8px">
            <input
              v-model="userQuery" class="input input--sm" style="width: 168px"
              type="search" placeholder="搜索昵称 / UID / 学校"
              @input="onFilterChange"
            />
            <select v-model="userSort" class="select select--sm" @change="onFilterChange">
              <option value="lastSeen">按最后活跃</option>
              <option value="activeDays">按活跃天数</option>
              <option value="uid">按 UID</option>
              <option value="name">按昵称</option>
            </select>
          </div>
        </div>

        <TableSkeleton v-if="loading" :rows="6" :cols="6" />
        <EmptyState
          v-else-if="!userInfo.admin"
          icon="fa-lock"
          title="用户个人信息不对未登录访客展示"
          sub="昵称 / 学校 / 活跃情况需管理员登录后查看"
        />
        <EmptyState
          v-else-if="!filteredUsers.length"
          icon="fa-user-shield"
          :title="userQuery ? '没有匹配的用户' : '暂无用户'"
          :sub="userQuery ? '试试换个关键词' : ''"
        />
        <template v-else>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 26%">用户</th>
                  <th style="width: 11%">UID</th>
                  <th style="width: 24%">学校</th>
                  <th style="width: 12%">版本</th>
                  <th style="width: 12%">活跃天数</th>
                  <th>最后活跃</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in pagedUsers" :key="u.uid">
                  <td>
                    <div class="user-cell">
                      <span class="mini-avatar">{{ initialOf(u) }}</span>
                      <span class="truncate">{{ u.name }}</span>
                    </div>
                  </td>
                  <td class="mono">{{ u.uid }}</td>
                  <td class="muted truncate">{{ u.school || '—' }}</td>
                  <td><span class="badge badge--muted">v{{ u.version }}</span></td>
                  <td class="mono">{{ u.activeDays }} 天</td>
                  <td class="muted nowrap">{{ u.lastSeenText || relTime(u.lastSeen) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="userPages > 1" class="pager">
            <button class="btn btn--sm" :disabled="userPage <= 1" @click="userPage--">上一页</button>
            <span class="muted">第 {{ userPage }} / {{ userPages }} 页 · 共 {{ filteredUsers.length }} 人</span>
            <button class="btn btn--sm" :disabled="userPage >= userPages" @click="userPage++">下一页</button>
          </div>
        </template>
      </div>

      <!-- 待办 + 最近操作：各自独立成卡，放在同一行的左右两栏（窄屏自动上下堆叠） -->
      <div class="ops-row">
        <!-- 左：运营待办队列 -->
        <div class="card">
          <div class="card__head">
            <div>
              <div class="card__title">待办</div>
              <div class="card__sub">需要你关注的队列</div>
            </div>
          </div>
          <div class="card__body" style="padding-top: 12px">
            <div class="todo">
              <span class="todo__icon"><i class="fa-solid fa-hourglass-half" /></span>
              <span class="grow">待审海报</span>
              <span class="badge" :class="agg.pending ? 'badge--warn' : 'badge--muted'">{{ agg.pending }}</span>
            </div>
            <div class="todo">
              <span class="todo__icon"><i class="fa-solid fa-image" /></span>
              <span class="grow">已通过海报</span>
              <span class="badge badge--muted">{{ agg.approved }}</span>
            </div>
            <div class="todo">
              <span class="todo__icon"><i class="fa-solid fa-thumbtack" /></span>
              <span class="grow">置顶海报</span>
              <span class="badge badge--muted">{{ agg.pinned }}</span>
            </div>
            <div class="todo">
              <span class="todo__icon"><i class="fa-solid fa-comment-dots" /></span>
              <span class="grow">用户反馈</span>
              <span class="badge" :class="agg.fbTotal ? 'badge--accent' : 'badge--muted'">{{ agg.fbTotal }}</span>
            </div>
          </div>
        </div>

        <!-- 右：最近管理动作 -->
        <div v-if="can('audit.view')" class="card">
          <div class="card__head">
            <div>
              <div class="card__title">最近操作</div>
              <div class="card__sub">最新的管理动作</div>
            </div>
          </div>
          <TableSkeleton v-if="loading" :rows="4" :cols="3" />
          <EmptyState v-else-if="!recentAudit.length" icon="fa-scroll" title="暂无操作记录" />
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 40%">操作</th>
                  <th style="width: 26%">执行人</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in recentAudit.slice(0, 6)" :key="a.id">
                  <td>
                    <span class="badge" :class="a.result === 'ok' ? 'badge--ok' : 'badge--danger'">
                      {{ a.action_label || a.action }}
                    </span>
                  </td>
                  <td class="mono truncate">{{ a.actor }}</td>
                  <td class="muted nowrap">{{ relTime(a.at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.welcome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 18px 20px;
}
.welcome__title { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; margin-bottom: 3px; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}
/* 窄窗口（如截图里的半屏）时自动降为两列，避免四张卡被压到互相挤字 */
@media (max-width: 1100px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }

.stat { display: flex; align-items: center; gap: 13px; padding: 16px 18px; min-width: 0; }
.stat__icon {
  width: 40px; height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: var(--r-md);
  font-size: 18px;
}
.stat__icon--accent { background: var(--accent-soft); color: var(--accent); }
.stat__icon--ok { background: var(--ok-soft); color: var(--ok); }
.stat__icon--warn { background: var(--warn-soft); color: var(--warn); }
.stat__icon > i[class*='fa-'] { font-size: 17px; }
.stat__value {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  /* 长数字（如 121）不被压缩换行 */
  white-space: nowrap;
}
.stat__label { font-size: 12.5px; color: var(--text-3); margin-top: 1px; white-space: nowrap; }
.stat__sub { font-size: 11.5px; color: var(--text-3); margin-top: 3px; white-space: nowrap; }

/* 趋势图 + 版本环图 并排（口径同原页 1.7fr : 1fr）
   ⚠️ align-items 用 stretch：让两卡同高。环图卡高度由内容自然撑开，
      图表卡随之等高，图表 SVG 再靠 flex:1 吃掉剩余空间。 */
.charts-row { display: grid; grid-template-columns: 1.7fr 1fr; gap: 14px; align-items: stretch; }
@media (max-width: 1000px) { .charts-row { grid-template-columns: 1fr; } }
/* 两卡内部都做成纵向 flex，body 撑满，保证同高时内容不塌 */
.charts-row > .card { display: flex; flex-direction: column; min-width: 0; }
.charts-row > .card > .card__body { flex: 1; min-height: 0; }

.chart-wrap { position: relative; }
/**
 * 纵横比：由 syncChartHeight 按容器宽度反算 SVG 高度（钳 200~300px），
 * 使折线不被压扁；两卡等高的最终对齐由 .charts-row 的 stretch + body flex:1 保证。
 */
.chart { width: 100%; display: block; cursor: crosshair; }
.chart-axis { width: 100%; height: 16px; display: block; }

.chart-axis__t { font-size: 10px; fill: var(--text-3); }
/* 纵轴刻度数字（与折线同色系，读图不用猜） */
.chart-ax { font-size: 10px; fill: var(--text-3); font-variant-numeric: tabular-nums; }

/* 悬停提示框：用 HTML 而非 SVG <text>，避免被 preserveAspectRatio="none" 横向拉伸变形 */
.chart-tip {
  position: absolute;
  top: 6px;
  transform: translateX(10px);
  pointer-events: none;
  z-index: 3;
  min-width: 108px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.13);
  font-size: 12px;
  line-height: 1.55;
}
/* 靠近右边界时翻到左侧，防止溢出卡片 */
.chart-tip--flip { transform: translateX(calc(-100% - 10px)); }
.chart-tip__date { font-weight: 650; margin-bottom: 3px; font-variant-numeric: tabular-nums; }
.chart-tip__row { display: flex; align-items: center; gap: 6px; color: var(--text-2); white-space: nowrap; }
.chart-tip__row b { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; }

/* 版本环图 */
.pie-wrap {
  display: flex; align-items: center; justify-content: center;
  gap: 18px; flex-wrap: wrap;
  /* 卡片被拉高时环图居中，不贴着顶部 */
  height: 100%; min-height: 168px;
}
.pie { width: 160px; height: 160px; flex: none; display: block; }
.pie__seg--tiny { stroke-opacity: 0.85; }
.pie__total { font-size: 23px; font-weight: 700; fill: var(--text); font-variant-numeric: tabular-nums; }
.pie__cap { font-size: 10.5px; fill: var(--text-3); }
.pie-legend { flex: 1; min-width: 132px; display: flex; flex-direction: column; gap: 7px; font-size: 12.5px; }
.pie-legend__item { display: flex; align-items: center; gap: 7px; }
/* 色块比小圆点更易分辨（8 行密排时尤其明显） */
.pie-legend__sw { width: 10px; height: 10px; border-radius: 3px; flex: none; display: inline-block; }
.pie-legend__v { color: var(--text-2); }
.pie-legend__n { margin-left: auto; font-variant-numeric: tabular-nums; }
.pie-legend__pct {
  width: 44px; text-align: right; flex: none;
  color: var(--text-3); font-variant-numeric: tabular-nums;
}

.legend { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); }
.legend__dot { width: 8px; height: 8px; border-radius: var(--r-full); display: inline-block; flex: none; }

/* 用户明细 */
.user-cell { display: flex; align-items: center; gap: 9px; min-width: 0; }
.mini-avatar {
  width: 26px; height: 26px; flex: none;
  display: grid; place-items: center;
  border-radius: var(--r-full);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px; font-weight: 650;
}

.todo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  font-size: 13.5px;
  border-bottom: 1px solid var(--border);
}
.todo:last-child { border-bottom: none; }
.todo__icon { width: 20px; text-align: center; flex: none; color: var(--text-3); font-size: 13px; }

/* 待办 + 最近操作：两张独立卡并排一行（各自成框，不合并为一张） */
.ops-row { display: grid; grid-template-columns: 1fr 1.35fr; gap: 14px; align-items: start; }
@media (max-width: 900px) { .ops-row { grid-template-columns: 1fr; } }

.pager {
  display: flex; align-items: center; justify-content: center; gap: 14px;
  padding: 12px 4px 4px; font-size: 12.5px;
}
</style>
