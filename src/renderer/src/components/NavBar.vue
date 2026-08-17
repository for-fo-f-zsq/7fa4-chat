<template>
  <div class="navbar">
    <div class="nav-logo" title="前往官网 chat.forfof.cloud" @click="openSite">
      <img src="../../icon/icon.ico" class="nav-logo-img" />
    </div>
    <div
      v-if="loggedIn"
      class="nav-icon"
      :class="{ active: pageType === 'chat' }"
      @click="$emit('switch', 'chat')"
    >
      <i class="fas fa-comment-dots"></i>
      <span>消息</span>
      <span v-if="chatUnread" class="nav-badge"></span>
    </div>
    <div
      v-if="loggedIn"
      class="nav-icon"
      :class="{ active: pageType === 'favorites' }"
      @click="$emit('switch', 'favorites')"
    >
      <i class="fas fa-star"></i>
      <span>收藏</span>
    </div>
    <div
      class="nav-icon"
      :class="{ active: pageType === 'tools' }"
      @click="$emit('switch', 'tools')"
    >
      <i class="fas fa-wrench"></i>
      <span>工具</span>
    </div>
    <div
      class="nav-icon"
      :class="{ active: pageType === 'settings' }"
      @click="$emit('switch', 'settings')"
    >
      <i class="fas fa-cog"></i>
      <span>设置</span>
    </div>
    <div
      class="nav-icon"
      :class="{ active: pageType === 'about' }"
      @click="$emit('switch', 'about')"
    >
      <i class="fas fa-info-circle"></i>
      <span>关于</span>
    </div>
    <!-- 底部用户头像（左下角固定）：个人信息 + 登录/退登 -->
    <div class="nav-user-wrap">
      <div class="nav-user" :title="userTitle" @click.stop="userMenu = !userMenu">
        <span v-if="selfInitial" class="nav-user-initial">{{ selfInitial }}</span>
        <i v-else class="fas fa-user nav-user-fallback"></i>
      </div>
      <div class="nav-user-menu" v-if="userMenu" @click.stop v-click-outside="() => (userMenu = false)">
        <div class="nav-user-menu-head">
          <div class="nav-user-menu-avatar">
            <span v-if="selfInitial" class="nav-user-initial-lg">{{ selfInitial }}</span>
            <i v-else class="fas fa-user"></i>
          </div>
          <div class="nav-user-menu-names">
            <div class="nav-user-menu-name">{{ selfName || '未登录' }}</div>
            <div class="nav-user-menu-uname" v-if="selfUname">@{{ selfUname }}</div>
          </div>
        </div>
        <!-- 个人信息（原设置面板顶部信息区） -->
        <div class="nav-user-menu-info" v-if="loggedIn">
          <div class="info-row"><span class="info-label">UID</span><span class="info-value">{{ selfUid }}</span></div>
          <div class="info-row" v-if="selfRealName"><span class="info-label">真名</span><span class="info-value">{{ selfRealName }}</span></div>
          <div class="info-row" v-if="selfSchool"><span class="info-label">学校</span><span class="info-value">{{ selfSchool }}</span></div>
          <div class="info-row" v-if="selfSeat"><span class="info-label">座位</span><span class="info-value">{{ selfSeat }}</span></div>
        </div>
        <div class="nav-user-menu-item" v-if="!loggedIn" @click="action('login')"><i class="fas fa-sign-in-alt"></i> 登录</div>
        <div class="nav-user-menu-item" v-if="loggedIn" @click="action('relogin')"><i class="fas fa-sync-alt"></i> 重新登录</div>
        <div class="nav-user-menu-item danger" v-if="loggedIn" @click="action('logout')"><i class="fas fa-sign-out-alt"></i> 退出登录</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { vClickOutside } from '../composables/vClickOutside.js'

const props = defineProps({
  pageType: String,
  users: Object,
  groups: Object,
  loggedIn: { type: Boolean, default: true },
  self: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['switch', 'user-action'])

const userMenu = ref(false)

const chatUnread = computed(() =>
  Object.values(props.users || {}).some(u => u.unread > 0) ||
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

function action(kind) {
  userMenu.value = false
  emit('user-action', kind)
}

// 左上角标识：点击打开官网
function openSite() {
  window.api.openExternal('https://chat.forfof.cloud')
}
</script>
