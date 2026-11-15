<template>
  <PanelShell title="版本更新" icon="fas fa-sync-alt" :backable="true" :scrollable="false" @back="emit('back')">
    <div class="update-view-body">
      <UiCard class="update-status-card" size="md">
        <div class="update-status-row">
          <span class="label">当前版本</span>
          <span class="value u-tabular-nums">v{{ version }}</span>
        </div>
        <div class="update-status-row">
          <span class="label">更新状态</span>
          <span class="update-status-text" :class="updateStatusClass">
            <i :class="updateStatusIcon" aria-hidden="true"></i>
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
          <span class="update-progress-text u-tabular-nums">{{ downloadProgress.toFixed(1) }}%</span>
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

      <div class="update-log">
        <div class="changelog-header"><span>更新日志</span></div>
        <div class="update-log-scroll">
          <ChangelogViewer :auto-load="true" />
        </div>
      </div>
    </div>
  </PanelShell>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { UiButton, UiCard, UiIconButton, UiProgress } from '@/ui'
import { store } from '@/store.js'
import { checkAppUpdate, compareVersion, officialDownloadUrl } from '@/utils.js'
import ChangelogViewer from '@/components/common/ChangelogViewer.vue'
import PanelShell from '@/components/common/PanelShell.vue'

const props = defineProps({ version: { type: String, default: '' } })
const emit = defineEmits(['back'])

const version = ref(props.version || '')
const updateStatus = ref('idle')
const updateInfo = ref(null)
const latestVersion = ref('')
const downloadProgress = ref(0)
const updateError = ref('')

const updateStatusText = computed(() => {
  const showLatest = latestVersion.value && compareVersion(latestVersion.value, version.value) >= 0
  switch (updateStatus.value) {
    case 'idle':
      return '未检查'
    case 'checking':
      return '正在检查...'
    case 'available':
      return `检测到新版本 v${updateInfo.value?.version || ''}`
    case 'not-available':
      return showLatest ? `已是最新版本（v${latestVersion.value}）` : '已是最新版本'
    case 'downloading':
      return `正在下载 ${downloadProgress.value.toFixed(1)}%`
    case 'downloaded':
      return `v${updateInfo.value?.version || ''} 已就绪`
    case 'error':
      return `更新失败: ${updateError.value}`
    default:
      return '未知'
  }
})

const STATUS_ICONS = {
  checking: 'fas fa-spinner fa-spin',
  available: 'fas fa-cloud-upload-alt',
  downloading: 'fas fa-download',
  downloaded: 'fas fa-check-circle',
  'not-available': 'fas fa-check-circle',
  error: 'fas fa-times-circle',
}

const updateStatusIcon = computed(() => STATUS_ICONS[updateStatus.value] || 'fas fa-question-circle')

const updateStatusClass = computed(() => ({
  'status-idle': updateStatus.value === 'idle',
  'status-checking': updateStatus.value === 'checking',
  'status-available': updateStatus.value === 'available',
  'status-latest': updateStatus.value === 'not-available',
  'status-downloading': updateStatus.value === 'downloading',
  'status-downloaded': updateStatus.value === 'downloaded',
  'status-error': updateStatus.value === 'error',
}))

function handleUpdateStatus(data) {
  updateStatus.value = data.status
  if (data.info) updateInfo.value = data.info
  if (data.progress) downloadProgress.value = data.progress.percent
  if (data.error) updateError.value = data.error
}

const isMobileWeb = !!window.__7FA4_WEB__
const isAndroid = window.__7FA4_PLATFORM__ === 'android' || window.__7FA4_NATIVE__ === true
const apkUrl = computed(() => (isAndroid ? store.update.apkUrl || '' : ''))
const apkSizeText = computed(() => {
  const b = store.update.apkSize || 0
  return b ? `（${(b / 1024 / 1024).toFixed(1)}MB）` : ''
})

function gotoDownloadPage() {
  window.api.openExternal?.(officialDownloadUrl())
}

function openApkOrPage() {
  if (apkUrl.value) window.api.openExternal?.(apkUrl.value)
  else gotoDownloadPage()
}

async function checkForUpdate() {
  updateStatus.value = 'checking'
  updateError.value = ''
  try {
    if (isMobileWeb && window.api.fetchVersionInfo) {
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
  if (isMobileWeb) {
    openApkOrPage()
    return
  }
  try {
    await window.api.downloadUpdate()
  } catch (e) {
    updateStatus.value = 'error'
    updateError.value = e.message
  }
}

function installUpdate() {
  if (isMobileWeb) {
    openApkOrPage()
    return
  }
  window.api.installUpdate()
}

let unsubscribeUpdateStatus = null

onMounted(async () => {
  checkForUpdate()
  if (!version.value) {
    window.api.getVersion().then((v) => {
      if (v) version.value = v
    }).catch(() => {})
  }
  if (typeof window.api?.onUpdateStatus === 'function') {
    unsubscribeUpdateStatus = window.api.onUpdateStatus(handleUpdateStatus)
  }
})

onUnmounted(() => {
  if (typeof unsubscribeUpdateStatus === 'function') {
    unsubscribeUpdateStatus()
    unsubscribeUpdateStatus = null
  }
})
</script>

<style scoped src="../../css/components/update-panel.css"></style>
