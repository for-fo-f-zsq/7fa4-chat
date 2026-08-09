<template>
  <div class="view-fade" :class="{ 'view-fade-out': viewFading }">
    <LoginView v-if="!store.logined" @login="onLogin" />
    <ChatView v-else :key="loginSeq" />
  </div>
  <Announcement v-if="showAnnouncement" @close="closeAnnouncement" />
  <div v-if="store.initializing && store.logined" class="init-loading">
    <div class="init-spinner"></div>
    <div class="init-text">正在加载消息…</div>
  </div>
  <canvas class="particle-canvas" ref="canvasEl" v-if="showParticles"></canvas>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { store } from './store.js';
import LoginView from './views/LoginView.vue';
import ChatView from './views/ChatView.vue';
import Announcement from './components/Announcement.vue';
import { loadUsersDb } from './utils.js';

const canvasEl = ref(null)
let animId = 0
let particles = []
let drawFn = null
let mouseListener = null
let resizeListener = null
const mousePos = { x: -9999, y: -9999 }
const viewFading = ref(false)
const loginSeq = ref(0)

// --- 版本公告：本地记录已看过的最高版本，首次打开新版本时展示 ---
const showAnnouncement = ref(false)
const SEEN_VERSION_KEY = 'announcement-seen-version'
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}
async function checkAnnouncement() {
  try {
    const v = await window.api.getVersion()
    const seen = localStorage.getItem(SEEN_VERSION_KEY) || '0'
    if (compareVersions(v, seen) > 0) showAnnouncement.value = true
  } catch {}
}
async function closeAnnouncement() {
  showAnnouncement.value = false
  try { localStorage.setItem(SEEN_VERSION_KEY, await window.api.getVersion()) } catch {}
}
checkAnnouncement()

function onLogin() {
  loginSeq.value++
  viewFading.value = true
  setTimeout(() => {
    store.logined = true
    nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          viewFading.value = false
        })
      })
    })
  }, 500)
}

const effectLevel = computed(() => {
  const s = store.setting
  if (s && s.effectLevel) return s.effectLevel
  return 'fancy'
})

const showParticles = computed(() => effectLevel.value === 'fancy')
const showMouseGradient = computed(() => effectLevel.value !== 'performance')

watch(showMouseGradient, (show) => {
  const app = document.querySelector('.app')
  if (app) {
    if (show) {
      app.classList.remove('no-mouse-gradient')
    } else {
      app.classList.add('no-mouse-gradient')
    }
  }
})

watch(showParticles, (show) => {
  if (show) {
    nextTick(() => {
      if (!drawFn) initParticles()
    })
  } else {
    if (animId) { cancelAnimationFrame(animId); animId = 0 }
    drawFn = null
  }
})

onMounted(() => {
  loadUsersDb(); // 加载加密的用户姓名数据库（users.7c）
  const onMouseMove = (e) => {
    mousePos.x = e.clientX
    mousePos.y = e.clientY
    if (showMouseGradient.value) {
      const app = document.querySelector('.app')
      if (app) {
        const r = app.getBoundingClientRect()
        app.style.setProperty('--mouse-x', (e.clientX - r.left) + 'px')
        app.style.setProperty('--mouse-y', (e.clientY - r.top) + 'px')
      }
    }
  }
  mouseListener = onMouseMove
  window.addEventListener('mousemove', mouseListener)

  if (showParticles.value) {
    nextTick(() => initParticles())
  }
})

function getAccentRGB() {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const m = val.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
  if (m) return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)]
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
    a: Math.random() * 0.15 + 0.04
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
      if (p.x < 0) { p.x = 0; p.vx *= -0.8 }
      if (p.x > canvas.width) { p.x = canvas.width; p.vx *= -0.8 }
      if (p.y < 0) { p.y = 0; p.vy *= -0.8 }
      if (p.y > canvas.height) { p.y = canvas.height; p.vy *= -0.8 }
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

onUnmounted(() => {
  if (animId) cancelAnimationFrame(animId)
  if (mouseListener) window.removeEventListener('mousemove', mouseListener)
  if (resizeListener) window.removeEventListener('resize', resizeListener)
})
</script>

<style scoped>
.init-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: var(--bg-app, #0f1115);
}
.init-spinner {
  width: 46px;
  height: 46px;
  border: 4px solid var(--accent-outline, rgba(128, 128, 128, 0.25));
  border-top-color: var(--accent, #12b7f5);
  border-radius: 50%;
  animation: init-spin 0.9s linear infinite;
}
.init-text {
  color: var(--text-primary, #e6e6e6);
  font-size: 14px;
  letter-spacing: 1px;
}
@keyframes init-spin {
  to { transform: rotate(360deg); }
}
</style>
