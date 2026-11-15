import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { store } from '../../store.js'
import { prefersReducedMotion } from '../../utils/motion.js'

/**
 * 根舞台视觉特效：性能档位降级（html.fx-lite）、鼠标光晕变量与粒子画布 rAF 生命周期。
 * @param {import('vue').Ref<HTMLCanvasElement|null>} canvasEl
 */
export function useAppEffects(canvasEl) {
  const reducedMotion = ref(prefersReducedMotion())

  const effectLevel = computed(() => {
    const s = store.setting
    return s && s.effectLevel ? s.effectLevel : 'fancy'
  })

  const showParticles = computed(() => effectLevel.value === 'fancy' && !reducedMotion.value)
  const showMouseGradient = computed(() => effectLevel.value !== 'performance' && !reducedMotion.value)

  let animId = 0
  let particles = []
  let drawFn = null
  let mouseListener = null
  let resizeListener = null
  let reducedListener = null

  watch(
    effectLevel,
    (level) => {
      document.documentElement.classList.toggle('fx-lite', level === 'performance')
    },
    { immediate: true },
  )

  watch(showParticles, (show) => {
    if (show) {
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

  function getAccentRGB() {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const m = val.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    const m2 = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (m2) return [+m2[1], +m2[2], +m2[3]]
    return [18, 183, 245]
  }

  function initParticles() {
    const canvas = canvasEl.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const COUNT = 80
    particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 2.5 + 1.5,
      a: Math.random() * 0.15 + 0.04,
    }))

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
    }
    if (resizeListener) window.removeEventListener('resize', resizeListener)
    resizeListener = resize
    window.addEventListener('resize', resizeListener)

    drawFn = () => {
      const [r, g, b] = getAccentRGB()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const REPEL_RADIUS = 150
      const REPEL_FORCE = 3
      for (const p of particles) {
        const dx = p.x - mousePos.x
        const dy = p.y - mousePos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < REPEL_RADIUS && dist > 0) {
          const force = REPEL_FORCE * (1 - dist / REPEL_RADIUS)
          p.vx += (dx / dist) * force * 0.05
          p.vy += (dy / dist) * force * 0.05
        }
        p.vx *= 0.98
        p.vy *= 0.98
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed < 0.15) {
          p.vx += (Math.random() - 0.5) * 0.1
          p.vy += (Math.random() - 0.5) * 0.1
        }
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) {
          p.x = 0
          p.vx *= -0.8
        }
        if (p.x > canvas.width) {
          p.x = canvas.width
          p.vx *= -0.8
        }
        if (p.y < 0) {
          p.y = 0
          p.vy *= -0.8
        }
        if (p.y > canvas.height) {
          p.y = canvas.height
          p.vy *= -0.8
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${p.a})`
        ctx.fill()
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 200) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.06 * (1 - dist / 200)})`
            ctx.lineWidth = 0.4
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(drawFn)
    }
    drawFn()
  }

  const mousePos = { x: -9999, y: -9999 }

  function onVisibilityChange() {
    if (document.hidden) {
      if (animId) {
        cancelAnimationFrame(animId)
        animId = 0
      }
    } else if (showParticles.value && !animId && drawFn) {
      animId = requestAnimationFrame(drawFn)
    }
  }

  onMounted(() => {
    bindReducedMotionListener()
    mouseListener = (e) => {
      mousePos.x = e.clientX
      mousePos.y = e.clientY
      if (showMouseGradient.value) {
        const app = document.querySelector('.app')
        if (app) {
          const r = app.getBoundingClientRect()
          app.style.setProperty('--mouse-x', e.clientX - r.left + 'px')
          app.style.setProperty('--mouse-y', e.clientY - r.top + 'px')
        }
      }
    }
    window.addEventListener('mousemove', mouseListener)
    document.addEventListener('visibilitychange', onVisibilityChange)

    if (showParticles.value) {
      nextTick(() => initParticles())
    }
  })

  onUnmounted(() => {
    if (animId) cancelAnimationFrame(animId)
    if (mouseListener) window.removeEventListener('mousemove', mouseListener)
    if (resizeListener) window.removeEventListener('resize', resizeListener)
    document.removeEventListener('visibilitychange', onVisibilityChange)
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
