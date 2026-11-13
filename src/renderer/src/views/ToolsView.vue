<template>
  <div class="tools-page">
    <div class="tools-header">
      <h2 class="page-title"><i class="fas fa-toolbox"></i> 工具</h2>
      <div class="tools-header-meta">
        <span v-if="updatedAtText" class="tools-updated" :title="manifestBuiltAtText ? '远端清单构建于 ' + manifestBuiltAtText : ''">工具列表更新于 {{ updatedAtText }}</span>
        <UiButton
          v-if="batchRunning || batchActionable"
          variant="secondary"
          size="sm"
          :loading="batchRunning"
          :disabled="batchRunning || loading"
          :title="batchTitle"
          icon="fas fa-download"
          @click="batchInstall"
        >
          {{ batchLabel }}
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          :loading="loading"
          :disabled="loading"
          title="刷新工具列表"
          icon="fas fa-rotate-right"
          @click="load"
        >
          {{ loading ? '刷新中' : '刷新' }}
        </UiButton>
      </div>
    </div>

    <UiBanner v-if="errorText" variant="danger" class="tools-error-bar">
      <template #default>{{ errorText }}</template>
      <template #action>
        <UiButton v-if="canRetry" variant="ghost" size="sm" @click="load">重试</UiButton>
        <UiButton v-else variant="ghost" size="sm" @click="dismissError">关闭</UiButton>
      </template>
    </UiBanner>

    <div v-if="loading && remoteCards.length === 0 && !errorText" class="tools-loading">
      <UiSpinner size="md" />
      <span>正在获取工具列表…</span>
    </div>

    <TransitionGroup v-else tag="div" name="list" class="tools-grid motion-stagger" appear>
      <!-- 远端工具：状态机 未安装→下载 / 已安装→打开+卸载 / 有新版→更新 / 下载中→进度 / 版本不满足→禁用 -->
      <UiCard
        v-for="card in remoteCards"
        :key="'remote-' + card.id"
        :interactive="!card.blocked"
        class="tool-card"
        :class="{ 'is-disabled': card.blocked }"
      >
        <i class="tool-card-icon" :class="toolIcon(card)" aria-hidden="true"></i>
        <div class="tool-card-name">{{ card.name || card.id }}</div>
        <div class="tool-card-desc">{{ card.desc || '远端工具' }}</div>
        <div class="tool-card-meta">
          <span class="tool-meta-item">v{{ card.version || '?' }}</span>
          <span v-if="formatSize(card.size)" class="tool-meta-item">{{ formatSize(card.size) }}</span>
          <span v-if="card.installedInfo" class="tool-meta-item">
            已装 v{{ card.installedInfo.version || '?' }}
          </span>
        </div>

        <template v-if="card.progress">
          <UiProgress
            class="tool-progress"
            size="sm"
            :value="progressPercent(card)"
            :label="'下载进度 ' + progressPercent(card) + '%'"
          />
          <div class="tool-progress-text">
            <span>{{ progressFile(card) }}</span>
            <span>{{ progressPercent(card) }}%</span>
          </div>
        </template>

        <template #footer>
          <div class="tool-card-footer">
            <UiBadge
              size="sm"
              :variant="card.blocked ? 'danger' : card.outdated && !card.progress ? 'warning' : 'neutral'"
            >
              {{ statusText(card.state) }}
            </UiBadge>

            <div class="tool-actions">
              <UiButton v-if="card.blocked" size="sm" disabled>请先更新应用</UiButton>

              <UiButton v-else-if="card.state === 'downloading'" size="sm" disabled>
                {{ card.busy === 'install' ? '安装中…' : '下载中…' }}
              </UiButton>

              <UiButton
                v-else-if="card.state === 'not-installed'"
                variant="primary"
                size="sm"
                :disabled="!!card.busy"
                @click="installTool(card)"
              >
                {{ card.busy === 'install' ? '安装中…' : '下载' }}
              </UiButton>

              <template v-else>
                <UiButton
                  v-if="card.state === 'outdated'"
                  variant="primary"
                  size="sm"
                  :disabled="!!card.busy"
                  @click="installTool(card)"
                >
                  {{ card.busy === 'install' ? '更新中…' : '更新' }}
                </UiButton>
                <UiButton
                  v-else
                  variant="primary"
                  size="sm"
                  :disabled="!!card.busy"
                  @click="openRemote(card)"
                >
                  {{ card.busy === 'open' ? '打开中…' : '打开' }}
                </UiButton>
                <UiButton
                  v-if="card.state === 'outdated'"
                  variant="secondary"
                  size="sm"
                  :disabled="!!card.busy"
                  @click="openRemote(card)"
                >
                  打开
                </UiButton>
                <UiButton
                  variant="danger"
                  size="sm"
                  :disabled="!!card.busy"
                  @click="removeTool(card)"
                >
                  卸载
                </UiButton>
              </template>
            </div>
          </div>
        </template>

        <div v-if="card.blocked" class="tool-blocked-hint">
          需要应用版本 ≥ v{{ card.minAppVersion }}，请先更新应用
        </div>
      </UiCard>
    </TransitionGroup>

    <UiEmptyState
      v-if="!loading && remoteCards.length === 0"
      class="tools-empty"
      icon="fas fa-box-open"
      title="暂无可用工具"
      description="工具需要联网获取：请检查网络后点右上角「刷新」重试。"
    />
  </div>
</template>

<script setup>
/**
 * 工具中心
 *
 * 工具全部来自远端清单：`fetchToolsManifest()` 拿清单 + `listInstalledTools()` 拿本地安装状态，
 * 安装 / 更新 / 卸载 / 打开全部经 window.api 平台层，API 缺失时降级为错误提示而不是白屏。
 *
 * 客户端不再内置任何工具页（曾经的 6 个「内置」实现已删除）：
 * 同一份源码既编进工具包又要内置进主包，会出现「改了 src、用户点开的却是下载包」的错配，
 * 而且联网时内置卡片本来就会被同名远端工具顶掉。离线时这里只提示需要联网获取。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { compareVersion } from '../utils.js'
import { UiBadge, UiBanner, UiButton, UiCard, UiEmptyState, UiProgress, UiSpinner } from '@/ui'

const emit = defineEmits(['openTool'])

const STATUS_TEXT = {
  'not-installed': '未安装',
  downloading: '下载中',
  installed: '已安装',
  outdated: '有新版',
}


const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const remoteTools = ref([])
const installedMap = ref({})
const progressMap = ref({})
const busyMap = ref({})
// updatedAt 记录「上次成功获取清单的时间」（本地时钟），而不是清单里的构建时间：
// 这样即使远端没有新版本，点一次刷新时间也会变，用户能确认刷新真的生效了。
const updatedAt = ref('')
// manifestBuiltAt 是远端 tools.json 里的 updatedAt（工具包构建时间），只作调试信息。
const manifestBuiltAt = ref('')
const appVersion = ref('')

// 远端清单缓存：已安装的工具即使断网/接口挂了也要能打开，
// 所以成功拉取后存一份，加载失败时回落到上次清单。
const MANIFEST_CACHE_KEY = 'tools-manifest-cache-v1'

function readManifestCache() {
  try {
    const raw = localStorage.getItem(MANIFEST_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.tools)) return null
    return data
  } catch {
    return null
  }
}

function writeManifestCache(tools, at, builtAt) {
  try {
    localStorage.setItem(
      MANIFEST_CACHE_KEY,
      JSON.stringify({ updatedAt: at || '', manifestBuiltAt: builtAt || '', tools })
    )
  } catch {
    /* 配额不足只影响离线兜底，不影响在线使用 */
  }
}

const cachedManifest = readManifestCache()
if (cachedManifest) {
  remoteTools.value = cachedManifest.tools
  updatedAt.value = cachedManifest.updatedAt || ''
  manifestBuiltAt.value = cachedManifest.manifestBuiltAt || ''
}

// 清单自动重拉：进页面时拉一次；之后页面重新可见 / 窗口聚焦时后台刷新（30s 内不重复），
// 并每 10 分钟定时刷新；拉取失败 60s 后自动重试。这样发了新工具版本不用手动点「刷新」。
const MANIFEST_AUTO_REFRESH_MS = 10 * 60 * 1000
const MANIFEST_MIN_REFRESH_GAP_MS = 30 * 1000
const MANIFEST_RETRY_MS = 60 * 1000
let manifestTimer = null
let manifestRetryTimer = null
let lastManifestAt = 0

function pageVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function refreshManifestInBackground() {
  if (!pageVisible()) return
  if (Date.now() - lastManifestAt < MANIFEST_MIN_REFRESH_GAP_MS) return
  load({ silent: true })
}

function onVisibilityChange() {
  if (pageVisible()) refreshManifestInBackground()
}

function scheduleAutoRetry() {
  if (manifestRetryTimer || !pageVisible()) return
  manifestRetryTimer = setTimeout(() => {
    manifestRetryTimer = null
    load({ silent: true })
  }, MANIFEST_RETRY_MS)
}

const errorText = computed(() => loadError.value || actionError.value)
const canRetry = computed(() => !!loadError.value)

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

function formatDateTime(raw) {
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 「工具列表更新于」展示本地成功获取时间，刷新即变，便于确认刷新生效。
const updatedAtText = computed(() => formatDateTime(updatedAt.value))
// 远端清单构建时间放在 title 里，用于排查发布是否已生效。
const manifestBuiltAtText = computed(() => formatDateTime(manifestBuiltAt.value))

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

// 旧版工具清单没有 icon 字段（图标是后加的），这里按 id 兜底，
// 保证拿到旧 manifest 时不至于全显示成拼图占位。
const FALLBACK_ICONS = {
  markdown: 'fas fa-file-lines',
  image: 'fas fa-image',
  graph_editor: 'fas fa-diagram-project',
  calculator: 'fas fa-calculator',
  timer: 'fas fa-stopwatch',
  math: 'fas fa-square-root-variable',
}

function toolIcon(card) {
  return card?.icon || FALLBACK_ICONS[card?.id] || 'fas fa-puzzle-piece'
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

async function load(options = {}) {
  const silent = options.silent === true
  if (!silent) {
    loading.value = true
    loadError.value = ''
    actionError.value = ''
  }
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
      manifestBuiltAt.value = res.updatedAt || ''
      // 记录本地获取成功的时间：即使远端没版本变化，刷新后时间也会更新
      updatedAt.value = new Date().toISOString()
      writeManifestCache(remoteTools.value, updatedAt.value, manifestBuiltAt.value)
    } else {
      const cache = readManifestCache()
      remoteTools.value = cache ? cache.tools : []
      updatedAt.value = cache ? cache.updatedAt || '' : ''
      manifestBuiltAt.value = cache ? cache.manifestBuiltAt || '' : ''
      errors.push(
        cache
          ? `获取工具列表失败：${res.error || '未知错误'}（已显示上次缓存的清单，已安装工具仍可打开）`
          : `获取工具列表失败：${res.error || '未知错误'}`
      )
    }
  } else {
    const cache = readManifestCache()
    remoteTools.value = cache ? cache.tools : []
    updatedAt.value = cache ? cache.updatedAt || '' : ''
    manifestBuiltAt.value = cache ? cache.manifestBuiltAt || '' : ''
    errors.push(
      cache
        ? `获取工具列表失败：${formatError(manifestResult.reason)}（已显示上次缓存的清单，已安装工具仍可打开）`
        : `获取工具列表失败：${formatError(manifestResult.reason)}`
    )
  }

  if (installedResult.status === 'fulfilled') {
    const res = installedResult.value || {}
    if (res.success) installedMap.value = res.installed || {}
    else errors.push(`获取已安装工具失败：${res.error || '未知错误'}`)
  } else {
    errors.push(`获取已安装工具失败：${formatError(installedResult.reason)}`)
  }

  lastManifestAt = Date.now()
  if (silent) {
    // 后台自动重拉失败不打扰用户：保留当前列表和旧提示，只记日志；
    // 仍然安排下一次重试（离线时每 60s 一次，恢复网络后自动出现新清单）。
    if (errors.length) {
      console.warn('[tools-view] 自动刷新工具清单失败:', errors.join('；'))
      scheduleAutoRetry()
    } else {
      loadError.value = ''
    }
    return
  }
  loadError.value = errors.join('；')
  loading.value = false
  // 失败后 60s 自动重试一次，避免必须手动点「刷新」
  if (errors.length) scheduleAutoRetry()
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

// ---------- 批量下载 / 全部更新 ----------
// 未安装的卡片 = 可下载；有新版可用的卡片 = 可更新。
// 两者都有时按钮文案叫「全部更新」，只有可下载的叫「全部下载」——按用户最关心的动作命名。
const batchRunning = ref(false)
const batchDone = ref(0)
const batchTotal = ref(0)
const batchTargets = computed(() =>
  remoteCards.value.filter((card) => !card.blocked && (card.state === 'not-installed' || card.state === 'outdated')),
)
const batchDownloadCount = computed(() => batchTargets.value.filter((card) => card.state === 'not-installed').length)
const batchUpdateCount = computed(() => batchTargets.value.filter((card) => card.state === 'outdated').length)
const batchActionable = computed(() => !batchRunning.value && batchTargets.value.length > 0)
const batchLabel = computed(() => {
  if (batchRunning.value) return `处理中 ${batchDone.value}/${batchTotal.value}`
  return batchUpdateCount.value > 0 ? '全部更新' : '全部下载'
})
const batchTitle = computed(() => {
  const parts = []
  if (batchUpdateCount.value > 0) parts.push(`${batchUpdateCount.value} 个可更新`)
  if (batchDownloadCount.value > 0) parts.push(`${batchDownloadCount.value} 个未安装`)
  return parts.length ? `一次性处理 ${parts.join('、')}` : ''
})

async function batchInstall() {
  const api = window.api || {}
  if (typeof api.installTool !== 'function') {
    actionError.value = '当前客户端不支持安装远端工具，请更新应用'
    return
  }
  const targets = batchTargets.value.slice()
  if (!targets.length) return
  batchRunning.value = true
  batchDone.value = 0
  batchTotal.value = targets.length
  actionError.value = ''
  const failed = []
  // 顺序执行：多个工具同时装会互相抢带宽，进度条也会串台
  for (const card of targets) {
    try {
      const meta = JSON.parse(JSON.stringify(card.raw || card))
      const res = await api.installTool(meta)
      if (!res || !res.success) throw new Error((res && res.error) || '安装失败')
    } catch (err) {
      failed.push(`${card.name || card.id}：${formatError(err)}`)
    } finally {
      delete progressMap.value[card.id]
      batchDone.value += 1
    }
  }
  await refreshInstalled()
  batchRunning.value = false
  if (failed.length) actionError.value = `批量处理完成，${failed.length} 个失败 —— ${failed.join('；')}`
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
  // 定时重拉 + 页面重新可见/窗口聚焦时后台刷新（发了新工具版本会自动出现）
  manifestTimer = setInterval(() => {
    if (pageVisible()) load({ silent: true })
  }, MANIFEST_AUTO_REFRESH_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', refreshManifestInBackground)
})

onBeforeUnmount(() => {
  if (manifestTimer) {
    clearInterval(manifestTimer)
    manifestTimer = null
  }
  if (manifestRetryTimer) {
    clearTimeout(manifestRetryTimer)
    manifestRetryTimer = null
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', refreshManifestInBackground)
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

<style scoped src="../css/components/tools.css"></style>
