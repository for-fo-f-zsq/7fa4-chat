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
            <i class="fas fa-download"></i> 下载更新
          </button>
          <button v-if="updateStatus === 'downloaded'" class="update-btn update-btn-install" @click="installUpdate">
            <i class="fas fa-sync-alt"></i> 安装并重启
          </button>
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