import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { store } from '../../store.js'
import { prefersReducedMotion } from '../../utils/motion.js'

// 交互期间暂停粒子绘制的时间窗：滚动/滚轮/触摸/按键拖动时，背景装饰动画没有信息价值，
// 让出主线程给真正在处理输入的内容。
const INTERACT_SUSPEND_MS = 320
// 连线只画这个距离内的粒子对（px）
const LINK_DIST = 200
const LINK_DIST2 = LINK_DIST * LINK_DIST
const REPEL_RADIUS = 150
const REPEL_FORCE = 3

/**
 * 根舞台视觉特效：性能档位降级（html.fx-lite）、鼠标光晕变量与粒子画布 rAF 生命周期。
 * @param {import('vue').Ref<HTMLCanvasElement|null>} canvasEl
 */
export function useAppEffects(canvasEl) {
  const reducedMotion = ref(prefersReducedMotion())

  const effectLevel = computed(() => {
    const s = store.setting
    return s && s.effectLevel ? s.effectLevel : 'efficiency'
  })

  const showParticles = computed(() => effectLevel.value === 'fancy' && !reducedMotion.value)
  const showMouseGradient = computed(() => effectLevel.value !== 'performance' && !reducedMotion.value)

  let animId = 0
  let particles = []
  let drawFn = null
  let mouseListener = null
  let resizeListener = null
  let reducedListener = null
  let themeObserver = null

  // ---- 运行时自适应降级状态 ----
  // 必须声明在下面所有 watch（尤其 `{ immediate: true }`）之前：
  // immediate watcher 会同步调用 resetAdaptive()，若这些 let 还在下方就会踩 TDZ
  // （真实事故：Cannot access 'degradeLevel' before initialization → <App> setup 失败 → 白屏）。
  // 降级只降不升：一旦判定「这台机器画不动」，就不再往上试，避免在阈值附近来回抖动。
  // 档位顺序： 0 全效果 → 1 节流 30fps → 2 关闭连线 → 3 停止粒子绘制（清空画布）
  // 判定：连续 60 帧的绘制耗时均值 > DRAW_BUDGET_MS（留出主线程给交互/渲染）。
  const DRAW_BUDGET_MS = 6
  const SAMPLE_FRAMES = 60
  let degradeLevel = 0
  let sampleSum = 0
  let sampleCount = 0
  let frameNo = 0
  // 档位 3 之后不再自动恢复（避免阈值附近抖动），只有手动改档位才解封
  let adaptiveStopped = false

  // ---- 强调色：原来每帧 getComputedStyle(documentElement) 是一次样式重算 + 强制布局，
  // 现在只在 html 的 class/style 变化（切主题、改自定义变量）时标脏，下一帧取一次。
  let accentRGB = [18, 183, 245]
  let accentDirty = true

  function readAccentRGB() {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const m = val.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    const m2 = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (m2) return [+m2[1], +m2[2], +m2[3]]
    return [18, 183, 245]
  }

  function currentAccent() {
    if (accentDirty) {
      accentDirty = false
      accentRGB = readAccentRGB()
    }
    return accentRGB
  }

  function watchTheme() {
    if (themeObserver || typeof MutationObserver === 'undefined') return
    themeObserver = new MutationObserver(() => { accentDirty = true })
    // 只盯 html 上的 class/style（applyThemeClass 加 theme-* 类、自定义主题写 CSS 变量）
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
  }

  watch(
    effectLevel,
    (level) => {
      document.documentElement.classList.toggle('fx-lite', level === 'performance')
      // 用户手动改档位 = 重新表态：清空运行时自动降级的累计，若此前被自动停绘则重新拉起循环。
      // （自动降级只存在于内存，不写回 store.setting，两者互不覆盖。）
      resetAdaptive()
      if (showParticles.value && !animId && drawFn) animId = requestAnimationFrame(drawFn)
    },
    { immediate: true },
  )

  watch(showParticles, (show) => {
    if (show) {
      // 重新开启粒子（换档位 / 系统「减少动效」关掉）时给一次全新的采样窗口
      resetAdaptive()
      nextTick(() => {
        if (!drawFn) initParticles()
      })
    } else {
      if (animId) {
        cancelAnimationFrame(animId)
        animId = 0
      }
      drawFn = null
    }
  })

  function bindReducedMotionListener() {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      reducedListener = (e) => {
        reducedMotion.value = e.matches
      }
      if (mq.addEventListener) mq.addEventListener('change', reducedListener)
      else if (mq.addListener) mq.addListener(reducedListener)
    } catch {
      /* ignore */
    }
  }

  // ---- 粒子 / 鼠标状态（提前声明，供 drawFn 与监听器共享）
  const mousePos = { x: -9999, y: -9999 }
  let interactingUntil = 0
  let interactionListener = null
  let appRectResetListener = null
  let appRect = null

  /** 硬件档位：普通办公本 80 个粒子 + 3000 多条连线的开销是白给的，按核数/内存减半。 */
  function particleCount() {
    const cores = Number(navigator.hardwareConcurrency) || 4
    const mem = Number(navigator.deviceMemory) || 0
    if (cores <= 2 || (mem && mem <= 2)) return 18
    if (cores <= 4) return 28
    if (cores <= 8) return 48
    return 72
  }

  function markInteraction() {
    interactingUntil = Date.now() + INTERACT_SUSPEND_MS
  }

  // ---- 运行时自适应降级（只在内存里，不写回 store.setting，因此与设置面板互不冲突）
  // 状态变量在文件顶部声明（TDZ 约束见那里）。降级只降不升；档位顺序
  // 0 全效果 → 1 节流 30fps → 2 关闭连线 → 3 停止粒子绘制（清空画布）。
  function noteFrameCost(costMs) {
    sampleSum += costMs
    sampleCount++
    if (sampleCount < SAMPLE_FRAMES) return
    const avg = sampleSum / SAMPLE_FRAMES
    sampleSum = 0
    sampleCount = 0
    if (avg <= DRAW_BUDGET_MS) return
    if (degradeLevel >= 3) return
    degradeLevel++
    if (degradeLevel >= 3) {
      // 最后一档：直接停掉绘制循环并清空画布（保留 canvas 与 drawFn，手动切回档位时能立刻恢复）
      adaptiveStopped = true
      if (animId) cancelAnimationFrame(animId)
      animId = 0
      try {
        const c = canvasEl.value
        const cx = c && c.getContext('2d')
        if (c && cx) cx.clearRect(0, 0, c.width, c.height)
      } catch { /* ignore */ }
    }
  }

  function resetAdaptive() {
    degradeLevel = 0
    sampleSum = 0
    sampleCount = 0
    frameNo = 0
    adaptiveStopped = false
  }

  // 画圆与连线的批次：把逐点 fillStyle/stroke 换成少量「按透明度分桶」的批量路径，
  // 一次帧里 stroke/fill 调用数从 ~3000+ 降到个位数，视觉差异（透明度量化）看不出来。
  const DOT_ALPHAS = [0.05, 0.09, 0.13, 0.17]
  const LINK_ALPHAS = [0.015, 0.035, 0.055]
  // 连线分段复用缓冲（每桶 [x1,y1,x2,y2, ...]），避免每帧为几千条线新建数组
  const linkSegs = [[], [], []]

  function initParticles() {
    const canvas = canvasEl.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const COUNT = particleCount()
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2.5 + 1.5,
      // 归到最近的一档透明度，绘制时按档批量 fill
      bucket: 0,
      a: 0,
    }))
    for (const p of particles) {
      const a = Math.random() * 0.15 + 0.04
      let bi = 0
      for (let i = 1; i < DOT_ALPHAS.length; i++) {
        if (Math.abs(DOT_ALPHAS[i] - a) < Math.abs(DOT_ALPHAS[bi] - a)) bi = i
      }
      p.bucket = bi
      p.a = DOT_ALPHAS[bi]
    }

    const resize = () => {
      const oldW = canvas.width || window.innerWidth
      const oldH = canvas.height || window.innerHeight
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const scaleX = canvas.width / oldW
      const scaleY = canvas.height / oldH
      for (const p of particles) {
        p.x *= scaleX
        p.y *= scaleY
      }
      appRect = null
    }
    if (resizeListener) window.removeEventListener('resize', resizeListener)
    resizeListener = resize
    window.addEventListener('resize', resizeListener, { passive: true })

    drawFn = () => {
      // 已被自动降级停绘：不再续帧，等手动切档位（resetAdaptive）解封
      if (adaptiveStopped) {
        animId = 0
        return
      }
      animId = requestAnimationFrame(drawFn)
      // 交互/后台页：跳过这一帧的绘制（保留 rAF 以便随时恢复，代价近乎为零）
      if (document.hidden || Date.now() < interactingUntil) return

      frameNo++
      // 档位 1：隔帧绘制（约 30fps），运动积分照常，速度观感不变
      const paint = degradeLevel < 1 || (frameNo & 1) === 0
      const t0 = performance.now()

      // 1) 位置与速度积分（纯数学，无 DOM、无样式读取）
      const w = canvas.width
      const h = canvas.height
      const mx = mousePos.x
      const my = mousePos.y
      for (const p of particles) {
        const dx = p.x - mx
        const dy = p.y - my
        if (dx < REPEL_RADIUS && dx > -REPEL_RADIUS && dy < REPEL_RADIUS && dy > -REPEL_RADIUS) {
          const d2 = dx * dx + dy * dy
          if (d2 < REPEL_RADIUS * REPEL_RADIUS && d2 > 0) {
            const dist = Math.sqrt(d2)
            const force = REPEL_FORCE * (1 - dist / REPEL_RADIUS)
            p.vx += (dx / dist) * force * 0.05
            p.vy += (dy / dist) * force * 0.05
          }
        }
        p.vx *= 0.98
        p.vy *= 0.98
        if (Math.abs(p.vx) + Math.abs(p.vy) < 0.15) {
          p.vx += (Math.random() - 0.5) * 0.1
          p.vy += (Math.random() - 0.5) * 0.1
        }
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) {
          p.x = 0
          p.vx *= -0.8
        } else if (p.x > w) {
          p.x = w
          p.vx *= -0.8
        }
        if (p.y < 0) {
          p.y = 0
          p.vy *= -0.8
        } else if (p.y > h) {
          p.y = h
          p.vy *= -0.8
        }
      }

      if (!paint) {
        noteFrameCost(performance.now() - t0)
        return
      }

      const [r, g, b] = currentAccent()
      ctx.clearRect(0, 0, w, h)

      // 2) 逐点绘制：按透明度分 4 桶，每桶一条路径 + 一次 fill
      for (let bi = 0; bi < DOT_ALPHAS.length; bi++) {
        let started = false
        ctx.beginPath()
        for (const p of particles) {
          if (p.bucket !== bi) continue
          started = true
          ctx.moveTo(p.x + p.r, p.y)
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        }
        if (!started) continue
        ctx.fillStyle = `rgba(${r},${g},${b},${DOT_ALPHAS[bi]})`
        ctx.fill()
      }

      // 3) 连线（档位 ≥2 时整段跳过）：按距离分 3 桶，每桶一条路径 + 一次 stroke。
      //    原来每条连线一次 beginPath/stroke = 3000 多次绘制调用，是这一帧最贵的部分。
      if (degradeLevel < 2) {
        linkSegs[0].length = 0
        linkSegs[1].length = 0
        linkSegs[2].length = 0
        for (let i = 0; i < particles.length; i++) {
          const pi = particles[i]
          for (let j = i + 1; j < particles.length; j++) {
            const pj = particles[j]
            const dx = pi.x - pj.x
            const dy = pi.y - pj.y
            const d2 = dx * dx + dy * dy
            if (d2 >= LINK_DIST2) continue
            const dist = Math.sqrt(d2)
            const bi = dist >= 120 ? 0 : (dist >= 60 ? 1 : 2)
            linkSegs[bi].push(pi.x, pi.y, pj.x, pj.y)
          }
        }
        ctx.lineWidth = 0.4
        for (let bi = 0; bi < LINK_ALPHAS.length; bi++) {
          const seg = linkSegs[bi]
          if (!seg.length) continue
          ctx.beginPath()
          for (let k = 0; k < seg.length; k += 4) {
            ctx.moveTo(seg[k], seg[k + 1])
            ctx.lineTo(seg[k + 2], seg[k + 3])
          }
          ctx.strokeStyle = `rgba(${r},${g},${b},${LINK_ALPHAS[bi]})`
          ctx.stroke()
        }
      }

      noteFrameCost(performance.now() - t0)
    }
    drawFn()
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (animId) {
        cancelAnimationFrame(animId)
        animId = 0
      }
    } else if (showParticles.value && !animId && drawFn && !adaptiveStopped) {
      animId = requestAnimationFrame(drawFn)
    }
  }

  // ---- 鼠标光晕：mousemove 每秒可达上百次，原来每个事件都读一次 .app 的 rect 并写两个 CSS 变量；
  // 现在只记录坐标，每帧最多写一次，rect 也是缓存值（只在 resize/滚动后失效）。
  let mouseRafId = 0

  function flushMouse() {
    mouseRafId = 0
    if (!showMouseGradient.value) return
    const app = document.querySelector('.app')
    if (!app) return
    if (!appRect) {
      const r = app.getBoundingClientRect()
      appRect = { left: r.left, top: r.top }
    }
    app.style.setProperty('--mouse-x', mousePos.x - appRect.left + 'px')
    app.style.setProperty('--mouse-y', mousePos.y - appRect.top + 'px')
  }

  onMounted(() => {
    bindReducedMotionListener()
    watchTheme()
    mouseListener = (e) => {
      mousePos.x = e.clientX
      mousePos.y = e.clientY
      if (!showMouseGradient.value) return
      if (!mouseRafId) mouseRafId = requestAnimationFrame(flushMouse)
    }
    window.addEventListener('mousemove', mouseListener, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)

    // 交互窗口：滚动/滚轮/触摸/按下时暂停粒子绘制，让主线程专心处理输入
    interactionListener = () => { markInteraction() }
    window.addEventListener('scroll', interactionListener, { capture: true, passive: true })
    window.addEventListener('wheel', interactionListener, { passive: true })
    window.addEventListener('touchmove', interactionListener, { passive: true })
    window.addEventListener('pointerdown', interactionListener, { passive: true })
    // 布局可能变化：让鼠标光晕的 .app 原点与强调色缓存失效
    appRectResetListener = () => { appRect = null }
    window.addEventListener('resize', appRectResetListener, { passive: true })

    if (showParticles.value) {
      nextTick(() => initParticles())
    }
  })

  onUnmounted(() => {
    if (animId) cancelAnimationFrame(animId)
    animId = 0
    if (mouseRafId) cancelAnimationFrame(mouseRafId)
    mouseRafId = 0
    drawFn = null
    if (mouseListener) window.removeEventListener('mousemove', mouseListener)
    if (resizeListener) window.removeEventListener('resize', resizeListener)
    if (interactionListener) {
      window.removeEventListener('scroll', interactionListener, true)
      window.removeEventListener('wheel', interactionListener)
      window.removeEventListener('touchmove', interactionListener)
      window.removeEventListener('pointerdown', interactionListener)
    }
    if (appRectResetListener) window.removeEventListener('resize', appRectResetListener)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
    }
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (reducedListener) {
        if (mq.removeEventListener) mq.removeEventListener('change', reducedListener)
        else if (mq.removeListener) mq.removeListener(reducedListener)
      }
    } catch {
      /* ignore */
    }
  })

  return {
    showParticles,
  }
}
