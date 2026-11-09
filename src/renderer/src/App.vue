<template>
  <!-- 视图舞台：ChatView 为多根 Fragment，Transition 子节点必须是单元素，故用 keyed 包装层承载页面切换 -->
  <div class="app-stage">
    <Transition name="page" mode="out-in">
      <div class="app-view" :key="viewKey">
        <LoginView
          v-if="!isWeb && !store.logined && !store.guestMode"
          @login="onLogin"
          @guest="onGuest"
        />
        <ChatView
          v-else
          :key="'chat-' + loginSeq"
        />
      </div>
    </Transition>
  </div>
  <Transition name="fade">
    <Onboarding v-if="showOnboarding" @close="closeOnboarding" />
  </Transition>
  <!-- 公告常驻：父级只切 visible，组件内部 overlay Transition 负责进出场（M-1，避免 v-if 卸载导致关闭硬切） -->
  <Announcement :visible="showAnnouncement" @close="closeAnnouncement" />
  <Transition name="fade">
    <div v-if="store.initializing && store.logined" class="init-loading">
      <div class="init-spinner motion-spin"></div>
      <div class="init-text">正在加载消息…</div>
      <div class="init-sub">本轮已获取 {{ store.fetchNewCount }} 条新消息</div>
    </div>
  </Transition>
  <!-- 粒子背景（EXCEPTIONS W1）：仅 fancy 档且未开启「减弱动效」时渲染，隐藏窗口暂停 rAF -->
  <canvas class="particle-canvas" ref="canvasEl" v-if="showParticles"></canvas>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { store } from './store.js';
import LoginView from './views/LoginView.vue';
import ChatView from './views/ChatView.vue';
import Announcement from './components/Announcement.vue';
import Onboarding from './components/Onboarding.vue';
import { loadUsersDb, compareVersion, checkAppUpdate, isWebBrowser } from './utils.js';
import { prefersReducedMotion } from './utils/motion.js';

// 网页版：没有自带登录页，登录态完全由 OJ 的 cookie 决定（同源）。
// 这里先按「已登录」启动；ChatView 用 /chat/info 探测，拿到 HTML 就整页跳 /login?url=…
const isWeb = isWebBrowser()

const canvasEl = ref(null)
let animId = 0
let particles = []
let drawFn = null
let mouseListener = null
let resizeListener = null
let reducedListener = null
const mousePos = { x: -9999, y: -9999 }
const loginSeq = ref(0)
// 视图身份：登录态 + 序号，登录/游客/重新登录都触发整页过渡
const viewKey = computed(() => ((store.logined || store.guestMode) ? 'chat' : 'login') + '-' + loginSeq.value)
const reducedMotion = ref(prefersReducedMotion())

// --- 新用户引导：只在首次启动（本地无标记）时展示一次；网页版不弹 ---
// 网页版没有「登录页」「工具」这些桌面端的引导步骤，弹出来反而误导（第一页就让人去输 OJ 密码）
const showOnboarding = ref(false)
const ONBOARDING_KEY = 'onboarding-seen'
try {
  if (!isWeb && localStorage.getItem(ONBOARDING_KEY) !== '1') showOnboarding.value = true
} catch {}
function closeOnboarding() {
  showOnboarding.value = false
  try { localStorage.setItem(ONBOARDING_KEY, '1') } catch {}
  // 首次启动两件事都有：引导关掉后再弹版本公告，避免两层叠在一起
  if (announcementPending.value) showAnnouncement.value = true
}

// --- 版本公告：本地记录已看过的最高版本，首次打开新版本时展示 ---
const showAnnouncement = ref(false)
const announcementPending = ref(false)
const SEEN_VERSION_KEY = 'announcement-seen-version'
async function checkAnnouncement() {
  try {
    const v = await window.api.getVersion()
    const seen = localStorage.getItem(SEEN_VERSION_KEY) || '0'
    if (compareVersion(v, seen) > 0) {
      // 新用户引导还开着就先挂起，等引导关掉再弹
      if (showOnboarding.value) announcementPending.value = true
      else showAnnouncement.value = true
    }
  } catch {}
}
async function closeAnnouncement() {
  showAnnouncement.value = false
  try { localStorage.setItem(SEEN_VERSION_KEY, await window.api.getVersion()) } catch {}
}
checkAnnouncement()
// 头像菜单"版本公告"入口：全局事件触发显示公告
window.addEventListener('open-announcement', () => { showAnnouncement.value = true })
// 关于页"新手指引"入口：全局事件重新打开引导（看完不改写已看标记，可随时回看）
window.addEventListener('open-onboarding', () => { showOnboarding.value = true })

// #2 登录持久化：localStorage 有登录标记 → 直接进入已登录主界面（重启/reload 不退出登录）
try {
  // 网页版：登录态完全由 OJ 的 cookie 决定（同源），本地没有登录标记可读。
  // 先按「已登录」启动，ChatView 用 /chat/info 探测：拿到登录页 HTML 就整页跳 /login?url=…
  // （未登录直接渲染错误页是 OJ 的既有行为，不是 302，所以只能由前端探测）
  if (isWeb) {
    store.guestMode = false;
    store.logined = true;
  } else if (localStorage.getItem('7fa4_logined') === '1') {
    store.guestMode = false;
    store.logined = true;
  }
} catch {}

// 游客模式 / 登录成功：视图切换由 <Transition name="page" mode="out-in"> 负责进出场，
// 这里只改状态（登录后立即置 logined，让 ChatView 挂载即走完整登录初始化）
function onGuest() {
  store.guestMode = true;
  loginSeq.value++;
}

function onLogin() {
  store.guestMode = false;
  store.logined = true;
  loginSeq.value++;
}

const effectLevel = computed(() => {
  const s = store.setting
  if (s && s.effectLevel) return s.effectLevel
  return 'fancy'
})

const showParticles = computed(() => effectLevel.value === 'fancy' && !reducedMotion.value)
// 鼠标光晕（W2）：performance 档或系统减弱动效时关闭
const showMouseGradient = computed(() => effectLevel.value !== 'performance' && !reducedMotion.value)

// 性能档统一降级：motion.css 的 html.fx-lite 负责关重动效/位移
watch(effectLevel, (level) => {
  document.documentElement.classList.toggle('fx-lite', level === 'performance')
}, { immediate: true })

// 系统「减弱动效」开关变化时同步（W1/W2 门控依据）
function bindReducedMotionListener() {
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedListener = (e) => { reducedMotion.value = e.matches }
    if (mq.addEventListener) mq.addEventListener('change', reducedListener)
    else if (mq.addListener) mq.addListener(reducedListener)
  } catch {}
}

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
  bindReducedMotionListener()
  loadUsersDb(); // 加载加密的用户姓名数据库（users.7c）
  initUpdateCheck();
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
  // 隐藏窗口时暂停粒子 rAF（W1），避免后台耗电
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (showParticles.value) {
    nextTick(() => initParticles())
  }
})

function onVisibilityChange() {
  if (document.hidden) {
    if (animId) { cancelAnimationFrame(animId); animId = 0 }
  } else if (showParticles.value && !animId && drawFn) {
    animId = requestAnimationFrame(drawFn)
  }
}

// 启动检查更新（网页端/安卓端）：放在根组件而不是 ChatView ——
// 网页版用的是 7fa4-chat-web/src/web/overrides 里的 ChatView，那份没有更新检查代码，
// 于是网页端 store.update 永远是空的（红点不亮，也不会在版本更新页显示新版本）。
// 先读一次设置，让 checkAppUpdate 能按「自动检查更新」开关决定查不查；登录页与游客同样覆盖。
async function initUpdateCheck() {
  try {
    const s = await window.api.loadSetting()
    if (s && !store.setting) store.setting = s
  } catch {}
  checkAppUpdate()
}

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
  // 重复 init 时先移除旧的 resize 监听，避免累加
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
  document.removeEventListener('visibilitychange', onVisibilityChange)
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedListener) {
      if (mq.removeEventListener) mq.removeEventListener('change', reducedListener)
      else if (mq.removeListener) mq.removeListener(reducedListener)
    }
  } catch {}
})
</script>

<style scoped>
/* 视图舞台：给 page Transition 提供单根父节点，并撑满 #app */
.app-stage,
.app-view {
  width: 100%;
  height: 100%;
}

/* 首屏加载层：动效走 .motion-spin（spin 1s linear，reduced-motion 自动停），不再本地定义 keyframes */
.init-loading {
  position: fixed;
  inset: 0;
  z-index: var(--z-max);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: var(--surface-0);
}
.init-spinner {
  width: 46px;
  height: 46px;
  border: 4px solid var(--brand-soft);
  border-top-color: var(--brand);
  border-radius: var(--radius-pill);
}
.init-text {
  color: var(--fg);
  font-size: var(--text-base);
  letter-spacing: 1px;
}
.init-sub {
  margin-top: calc(-1 * var(--space-2));
  color: var(--fg-muted);
  font-size: var(--text-sm);
  letter-spacing: 0.5px;
}
/* 粒子背景画布（EXCEPTIONS W1，渲染开关在 JS 按 effectLevel / reduced-motion 门控） */
.particle-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--z-max);
}
</style>
