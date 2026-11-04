<template>
  <div class="tools-page">
    <div class="tools-header">
      <h2 class="page-title"><i class="fas fa-toolbox"></i> 工具</h2>
      <div class="tools-header-meta">
        <span v-if="updatedAtText" class="tools-updated">工具列表更新于 {{ updatedAtText }}</span>
        <button
          class="tool-btn tools-refresh"
          type="button"
          :disabled="loading"
          title="刷新工具列表"
          @click="load"
        >
          <i class="fas fa-rotate-right" :class="{ 'fa-spin': loading }"></i>
          <span>{{ loading ? '刷新中' : '刷新' }}</span>
        </button>
      </div>
    </div>

    <div v-if="errorText" class="tools-error-bar">
      <i class="fas fa-exclamation-triangle"></i>
      <span class="tools-error-text">{{ errorText }}</span>
      <button v-if="canRetry" class="tool-btn tools-error-retry" type="button" @click="load">重试</button>
      <button v-else class="tool-btn tools-error-retry" type="button" @click="dismissError">关闭</button>
    </div>

    <div v-if="loading && remoteCards.length === 0 && !errorText" class="tools-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>正在获取工具列表…</span>
    </div>

    <div v-else class="tools-grid">
      <!-- 内置工具：manifest 中已提供同名远端工具的会被替换，其余继续走旧入口（过渡期） -->
      <div
        v-for="tool in builtinCards"
        :key="'builtin-' + tool.id"
        class="tool-card"
        @click="onBuiltinClick(tool)"
      >
        <i :class="tool.icon"></i>
        <div class="tool-card-name">{{ tool.name }}</div>
        <div class="tool-card-desc">{{ tool.desc }}</div>
        <div class="tool-card-footer">
          <span class="tool-badge tool-badge-builtin"><i class="fas fa-box"></i> 内置</span>
          <div class="tool-actions">
            <button class="tool-btn tool-btn-primary" type="button" @click.stop="onBuiltinClick(tool)">
              打开
            </button>
          </div>
        </div>
      </div>

      <!-- 远端工具：状态机 未安装→下载 / 已安装→打开+卸载 / 有新版→更新 / 下载中→进度 / 版本不满足→禁用 -->
      <div
        v-for="card in remoteCards"
        :key="'remote-' + card.id"
        class="tool-card"
        :class="{ 'is-disabled': card.blocked }"
      >
        <i :class="card.icon || 'fas fa-puzzle-piece'"></i>
        <div class="tool-card-name">{{ card.name || card.id }}</div>
        <div class="tool-card-desc">{{ card.desc || '远端工具' }}</div>
        <div class="tool-card-meta">
          <span class="tool-meta-item">v{{ card.version || '?' }}</span>
          <span v-if="formatSize(card.size)" class="tool-meta-item">{{ formatSize(card.size) }}</span>
          <span v-if="card.installedInfo" class="tool-meta-item">
            已装 v{{ card.installedInfo.version || '?' }}
          </span>
        </div>

        <div v-if="card.progress" class="tool-progress">
          <div class="tool-progress-track">
            <div class="tool-progress-bar" :style="{ width: progressPercent(card) + '%' }"></div>
          </div>
          <div class="tool-progress-text">
            <span>{{ progressFile(card) }}</span>
            <span>{{ progressPercent(card) }}%</span>
          </div>
        </div>

        <div class="tool-card-footer">
          <span class="tool-badge" :class="{ 'tool-badge-update': card.outdated && !card.progress }">
            {{ statusText(card.state) }}
          </span>

          <div class="tool-actions">
            <button v-if="card.blocked" class="tool-btn" type="button" disabled>
              请先更新应用
            </button>

            <button v-else-if="card.state === 'downloading'" class="tool-btn" type="button" disabled>
              {{ card.busy === 'install' ? '安装中…' : '下载中…' }}
            </button>

            <button
              v-else-if="card.state === 'not-installed'"
              class="tool-btn tool-btn-primary"
              type="button"
              :disabled="!!card.busy"
              @click="installTool(card)"
            >
              {{ card.busy === 'install' ? '安装中…' : '下载' }}
            </button>

            <template v-else>
              <button
                v-if="card.state === 'outdated'"
                class="tool-btn tool-btn-primary"
                type="button"
                :disabled="!!card.busy"
                @click="installTool(card)"
              >
                {{ card.busy === 'install' ? '更新中…' : '更新' }}
              </button>
              <button
                v-else
                class="tool-btn tool-btn-primary"
                type="button"
                :disabled="!!card.busy"
                @click="openRemote(card)"
              >
                {{ card.busy === 'open' ? '打开中…' : '打开' }}
              </button>
              <button
                v-if="card.state === 'outdated'"
                class="tool-btn"
                type="button"
                :disabled="!!card.busy"
                @click="openRemote(card)"
              >
                打开
              </button>
              <button
                class="tool-btn tool-btn-danger"
                type="button"
                :disabled="!!card.busy"
                @click="removeTool(card)"
              >
                卸载
              </button>
            </template>
          </div>
        </div>

        <div v-if="card.blocked" class="tool-blocked-hint">
          需要应用版本 ≥ v{{ card.minAppVersion }}，请先更新应用
        </div>
      </div>
    </div>

    <div v-if="!loading && remoteCards.length === 0" class="tools-empty">
      暂无远端工具；当前客户端版本或网络可能暂不支持工具中心。
    </div>
  </div>
</template>

<script setup>
/**
 * 工具中心
 *
 * - 远端工具：fetchToolsManifest() 拿清单 + listInstalledTools() 拿本地安装状态；
 * - 内置工具：manifest 缺失时继续走旧入口（标注「内置」），保证过渡期可用；
 * - 安装 / 更新 / 卸载 / 打开全部经 window.api 平台层，API 缺失时降级为错误提示而不是白屏。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { compareVersion, isWebBrowser } from '../utils.js'

const emit = defineEmits(['openTool'])

// 纯网页浏览器端：GeoGebra 离线包体积过大（49MB），仅提示下载本地版。
// 必须用 isWebBrowser()：Android 端已把 GeoGebra 打进 APK（scripts/build-web.mjs 复制到 /geogebra/），
// 直接读 window.__7FA4_WEB__ 会把安卓误判成网页、把工具描述写错。
const isWeb = isWebBrowser()

const STATUS_TEXT = {
  'not-installed': '未安装',
  downloading: '下载中',
  installed: '已安装',
  outdated: '有新版',
}

// 内置工具清单（过渡期兜底；远端清单里出现同 id 时以远端卡片为准）
const builtinTools = computed(() => [
  {
    id: 'markdown',
    icon: 'fas fa-file-alt',
    name: 'Markdown 编辑',
    desc: 'Markdown 编写与预览；打开文件 / 新建 / 保存到文件 / 导出为图片',
  },
  {
    id: 'image',
    icon: 'fas fa-paint-brush',
    name: '图片编辑',
    desc: '画笔/橡皮/直线/矩形/椭圆；撤销；新建画布；保存到文件',
  },
  {
    id: 'graph_editor',
    icon: 'fas fa-project-diagram',
    name: 'Graph Editor',
    desc: '交互式图编辑器：点击建点、拖拽连边、力导向布局、连通分量/桥/MST/二分图高亮',
  },
  {
    id: 'calculator',
    icon: 'fas fa-calculator',
    name: '计算器',
    desc: '科学计算器：表达式求值、阶乘、快速幂、对数、组合排列、gcd/lcm、质因数分解、模逆元',
  },
  {
    id: 'timer',
    icon: 'fas fa-stopwatch',
    name: '计时器',
    desc: '四宫格倒计时：每格可选一名用户并搜索，按「时长」或「目标时刻」计时；支持 1/2/4 格切换、全部开始/暂停、快捷时长、归零提示音',
  },
  {
    id: 'math',
    icon: 'fas fa-chart-line',
    name: 'GeoGebra',
    desc: isWeb
      ? '网页端不支持 GeoGebra，请下载本地版使用'
      : 'GeoGebra 官方绘图计算器（本地离线版）：函数图像、几何画板、滑动条动画、测量、变换、轨迹、CAS 等全部二维功能',
  },
])

const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const remoteTools = ref([])
const installedMap = ref({})
const progressMap = ref({})
const busyMap = ref({})
const updatedAt = ref('')
const appVersion = ref('')

const errorText = computed(() => loadError.value || actionError.value)
const canRetry = computed(() => !!loadError.value)

const remoteIds = computed(() => new Set(remoteTools.value.map((tool) => tool.id)))
const builtinCards = computed(() => builtinTools.value.filter((tool) => !remoteIds.value.has(tool.id)))

const remoteCards = computed(() =>
  remoteTools.value.map((tool) => {
    const installedInfo = installedMap.value[tool.id] || null
    const progress = progressMap.value[tool.id] || null
    const busy = busyMap.value[tool.id] || ''
    const outdated =
      !!installedInfo &&
      !!tool.version &&
      compareVersion(String(installedInfo.version || '0'), String(tool.version)) < 0
    let state = 'installed'
    if (progress) state = 'downloading'
    else if (!installedInfo) state = 'not-installed'
    else if (outdated) state = 'outdated'
    return {
      ...tool,
      raw: tool,
      installedInfo,
      progress,
      busy,
      outdated,
      blocked: isBelowMinApp(tool),
      state,
    }
  }),
)

const updatedAtText = computed(() => {
  const raw = updatedAt.value
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

let unsubscribeProgress = null

function formatError(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  return err.message || String(err)
}

function formatSize(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  const digits = index === 0 || size >= 100 ? 0 : 1
  return `${size.toFixed(digits)} ${units[index]}`
}

function isBelowMinApp(tool) {
  // 拿不到应用版本时不禁用，避免误伤（宁可能装错也不误锁）
  if (!tool || !tool.minAppVersion || !appVersion.value) return false
  return compareVersion(appVersion.value, String(tool.minAppVersion)) < 0
}

function statusText(state) {
  return STATUS_TEXT[state] || state
}

function progressPercent(card) {
  const progress = card.progress
  if (!progress) return 0
  if (progress.total > 0) {
    return Math.min(100, Math.max(0, Math.floor((progress.received / progress.total) * 100)))
  }
  if (progress.count > 0) {
    return Math.min(100, Math.max(0, Math.floor((progress.index / progress.count) * 100)))
  }
  return 0
}

function progressFile(card) {
  const progress = card.progress
  if (!progress) return ''
  const base = progress.path ? String(progress.path).split(/[\\/]/).pop() : ''
  const label = base || '下载中'
  if (progress.count > 1) return `${label}（${progress.index}/${progress.count}）`
  return label
}

function handleProgress(evt) {
  if (!evt || !evt.id) return
  if (evt.phase && evt.phase !== 'download') return
  progressMap.value[evt.id] = {
    phase: evt.phase || 'download',
    index: Number(evt.index) || 0,
    count: Number(evt.count) || 0,
    path: typeof evt.path === 'string' ? evt.path : '',
    received: Number(evt.received) || 0,
    total: Number(evt.total) || 0,
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  actionError.value = ''
  const api = window.api || {}
  const errors = []

  // 应用版本：minAppVersion 判定依赖它，取不到也不阻塞列表
  try {
    if (typeof api.getVersion === 'function') {
      const value = await api.getVersion()
      if (typeof value === 'string') appVersion.value = value
    }
  } catch {
    /* ignore */
  }

  const unsupported = () => Promise.reject(new Error('当前客户端不支持远端工具，请更新应用'))
  const [manifestResult, installedResult] = await Promise.allSettled([
    typeof api.fetchToolsManifest === 'function' ? api.fetchToolsManifest() : unsupported(),
    typeof api.listInstalledTools === 'function' ? api.listInstalledTools() : unsupported(),
  ])

  if (manifestResult.status === 'fulfilled') {
    const res = manifestResult.value || {}
    if (res.success) {
      remoteTools.value = Array.isArray(res.tools) ? res.tools : []
      updatedAt.value = res.updatedAt || ''
    } else {
      remoteTools.value = []
      errors.push(`获取工具列表失败：${res.error || '未知错误'}`)
    }
  } else {
    remoteTools.value = []
    errors.push(`获取工具列表失败：${formatError(manifestResult.reason)}`)
  }

  if (installedResult.status === 'fulfilled') {
    const res = installedResult.value || {}
    if (res.success) installedMap.value = res.installed || {}
    else errors.push(`获取已安装工具失败：${res.error || '未知错误'}`)
  } else {
    errors.push(`获取已安装工具失败：${formatError(installedResult.reason)}`)
  }

  loadError.value = errors.join('；')
  loading.value = false
}

async function refreshInstalled() {
  const api = window.api || {}
  if (typeof api.listInstalledTools !== 'function') return
  try {
    const res = await api.listInstalledTools()
    if (res && res.success) installedMap.value = res.installed || {}
  } catch (err) {
    console.warn('[tools-view] 刷新已安装工具失败:', err)
  }
}

async function installTool(card) {
  const api = window.api || {}
  if (typeof api.installTool !== 'function') {
    actionError.value = '当前客户端不支持安装远端工具，请更新应用'
    return
  }
  // 远端 manifest 条目来自 Vue 响应式数组（Proxy），直接经 contextBridge 传给主进程会抛
  // 「An object could not be cloned」；先深拷贝成纯 JSON 对象再跨进程传递。
  const meta = JSON.parse(JSON.stringify(card.raw || card))
  const name = meta.name || meta.id
  busyMap.value[meta.id] = 'install'
  actionError.value = ''
  try {
    const res = await api.installTool(meta)
    if (!res || !res.success) throw new Error((res && res.error) || '安装失败')
    await refreshInstalled()
  } catch (err) {
    actionError.value = `${card.outdated ? '更新' : '安装'}「${name}」失败：${formatError(err)}`
  } finally {
    delete busyMap.value[meta.id]
    delete progressMap.value[meta.id]
  }
}

async function removeTool(card) {
  const api = window.api || {}
  if (typeof api.removeTool !== 'function') {
    actionError.value = '当前客户端不支持卸载远端工具，请更新应用'
    return
  }
  const name = card.name || card.id
  if (typeof window.confirm === 'function' && !window.confirm(`确定卸载「${name}」吗？`)) return
  busyMap.value[card.id] = 'remove'
  actionError.value = ''
  try {
    const res = await api.removeTool(card.id)
    if (!res || !res.success) throw new Error((res && res.error) || '卸载失败')
    await refreshInstalled()
  } catch (err) {
    actionError.value = `卸载「${name}」失败：${formatError(err)}`
  } finally {
    delete busyMap.value[card.id]
  }
}

async function openRemote(card) {
  const api = window.api || {}
  if (typeof api.getToolEntryUrl !== 'function') {
    actionError.value = '当前客户端不支持打开远端工具，请更新应用'
    return
  }
  busyMap.value[card.id] = 'open'
  actionError.value = ''
  try {
    const res = await api.getToolEntryUrl(card.id, card.entry)
    if (!res || !res.success || !res.url) throw new Error((res && res.error) || '无法获取工具入口地址')
    emit('openTool', {
      remote: true,
      id: card.id,
      url: res.url,
      name: card.name || card.id,
      version: card.version || '',
    })
  } catch (err) {
    actionError.value = `打开「${card.name || card.id}」失败：${formatError(err)}`
  } finally {
    delete busyMap.value[card.id]
  }
}

function onBuiltinClick(tool) {
  emit('openTool', tool.id)
}

function dismissError() {
  actionError.value = ''
}

onMounted(() => {
  const api = window.api || {}
  if (typeof api.onToolProgress === 'function') {
    try {
      const unsubscribe = api.onToolProgress(handleProgress)
      if (typeof unsubscribe === 'function') unsubscribeProgress = unsubscribe
    } catch (err) {
      console.warn('[tools-view] 订阅下载进度失败:', err)
    }
  }
  load()
})

onBeforeUnmount(() => {
  if (typeof unsubscribeProgress === 'function') {
    try {
      unsubscribeProgress()
    } catch {
      /* ignore */
    }
  }
  unsubscribeProgress = null
  // 平台层同时提供 offToolProgress 时一并取消（不同实现可能只支持其中一种）
  const api = window.api || {}
  if (typeof api.offToolProgress === 'function') {
    try {
      api.offToolProgress(handleProgress)
    } catch {
      /* ignore */
    }
  }
})
</script>
