import { ref } from 'vue'

/**
 * 应用内轻提示通道。
 *
 * 两种渲染路径共用同一份数据与计时策略：
 * - 主窗口有 UiToastHost（hostCount > 0）→ Vue 渲染 toasts；
 * - 独立工具窗（GraphTool / ImageTool / Markdown …）没有宿主 → document.body 上建兜底容器。
 *
 * 这里只处理「什么时候出现、显示什么、什么时候消失」，样式与动效分别交给
 * UiToastHost.css 和兜底 DOM 的内联样式，避免把 UI 逻辑塞进工具窗 bundle。
 */

const MAX_VISIBLE = 4
const DEFAULT_DURATION = 2400
const DEFAULT_POSITION = 'top'
const TYPES = ['info', 'success', 'warning', 'error']
const POSITIONS = ['top', 'top-left', 'top-right', 'bottom', 'bottom-left', 'bottom-right']

export const toasts = ref([])
/** 宿主位置：setToastPosition 改写，宿主用它拼 ui-toast-host--<pos> */
export const toastPosition = ref(DEFAULT_POSITION)

let nextId = 1
// 宿主数量：>=1 走 Vue 渲染；0 说明这是没有 UI 宿主的独立工具窗，只能走 DOM 兜底
let hostCount = 0
let fallbackContainer = null

/** id -> 计时元数据。放在 Map 里而不是响应式条目上，避免每次暂停/续期都触发重渲染 */
const timers = new Map()
/** 兜底模式下的条目索引：dismissToast / updateToast 对两种模式行为一致 */
const fallbackItems = new Map()
const fallbackByKey = new Map()

/* ------------------------------------------------------------------ *
 * 归一化
 * ------------------------------------------------------------------ */

// 旧调用里有大量 'danger'（历史写法），统一归到 error 视觉
function normalizeType(type) {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : ''
  if (t === 'danger' || t === 'err' || t === 'failed') return 'error'
  return TYPES.includes(t) ? t : 'info'
}

// duration=0 表示常驻（不自动关），负数/非法值回落到默认时长
function normalizeDuration(value, fallback = DEFAULT_DURATION) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function normalizePosition(pos) {
  return POSITIONS.includes(pos) ? pos : DEFAULT_POSITION
}

function normalizeKey(key) {
  return key === undefined || key === null || key === '' ? null : String(key)
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') return null
  const label = action.label === undefined || action.label === null ? '' : String(action.label)
  if (!label) return null
  return {
    label,
    onClick: typeof action.onClick === 'function' ? action.onClick : null,
    keepOpen: action.keepOpen === true
  }
}

function toText(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/** 新条目要有完整字段：未指定的字段落到默认值 */
function withDefaults(payload) {
  return {
    message: payload.message === undefined ? '' : payload.message,
    title: payload.title === undefined ? '' : payload.title,
    type: payload.type === undefined ? 'info' : payload.type,
    icon: payload.icon === undefined ? '' : payload.icon,
    duration: payload.duration === undefined ? DEFAULT_DURATION : payload.duration,
    key: payload.key === undefined ? null : payload.key,
    dismissible: payload.dismissible === undefined ? true : payload.dismissible,
    progress: payload.progress === undefined ? true : payload.progress,
    action: payload.action === undefined ? null : payload.action
  }
}

/* ------------------------------------------------------------------ *
 * 计时：暂停 / 续期 / 重置
 * ------------------------------------------------------------------ */

function clearTimer(id) {
  const meta = timers.get(id)
  if (meta && meta.timeoutId) {
    clearTimeout(meta.timeoutId)
    meta.timeoutId = null
  }
}

function armTimer(id, ms) {
  const meta = timers.get(id)
  if (!meta) return
  clearTimer(id)
  if (!(ms > 0)) return
  meta.remaining = ms
  meta.startedAt = Date.now()
  meta.timeoutId = setTimeout(() => {
    meta.timeoutId = null
    timers.delete(id)
    dismissToast(id)
  }, ms)
}

function startTimer(id, duration) {
  timers.set(id, { duration, remaining: duration, startedAt: 0, timeoutId: null, paused: false })
  if (duration > 0) armTimer(id, duration)
}

/** 重置计时但保留「鼠标还压在上面」的状态：否则 hover 中来的重复提示会偷偷溜走 */
function resetTimer(id, duration) {
  const meta = timers.get(id)
  const wasPaused = !!(meta && meta.paused)
  if (meta && meta.timeoutId) clearTimeout(meta.timeoutId)
  timers.set(id, { duration, remaining: duration, startedAt: 0, timeoutId: null, paused: wasPaused })
  if (duration > 0 && !wasPaused) armTimer(id, duration)
}

/** 悬停暂停：把已经走过的时间从剩余时间里扣掉，移出后接着走完 */
export function pauseToast(id) {
  const meta = timers.get(id)
  if (!meta || meta.paused) return
  meta.paused = true
  if (meta.timeoutId) {
    clearTimeout(meta.timeoutId)
    meta.timeoutId = null
    meta.remaining = Math.max(0, meta.remaining - (Date.now() - meta.startedAt))
  }
}

/** 悬停结束：用剩余时间续期，而不是重新给满时长 */
export function resumeToast(id) {
  const meta = timers.get(id)
  if (!meta || !meta.paused) return
  meta.paused = false
  if (!(meta.duration > 0)) return
  if (meta.remaining > 0) armTimer(id, meta.remaining)
  else dismissToast(id)
}

/* ------------------------------------------------------------------ *
 * 宿主渲染路径
 * ------------------------------------------------------------------ */

function buildEntry(id, raw) {
  const payload = withDefaults(raw)
  return {
    id,
    message: payload.message,
    title: payload.title,
    type: payload.type,
    icon: payload.icon,
    count: 1,
    duration: payload.duration,
    key: payload.key,
    dismissible: payload.dismissible,
    progress: payload.progress,
    action: payload.action,
    // 进度条靠 CSS 动画跑；revision 变化时宿主换 key 重挂节点，动画才会从头开始
    revision: 1,
    createdAt: Date.now()
  }
}

function enqueue(raw) {
  const payload = withDefaults(raw)
  // 队列上限：挤掉最旧的一条非常驻提示；全是常驻才退而挤最旧的一条
  while (toasts.value.length >= MAX_VISIBLE) {
    const victim = toasts.value.find((t) => t.duration > 0) || toasts.value[0]
    if (!victim) break
    dismissToast(victim.id)
  }
  const id = nextId++
  toasts.value.push(buildEntry(id, payload))
  startTimer(id, payload.duration)
  return id
}

/**
 * 就地更新一条提示。bump=true 表示「同 key 又弹了一次」（count+1 并置顶）。
 * 只合并 payload 里出现过的字段，未出现的保持原值。
 */
function mergeEntry(id, payload, bump = false) {
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx === -1) return null
  const entry = toasts.value[idx]
  const next = {
    message: payload.message === undefined ? entry.message : payload.message,
    title: payload.title === undefined ? entry.title : payload.title,
    type: payload.type === undefined ? entry.type : payload.type,
    icon: payload.icon === undefined ? entry.icon : payload.icon,
    duration: payload.duration === undefined ? entry.duration : payload.duration,
    key: payload.key === undefined ? entry.key : payload.key,
    dismissible: payload.dismissible === undefined ? entry.dismissible : payload.dismissible,
    progress: payload.progress === undefined ? entry.progress : payload.progress,
    // action 不沿用：同 key 重复弹且这次没带 action 时，旧按钮和旧 onClick 不能留在屏幕上
    action: payload.action === undefined ? (bump ? null : entry.action) : payload.action,
    count: bump ? entry.count + 1 : payload.count === undefined ? entry.count : payload.count,
    revision: (entry.revision || 1) + 1
  }
  Object.assign(entry, next)
  // 重置计时（重复提示要把停留时间重新给满）
  resetTimer(id, entry.duration)
  if (bump) {
    // 数组末位 = 最靠近屏幕边缘的一条 ⇒ 视觉上「置顶」
    toasts.value.splice(idx, 1)
    toasts.value.push(entry)
  }
  return entry
}

/* ------------------------------------------------------------------ *
 * 兜底渲染路径（独立工具窗：没有 UiToastHost）
 * ------------------------------------------------------------------ */

// 类型色：令牌缺失时给个能看的颜色，工具窗未必加载完整主题
const TYPE_INK = {
  info: 'var(--brand, #3C8CE7)',
  success: 'var(--status-success-ink, #4caf50)',
  warning: 'var(--status-warning-ink, #ff9800)',
  error: 'var(--status-danger-ink, #e74c3c)'
}
const TYPE_BORDER = {
  info: 'var(--line-hairline, var(--line, rgba(127, 127, 127, 0.28)))',
  success: 'var(--status-success-border, var(--line, rgba(127, 127, 127, 0.28)))',
  warning: 'var(--status-warning-border, var(--line, rgba(127, 127, 127, 0.28)))',
  error: 'var(--status-danger-border, var(--line, rgba(127, 127, 127, 0.28)))'
}
const TYPE_ICON = {
  info: 'fas fa-circle-info',
  success: 'fas fa-circle-check',
  warning: 'fas fa-triangle-exclamation',
  error: 'fas fa-circle-xmark'
}
const FG = 'var(--fg, var(--text-primary, #f3f4f6))'
const FG_MUTED = 'var(--fg-muted, var(--text-secondary, #9ca3af))'

function requestFrame(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn)
  return setTimeout(fn, 16)
}

function cancelFrame(handle) {
  if (handle === null || handle === undefined) return
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else clearTimeout(handle)
}

// 工具窗不一定加载了 Font Awesome：没有字形就不画图标，别留一个空白方块
function hasGlyph(el) {
  try {
    const cs = window.getComputedStyle(el, '::before')
    const content = cs && cs.content
    return (
      !!content && content !== 'none' && content !== 'normal' && content !== '""' && content !== "''"
    )
  } catch {
    return false
  }
}

function applyFallbackPosition(el, position) {
  const pos = normalizePosition(position)
  el.setAttribute('data-toast-position', pos)
  // 兜底容器跑在没有主题令牌的工具窗里，定位用实打实的像素，别依赖 var() 解析
  el.style.top = ''
  el.style.bottom = ''
  el.style.left = ''
  el.style.right = ''
  el.style.transform = ''
  el.style.alignItems = 'center'
  if (pos.startsWith('top')) el.style.top = '20px'
  else el.style.bottom = '16px'
  if (pos.endsWith('-left')) {
    el.style.left = '16px'
    el.style.alignItems = 'flex-start'
  } else if (pos.endsWith('-right')) {
    el.style.right = '16px'
    el.style.alignItems = 'flex-end'
  } else {
    el.style.left = '50%'
    el.style.transform = 'translateX(-50%)'
  }
}

function ensureFallbackContainer(position) {
  if (typeof document === 'undefined' || !document.body) return null
  if (fallbackContainer && fallbackContainer.isConnected) {
    applyFallbackPosition(fallbackContainer, position)
    return fallbackContainer
  }
  const el = document.createElement('div')
  el.setAttribute('data-ui-toast-fallback', '1')
  el.setAttribute('role', 'region')
  el.setAttribute('aria-label', '通知提示')
  el.setAttribute('aria-live', 'polite')
  // 容器只负责定位且不吃指针事件，否则会挡住下面整块画布；每条提示自己 auto
  el.style.position = 'fixed'
  el.style.zIndex = 'var(--z-toast, 5000)'
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.gap = 'var(--space-2, 8px)'
  el.style.pointerEvents = 'none'
  el.style.maxWidth = 'calc(100vw - 32px)'
  el.style.boxSizing = 'border-box'
  applyFallbackPosition(el, position)
  document.body.appendChild(el)
  fallbackContainer = el
  return el
}

function removeFallbackContainerIfEmpty() {
  const el = fallbackContainer
  if (el && el.childElementCount === 0) {
    el.remove()
    fallbackContainer = null
  }
}

function showFallbackToast(raw) {
  const payload = withDefaults(raw)
  const container = ensureFallbackContainer(raw.position || toastPosition.value)
  if (!container) return null

  // 同 key 复用同一张卡片（工具窗里也常有「连续同一类提示」）
  if (payload.key) {
    const existing = fallbackByKey.get(payload.key)
    if (existing && !existing.destroyed) {
      existing.update({ ...raw, bump: true })
      return existing.id
    }
  }

  // 与宿主一致的队列上限
  while (fallbackItems.size >= MAX_VISIBLE) {
    const oldest = fallbackItems.values().next().value
    if (!oldest) break
    oldest.dismiss()
  }

  const id = nextId++
  const state = {
    message: payload.message,
    title: payload.title,
    type: payload.type,
    icon: payload.icon,
    key: payload.key,
    count: 1,
    duration: payload.duration,
    dismissible: payload.dismissible,
    progress: payload.progress,
    action: payload.action
  }

  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.style.pointerEvents = 'auto'
  el.style.position = 'relative'
  el.style.display = 'flex'
  el.style.alignItems = 'flex-start'
  el.style.gap = 'var(--space-2, 8px)'
  el.style.maxWidth = '380px'
  el.style.boxSizing = 'border-box'
  el.style.padding = '9px 10px 11px 12px'
  el.style.borderRadius = 'var(--radius-xl, 12px)'
  el.style.background = 'var(--surface-glass, var(--surface-raised, #24262b))'
  el.style.color = FG
  el.style.border = '1px solid ' + TYPE_BORDER[state.type]
  el.style.boxShadow = 'var(--elev-2, 0 8px 24px rgba(0, 0, 0, 0.24))'
  el.style.fontSize = 'var(--text-sm, 13px)'
  el.style.lineHeight = '1.45'
  el.style.wordBreak = 'break-word'
  el.style.overflow = 'hidden'
  el.style.cursor = state.dismissible ? 'pointer' : 'default'
  el.style.opacity = '0'
  el.style.transform = 'translateY(-6px)'
  el.style.transition = 'opacity 160ms ease, transform 160ms ease'
  try {
    el.style.backdropFilter = 'blur(var(--glass-blur, 12px))'
  } catch {
    /* 老内核不支持就退化为实色底 */
  }

  // 图标
  const iconEl = document.createElement('i')
  iconEl.className = state.icon || TYPE_ICON[state.type]
  iconEl.setAttribute('aria-hidden', 'true')
  iconEl.style.flex = 'none'
  iconEl.style.fontSize = '13px'
  iconEl.style.lineHeight = '1.5'
  iconEl.style.marginTop = '1px'
  iconEl.style.color = TYPE_INK[state.type]
  el.appendChild(iconEl)

  // 正文（标题 + 内容）：全部 textContent，绝不拼 innerHTML
  const bodyEl = document.createElement('div')
  bodyEl.style.flex = '1 1 auto'
  bodyEl.style.minWidth = '0'
  bodyEl.style.display = 'flex'
  bodyEl.style.flexDirection = 'column'
  bodyEl.style.gap = '1px'
  el.appendChild(bodyEl)

  const titleEl = document.createElement('div')
  titleEl.style.fontWeight = 'var(--weight-semibold, 600)'
  titleEl.style.color = FG
  titleEl.style.fontSize = 'var(--text-sm, 13px)'
  titleEl.style.overflow = 'hidden'
  titleEl.style.textOverflow = 'ellipsis'
  titleEl.style.whiteSpace = 'nowrap'
  bodyEl.appendChild(titleEl)

  const textEl = document.createElement('div')
  textEl.style.color = FG
  textEl.style.overflow = 'hidden'
  textEl.style.display = '-webkit-box'
  textEl.style.webkitBoxOrient = 'vertical'
  textEl.style.webkitLineClamp = '2'
  bodyEl.appendChild(textEl)

  // ×N 计数
  const countEl = document.createElement('span')
  countEl.style.flex = 'none'
  countEl.style.alignSelf = 'center'
  countEl.style.fontSize = 'var(--text-xs, 11px)'
  countEl.style.color = FG_MUTED
  countEl.style.fontVariantNumeric = 'tabular-nums'
  countEl.style.display = 'none'
  el.appendChild(countEl)

  // action 按钮（原生 button，工具窗不引入 UiButton）
  const actionEl = document.createElement('button')
  actionEl.type = 'button'
  actionEl.style.flex = 'none'
  actionEl.style.border = '0'
  actionEl.style.cursor = 'pointer'
  actionEl.style.padding = '2px 6px'
  actionEl.style.borderRadius = 'var(--radius-md, 8px)'
  actionEl.style.background = 'transparent'
  actionEl.style.color = TYPE_INK.info
  actionEl.style.fontSize = 'var(--text-sm, 13px)'
  actionEl.style.fontWeight = 'var(--weight-semibold, 600)'
  actionEl.style.display = 'none'
  el.appendChild(actionEl)

  // 关闭按钮
  const closeEl = document.createElement('button')
  closeEl.type = 'button'
  closeEl.setAttribute('aria-label', '关闭')
  closeEl.textContent = '×'
  closeEl.style.flex = 'none'
  closeEl.style.width = '18px'
  closeEl.style.height = '18px'
  closeEl.style.padding = '0'
  closeEl.style.border = '0'
  closeEl.style.borderRadius = 'var(--radius-md, 8px)'
  closeEl.style.background = 'transparent'
  closeEl.style.color = FG_MUTED
  closeEl.style.fontSize = '15px'
  closeEl.style.lineHeight = '1'
  closeEl.style.cursor = 'pointer'
  el.appendChild(closeEl)

  // 进度条：用 rAF 改宽度而不是 CSS 动画 —— 工具窗没有 CSS 文件可挂 keyframes
  const progressEl = document.createElement('div')
  progressEl.style.position = 'absolute'
  progressEl.style.left = '0'
  progressEl.style.bottom = '0'
  progressEl.style.height = '2px'
  progressEl.style.width = '100%'
  progressEl.style.background = TYPE_INK[state.type]
  progressEl.style.opacity = '0.7'
  progressEl.style.display = 'none'
  el.appendChild(progressEl)

  container.appendChild(el)

  let destroyed = false
  let paused = false
  let timerId = null
  let rafId = null
  let startedAt = 0
  let remaining = state.duration

  function showsProgress() {
    return state.progress !== false && state.duration > 0
  }

  function paintProgress() {
    if (!showsProgress()) {
      progressEl.style.display = 'none'
      return
    }
    progressEl.style.display = 'block'
    const ratio = Math.max(0, Math.min(1, remaining / state.duration))
    progressEl.style.width = (ratio * 100).toFixed(2) + '%'
  }

  function stopRaf() {
    if (rafId !== null) {
      cancelFrame(rafId)
      rafId = null
    }
  }

  function tick() {
    rafId = null
    if (destroyed || paused) return
    const now = Date.now()
    remaining = Math.max(0, remaining - (now - startedAt))
    startedAt = now
    paintProgress()
    if (remaining > 0) rafId = requestFrame(tick)
  }

  function arm(ms) {
    if (timerId) clearTimeout(timerId)
    timerId = null
    if (!(ms > 0)) return
    remaining = ms
    startedAt = Date.now()
    timerId = setTimeout(() => {
      timerId = null
      dismiss()
    }, ms)
    stopRaf()
    rafId = requestFrame(tick)
  }

  function pause() {
    if (paused || destroyed) return
    paused = true
    if (timerId) {
      clearTimeout(timerId)
      timerId = null
      remaining = Math.max(0, remaining - (Date.now() - startedAt))
    }
    stopRaf()
    paintProgress()
  }

  function resume() {
    if (!paused || destroyed) return
    paused = false
    if (!(state.duration > 0)) return
    if (remaining <= 0) dismiss()
    else arm(remaining)
  }

  function dismiss() {
    if (destroyed) return
    destroyed = true
    if (timerId) clearTimeout(timerId)
    timerId = null
    stopRaf()
    if (fallbackItems.get(id) === ctrl) fallbackItems.delete(id)
    if (state.key && fallbackByKey.get(state.key) === ctrl) fallbackByKey.delete(state.key)
    // 离场中的节点已不算「在场」，但还要留 180ms 播淡出
    el.setAttribute('data-toast-leaving', '1')
    el.style.opacity = '0'
    el.style.transform = 'translateY(-6px)'
    setTimeout(() => {
      el.remove()
      removeFallbackContainerIfEmpty()
    }, 180)
  }

  function update(patch) {
    if (destroyed || !patch) return
    if (patch.message !== undefined) state.message = toText(patch.message)
    if (patch.title !== undefined) state.title = toText(patch.title)
    if (patch.type !== undefined) state.type = normalizeType(patch.type)
    if (patch.icon !== undefined) state.icon = patch.icon ? String(patch.icon) : ''
    if (patch.dismissible !== undefined) state.dismissible = patch.dismissible !== false
    if (patch.progress !== undefined) state.progress = patch.progress !== false
    // action 不沿用：同 key 重复弹且这次没带 action 时，旧按钮和旧 onClick 不能留在屏幕上
    if (patch.action !== undefined) state.action = normalizeAction(patch.action)
    else if (patch.bump === true) state.action = null
    if (patch.count !== undefined) state.count = Math.max(1, Number(patch.count) || 1)
    else state.count += 1
    const durationChanged = patch.duration !== undefined
    if (durationChanged) state.duration = normalizeDuration(patch.duration, state.duration)
    paint()
    // 时长变了就按新时长重来，否则沿用剩余时间（与宿主「重置计时」保持一致）
    const nextMs = durationChanged ? state.duration : Math.max(1, remaining)
    if (paused) {
      // 鼠标还压在这条上：只记下新的剩余时间，等 mouseleave 再续期
      remaining = nextMs
      paintProgress()
    } else {
      arm(nextMs)
    }
  }

  function paint() {
    el.style.border = '1px solid ' + TYPE_BORDER[state.type]
    el.style.cursor = state.dismissible ? 'pointer' : 'default'
    iconEl.className = state.icon || TYPE_ICON[state.type]
    iconEl.style.color = TYPE_INK[state.type]
    progressEl.style.background = TYPE_INK[state.type]
    titleEl.textContent = state.title || ''
    titleEl.style.display = state.title ? 'block' : 'none'
    textEl.textContent = state.message || ''
    textEl.style.color = state.title ? FG_MUTED : FG
    const counted = state.count > 1
    countEl.textContent = counted ? '×' + state.count : ''
    countEl.style.display = counted ? 'block' : 'none'
    const hasAction = !!(state.action && state.action.label)
    actionEl.textContent = hasAction ? state.action.label : ''
    actionEl.style.display = hasAction ? 'inline-block' : 'none'
    closeEl.style.display = state.dismissible ? 'block' : 'none'
    paintProgress()
  }

  const ctrl = {
    id,
    el,
    get destroyed() {
      return destroyed
    },
    pause,
    resume,
    dismiss,
    update
  }

  // 交互：悬停暂停、点正文关闭、action / 关闭按钮各自 stopPropagation
  el.addEventListener('mouseenter', pause)
  el.addEventListener('mouseleave', resume)
  el.addEventListener('click', () => {
    if (state.dismissible) dismiss()
  })
  closeEl.addEventListener('click', (e) => {
    e.stopPropagation()
    dismiss()
  })
  actionEl.addEventListener('click', (e) => {
    e.stopPropagation()
    const action = state.action
    if (!action) return
    try {
      if (action.onClick) action.onClick(id)
    } catch {
      /* 回调抛错不该把提示条卡在屏幕上 */
    }
    if (!action.keepOpen) dismiss()
  })

  fallbackItems.set(id, ctrl)
  if (state.key) fallbackByKey.set(state.key, ctrl)

  paint()
  // 入场：下一帧再改样式，否则 transition 不会触发
  requestFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
    if (!hasGlyph(iconEl)) iconEl.remove()
  })
  if (state.duration > 0) arm(state.duration)
  return id
}

/* ------------------------------------------------------------------ *
 * 公共 API
 * ------------------------------------------------------------------ */

function teardownFallback() {
  fallbackItems.forEach((ctrl) => {
    if (!ctrl.destroyed) ctrl.dismiss()
  })
  fallbackItems.clear()
  fallbackByKey.clear()
  if (fallbackContainer) {
    fallbackContainer.remove()
    fallbackContainer = null
  }
}

export function registerToastHost() {
  hostCount += 1
  // 宿主一出现就清掉兜底容器：否则同一条提示会在 body 上再显示一份
  teardownFallback()
  return () => {
    hostCount = Math.max(0, hostCount - 1)
  }
}

export function dismissToast(id) {
  if (id === null || id === undefined) return
  clearTimer(id)
  timers.delete(id)
  const fb = fallbackItems.get(Number(id))
  if (fb) fb.dismiss()
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx !== -1) toasts.value.splice(idx, 1)
}

export function dismissAllToasts() {
  timers.forEach((meta) => {
    if (meta.timeoutId) clearTimeout(meta.timeoutId)
  })
  timers.clear()
  // 整体替换数组：TransitionGroup 会把所有条目一起播离场
  toasts.value = []
  fallbackItems.forEach((ctrl) => {
    if (!ctrl.destroyed) ctrl.dismiss()
  })
  fallbackItems.clear()
  fallbackByKey.clear()
}

export function updateToast(id, patch) {
  if (id === null || id === undefined || !patch) return
  const fb = fallbackItems.get(Number(id))
  if (fb) {
    fb.update(patch)
    return
  }
  const payload = {}
  if (patch.message !== undefined) payload.message = toText(patch.message)
  if (patch.title !== undefined) payload.title = toText(patch.title)
  if (patch.type !== undefined) payload.type = normalizeType(patch.type)
  if (patch.icon !== undefined) payload.icon = patch.icon ? String(patch.icon) : ''
  if (patch.dismissible !== undefined) payload.dismissible = patch.dismissible !== false
  if (patch.progress !== undefined) payload.progress = patch.progress !== false
  if (patch.action !== undefined) payload.action = normalizeAction(patch.action)
  if (patch.key !== undefined) payload.key = normalizeKey(patch.key)
  if (patch.duration !== undefined) payload.duration = normalizeDuration(patch.duration, DEFAULT_DURATION)
  if (patch.count !== undefined) payload.count = Math.max(1, Number(patch.count) || 1)
  mergeEntry(id, payload)
}

export function setToastPosition(pos) {
  const next = normalizePosition(pos)
  toastPosition.value = next
  if (fallbackContainer && fallbackContainer.isConnected) applyFallbackPosition(fallbackContainer, next)
  return next
}

/**
 * 显示一条轻提示。
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'|'danger'|object} [typeOrOptions='info']
 * @param {number} [durationArg=2400]
 * @returns {number|null} id（供 dismissToast / updateToast 用）；无可展示内容时返回 null
 */
export function showToast(message, typeOrOptions = 'info', durationArg = DEFAULT_DURATION) {
  const isOptions = !!typeOrOptions && typeof typeOrOptions === 'object'
  const text = toText(message)

  // options 形式：只认「显式给了」的字段，其余留 undefined 交给合并逻辑保留旧值。
  // 这样 key 去重时调用方只传 body/title 也不会把原有的 type / action 抹掉。
  const payload = { message: text }
  if (isOptions) {
    const opts = typeOrOptions
    if (has(opts, 'title')) payload.title = toText(opts.title)
    if (has(opts, 'type')) payload.type = normalizeType(opts.type)
    if (has(opts, 'icon')) payload.icon = opts.icon ? String(opts.icon) : ''
    if (has(opts, 'duration')) payload.duration = normalizeDuration(opts.duration, DEFAULT_DURATION)
    // options 形态没给 duration 时，第三参依然算数：showToast(msg, { type }, 3000)
    else payload.duration = normalizeDuration(durationArg, DEFAULT_DURATION)
    if (has(opts, 'key')) payload.key = normalizeKey(opts.key)
    if (has(opts, 'dismissible')) payload.dismissible = opts.dismissible !== false
    if (has(opts, 'progress')) payload.progress = opts.progress !== false
    if (has(opts, 'action')) payload.action = normalizeAction(opts.action)
    if (opts.position) setToastPosition(opts.position)
  } else {
    payload.type = normalizeType(typeOrOptions)
    payload.duration = normalizeDuration(durationArg, DEFAULT_DURATION)
  }

  const resolved = withDefaults(payload)
  // 旧实现没有正文就什么都不弹；「返回 null」的契约保持不变
  if (!resolved.message && !resolved.title) return null

  // 没有宿主 = 独立工具窗，只能走 document.body 兜底
  if (hostCount === 0) return showFallbackToast({ ...payload, position: normalizePosition(toastPosition.value) })

  // 同 key：更新内容/类型、count+1、置顶并重置计时，不新增一条
  if (resolved.key) {
    const existing = toasts.value.find((t) => t.key === resolved.key)
    if (existing) {
      mergeEntry(existing.id, payload, true)
      return existing.id
    }
  }

  return enqueue(payload)
}

export function useToast() {
  return {
    toasts,
    showToast,
    dismissToast,
    dismissAllToasts,
    updateToast,
    setToastPosition,
    success: (message, options) => showToast(message, { ...(options || {}), type: 'success' }),
    error: (message, options) => showToast(message, { ...(options || {}), type: 'error' }),
    warning: (message, options) => showToast(message, { ...(options || {}), type: 'warning' }),
    info: (message, options) => showToast(message, { ...(options || {}), type: 'info' })
  }
}
