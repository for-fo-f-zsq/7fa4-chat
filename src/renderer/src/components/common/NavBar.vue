<template>
  <div class="navbar" :class="{ narrow, 'fx-off': fxOff }">
    <div class="nav-logo" title="前往官网" @click="openSite">
      <img src="../../assets/icon.ico" class="nav-logo-img" />
    </div>
    <UiIconButton
      class="nav-icon"
      icon="fas fa-comment-dots"
      size="lg"
      variant="ghost"
      :active="pageType === 'chat'"
      :disabled="isLocked('chat')"
      :aria-label="isLocked('chat') ? '消息（登录后可用）' : '消息'"
      :title="isLocked('chat') ? '登录后可用' : '消息'"
      @click="onNavClick('chat')"
    >
      <template #icon>
        <span class="nav-icon-stack">
          <i class="fas fa-comment-dots" aria-hidden="true"></i>
          <span class="nav-icon-label">消息</span>
        </span>
        <UiBadge v-if="chatUnread && !isWeb" class="nav-badge motion-pulse" dot variant="danger" />
      </template>
    </UiIconButton>
    <UiIconButton
      v-if="!isWeb"
      class="nav-icon"
      icon="fas fa-toolbox"
      size="lg"
      variant="ghost"
      :active="pageType === 'tools'"
      aria-label="工具"
      title="工具"
      @click="$emit('switch', 'tools')"
    >
      <template #icon>
        <span class="nav-icon-stack">
          <i class="fas fa-toolbox" aria-hidden="true"></i>
          <span class="nav-icon-label">工具</span>
        </span>
      </template>
    </UiIconButton>
    <UiIconButton
      class="nav-icon"
      icon="fas fa-cog"
      size="lg"
      variant="ghost"
      :active="pageType === 'settings'"
      aria-label="设置"
      title="设置"
      @click="$emit('switch', 'settings')"
    >
      <template #icon>
        <span class="nav-icon-stack">
          <i class="fas fa-cog" aria-hidden="true"></i>
          <span class="nav-icon-label">设置</span>
        </span>
      </template>
    </UiIconButton>
    <UiIconButton
      class="nav-icon"
      icon="fas fa-info-circle"
      size="lg"
      variant="ghost"
      :active="pageType === 'about'"
      aria-label="关于"
      title="关于"
      @click="$emit('switch', 'about')"
    >
      <template #icon>
        <span class="nav-icon-stack">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
          <span class="nav-icon-label">关于</span>
        </span>
      </template>
    </UiIconButton>
    <UiIconButton
      v-if="isWeb"
      class="nav-icon nav-download"
      icon="fas fa-download"
      size="lg"
      variant="ghost"
      aria-label="下载客户端"
      title="下载客户端（Windows / Linux / macOS / Android）"
      @click="openDownload"
    >
      <template #icon>
        <span class="nav-icon-stack">
          <i class="fas fa-download" aria-hidden="true"></i>
          <span class="nav-icon-label">下载</span>
        </span>
      </template>
    </UiIconButton>

    <UiIconButton
      v-if="loggedIn"
      class="nav-icon"
      icon="fas fa-bell"
      size="lg"
      variant="ghost"
      aria-label="通知"
      :title="noticeUncheckedCount > 0 ? `通知（${noticeUncheckedCount} 条未读）` : '系统通知'"
      @click="openNoticeModal"
    >
      <template #icon>
        <span class="nav-icon-stack">
          <i class="fas fa-bell" aria-hidden="true"></i>
          <span class="nav-icon-label">通知</span>
        </span>
        <UiBadge
          v-if="noticeHasBadge"
          class="nav-badge motion-pulse"
          dot
          variant="danger"
        />
      </template>
    </UiIconButton>

    <div class="nav-user-wrap">
      <NavUserMenu
        v-model:open="userMenu"
        :narrow="narrow"
        :logged-in="loggedIn"
        :has-update="store.update.hasUpdate"
        :self-uid="selfUid"
        :self-name="selfName"
        :self-uname="selfUname"
        :self-initial="selfInitial"
        :self-real-name="selfRealName"
        :self-school="selfSchool"
        :self-seat="selfSeat"
        @go="go"
        @action="action"
        @open-announcement="openAnnouncement"
        @open-feedback="openFeedback"
      >
        <template #trigger>
          <UiAvatar
            class="nav-user"
            :size="38"
            clickable
            :color="avatarTint(selfUid)"
            :name="selfName || '未登录'"
            :title="userTitle"
          >
            <span v-if="selfInitial" class="nav-user-initial">{{ selfInitial }}</span>
            <i v-else class="fas fa-user nav-user-fallback" aria-hidden="true"></i>
          </UiAvatar>
        </template>
      </NavUserMenu>
      <UiBadge v-if="store.update.hasUpdate" class="nav-update-dot motion-pulse" dot variant="danger" title="有新版本可用" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { UiAvatar, UiBadge, UiIconButton } from '@/ui'
import NavUserMenu from './NavUserMenu.vue'
import { store } from '../../store.js'
import { useNotices } from '../../composables/chat/useNotices.js'
import { isUserHiddenBySetting, isWebBrowser, officialSiteUrl, officialDownloadUrl, feedbackPageUrl, avatarTint } from '../../utils.js'

const props = defineProps({
  pageType: String,
  users: Object,
  groups: Object,
  loggedIn: { type: Boolean, default: true },
  self: { type: Object, default: () => ({}) },
  narrow: { type: Boolean, default: false },
})

const emit = defineEmits(['switch', 'user-action'])

const userMenu = ref(false)
const fxOff = computed(() => (store.setting?.effectLevel || 'fancy') === 'performance')
const {
  uncheckedCount: noticeUncheckedCount,
  hasUnreadOrPending: noticeHasBadge,
  openNoticeModal,
} = useNotices()

const chatUnread = computed(() =>
  Object.values(props.users || {}).some((u) => u.unread > 0 && !isUserHiddenBySetting(u)) ||
  Object.values(props.groups || {}).some((g) => g.unread > 0 && !g.exited),
)

const selfName = computed(() => props.self?.nickname || props.self?.realname || props.self?.username || '')
const selfUname = computed(() => props.self?.username || '')
const selfUid = computed(() => props.self?.uid || '')
const selfRealName = computed(() => props.self?.realname || '')
const selfSchool = computed(() => props.self?.school || '')
const selfSeat = computed(() => props.self?.seat || '')
const selfInitial = computed(() => {
  const n = selfName.value
  return n ? n.charAt(0).toUpperCase() : ''
})
const userTitle = computed(() => (props.loggedIn ? selfName.value || `UID ${selfUid.value}` : '未登录'))

const LOGIN_ONLY_PAGES = ['chat']
function isLocked(page) {
  return !props.loggedIn && LOGIN_ONLY_PAGES.includes(page)
}
function onNavClick(page) {
  if (isLocked(page)) return
  emit('switch', page)
}

function action(kind) {
  userMenu.value = false
  emit('user-action', kind)
}

function go(page) {
  userMenu.value = false
  emit('switch', page)
}

function openAnnouncement() {
  userMenu.value = false
  window.dispatchEvent(new CustomEvent('open-announcement'))
}

const isWeb = isWebBrowser()
async function openFeedback() {
  userMenu.value = false
  if (isWeb) {
    let ver = ''
    try {
      ver = String((await window.api.getVersion()) || '')
    } catch {
      /* ignore */
    }
    try {
      window.api.openExternal(feedbackPageUrl('web', ver))
    } catch {
      /* ignore */
    }
    return
  }
  window.dispatchEvent(new CustomEvent('open-feedback'))
}

function openSite() {
  try {
    window.api.openExternal(officialSiteUrl())
  } catch {
    /* ignore */
  }
}

function openDownload() {
  userMenu.value = false
  try {
    window.api.openExternal(officialDownloadUrl())
  } catch {
    /* ignore */
  }
}
</script>

<style scoped src="../../css/components/nav-bar.css"></style>
