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
      class="nav-icon"
      :class="{ active: pageType === 'tools' }"
      @click="$emit('switch', 'tools')"
    >
      <i class="fas fa-wrench"></i>
      <span>工具</span>
    </div>
    <!-- 底部用户头像（左下角固定）：个人信息 + 登录/退登 + 设置/关于入口 -->
    <div class="nav-user-wrap">
      <div class="nav-user" :title="userTitle" @click.stop="userMenu = !userMenu">
        <span v-if="selfInitial" class="nav-user-initial">{{ selfInitial }}</span>
        <i v-else class="fas fa-user nav-user-fallback"></i>
      </div>
      <div class="nav-user-menu" v-if="userMenu" @click.stop v-click-outside="() => (userMenu = false)">
        <div class="nav-user-menu-head">
          <div class="nav-user-menu-head-top">
            <div class="nav-user-menu-avatar">
              <span v-if="selfInitial" class="nav-user-initial-lg">{{ selfInitial }}</span>
              <i v-else class="fas fa-user"></i>
            </div>
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
          <div class="nav-user-menu-item" v-if="loggedIn" @click="go('favorites')"><i class="fas fa-star"></i><span>收藏</span></div>
          <div class="nav-user-menu-item" @click="go('settings')"><i class="fas fa-cog"></i><span>设置</span></div>
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
    </div>
  </div>
  <!-- 意见反馈弹窗 -->
  <div class="feedback-mask" v-if="feedbackVisible" @click.self="feedbackVisible = false">
    <div class="feedback-box">
      <div class="feedback-head"><h3>意见反馈</h3><button class="feedback-close" @click="feedbackVisible = false"><i class="fas fa-times"></i></button></div>
      <textarea class="feedback-input" v-model="feedbackText" rows="5" maxlength="2000" placeholder="写下你的建议、问题或 Bug 描述…"></textarea>
      <div class="feedback-status" :class="{ ok: feedbackStatus === 'ok', err: feedbackStatus === 'err' }" v-if="feedbackStatus">{{ feedbackMsg }}</div>
      <div class="feedback-actions">
        <button class="feedback-btn" @click="feedbackVisible = false">取消</button>
        <button class="feedback-btn primary" :disabled="feedbackSending || !feedbackText.trim()" @click="submitFeedback">{{ feedbackSending ? '提交中…' : '提交' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { vClickOutside } from '../composables/vClickOutside.js'
import { store } from '../store.js'

// 意见反馈
const feedbackVisible = ref(false)
const feedbackText = ref('')
const feedbackSending = ref(false)
const feedbackStatus = ref('') // '' | 'ok' | 'err'
const feedbackMsg = ref('')
function openFeedback() {
  userMenu.value = false
  feedbackText.value = ''
  feedbackStatus.value = ''
  feedbackMsg.value = ''
  feedbackVisible.value = true
}
// 版本公告：通过全局事件通知 App 显示（公告组件由 App 层管理）
function openAnnouncement() {
  userMenu.value = false
  window.dispatchEvent(new CustomEvent('open-announcement'))
}
async function submitFeedback() {
  const content = feedbackText.value.trim()
  if (!content || feedbackSending.value) return
  feedbackSending.value = true
  try {
    const r = await window.api.sendFeedback({
      content,
      user: store.self?.username || store.self?.nickname || '',
      uid: store.self?.uid || 0,
    })
    if (r && r.success) {
      feedbackStatus.value = 'ok'
      feedbackMsg.value = '反馈已提交，感谢你的支持！'
      feedbackText.value = ''
    } else {
      feedbackStatus.value = 'err'
      feedbackMsg.value = (r && r.error) || '提交失败，请稍后重试'
    }
  } catch (e) {
    feedbackStatus.value = 'err'
    feedbackMsg.value = e.message || '提交失败'
  } finally {
    feedbackSending.value = false
  }
}

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

// #14 从头像菜单跳转页面
function go(page) {
  userMenu.value = false
  emit('switch', page)
}

// 左上角标识：点击打开官网
function openSite() {
  window.api.openExternal('https://chat.forfof.cloud')
}
</script>
