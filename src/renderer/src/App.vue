<template>
  <div class="app-stage">
    <Transition name="page" mode="out-in">
      <div class="app-view" :key="viewKey">
        <LoginView
          v-if="!isWeb && !store.logined && !store.guestMode"
          @login="onLogin"
          @guest="onGuest"
        />
        <ChatView v-else :key="'chat-' + loginSeq" />
      </div>
    </Transition>
  </div>

  <Transition name="overlay" appear>
    <WelcomeIntro v-if="showWelcome" @finish="finishWelcome" />
  </Transition>
  <Transition name="fade">
    <Onboarding v-if="showOnboarding" @close="closeOnboarding" />
  </Transition>
  <AnnouncementModal :visible="showAnnouncement" @close="closeAnnouncement" />
  <FeedbackModal :open="showFeedback" @close="showFeedback = false" />

  <Transition name="fade">
    <div v-if="store.initializing && store.logined" class="init-loading">
      <div class="init-card">
        <div class="init-spinner motion-spin" aria-hidden="true"></div>
        <div class="init-text">正在加载消息…</div>
        <div class="init-sub u-tabular-nums">本轮已获取 {{ store.fetchNewCount }} 条新消息</div>
      </div>
    </div>
  </Transition>

  <canvas ref="canvasEl" v-if="showParticles" class="particle-canvas"></canvas>

  <UiDialogHost />
  <UiToastHost />
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { UiDialogHost, UiToastHost } from '@/ui'
import { store } from './store.js'
import { checkAppUpdate, isWebBrowser, loadUsersDb } from './utils.js'
import { useAppEffects } from './composables/app/useAppEffects.js'
import { useAppOverlays } from './composables/app/useAppOverlays.js'
import LoginView from './views/LoginView.vue'
import ChatView from './views/ChatView.vue'
import AnnouncementModal from './components/modals/AnnouncementModal.vue'
import FeedbackModal from './components/modals/FeedbackModal.vue'
import Onboarding from './components/onboarding/Onboarding.vue'
import WelcomeIntro from './components/onboarding/WelcomeIntro.vue'

const isWeb = isWebBrowser()
const canvasEl = ref(null)
const loginSeq = ref(0)
const viewKey = computed(() => `${store.logined || store.guestMode ? 'chat' : 'login'}-${loginSeq.value}`)

const { showParticles } = useAppEffects(canvasEl)
const {
  showWelcome,
  showOnboarding,
  showAnnouncement,
  showFeedback,
  finishWelcome,
  closeOnboarding,
  closeAnnouncement,
} = useAppOverlays(isWeb)

try {
  if (isWeb || localStorage.getItem('7fa4_logined') === '1') {
    store.guestMode = false
    store.logined = true
  }
} catch {
  /* ignore */
}

function onGuest() {
  store.guestMode = true
  loginSeq.value++
}

function onLogin() {
  store.guestMode = false
  store.logined = true
  loginSeq.value++
}

async function initUpdateCheck() {
  try {
    const s = await window.api.loadSetting()
    if (s && !store.setting) store.setting = s
  } catch {
    /* ignore */
  }
  checkAppUpdate()
}

onMounted(() => {
  loadUsersDb()
  initUpdateCheck()
})
</script>

<style scoped>
.app-stage,
.app-view {
  width: 100%;
  height: 100%;
}

.init-loading {
  position: fixed;
  inset: 0;
  z-index: var(--z-max);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-glass);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}

.init-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-8);
  border-radius: var(--radius-2xl);
  background: var(--surface-raised);
  border: var(--border-width) solid var(--line-hairline);
  box-shadow: var(--elev-2);
}

.init-spinner {
  width: 38px;
  height: 38px;
  border: 3px solid var(--brand-soft);
  border-top-color: var(--brand);
  border-radius: var(--radius-pill);
}

.init-text {
  color: var(--fg);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wide);
}

.init-sub {
  margin-top: calc(-1 * var(--space-2));
  color: var(--fg-muted);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
}

.particle-canvas {
  position: fixed;
  inset: 0;
  z-index: var(--z-max);
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
