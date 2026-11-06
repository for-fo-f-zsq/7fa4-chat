<template>
  <div class="navbar" :class="{ narrow, 'fx-off': fxOff }">
    <div class="nav-logo" title="前往项目主页" @click="openSite">
      <img src="../../icon/icon.ico" class="nav-logo-img" />
    </div>
    <!-- 导航项：UiIconButton（ghost + lg）承载图标按钮语义，尺寸由 scoped .nav-icon 的自定义属性覆盖为 44×44 -->
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
        <UiBadge v-if="chatUnread" class="nav-badge motion-pulse" dot variant="danger" />
      </template>
    </UiIconButton>
    <UiIconButton
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
    <!-- 网页端专属：客户端下载入口（强调色高亮，侧栏/底栏始终可见） -->
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
    <!-- 底部用户头像（左下角固定）：个人信息 + 登录/退登 + 设置/关于入口 -->
    <div class="nav-user-wrap">
      <UiAvatar
        class="nav-user"
        :size="38"
        clickable
        :color="avatarTint(selfUid)"
        :name="selfName || '未登录'"
        :title="userTitle"
        @click.stop="userMenu = !userMenu"
      >
        <span v-if="selfInitial" class="nav-user-initial">{{ selfInitial }}</span>
        <i v-else class="fas fa-user nav-user-fallback" aria-hidden="true"></i>
      </UiAvatar>
      <!-- 非桌面端启动静默检查到新版本：红点提醒（桌面端由 electron-updater 自行弹窗，不置位） -->
      <UiBadge v-if="store.update.hasUpdate" class="nav-update-dot motion-pulse" dot variant="danger" title="有新版本可用" />
      <Transition name="dropdown">
      <div class="nav-user-menu" v-if="userMenu" @click.stop v-click-outside="() => (userMenu = false)">
        <div class="nav-user-menu-head">
          <div class="nav-user-menu-head-top">
            <UiAvatar class="nav-user-menu-avatar" :size="46" :color="avatarTint(selfUid)" :name="selfName || '未登录'">
              <span v-if="selfInitial" class="nav-user-initial-lg">{{ selfInitial }}</span>
              <i v-else class="fas fa-user nav-user-fallback" aria-hidden="true"></i>
            </UiAvatar>
            <div class="nav-user-menu-names">
              <div class="nav-user-menu-name">{{ selfName || '未登录' }}</div>
              <div class="nav-user-menu-uname" v-if="selfUname">@{{ selfUname }}</div>
            </div>
          </div>
          <!-- 个人信息（详细） -->
          <div class="nav-user-menu-info" v-if="loggedIn">
            <div class="info-item"><span class="info-key">UID</span><span class="info-val mono">{{ selfUid }}</span></div>
            <div class="info-item" v-if="selfRealName"><span class="info-key">真名</span><span class="info-val">{{ selfRealName }}</span></div>
            <div class="info-item" v-if="selfSchool"><span class="info-key">学校</span><span class="info-val">{{ selfSchool }}</span></div>
            <div class="info-item" v-if="selfSeat"><span class="info-key">座位</span><span class="info-val">{{ selfSeat }}</span></div>
          </div>
        </div>
        <!-- 导航分组 -->
        <div class="nav-user-menu-group">
          <div class="nav-user-menu-item" @click="go('update')"><i class="fas fa-cloud-upload-alt"></i><span>版本更新</span><UiBadge v-if="store.update.hasUpdate" class="nav-update-tag" variant="danger" size="sm">有新版本</UiBadge></div>
          <div class="nav-user-menu-item" @click="go('donate')"><i class="fas fa-heart"></i><span>赞助</span></div>
          <div class="nav-user-menu-item" @click="go('about')"><i class="fas fa-info-circle"></i><span>关于</span></div>
          <div class="nav-user-menu-item" @click="openAnnouncement"><i class="fas fa-bullhorn"></i><span>版本公告</span></div>
          <div class="nav-user-menu-item" @click="openFeedback"><i class="fas fa-comment-dots"></i><span>意见反馈</span></div>
        </div>
        <!-- 账户分组 -->
        <div class="nav-user-menu-group">
          <div class="nav-user-menu-item" v-if="!loggedIn" @click="action('login')"><i class="fas fa-sign-in-alt"></i><span>登录</span></div>
          <div class="nav-user-menu-item" v-if="loggedIn" @click="action('relogin')"><i class="fas fa-sync-alt"></i><span>重新登录</span></div>
          <div class="nav-user-menu-item danger" v-if="loggedIn" @click="action('logout')"><i class="fas fa-sign-out-alt"></i><span>退出登录</span></div>
        </div>
      </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { UiAvatar, UiBadge, UiIconButton } from '../ui'
import { vClickOutside } from '../composables/vClickOutside.js'
import { store } from '../store.js'
import { isUserHiddenBySetting, isWebBrowser, gitlabProjectUrl, gitlabIssuesUrl, gitlabPackagesUrl, avatarTint } from '../utils.js'

const props = defineProps({
  pageType: String,
  users: Object,
  groups: Object,
  loggedIn: { type: Boolean, default: true },
  self: { type: Object, default: () => ({}) },
  // 窄屏单列模式（ChatView 的 isNarrowLayout）：导航栏移到底部成 TabBar
  narrow: { type: Boolean, default: false }
})

const emit = defineEmits(['switch', 'user-action'])

const userMenu = ref(false)

// performance 档（与 App.vue 的 html.fx-lite 同源）：暂停品牌光晕循环与状态脉冲
const fxOff = computed(() => (store.setting?.effectLevel || 'fancy') === 'performance')

const chatUnread = computed(() =>
  Object.values(props.users || {}).some(u => u.unread > 0 && !isUserHiddenBySetting(u)) ||
  Object.values(props.groups || {}).some(g => g.unread > 0 && !g.exited)
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
const userTitle = computed(() => props.loggedIn ? (selfName.value || `UID ${selfUid.value}`) : '未登录')

// 未登录（游客）进不去的入口：不隐藏，改为变浅且不可交互。
// 隐藏会让人以为软件没这个功能；保留可见 + 灰掉 + 悬停提示"登录后可用"，才知道是登录态限制。
// 与 ChatView.switchPage 的游客拦截同一份清单（那边是兜底，快捷键也走它）。
const LOGIN_ONLY_PAGES = ['chat'];
function isLocked(page) { return !props.loggedIn && LOGIN_ONLY_PAGES.includes(page); }
function onNavClick(page) { if (isLocked(page)) return; emit('switch', page); }
function onMenuGo(page) { if (isLocked(page)) return; go(page); }

function action(kind) {
  userMenu.value = false
  emit('user-action', kind)
}

// #14 从头像菜单跳转页面
function go(page) {
  userMenu.value = false
  emit('switch', page)
}

// 版本公告：通过全局事件通知 App 显示（公告组件由 App 层管理）
function openAnnouncement() {
  userMenu.value = false
  window.dispatchEvent(new CustomEvent('open-announcement'))
}

// 意见反馈：直接跳转 GitLab Issues（不再走客户端内置表单）
function openFeedback() {
  userMenu.value = false
  try { window.api.openExternal(gitlabIssuesUrl()) } catch {}
}

// 左上角标识：点击打开 GitLab 项目主页
function openSite() {
  try { window.api.openExternal(gitlabProjectUrl()) } catch {}
}

// 纯网页浏览器端：客户端下载入口（引导下载完整客户端）
// 必须用 isWebBrowser()：window.__7FA4_WEB__ 在 Android App 里也是 true（共用 platform/web-api.js），
// 直接用它会害得安卓端底栏也冒出一个「下载」。
const isWeb = isWebBrowser()
function openDownload() {
  userMenu.value = false
  try { window.api.openExternal(gitlabPackagesUrl()) } catch {}
}
</script>

<style scoped src="../css/nav-bar.css"></style>

