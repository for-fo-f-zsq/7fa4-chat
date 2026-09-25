<template>
  <Transition name="ad-fade">
    <div v-if="visible" class="startup-ad">
      <div class="startup-ad-inner">
        <div class="startup-ad-card">
          <!-- 左：宣传海报 -->
          <img
            ref="imgEl"
            class="startup-ad-poster"
            :src="posterUrl"
            alt="AI 科创社招新"
            draggable="false"
            @load="onLoaded"
            @error="onError"
          />

          <!-- 右：赞助 -->
          <aside class="startup-ad-side">
            <div class="side-header">
              <div class="side-title"><i class="fas fa-heart"></i>赞助支持</div>
              <p class="side-desc">由 for_fo_f 独立开发维护，没有任何商业团队与广告。你的赞赏是持续更新的动力。</p>
            </div>

            <div class="side-qr">
              <div class="side-qr-box">
                <img
                  v-if="!qrFailed"
                  :src="DONATE_URL"
                  alt="赞赏码"
                  class="side-qr-img"
                  draggable="false"
                  @error="qrFailed = true"
                />
                <div v-else class="side-qr-img side-qr-fallback"><i class="fas fa-heart"></i></div>
              </div>
              <p class="side-qr-tip">微信扫码赞赏</p>
            </div>

            <div class="side-sponsors">
              <div class="side-sub">
                <i class="fas fa-users"></i>赞助者
                <span v-if="sponsors.length" class="side-count">{{ sponsors.length }}</span>
              </div>
              <div v-if="sponsors.length" class="side-sp-list">
                <div v-for="(sp, idx) in shownSponsors" :key="idx" class="side-sp-row">
                  <span class="side-sp-idx">{{ idx + 1 }}</span>
                  <span class="side-sp-name">{{ sp.name }}</span>
                  <span class="side-sp-amt">{{ sp.amount }}</span>
                </div>
              </div>
              <div v-else class="side-sp-empty">暂无赞助记录，期待你成为第一位支持者</div>
            </div>

            <div class="side-ad">
              <div class="side-ad-strong"><i class="fas fa-bullhorn"></i>7FA4 Chat 火热招商中</div>
              <div class="side-ad-contact">有需要请联系 for_fo_f</div>
            </div>
          </aside>
        </div>

        <div class="startup-ad-progress" v-if="ready">
          <div class="startup-ad-bar" :style="{ animationDuration: duration + 'ms' }"></div>
        </div>
      </div>

      <!-- 关闭按钮常驻右上角：停留时长未满前禁用（显示剩余秒数、点了无效），
           满了才变成 × 且可点。满了也不自动关 —— 必须用户主动点。 -->
      <button
        class="startup-ad-close"
        :class="{ locked: !canClose }"
        :disabled="!canClose"
        :title="canClose ? '关闭' : `请稍候 ${left}s`"
        @click="close"
      >
        <i v-if="canClose" class="fas fa-times"></i>
        <template v-else>{{ left }}</template>
      </button>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import posterUrl from '../assets/club-poster.jpg'

const props = defineProps({
  // 强制停留时长（ms）。计时从海报加载完成才开始，避免"图还没显示出来倒计时就走完了"
  duration: { type: Number, default: 3000 }
})
const emit = defineEmits(['close'])

// 与赞助页同一份赞赏码（托管在 chat.forfof.cloud/assets/donate-qr.jpg）
const DONATE_URL = 'https://chat.forfof.cloud/assets/donate-qr.jpg'

const visible = ref(true)
const ready = ref(false)    // 海报已就绪 → 进度条与倒计时开始
const canClose = ref(false) // 停留时长已满 → 关闭按钮可点
const left = ref(Math.ceil(props.duration / 1000))
const imgEl = ref(null)
const sponsors = ref([])
const qrFailed = ref(false) // 赞赏码是远端图，加载失败只隐藏二维码，绝不影响启动
let ticker = null
let done = false

// 广告高度有限：全部渲染出来（上限 20 位防极端），实际露几行交给 CSS 按可用高度决定 ——
// 行高固定 + 容器 max-height 取行高整数倍，所以高度富余时尽量多露人，装不下时裁在行边界上。
// 赞助总人数在「赞助者」标题旁的徽章里，因此不再需要「等共 N 位」的汇总行。
const shownSponsors = computed(() => sponsors.value.slice(0, 20))

function finish() {
  if (done) return
  done = true
  if (ticker) { clearInterval(ticker); ticker = null }
  visible.value = false
  emit('close')
}

function close() {
  if (!canClose.value) return // 时长未满：点击与键盘触发一律忽略
  finish()
}

function onLoaded() {
  if (ready.value) return
  ready.value = true
  const startAt = Date.now()
  // 不用 setTimeout 直接关：这里只推进倒计时与解锁按钮，关闭必须由用户点击触发
  ticker = setInterval(() => {
    const elapsed = Date.now() - startAt
    if (elapsed >= props.duration) {
      clearInterval(ticker); ticker = null
      left.value = 0
      canClose.value = true
      return
    }
    left.value = Math.ceil((props.duration - elapsed) / 1000)
  }, 200)
}

// 海报加载失败（资源缺失/解码失败）：直接放行，绝不让启动被一个挂掉的广告卡住
function onError() { finish() }

// 赞助列表是网络请求，失败静默 —— 广告不能因为它卡住或报错
async function loadSponsors() {
  try {
    const r = await window.api?.fetchSponsors?.()
    if (r && r.success && Array.isArray(r.list)) sponsors.value = r.list
  } catch {}
}

function onKeydown(e) {
  if (e.key === 'Escape' || e.key === 'Enter') close()
}

onMounted(() => {
  // 命中缓存时 load 事件可能在监听挂上之前就已触发，用 complete 兜底
  const el = imgEl.value
  if (el && el.complete && el.naturalWidth > 0) onLoaded()
  loadSponsors()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
/* 启动广告：全屏遮罩，强制停留指定时长后才允许关闭。z-index 高于 init-loading(9999) 与引导/公告层，
   必须盖住登录页在内的所有内容 —— 否则启动瞬间会露出后面的界面。 */
.startup-ad {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  /* 径向渐变而非纯黑：背景不"死"，海报与右栏更跳 */
  background: radial-gradient(120% 85% at 50% 0%, rgba(32, 46, 72, 0.96), rgba(6, 10, 16, 0.97));
  -webkit-app-region: no-drag;
}
/* 桌面端（Electron 无边框窗口）：让出 32px 标题栏，广告只盖内容区。
   广告效果不减（内容区完全遮挡），但用户仍可拖动 / 最小化 / 关闭窗口 —— 否则想关掉软件也得先等满时长。
   Web/Android 端 body.web 隐藏了自定义标题栏，广告保持全屏。 */
body:not(.web) .startup-ad {
  top: 32px;
}
.startup-ad-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden; /* 兜底：任何情况下都不许把遮罩撑破 */
}
/* 左右分栏：左侧海报、右侧赞助。两栏等高（右栏 stretch 到海报高度）——
   早前让右栏高度自适应内容，它比海报矮一大截，在宽屏里像一张浮着的小卡片，右重左轻很明显。 */
.startup-ad-card {
  display: flex;
  align-items: stretch;
  gap: 24px;
  max-width: 100%;
  min-height: 0;
}
.startup-ad-poster {
  /* 海报是竖版（1048×1501），必须 contain 完整显示：任何 cover/裁剪都会切掉宣传内容 */
  flex: 0 1 auto;
  align-self: center; /* 不参与 stretch，否则图片会被拉高变形 */
  min-width: 0;
  max-width: 100%;
  max-height: calc(100vh - 110px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  user-select: none;
  -webkit-user-drag: none;
}
body:not(.web) .startup-ad-poster {
  max-height: calc(100vh - 142px);
}

/* ---------- 右栏：赞助 ----------
   用近白卡片而不是深色半透明卡：左边海报本身是明亮彩色物料，右边再压一块深灰会形成两套视觉语言；
   白卡与海报同属「卡片」，白底的赞赏码也天然融入，不再需要"深底上贴白图"那种生硬处理。 */
.startup-ad-side {
  flex: 0 0 320px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  box-sizing: border-box;
  max-height: calc(100vh - 110px);
  color: #1f2937;
  background: linear-gradient(180deg, #ffffff, #f5f8fc);
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
  overflow: hidden;
}
body:not(.web) .startup-ad-side {
  max-height: calc(100vh - 142px);
}
.side-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.side-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: #1f2937;
}
.side-title i { color: #ff5f7e; font-size: 14px; }
.side-desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #6b7688;
}
.side-qr {
  /* 撑满"标题"与"名单"之间的剩余空间并垂直居中：右栏被拉伸到与海报等高，
     二维码独占中段，空白分摊在它上下，比全部堆在它下方自然 */
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 2px 0;
  min-height: 0;
}
/* 白卡上的二维码再给一层浅描边内框，否则图与卡同为白色、看不出边界 */
.side-qr-box {
  padding: 9px;
  line-height: 0;
  background: #fff;
  border: 1px solid #e9eef5;
  border-radius: 12px;
}
.side-qr-img {
  display: block;
  width: 156px;
  height: 156px;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
.side-qr-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  color: #c3ccd8;
}
.side-qr-tip {
  margin: 0;
  font-size: 11.5px;
  color: #8b96a6;
}
/* 名单贴卡片底部：右栏与海报等高，剩余空间由上面的二维码块消化，名单自然成为"卡片页脚" */
.side-sponsors {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: none; /* 不可被 flex 压缩：一旦被压到非整行高度，名单就会出现"半行" */
  padding-top: 13px;
  border-top: 1px solid #eef1f6;
}
.side-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 9px;
  color: #1f2937;
}
.side-sub i { color: #9aa5b4; font-size: 11px; }
.side-count {
  padding: 0 6px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  color: #6b7688;
  background: #eef2f7;
  border-radius: 8px;
}
.side-sp-list {
  min-height: 0;
  /* 行高固定 + max-height 取行高整数倍：高度富余时尽量多露几位，装不下时恰好裁在行边界上，
     既不会浪费空间、也永远不会出现"半行被切"。装不下的人不显示，总数在标题徽章里，信息不丢。 */
  max-height: calc(9 * 26px);
  overflow: hidden;
}
.side-sp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px; /* 固定行高：见 .side-sp-list 的整数倍说明 */
  font-size: 12.5px;
  color: #384454;
}
.side-sp-idx {
  flex: none;
  width: 14px;
  color: #9aa5b4;
  font-variant-numeric: tabular-nums;
}
.side-sp-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-sp-amt {
  flex: none;
  color: #c8801a;
  font-variant-numeric: tabular-nums;
}
.side-sp-empty {
  padding-top: 5px;
  font-size: 11px;
  color: #9aa5b4;
}
/* 招商位：做成暖色高亮小卡，而不是一行灰字 —— 灰字压在赞助名单下方基本没人会看见 */
.side-ad {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #fff6e5, #ffeff3);
  border: 1px solid #ffe0c2;
  border-radius: 10px;
}
.side-ad-strong {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: #b45309;
}
.side-ad-strong i { color: #f59e0b; font-size: 12px; }
.side-ad-contact {
  font-size: 11.5px;
  color: #9a6b3f;
}
.startup-ad-progress {
  width: 180px;
  height: 3px;
  flex: none;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.22);
  overflow: hidden;
}
.startup-ad-bar {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  background: #fff;
  transform-origin: left center;
  animation: ad-progress linear forwards;
}
@keyframes ad-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
/* 关闭按钮：未到时长显示剩余秒数且不可点，到时后变成 × */
.startup-ad-close {
  position: absolute;
  top: 14px;
  right: 14px;
  min-width: 32px;
  height: 32px;
  padding: 0 9px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s ease, opacity 0.2s ease;
}
.startup-ad-close:hover { background: rgba(255, 255, 255, 0.3); }
.startup-ad-close.locked {
  opacity: 0.45;
  cursor: not-allowed;
}
.startup-ad-close.locked:hover { background: rgba(255, 255, 255, 0.16); }
.ad-fade-leave-active { transition: opacity 0.28s ease; }
.ad-fade-leave-to { opacity: 0; }
.ad-fade-enter-active { transition: opacity 0.18s ease; }
.ad-fade-enter-from { opacity: 0; }

/* 高度分级：按右栏可用高度决定赞助名单最多露几行（行高 26px，取整数倍）与二维码尺寸。
   窗口变矮时同步缩小二维码，把省下的高度让给名单 —— 否则矮窗口下名单会被挤到一行不剩。
   任何一级都裁在行边界上，不会出现"半行被切"。阈值与行数均按实测（tmp/render-ad-preview.cjs）定。
   ⚠️ 这几段必须放在下面的窄屏块之前：窄屏按宽度定的尺寸要能覆盖这里的高度适配。 */
@media (max-height: 780px) {
  .side-sp-list { max-height: calc(6 * 26px); }
  .side-qr-img { width: 140px; height: 140px; }
}
@media (max-height: 720px) {
  .side-sp-list { max-height: calc(4 * 26px); }
  .side-qr-img { width: 132px; height: 132px; }
}
@media (max-height: 660px) {
  .side-sp-list { max-height: calc(3 * 26px); }
  .side-qr-box { padding: 7px; }
  .side-qr-img { width: 118px; height: 118px; }
}
@media (max-height: 600px) {
  .side-sp-list { max-height: calc(1 * 26px); }
  .side-qr-img { width: 104px; height: 104px; }
}
/* 极矮窗口：名单整体让位，只保留「赞助者 N」徽章与招商卡（宁可不显示名单，也不能裁掉招商） */
@media (max-height: 550px) {
  .side-sp-list { max-height: 0; }
  .side-qr-img { width: 92px; height: 92px; }
}

/* 窄屏（手机比例 / 窄窗口）：左右放不下，改为上下堆叠。
   堆叠后必须用 grid 明确分区并压低海报高度 —— 否则赞助栏会被窗口下沿裁掉、
   文案与二维码挤在同一行里互相压字。 */
@media (max-width: 760px) {
  .startup-ad {
    padding: 12px;
  }
  .startup-ad-inner {
    gap: 10px;
  }
  .startup-ad-card {
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  /* 海报高度必须给"赞助栏 + 招商卡"留够 —— 留少了招商卡会被 .startup-ad-inner 的
     overflow:hidden 直接裁掉（看不见，且不报错）。阈值按实测反推。 */
  .startup-ad-poster,
  body:not(.web) .startup-ad-poster {
    max-height: calc(100vh - 385px);
  }
  .startup-ad-side,
  body:not(.web) .startup-ad-side {
    flex: 0 0 auto;
    width: 100%;
    max-width: 520px;
    max-height: none;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'header qr'
      'sponsors qr'
      'ad qr';
    align-items: center;
    gap: 6px 14px;
    padding: 12px 14px;
  }
  .side-header { grid-area: header; gap: 4px; }
  .side-title { font-size: 14px; }
  .side-desc { font-size: 11px; line-height: 1.6; }
  .side-qr { grid-area: qr; padding: 0; gap: 5px; }
  .side-qr-box { padding: 6px; border-radius: 9px; }
  /* 窄屏也要保证可扫：小于 100px 的二维码在手机屏上很难识别 */
  .side-qr-img { width: 110px; height: 110px; }
  .side-qr-fallback { font-size: 22px; }
  .side-qr-tip { font-size: 10.5px; white-space: nowrap; }
  .side-sponsors {
    grid-area: sponsors;
    padding-top: 7px;
    border-top: 1px solid #eef1f6;
  }
  .side-sub { margin-bottom: 5px; }
  /* 窄屏行高收到 22px，名单最多露 6 位（矮窗口再降一档），同样裁在行边界上 */
  .side-sp-row { height: 22px; }
  .side-sp-list { max-height: calc(5 * 22px); }
  .side-ad { grid-area: ad; padding: 7px 9px; }
  .side-ad-strong { font-size: 12px; }
  .side-ad-contact { font-size: 11px; }
}
@media (max-width: 760px) and (max-height: 640px) {
  .side-sp-list { max-height: calc(3 * 22px); }
}
</style>
