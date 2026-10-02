<template>
  <Transition name="ad-fade">
    <!-- 开屏海报：全屏遮罩，随机展示一张服务端已审核通过的海报。
         遮罩从挂载起就存在（避免先露出半加载的界面再盖一层），但只有在拿到海报并加载完成后
         才允许关闭 —— 未满时长前关闭按钮显示剩余秒数且禁用；失败/超时/无海报一律直接放行。 -->
    <div v-if="visible" class="startup-poster">
      <div class="startup-poster-inner">
        <img
          v-if="posterUrl"
          ref="imgEl"
          class="startup-poster-img"
          :src="posterUrl"
          alt="海报"
          draggable="false"
          @load="onLoaded"
          @error="onError"
        />
        <div v-else class="startup-poster-loading" aria-label="加载中">
          <span class="startup-poster-spinner"></span>
        </div>

        <!-- 署名：海报提供者（服务端只下发名字，不含 uid / IP） -->
        <div v-if="posterUrl && posterAuthor" class="startup-poster-author">
          <i class="fas fa-user-pen"></i>{{ posterAuthor }}
        </div>

        <div class="startup-poster-progress" v-if="ready">
          <div class="startup-poster-bar" :style="{ animationDuration: duration + 'ms' }"></div>
        </div>
      </div>

      <!-- 关闭按钮常驻右上角：停留时长未满前禁用（显示剩余秒数、点了无效），满了才变成 ×。
           满了也不自动关 —— 必须用户主动点。 -->
      <button
        class="startup-poster-close"
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
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  // 强制停留时长（ms）。计时从海报加载完成才开始，避免"图还没显示出来倒计时就走完了"
  duration: { type: Number, default: 3000 }
})
const emit = defineEmits(['close'])

// 海报加载不出来时的兜底上限：图片既 load 也 error 都不触发（连接挂死）时，
// 不能把用户永久锁在一个无法关闭的遮罩里。
const IMG_LOAD_TIMEOUT = 8000

const visible = ref(true)
const posterUrl = ref('')
const posterAuthor = ref('') // 海报提供者署名（服务端只下发名字）
const ready = ref(false)    // 海报已就绪 → 进度条与倒计时开始
const canClose = ref(false) // 停留时长已满 → 关闭按钮可点
const left = ref(Math.ceil(props.duration / 1000))
const imgEl = ref(null)
let ticker = null
let loadTimer = null
let done = false

function finish() {
  if (done) return
  done = true
  if (ticker) { clearInterval(ticker); ticker = null }
  if (loadTimer) { clearTimeout(loadTimer); loadTimer = null }
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
  if (loadTimer) { clearTimeout(loadTimer); loadTimer = null }
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

// 图片加载失败（网络/解码失败）：直接放行，绝不让启动被一张挂掉的海报卡住
function onError() { finish() }

function onKeydown(e) {
  if (e.key === 'Escape' || e.key === 'Enter') close()
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  // 随机取一张已审核通过的海报。三种情况都直接放行（不开屏）：
  //   接口失败 / 硬超时（主进程 3s）/ 服务端返回 item=null（尚无已审海报）
  let r = null
  try { r = await window.api?.fetchRandomPoster?.() } catch {}
  if (!visible.value) return // 期间已被关闭
  if (!r || !r.success || !r.item || !r.item.url) { finish(); return }

  posterUrl.value = r.item.url
  posterAuthor.value = r.item.author || ''
  await nextTick()
  // 命中缓存时 load 事件可能在监听挂上之前就已触发，用 complete 兜底
  const el = imgEl.value
  if (el && el.complete && el.naturalWidth > 0) onLoaded()
  else if (el) loadTimer = setTimeout(finish, IMG_LOAD_TIMEOUT)
})

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  if (loadTimer) clearTimeout(loadTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
/* 开屏海报：全屏遮罩，强制停留指定时长后才允许关闭。z-index 高于 init-loading(9999) 与引导/公告层，
   必须盖住登录页在内的所有内容 —— 否则启动瞬间会露出后面的界面。 */
.startup-poster {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  /* 径向渐变而非纯黑：背景不"死"，海报更跳 */
  background: radial-gradient(120% 85% at 50% 0%, rgba(32, 46, 72, 0.96), rgba(6, 10, 16, 0.97));
  -webkit-app-region: no-drag;
}
/* 桌面端（Electron 无边框窗口）：让出 32px 标题栏，海报只盖内容区。
   效果不减（内容区完全遮挡），但用户仍可拖动 / 最小化 / 关闭窗口 —— 否则想关掉软件也得先等满时长。
   Web/Android 端 body.web 隐藏了自定义标题栏，海报保持全屏。 */
body:not(.web) .startup-poster {
  top: 32px;
}
.startup-poster-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden; /* 兜底：任何情况下都不许把遮罩撑破 */
}
.startup-poster-img {
  /* 海报多为竖版，必须 contain 完整显示：任何 cover/裁剪都会切掉宣传内容 */
  display: block;
  flex: 0 1 auto;
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
body:not(.web) .startup-poster-img {
  max-height: calc(100vh - 142px);
}
/* 拉取元数据 / 图片加载期间的占位：避免出现一整块"什么都没有"的黑屏 */
.startup-poster-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 300px;
  max-width: 60vw;
  max-height: 50vh;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.startup-poster-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: rgba(255, 255, 255, 0.85);
  animation: poster-spin 0.8s linear infinite;
}
@keyframes poster-spin {
  to { transform: rotate(360deg); }
}
.startup-poster-progress {
  width: 180px;
  height: 3px;
  flex: none;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.22);
  overflow: hidden;
}
/* 署名：海报底部居中浮层，白字 + 半透明黑底，任何画面上都可读 */
.startup-poster-author {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  max-width: calc(100% - 28px);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  border-radius: 999px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
.startup-poster-author i { font-size: 0.88em; opacity: 0.9; }
.startup-poster-bar {
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
.startup-poster-close {
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
.startup-poster-close:hover { background: rgba(255, 255, 255, 0.3); }
.startup-poster-close.locked {
  opacity: 0.45;
  cursor: not-allowed;
}
.startup-poster-close.locked:hover { background: rgba(255, 255, 255, 0.16); }
.ad-fade-leave-active { transition: opacity 0.28s ease; }
.ad-fade-leave-to { opacity: 0; }
.ad-fade-enter-active { transition: opacity 0.18s ease; }
.ad-fade-enter-from { opacity: 0; }

/* 窄屏（手机比例 / 窄窗口）：把标题栏外的可用高度全给海报，去掉多余留白 */
@media (max-width: 760px) {
  .startup-poster {
    padding: 12px;
  }
  .startup-poster-inner {
    gap: 10px;
  }
  .startup-poster-img,
  body:not(.web) .startup-poster-img {
    max-height: calc(100vh - 92px);
  }
  .startup-poster-loading {
    width: 180px;
    height: 240px;
  }
}
</style>
