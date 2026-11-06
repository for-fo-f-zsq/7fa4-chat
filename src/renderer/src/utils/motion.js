// 动效运行时：数字唯一来源是 css/motion.css 的 --motion-* 令牌；本文件只读取 + 兜底，不定义第二套风格值
// import 路径：components/*.vue 与 views/*.vue → '../utils/motion.js'；views/tools/*/*.vue → '../../../utils/motion.js'

const FALLBACK = Object.freeze({
  fast: 120,
  base: 180,
  slow: 260,
  emph: 400,
  exit: 120,
  scroll: 260,
  spring: 400,
  hold: 1500,
  stagger: 40,
  staggerMax: 8,
  spin: 1000,
  shimmer: 1600,
  pulse: 2000,
  breathe: 3000,
  drift: 6000,
  blink: 1000,
})

const VAR_BY_NAME = {
  fast: '--motion-dur-fast',
  base: '--motion-dur-base',
  slow: '--motion-dur-slow',
  emph: '--motion-dur-emph',
  exit: '--motion-dur-exit',
  scroll: '--motion-dur-scroll',
  spring: '--motion-spring-dur',
  hold: '--motion-hold-highlight',
  stagger: '--motion-stagger',
  spin: '--motion-loop-spin',
  shimmer: '--motion-loop-shimmer',
  pulse: '--motion-loop-pulse',
  breathe: '--motion-loop-breathe',
  drift: '--motion-loop-drift',
  blink: '--motion-loop-blink',
}

// 与 motion.css 的缓动令牌一一对应（scrollToY 用同一组控制点，避免 JS/CSS 手感两套）
const EASE_POINTS = Object.freeze({
  standard: [0.2, 0, 0, 1],
  enter: [0.05, 0.7, 0.1, 1],
  exit: [0.3, 0, 0.8, 0.15],
  spring: [0.34, 1.36, 0.64, 1],
})

function rootEl() {
  return typeof document === 'undefined' ? null : document.documentElement
}

function readMs(varName, fallback) {
  const el = rootEl()
  if (!el || typeof getComputedStyle !== 'function') return fallback
  const raw = getComputedStyle(el).getPropertyValue(varName).trim()
  if (!raw) return fallback
  const value = parseFloat(raw)
  if (!Number.isFinite(value)) return fallback
  if (raw.endsWith('ms')) return value
  if (raw.endsWith('s')) return value * 1000
  return value
}

function ease(points, progress) {
  const [x1, y1, x2, y2] = points
  const ax = 3 * x1 - 3 * x2 + 1
  const bx = 3 * x2 - 6 * x1
  const cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1
  const by = 3 * y2 - 6 * y1
  const cy = 3 * y1
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t) => ((ay * t + by) * t + cy) * t
  let low = 0
  let high = 1
  let t = progress
  for (let i = 0; i < 8; i += 1) {
    if (Math.abs(sampleX(t) - progress) < 0.0001) break
    if (sampleX(t) < progress) low = t
    else high = t
    t = (low + high) / 2
  }
  return sampleY(t)
}

/** 系统是否要求减少动态效果 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 当前是否性能档（html.fx-lite，由 effectLevel=performance 挂载） */
export function isFxLite() {
  const el = rootEl()
  return !!el && el.classList.contains('fx-lite')
}

/**
 * 读取动效时长（毫秒）
 * @param {'fast'|'base'|'slow'|'emph'|'exit'|'scroll'|'spring'|'hold'|'stagger'|'spin'|'shimmer'|'pulse'|'breathe'|'drift'|'blink'} name
 */
export function motionDuration(name = 'base') {
  if (prefersReducedMotion()) return 0
  const varName = VAR_BY_NAME[name]
  if (!varName) return FALLBACK.base
  return readMs(varName, FALLBACK[name] ?? FALLBACK.base)
}

/**
 * 等待一次过渡/动画结束（比 setTimeout 硬编码可靠）
 * 优先 transitionend，其次 animationend，最后超时兜底；减少动态时立即 resolve
 * @param {Element} el
 * @param {{ timeout?: number, prop?: string }} [options]
 * @returns {Promise<Element>}
 */
export function waitForMotion(el, options = {}) {
  if (!el || prefersReducedMotion()) return Promise.resolve(el)
  const { timeout, prop } = options
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      el.removeEventListener('transitionend', onEnd)
      el.removeEventListener('animationend', onEnd)
      clearTimeout(timer)
      resolve(el)
    }
    const onEnd = (event) => {
      if (event.target !== el) return
      if (prop && event.propertyName !== prop) return
      finish()
    }
    el.addEventListener('transitionend', onEnd)
    el.addEventListener('animationend', onEnd)
    const limit = Number.isFinite(timeout) ? timeout : motionDuration('slow') + 120
    const timer = setTimeout(finish, limit)
  })
}

/**
 * 程序化滚动（替代直接赋值 scrollTop / scrollIntoView 的多种写法）
 * 默认 260ms + standard 缓动；减少动态或性能档时瞬时定位
 * @param {HTMLElement} el 滚动容器
 * @param {number} y 目标 scrollTop（传 Infinity/超界值会自动 clamp 到底部）
 * @param {{ duration?: number, easing?: 'standard'|'enter'|'exit'|'spring' }} [options]
 * @returns {Promise<HTMLElement>}
 */
export function scrollToY(el, y, options = {}) {
  if (!el) return Promise.resolve(el)
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  const target = Number.isFinite(y) ? y : el.scrollHeight
  const end = Math.max(0, Math.min(target, max))
  if (prefersReducedMotion() || isFxLite()) {
    el.scrollTop = end
    return Promise.resolve(el)
  }
  const start = el.scrollTop
  const duration = Number.isFinite(options.duration) ? options.duration : motionDuration('scroll')
  if (duration <= 0 || Math.abs(end - start) < 1) {
    el.scrollTop = end
    return Promise.resolve(el)
  }
  const points = EASE_POINTS[options.easing] || EASE_POINTS.standard
  return new Promise((resolve) => {
    const begin = performance.now()
    const step = (now) => {
      const progress = Math.min(1, (now - begin) / duration)
      el.scrollTop = start + (end - start) * ease(points, progress)
      if (progress < 1) {
        requestAnimationFrame(step)
      } else {
        el.scrollTop = end
        resolve(el)
      }
    }
    requestAnimationFrame(step)
  })
}

/**
 * 给容器子元素写入 --i（配合 .motion-stagger / .list-enter-active 的 stagger 延迟，封顶 8）
 * @param {HTMLElement} container
 * @param {{ step?: number, max?: number }} [options]
 * @returns {() => void} 清理函数（onBeforeUnmount 调用）
 */
export function staggerChildren(container, options = {}) {
  if (!container || !container.children) return () => {}
  const max = Number.isFinite(options.max) ? options.max : FALLBACK.staggerMax
  const touched = Array.from(container.children)
  touched.forEach((child, index) => {
    child.style.setProperty('--i', String(Math.min(index, max)))
  })
  return () => {
    touched.forEach((child) => child.style.removeProperty('--i'))
  }
}
