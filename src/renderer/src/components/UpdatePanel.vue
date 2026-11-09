<template>
  <div class="update-view">
    <div class="update-view-header">
      <BackButton title="返回消息列表" @back="emit('back')" />
      <h2>版本更新</h2>
    </div>

    <div class="update-view-body">
      <!-- 检测更新 -->
      <UiCard class="update-status-card" size="md">
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
          <UiIconButton
            class="update-refresh-btn"
            size="sm"
            icon="fas fa-sync-alt"
            aria-label="检查更新"
            :loading="updateStatus === 'checking'"
            :disabled="updateStatus === 'downloading'"
            @click="checkForUpdate"
          />
        </div>
        <div v-if="updateStatus === 'downloading'" class="update-progress">
          <UiProgress class="update-progress-bar" :value="downloadProgress" size="md" label="下载进度" />
          <span class="update-progress-text">{{ downloadProgress.toFixed(1) }}%</span>
        </div>
        <div class="update-actions">
          <UiButton v-if="updateStatus === 'available'" variant="secondary" size="sm" icon="fas fa-download" @click="downloadUpdate">
            {{ isMobileWeb ? (apkUrl ? '下载新版 APK' + apkSizeText : '前往 GitLab 下载页') : '下载更新' }}
          </UiButton>
          <UiButton v-if="updateStatus === 'downloaded'" variant="primary" size="sm" icon="fas fa-sync-alt" @click="installUpdate">
            安装并重启
          </UiButton>
        </div>
        <div v-if="isAndroid && updateStatus === 'available' && apkUrl" class="update-apk-hint">
          将调用系统浏览器下载安装包，下载完成后点击安装即可升级
        </div>
      </UiCard>

      <!-- 更新日志（内部滚动区） -->
      <div class="update-log">
        <div class="changelog-header"><span>更新日志</span></div>
        <div class="update-log-scroll">
          <div v-if="changelogLoading" class="changelog-loading">
            <UiSpinner size="sm" label="加载更新日志中" /> 加载中...
          </div>
          <UiBanner v-else-if="changelogError" variant="danger" :description="changelogError" />
          <div v-else-if="changelogHtml" class="changelog-body" v-html="changelogHtml"></div>
          <UiEmptyState v-else size="sm" icon="fa-inbox" title="暂无更新日志" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 用法：<UpdatePanel :version="version" @back="view='chat'" />

import { computed, ref, onMounted } from 'vue'
import BackButton from './BackButton.vue'
import { compareVersion, checkAppUpdate, officialDownloadUrl } from '../utils.js'
import { store } from '../store.js'
import { renderChangelogMarkdown } from '../changelog-md.js'
import { UiBanner, UiButton, UiCard, UiEmptyState, UiIconButton, UiProgress, UiSpinner } from '@/ui'

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
    case 'available': return `检测到新版本 v${updateInfo.value?.version || ''}`
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

// 非桌面端（网页端 + Android）：没有 electron-updater，版本信息来自 GitLab 仓库发布的版本文件，
// 「更新」动作改为跳 GitLab 包下载页 —— 安卓端也需要这个分支，所以这里就该读 __7FA4_WEB__（非 Electron），
// **不要**改成 isWebBrowser()。
const isMobileWeb = !!(window.__7FA4_WEB__)
// 安卓 APK：没有自动更新通道，能拿到 APK 直链时直接下安装包，比让用户自己去下载页找快得多
const isAndroid = window.__7FA4_PLATFORM__ === 'android' || window.__7FA4_NATIVE__ === true
const apkUrl = computed(() => (isAndroid ? (store.update.apkUrl || '') : ''))
const apkSizeText = computed(() => {
  const b = store.update.apkSize || 0
  return b ? `（${(b / 1024 / 1024).toFixed(1)}MB）` : ''
})

// 非桌面端：跳官网下载区（含 Android/桌面各平台安装包）
function gotoDownloadPage() {
  window.api.openExternal?.(officialDownloadUrl())
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
      changelogHtml.value = renderChangelogMarkdown(result.markdown)
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

<style scoped src="../css/update-panel.css"></style>
