<template>
  <div class="about-panel">
    <div class="about-header">
      <a href="#" @click.prevent="openLink('http://jx.7fa4.cn:9080/zsq/7fa4-chat')">
        <svg class="tanuki-logo" width="25" height="24" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path class="tanuki-shape tanuki" d="m24.507 9.5-.034-.09L21.082.562a.896.896 0 0 0-1.694.091l-2.29 7.01H7.825L5.535.653a.898.898 0 0 0-1.694-.09L.451 9.411.416 9.5a6.297 6.297 0 0 0 2.09 7.278l.012.01.03.022 5.16 3.867 2.56 1.935 1.554 1.176a1.051 1.051 0 0 0 1.268 0l1.555-1.176 2.56-1.935 5.197-3.89.014-.01A6.297 6.297 0 0 0 24.507 9.5Z" fill="#E24329"></path>
          <path class="tanuki-shape right-cheek" d="m24.507 9.5-.034-.09a11.44 11.44 0 0 0-4.56 2.051l-7.447 5.632 4.742 3.584 5.197-3.89.014-.01A6.297 6.297 0 0 0 24.507 9.5Z" fill="#FC6D26"></path>
          <path class="tanuki-shape chin" d="m7.707 20.677 2.56 1.935 1.555 1.176a1.051 1.051 0 0 0 1.268 0l1.555-1.176 2.56-1.935-4.743-3.584-4.755 3.584Z" fill="#FCA326"></path>
          <path class="tanuki-shape left-cheek" d="M5.01 11.461a11.43 11.43 0 0 0-4.56-2.05L.416 9.5a6.297 6.297 0 0 0 2.09 7.278l.012.01.03.022 5.16 3.867 4.745-3.584-7.444-5.632Z" fill="#FC6D26"></path>
        </svg>
      </a>
      <h2>7FA4 Chat</h2>
    </div>
    <div class="about-content">
      <div class="about-row"><span class="label">版本</span><span class="value">{{ version }}</span></div>
      <div class="about-row"><span class="label">框架</span><span class="value">Electron + Vue 3</span></div>
      <div class="about-row"><span class="label">作者</span><span class="value">for_fo_f / GLM-5.1</span></div>

      <div class="update-section">
        <div class="update-status-row">
          <span class="label">更新</span>
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
            <i class="fas fa-download"></i> 下载更新
          </button>
          <button v-if="updateStatus === 'downloaded'" class="update-btn update-btn-install" @click="installUpdate">
            <i class="fas fa-sync-alt"></i> 安装并重启
          </button>
        </div>
      </div>

      <div class="about-desc">
        <p>7FA4 Chat 是一款基于 Vue 3 与 Electron 构建的跨平台即时通讯应用。</p>
        <p>你可以前往gitlab查询更多信息</p>
      </div>
      <div class="about-tech">
        <span class="tech-tag">Vue 3</span>
        <span class="tech-tag">Electron</span>
        <span class="tech-tag">Markdown</span>
        <span class="tech-tag">KaTeX</span>
        <span class="tech-tag">Express</span>
        <span class="tech-tag">Font Awesome</span>
      </div>

      <div class="changelog-section">
        <div class="changelog-header">
          <span>更新日志</span>
          <i class="fas fa-chevron-down changelog-toggle" ></i>
        </div>
        <div  class="changelog-content">
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
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { store } from '../store.js'

defineProps({ version: String })

const changelogLoading = ref(false)
const changelogError = ref('')
const changelogHtml = ref('')
const updateStatus = ref('idle') // idle, checking, available, not-available, downloading, downloaded, error
const updateInfo = ref(null)
const downloadProgress = ref(0)
const updateError = ref('')

const updateStatusText = computed(() => {
  switch (updateStatus.value) {
    case 'idle': return '未检查'
    case 'checking': return '正在检查...'
    case 'available': return `发现新版本 v${updateInfo.value?.version || ''}`
    case 'not-available': return '已是最新版本'
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

async function checkForUpdate() {
  updateStatus.value = 'checking'
  updateError.value = ''
  try {
    await window.api.checkForUpdate()
  } catch (e) {
    updateStatus.value = 'error'
    updateError.value = e.message
  }
}

async function downloadUpdate() {
  try {
    await window.api.downloadUpdate()
  } catch (e) {
    updateStatus.value = 'error'
    updateError.value = e.message
  }
}

function installUpdate() {
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

onMounted(async () => {
  try {
    checkForUpdate();fetchChangelog();
  } catch (err) {
    console.error('获取设置失败:', err)
  }
  window.api.onUpdateStatus(handleUpdateStatus)
})
onUnmounted(() => {
  // ipcRenderer listener will be cleaned up on window close
})
</script>
