<template>
  <div class="update-view">
    <div class="update-view-header">
      <BackButton title="返回消息列表" @back="emit('back')" />
      <h2>版本更新</h2>
    </div>

    <div class="update-view-body">
      <!-- 检测更新 -->
      <div class="update-status-card">
        <div class="update-status-row">
          <span class="label">当前版本</span>
          <span class="value">{{ version }}</span>
        </div>
        <div class="update-status-row">
          <span class="label">更新状态</span>
          <span class="update-status-text" :class="updateStatusClass">
            <i v-if="updateStatus === 'checking'" class="fas fa-spinner fa-spin"></i>
            <i v-else-if="updateStatus === 'available'" class="fas fa-cloud-upload-alt"></i>
            <i v-else-if="updateStatus === 'downloading'" class="fas fa-download"></i>
            <i v-else-if="updateStatus === 'downloaded'" class="fas fa-check-circle"></i>
            <i v-else-if="updateStatus === 'not-available'" class="fas fa-check-circle"></i>
            <i v-else-if="updateStatus === 'error'" class="fas fa-times-circle"></i>
            <i v-else class="fas fa-question-circle"></i>
            {{ updateStatusText }}
          </span>
          <button class="update-refresh-btn" @click="checkForUpdate" :disabled="updateStatus === 'checking' || updateStatus === 'downloading'" title="检查更新">
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': updateStatus === 'checking' }"></i>
          </button>
        </div>
        <div v-if="updateStatus === 'downloading'" class="update-progress-bar">
          <div class="update-progress-fill" :style="{ width: downloadProgress + '%' }"></div>
          <span class="update-progress-text">{{ downloadProgress.toFixed(1) }}%</span>
        </div>
        <div class="update-actions">
          <button v-if="updateStatus === 'available'" class="update-btn" @click="downloadUpdate">
            <i class="fas fa-download"></i> {{ isMobileWeb ? (apkUrl ? '下载新版 APK' + apkSizeText : '前往官网下载') : '下载更新' }}
          </button>
          <button v-if="updateStatus === 'downloaded'" class="update-btn update-btn-install" @click="installUpdate">
            <i class="fas fa-sync-alt"></i> 安装并重启
          </button>
        </div>
        <div v-if="isAndroid && updateStatus === 'available' && apkUrl" class="update-apk-hint">
          将调用系统浏览器下载安装包，下载完成后点击安装即可升级
        </div>
      </div>

      <!-- 更新日志（内部滚动区） -->
      <div class="update-log">
        <div class="changelog-header"><span>更新日志</span></div>
        <div class="update-log-scroll">
          <div v-if="changelogLoading" class="changelog-loading">
            <i class="fas fa-spinner fa-spin"></i> 加载中...
          </div>
          <div v-else-if="changelogError" class="changelog-error">
            <i class="fas fa-times-circle"></i> {{ changelogError }}
          </div>
          <div v-else-if="changelogHtml" class="changelog-body" v-html="changelogHtml"></div>
          <div v-else class="changelog-empty">暂无更新日志</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import BackButton from './BackButton.vue'
import { compareVersion, checkAppUpdate } from '../utils.js'
import { store } from '../store.js'

const props = defineProps({ version: { type: String, default: '' } })
const emit = defineEmits(['back'])

// 兜底：外层异步传入可能为空，面板自身再拉一次版本号
const version = ref(props.version || '')
onMounted(() => {
  if (!version.value) {
    window.api.getVersion().then((v) => { if (v) version.value = v }).catch(() => {})
  }
})

const changelogLoading = ref(false)
const changelogError = ref('')
const changelogHtml = ref('')
const updateStatus = ref('idle') // idle, checking, available, not-available, downloading, downloaded, error
const updateInfo = ref(null)
const latestVersion = ref('')
const downloadProgress = ref(0)
const updateError = ref('')

const updateStatusText = computed(() => {
  // 仅当检测到的 latest ≥ 当前版本时才在后缀显示版本号（发版过渡期 latest 可能暂时低于当前）
  const showLatest = latestVersion.value && compareVersion(latestVersion.value, version.value) >= 0;
  switch (updateStatus.value) {
    case 'idle': return '未检查'
    case 'checking': return '正在检查...'
    case 'available': return `发现新版本 v${updateInfo.value?.version || ''}`
    case 'not-available': return showLatest ? `已是最新版本（v${latestVersion.value}）` : '已是最新版本'
    case 'downloading': return `正在下载 ${downloadProgress.value.toFixed(1)}%`
    case 'downloaded': return `v${updateInfo.value?.version || ''} 已就绪`
    case 'error': return `更新失败: ${updateError.value}`
    default: return '未知'
  }
})

const updateStatusClass = computed(() => {
  return {
    'status-idle': updateStatus.value === 'idle',
    'status-checking': updateStatus.value === 'checking',
    'status-available': updateStatus.value === 'available',
    'status-latest': updateStatus.value === 'not-available',
    'status-downloading': updateStatus.value === 'downloading',
    'status-downloaded': updateStatus.value === 'downloaded',
    'status-error': updateStatus.value === 'error',
  }
})

function handleUpdateStatus(data) {
  updateStatus.value = data.status
  if (data.info) updateInfo.value = data.info
  if (data.progress) downloadProgress.value = data.progress.percent
  if (data.error) updateError.value = data.error
}

// 版本号比较：compareVersion 统一在 utils.js（原来这里/App.vue 各有一份副本）

// 非桌面端（网页端 + Android）：没有 electron-updater，latest 来自后端 /web/api/version，
// 「更新」动作改为跳官网下载页 —— 安卓端也需要这个分支，所以这里就该读 __7FA4_WEB__（非 Electron），
// **不要**改成 isWebBrowser()。
const isMobileWeb = !!(window.__7FA4_WEB__)
// 安卓 APK：没有自动更新通道，能拿到 APK 直链时直接下安装包，比让用户自己去下载页找快得多
const isAndroid = window.__7FA4_PLATFORM__ === 'android' || window.__7FA4_NATIVE__ === true
const apkUrl = computed(() => (isAndroid ? (store.update.apkUrl || '') : ''))
const apkSizeText = computed(() => {
  const b = store.update.apkSize || 0
  return b ? `（${(b / 1024 / 1024).toFixed(1)}MB）` : ''
})

// 非桌面端：跳转官网下载页（含 Android/桌面各平台安装包）
function gotoDownloadPage() {
  window.api.openExternal?.('https://chat.forfof.cloud')
}

// 非桌面端：优先直接下 APK，拿不到直链才退回下载页
function openApkOrPage() {
  if (apkUrl.value) window.api.openExternal?.(apkUrl.value)
  else gotoDownloadPage()
}

async function checkForUpdate() {
  updateStatus.value = 'checking'
  updateError.value = ''
  try {
    if (isMobileWeb && window.api.fetchVersionInfo) {
      // 与启动时的静默检查共用一套逻辑，结果写进 store.update（NavBar 红点同源）
      const u = await checkAppUpdate()
      latestVersion.value = u.latest || ''
      if (u.error && !u.latest) {
        updateStatus.value = 'error'
        updateError.value = u.error
      } else if (u.hasUpdate) {
        updateStatus.value = 'available'
        updateInfo.value = { version: u.latest }
      } else {
        updateStatus.value = 'not-available'
      }
      return
    }
    await window.api.checkForUpdate()
  } catch (e) {
    updateStatus.value = 'error'
    updateError.value = e.message
  }
}

async function downloadUpdate() {
  if (isMobileWeb) { openApkOrPage(); return }
  try {
    await window.api.downloadUpdate()
  } catch (e) {
    updateStatus.value = 'error'
    updateError.value = e.message
  }
}

function installUpdate() {
  if (isMobileWeb) { openApkOrPage(); return }
  window.api.installUpdate()
}

async function fetchChangelog() {
  changelogLoading.value = true
  changelogError.value = ''
  try {
    const result = await window.api.fetchChangelog()
    if (result.success) {
      changelogHtml.value = result.html
    } else {
      changelogError.value = result.error || '获取失败'
    }
  } catch (e) {
    changelogError.value = e.message || '网络错误'
  } finally {
    changelogLoading.value = false
  }
}

let updateListenerRegistered = false // 页面切换会重复 mounted，仅注册一次监听（preload 不提供取消函数）

onMounted(async () => {
  checkForUpdate()
  fetchChangelog()
  if (!version.value) {
    window.api.getVersion().then((v) => { if (v) version.value = v }).catch(() => {})
  }
  if (!updateListenerRegistered) {
    updateListenerRegistered = true
    window.api.onUpdateStatus(handleUpdateStatus)
  }
})
</script>