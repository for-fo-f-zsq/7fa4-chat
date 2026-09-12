<template>
  <div class="ob-layer">
    <!-- 全程不遮挡、不拦截任何操作：只在目标上画一圈呼吸描边指个方向，
         气泡常驻提示该做什么，完成由真实状态判定 -->

    <div class="ob-tip" :style="tipStyle" ref="tipEl">
      <div class="ob-tip-head" title="按住可拖动气泡" @mousedown="onTipDragStart">
        <span class="ob-step">第 {{ stepIndex + 1 }} / {{ STEPS.length }} 步</span>
        <button class="ob-skip" @click="emit('close')">跳过引导</button>
      </div>
      <div class="ob-tip-title">
        <i class="fas" :class="step.icon"></i> {{ step.title }}
      </div>
      <div class="ob-tip-text">{{ step.text }}</div>
      <div class="ob-tip-actions" v-if="step.actionLabel">
        <button class="ob-btn primary" @click="runAction">{{ step.actionLabel }}</button>
      </div>
    <!-- 高亮框：只画一圈呼吸描边指个方向，不挡任何东西 -->
    <div class="ob-hole" v-show="ready" :style="holeStyle">      </div>
      <!-- 参观型步骤没有「完成」动作，静态说明一句，避免用户不知道还要不要点什么 -->
      <div class="ob-tip-hint" v-if="isFree">随便试，玩一会儿会自动进入下一步</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { store } from '../store.js'
import '../css/onboarding.css'

const emit = defineEmits(['close'])

/** 开发者 UID：引导里让用户加的好友 */
const DEV_UID = 991
/** 「给我发消息」的判定窗口：最近 1 分钟内发过就算完成 */
const MSG_WINDOW = 60
/** 参观型步骤：目标出现后停留多久再自动推进（给用户动手玩的时间） */
const FREE_HOLD = 9000

/** 在当前 DOM 里找文案匹配的元素 */
function byText(sel, text) {
  return [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').includes(text)) || null
}
/** 会话列表右上角的「+」按钮（可能有「全部已读」按钮在前面，取最后一个） */
function plusBtn() {
  const btns = document.querySelectorAll('.list-header-actions .inputModal-btn')
  return btns[btns.length - 1] || null
}
/** 通知 ChatView 执行动作（打开会话 / 切换页面） */
function ask(action, payload) {
  window.dispatchEvent(new CustomEvent('onboarding-action', { detail: { action, ...payload } }))
}

/**
 * 步骤契约
 * --------
 * type 'guide' 操作型：聚光灯模式 —— 四块遮罩挖洞，只有洞内可交互，洞外压暗拦截；
 *                      做完动作自动推进，不提供「下一步」按钮
 *      'free'  参观型：不遮罩、不抬层级、整屏照常可用，只在目标上画一圈呼吸描边框；
 *                      目标出现后停留 FREE_HOLD 毫秒自动推进（这类步骤是让用户上手玩的，
 *                      遮罩会把工具栏/主题预览挡住，等于锁死）
 * resolve()  要高亮的真实 DOM；null 或尺寸为 0 = 目标不在当前界面
 * done()     操作型的完成判定（参观型不写，交给停留计时）
 * action*    气泡里的直达按钮（仅需要跨页面跳转的步骤）
 */
const STEPS = [
  {
    id: 'login',
    type: 'guide',
    icon: 'fa-sign-in-alt',
    title: '登录你的 OJ 账号',
    text: '在这里输入校内 OJ 的用户名和密码。登录后会自动保持登录态，下次打开不用再输。',
    // 已进主界面（游客）时登录页不渲染，退一步高亮顶栏横幅的「去登录」
    resolve: () =>
      document.querySelector('.login-root .btn') ||
      byText('.nav-user-menu-item', '登录') ||
      document.querySelector('.banner-login-btn'),
    done: () => !!store.logined,
  },
  {
    id: 'addfriend',
    type: 'guide',
    icon: 'fa-user-plus',
    title: '加我为好友（UID 991）',
    text: '点会话列表右上角「+」→ 添加好友，搜索 991 —— 那就是我（开发者）。使用中遇到任何问题都可以直接找我。',
    // 三段式跟随：菜单没开时高亮「+」，菜单开了高亮「添加好友」项，弹窗开了高亮输入框
    resolve: () =>
      document.querySelector('.addfriend-input') ||
      byText('.new-convo-item', '添加好友') ||
      plusBtn(),
    // 直接判断是否关注了我（watchee = 已关注）
    done: () => store.users[DEV_UID]?.watchee === true,
  },
  {
    id: 'sendmsg',
    type: 'guide',
    icon: 'fa-comment-dots',
    title: '发一条消息',
    text: '打开任意会话（找我也可以，点下面的按钮直接开），随便发点什么。Enter 发送、Ctrl+Enter 换行；左边写 Markdown，右边实时预览。',
    resolve: () => document.querySelector('.input-editor') || document.querySelector('.list-section'),
    actionLabel: '打开与我的对话',
    action: () => ask('openUser', { id: DEV_UID }),
    // 发给谁都行：只看最近 1 分钟内有没有自己发出的消息（send_time 是秒）；
    // 本地哨兵消息没有时间戳时退回「引导开始后新出现的 id」
    done: () => {
      const now = Date.now() / 1000
      for (const id of Object.keys(store.messages || {})) {
        const m = store.messages[id]
        if (!m || m.sender !== store.self.uid) continue
        const t = Number(m.send_time)
        if (t ? now - t <= MSG_WINDOW : !baseline.msgs.has(Number(id))) return true
      }
      return false
    },
  },
  {
    id: 'group',
    type: 'guide',
    icon: 'fa-users',
    title: '新建一个群聊',
    text: '点「+」→ 创建群聊，填个群名就行。建好后点头顶群名可以改群名、加成员、设管理员。',
    resolve: () =>
      document.querySelector('.inputModal-input') ||
      byText('.new-convo-item', '创建群聊') ||
      plusBtn(),
    // 打开「新建群聊」输入框就算完成，不要求真的建出来
    done: () => !!byText('.inputModal-popup-inner h4', '新建群聊'),
  },
  {
    id: 'graph',
    type: 'free',
    icon: 'fa-project-diagram',
    title: '玩一下 Graph Editor',
    text: '工具箱 → Graph Editor：点空白处建点、拖点之间连边，再试试工具栏的力导向布局和算法高亮。这一整片都可以随便点。',
    resolve: () =>
      document.querySelector('.graph-tool') ||
      byText('.tool-card', 'Graph Editor') ||
      byText('.nav-icon', '工具'),
    actionLabel: '打开工具箱',
    action: () => ask('switch', { page: 'tools' }),
  },
  {
    id: 'theme',
    type: 'free',
    icon: 'fa-palette',
    title: '挑一个喜欢的主题',
    text: '点头像 → 设置 → 主题：20 多套预设配色还能自定义，点开就能实时预览，整个界面马上换新感觉。',
    resolve: () =>
      document.querySelector('.theme-modal-card') ||
      document.querySelector('.theme-row') ||
      byText('.nav-user-menu-item', '设置') ||
      document.querySelector('.nav-user'),
    actionLabel: '打开设置',
    action: () => ask('switch', { page: 'settings' }),
  },
  {
    id: 'donate',
    type: 'free',
    icon: 'fa-heart',
    title: '赞助支持一下',
    text: '点头像 → 赞助。项目由我一个人独立开发维护、没有广告也没有团队，你的每一份支持都是持续更新的动力。',
    resolve: () =>
      document.querySelector('.donate-view') ||
      byText('.nav-user-menu-item', '赞助') ||
      document.querySelector('.nav-user'),
    actionLabel: '打开赞助页',
    action: () => ask('switch', { page: 'donate' }),
  },
]

const stepIndex = ref(0)
const step = computed(() => STEPS[stepIndex.value] || STEPS[STEPS.length - 1])
/** 参观型：整屏不遮不拦，只画描边 */
const isFree = computed(() => step.value.type === 'free')

/** 无时间戳消息（本地刚发的哨兵）的兜底比对集合：引导开始时就存在的 id 不算新发。
    必须等 store 数据加载完再采样 —— 首帧 store 还是空的，会把登录恢复后拉回来的
    消息全当成新发的。 */
const baseline = { msgs: new Set() }
let baselineReady = false
function sampleBaseline() {
  if (baselineReady) return
  if (store.initializing || !store.self.uid) return
  baseline.msgs = new Set(Object.keys(store.messages || {}).map(Number))
  baselineReady = true
}

const ready = ref(false)
const tipEl = ref(null)
const hole = reactive({ x: 0, y: 0, w: 0, h: 0 })
const tip = reactive({ x: 0, y: 0 })
const domDone = reactive({})
/** 完成即锁存：像「1 分钟内发过消息」这类带时间窗口的判定，过期后不该退回未完成 */
const latched = new Set()
function markDone(id, d) {
  if (d) latched.add(id)
  const v = latched.has(id)
  if (domDone[id] !== v) domDone[id] = v
}

const holeStyle = computed(() => ({
  left: hole.x + 'px',
  top: hole.y + 'px',
  width: hole.w + 'px',
  height: hole.h + 'px',
}))
const tipStyle = computed(() => ({ left: tip.x + 'px', top: tip.y + 'px' }))

/** 气泡定位：候选位置（下/上/右/左）里挑「不压住高亮框、不出视口」的最优解。
    气泡不能挡住用户要操作的元素 —— 这是唯一可能产生遮挡的地方。 */
function placeTip(hr, TW, TH) {
  if (tipMoved) return // 用户手动拖过就不自动挪
  const W = window.innerWidth
  const H = window.innerHeight
  const overlap = (x, y) => {
    const l = Math.max(x, hr.left), r2 = Math.min(x + TW, hr.right)
    const t = Math.max(y, hr.top), b = Math.min(y + TH, hr.bottom)
    return r2 > l && b > t ? (r2 - l) * (b - t) : 0
  }
  const cx = hr.left + hr.width / 2 - TW / 2
  const cy = hr.top + hr.height / 2 - TH / 2
  const cands = [
    { x: cx, y: hr.bottom + 12 }, // 下
    { x: cx, y: hr.top - TH - 12 }, // 上
    { x: hr.right + 12, y: cy }, // 右
    { x: hr.left - TW - 12, y: cy }, // 左
    { x: cx, y: 12 }, // 兜底：顶上居中
  ]
  let best = cands[0]
  let bestScore = Infinity
  for (const c0 of cands) {
    const c = {
      x: Math.max(12, Math.min(c0.x, W - TW - 12)),
      y: Math.max(12, Math.min(c0.y, H - TH - 12)),
    }
    // 被 clamp 挪离理想位置的距离也要计入代价，避免硬挤到视口外
    const drift = Math.abs(c.x - c0.x) + Math.abs(c.y - c0.y)
    const score = overlap(c.x, c.y) + drift
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  tip.x = best.x
  tip.y = best.y
}

/** 手动把气泡拖开（标题栏按住拖动），拖过后自动定位不再接管 */
let tipMoved = false
function onTipDragStart(e) {
  if (e.button !== 0) return
  tipEl.value?.classList.add('ob-dragging')
  const offX = e.clientX - tip.x
  const offY = e.clientY - tip.y
  const move = (ev) => {
    tipMoved = true
    tip.x = Math.max(12, Math.min(ev.clientX - offX, window.innerWidth - (tipEl.value?.offsetWidth || 330) - 12))
    tip.y = Math.max(12, Math.min(ev.clientY - offY, window.innerHeight - (tipEl.value?.offsetHeight || 150) - 12))
  }
  const up = () => {
    tipEl.value?.classList.remove('ob-dragging')
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

/** 完成标志统一落在 domDone 上，由 locate（150ms 一轮）刷新：
    ① 任何一步都靠界面/store 的真实状态判断，不提供「下一步」按钮；
    ② 写入响应式对象才能让 watch 稳定触发（避免 true→true 时漏掉连锁推进）。 */
const doneNow = computed(() => !!domDone[step.value.id])

function locate() {
  const s = step.value
  sampleBaseline()
  const el = s.resolve()
  const r0 = el ? el.getBoundingClientRect() : null
  if (!el || r0.width < 2 || r0.height < 2) {
    // 目标不在当前界面：描边隐藏，气泡固定在屏幕中上方提示该做什么
    ready.value = false
    clearHold()
    if (!tipMoved) {
      tip.x = Math.max(12, (window.innerWidth - 330) / 2)
      tip.y = Math.max(12, window.innerHeight * 0.28)
    }
    // 目标缺席也要照常判定完成（如用户已在主界面、登录页不渲染但早已登录），
    // 否则该步永远无法推进；参观型不看 done，交给停留计时
    if (s.type !== 'free') markDone(s.id, !!s.done?.())
    return
  }
  const r = el.getBoundingClientRect()
  const pad = 6
  hole.x = r.left - pad
  hole.y = r.top - pad
  hole.w = r.width + pad * 2
  hole.h = r.height + pad * 2

  const TW = 330
  const TH = (tipEl.value?.offsetHeight || 150) + 4
  placeTip(r, TW, TH)
  ready.value = true

  if (s.type === 'free') {
    // 参观型：目标是给用户玩/看的，出现之后再停留一会儿才推进（期间界面完全可用）
    if (!domDone[s.id] && !holdTimer) {
      holdTimer = setTimeout(() => {
        holdTimer = 0
        markDone(s.id, true)
      }, FREE_HOLD)
    }
    return
  }
  markDone(s.id, !!s.done?.())
}

let timer = 0
let autoTimer = 0
let baseFallback = 0
let holdTimer = 0
function clearHold() {
  clearTimeout(holdTimer)
  holdTimer = 0
}

function next() {
  clearTimeout(autoTimer)
  clearHold()
  if (stepIndex.value >= STEPS.length - 1) {
    emit('close')
    return
  }
  stepIndex.value++
  ready.value = false
  tipMoved = false
  locate()
  // 连锁推进：老用户很多步早就完成了（已登录 / 已加好友），没有手动按钮可点，
  // 必须在这里接着往下走，否则会卡在已完成的一步上
  if (doneNow.value) autoTimer = setTimeout(next, 400)
}

function runAction() {
  step.value.action?.()
  setTimeout(locate, 350)
}

// 步骤完成后自动进入下一步（留一点时间让用户看到「完成」）
watch(doneNow, (v) => {
  clearTimeout(autoTimer)
  if (v) autoTimer = setTimeout(next, 1000)
})

function onResize() { locate() }

onMounted(() => {
  locate()
  timer = setInterval(locate, 150)
  window.addEventListener('resize', onResize)
  // 兜底：一直等不到 uid（游客态）也要让动作型步骤能判定，5 秒后强制采样
  baseFallback = setTimeout(() => {
    if (baselineReady) return
    baseline.msgs = new Set(Object.keys(store.messages || {}).map(Number))
    baselineReady = true
  }, 5000)
  // 首帧就可能已完成（如已记住登录），立即检查一次
  if (doneNow.value) autoTimer = setTimeout(next, 600)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(autoTimer)
  clearTimeout(baseFallback)
  clearHold()
  window.removeEventListener('resize', onResize)
})
</script>
