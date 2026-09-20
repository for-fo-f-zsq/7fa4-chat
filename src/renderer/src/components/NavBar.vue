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
      :class="{ active: pageType === 'discover' }"
      title="发现：可能认识的人 / 群，以及全量搜索"
      @click="$emit('switch', 'discover')"
    >
      <i class="fas fa-compass"></i>
      <span>发现</span>
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
      title="设置"
      @click="$emit('switch', 'settings')"
    >
      <i class="fas fa-cog"></i>
      <span>设置</span>
    </div>
    <!-- 网页端专属：客户端下载入口（强调色高亮，侧栏/底栏始终可见） -->
    <div
      v-if="isWeb"
      class="nav-icon nav-download"
      title="下载客户端（Windows / Linux / macOS / Android）"
      @click="openDownload"
    >
      <i class="fas fa-download"></i>
      <span>下载</span>
    </div>
    <!-- 底部用户头像（左下角固定）：个人信息 + 登录/退登 + 设置/关于入口 -->
    <div class="nav-user-wrap">
      <div class="nav-user" :title="userTitle" @click.stop="userMenu = !userMenu">
        <span v-if="selfInitial" class="nav-user-initial">{{ selfInitial }}</span>
        <i v-else class="fas fa-user nav-user-fallback"></i>
        <!-- 非桌面端启动静默检查到新版本：红点提醒（桌面端由 electron-updater 自行弹窗，不置位） -->
        <span v-if="store.update.hasUpdate" class="nav-update-dot" title="有新版本可用"></span>
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
          <div class="nav-user-menu-item" @click="go('update')"><i class="fas fa-cloud-upload-alt"></i><span>版本更新</span><span v-if="store.update.hasUpdate" class="nav-update-tag">有新版本</span></div>
          <div class="nav-user-menu-item" v-if="isWeb" @click="openDownload"><i class="fas fa-download"></i><span>下载客户端</span></div>
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
    </div>
  </div>
  <!-- 意见反馈弹窗 -->
  <div class="feedback-mask" v-if="feedbackVisible" @click.self="feedbackVisible = false">
    <div class="feedback-box">
      <div class="feedback-head"><h3>意见反馈</h3><button class="feedback-close" @click="feedbackVisible = false"><i class="fas fa-times"></i></button></div>
      <textarea class="feedback-input" v-model="feedbackText" rows="5" maxlength="2000" placeholder="写下你的建议、问题或 Bug 描述…"></textarea>
      <div class="feedback-pics" v-if="feedbackImage">
        <div class="feedback-pic-item">
          <img :src="feedbackImageUrl" class="feedback-pic-img" />
          <button class="feedback-pic-remove" title="移除图片" @click="feedbackImage = null"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="feedback-tools">
        <button class="feedback-add-pic" @click="pickFeedbackImage"><i class="fas fa-image"></i> 添加截图（可选）</button>
      </div>
      <div class="feedback-client" v-if="feedbackClientText"><i class="fas fa-info-circle"></i> {{ feedbackClientText }}</div>
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
import { compressBase64Image, isUserHiddenBySetting, isWebBrowser } from '../utils.js'

// 意见反馈
const feedbackVisible = ref(false)
const feedbackText = ref('')
const feedbackSending = ref(false)
const feedbackStatus = ref('') // '' | 'ok' | 'err'
const feedbackMsg = ref('')
const feedbackImage = ref(null) // 可选截图（base64 JPEG，≤300KB）
const feedbackImageUrl = ref('')
const feedbackClientText = ref('')

function openFeedback() {
  userMenu.value = false
  feedbackText.value = ''
  feedbackStatus.value = ''
  feedbackMsg.value = ''
  feedbackImage.value = null
  feedbackImageUrl.value = ''
  feedbackVisible.value = true
  // 打开即展示客户端信息（平台/版本/UID）
  collectClientInfo().catch(() => {})
}

// 客户端信息（随反馈提交，便于定位问题）：平台（Windows/Linux/macOS/Android/Web）+ 版本号 + UID
async function collectClientInfo() {
  // 桌面端由主进程按 OS 细分（get-platform → windows/linux/macos）；Android/Web 用平台标记
  let platform = 'desktop'
  try {
    if (window.api && typeof window.api.getPlatform === 'function') {
      platform = await window.api.getPlatform()
    } else if (window.__7FA4_PLATFORM__) {
      platform = window.__7FA4_PLATFORM__
    }
  } catch {}
  let version = ''
  try { version = await window.api.getVersion() } catch {}
  const info = {
    platform,
    version: version || '',
    uid: Number(store.self?.uid) || 0,
    user: store.self?.username || store.self?.nickname || ''
  }
  const label = { windows: 'Windows', linux: 'Linux', macos: 'macOS', android: 'Android', web: '网页端', desktop: '桌面端' }[platform] || platform
  feedbackClientText.value = `${label}${version ? ' v' + version : ''}${info.uid ? ' · UID ' + info.uid : ''}`
  return info
}

// 版本公告：通过全局事件通知 App 显示（公告组件由 App 层管理）
function openAnnouncement() {
  userMenu.value = false
  window.dispatchEvent(new CustomEvent('open-announcement'))
}

async function pickFeedbackImage() {
  try {
    const sel = await window.api.selectImage()
    if (!sel || !sel.success || !sel.data) return
    let data = sel.data
    let mime = sel.mime || 'image/jpeg'
    // 压缩到 ≤100KB（复用 compressBase64Image 的降质循环），控制反馈体积
    if (!/^image\/gif$/i.test(mime)) {
      const r = await compressBase64Image(data, mime)
      if (r) { data = r.data; mime = 'image/jpeg' }
    }
    feedbackImage.value = data
    feedbackImageUrl.value = `data:${mime};base64,${data}`
  } catch {}
}

async function submitFeedback() {
  const content = feedbackText.value.trim()
  if (!content || feedbackSending.value) return
  feedbackSending.value = true
  try {
    const client = await collectClientInfo()
    const r = await window.api.sendFeedback({
      content,
      user: client.user,
      uid: client.uid,
      client: { platform: client.platform, version: client.version },
      image: feedbackImageUrl.value || '', // data URL（含 mime），服务器直接存储展示
    })
    if (r && r.success) {
      feedbackStatus.value = 'ok'
      feedbackMsg.value = '反馈已提交，感谢你的支持！'
      feedbackText.value = ''
      feedbackImage.value = null
      feedbackImageUrl.value = ''
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

// 纯网页浏览器端：客户端下载入口（引导下载完整客户端）
// 必须用 isWebBrowser()：window.__7FA4_WEB__ 在 Android App 里也是 true（共用 platform/web-api.js），
// 直接用它会害得安卓端底栏也冒出一个「下载」。
const isWeb = isWebBrowser()
function openDownload() {
  userMenu.value = false
  try { window.api.openExternal('https://chat.forfof.cloud/#download') } catch {}
}
</script>
