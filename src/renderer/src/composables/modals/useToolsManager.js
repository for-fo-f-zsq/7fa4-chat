import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { compareVersion } from '../../utils.js'
import { showConfirm } from '../useDialog.js'

const STATUS_TEXT = {
  'not-installed': '未安装',
  downloading: '下载中',
  installed: '已安装',
  outdated: '有新版',
}

const FALLBACK_ICONS = {
  markdown: 'fas fa-file-lines',
  image: 'fas fa-image',
  graph_editor: 'fas fa-diagram-project',
  calculator: 'fas fa-calculator',
  timer: 'fas fa-stopwatch',
  math: 'fas fa-square-root-variable',
}

const MANIFEST_CACHE_KEY = 'tools-manifest-cache-v1'
const INSTALLED_CACHE_KEY = 'tools-installed-cache-v1'
const MANIFEST_AUTO_REFRESH_MS = 10 * 60 * 1000
const MANIFEST_MIN_REFRESH_GAP_MS = 30 * 1000
const MANIFEST_RETRY_MS = 60 * 1000

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
      JSON.stringify({ updatedAt: at || '', manifestBuiltAt: builtAt || '', tools }),
    )
  } catch {
    /* ignore */
  }
}

function readInstalledCache() {
  try {
    const raw = localStorage.getItem(INSTALLED_CACHE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return data
  } catch {
    return {}
  }
}

function writeInstalledCache(installed) {
  try {
    if (!installed || typeof installed !== 'object' || Array.isArray(installed)) return
    localStorage.setItem(INSTALLED_CACHE_KEY, JSON.stringify(installed))
  } catch {
    /* ignore */
  }
}

function formatError(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  return err.message || String(err)
}

function formatDateTime(raw) {
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function toolIcon(card) {
  return card?.icon || FALLBACK_ICONS[card?.id] || 'fas fa-puzzle-piece'
}

export function statusText(state) {
  return STATUS_TEXT[state] || state
}

export function progressPercent(card) {
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

export function progressFile(card) {
  const progress = card.progress
  if (!progress) return ''
  const base = progress.path ? String(progress.path).split(/[\\/]/).pop() : ''
  const label = base || '下载中'
  if (progress.count > 1) return `${label}（${progress.index}/${progress.count}）`
  return label
}

/**
 * 远端工具清单拉取、本地安装状态、下载进度与批量更新管理。
 * @param {(payload: object) => void} onOpenTool
 */
export function useToolsManager(onOpenTool) {
  const loading = ref(true)
  const loadError = ref('')
  const actionError = ref('')
  const remoteTools = ref([])
  const installedMap = ref(readInstalledCache())
  const progressMap = ref({})
  const busyMap = ref({})
  const updatedAt = ref('')
  const manifestBuiltAt = ref('')
  const appVersion = ref('')

  const cachedManifest = readManifestCache()
  if (cachedManifest) {
    remoteTools.value = cachedManifest.tools
    updatedAt.value = cachedManifest.updatedAt || ''
    manifestBuiltAt.value = cachedManifest.manifestBuiltAt || ''
  }

  let manifestTimer = null
  let manifestRetryTimer = null
  let lastManifestAt = 0
  let nonSilentLoadSeq = 0
  let manifestSeq = 0
  let installedSeq = 0
  let unsubscribeProgress = null

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

  function isBelowMinApp(tool) {
    if (!tool || !tool.minAppVersion || !appVersion.value) return false
    return compareVersion(appVersion.value, String(tool.minAppVersion)) < 0
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

  const updatedAtText = computed(() => formatDateTime(updatedAt.value))
  const manifestBuiltAtText = computed(() => formatDateTime(manifestBuiltAt.value))

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

  function applyManifestFallback(reason, errors) {
    const cache = readManifestCache()
    if (cache) {
      remoteTools.value = cache.tools
      updatedAt.value = cache.updatedAt || ''
      manifestBuiltAt.value = cache.manifestBuiltAt || ''
    }
    const hasCachedList = cache ? cache.tools.length > 0 : remoteTools.value.length > 0
    errors.push(
      hasCachedList
        ? `获取工具列表失败：${reason}（已显示上次缓存的清单，已安装工具仍可打开）`
        : `获取工具列表失败：${reason}`,
    )
  }

  async function load(options = {}) {
    const silent = options?.silent === true
    const currentNonSilentSeq = silent ? nonSilentLoadSeq : ++nonSilentLoadSeq
    if (!silent) {
      loading.value = true
      loadError.value = ''
      actionError.value = ''
    }
    const api = window.api || {}
    const errors = []
    const currentManifestSeq = ++manifestSeq
    const currentInstalledSeq = ++installedSeq

    const unsupported = () => Promise.reject(new Error('当前客户端不支持远端工具，请更新应用'))

    const versionTask = (async () => {
      try {
        if (typeof api.getVersion === 'function') {
          const value = await api.getVersion()
          if (typeof value === 'string') appVersion.value = value
        }
      } catch {
        /* ignore */
      }
    })()

    // 远端清单与本地已安装状态独立结算：本地检查毫秒级返回，不能被慢网络阻塞成“全员未安装”。
    const manifestTask = (async () => {
      try {
        const res =
          typeof api.fetchToolsManifest === 'function'
            ? await api.fetchToolsManifest()
            : await unsupported()
        if (currentManifestSeq !== manifestSeq) return
        if (res && res.success) {
          remoteTools.value = Array.isArray(res.tools) ? res.tools : []
          manifestBuiltAt.value = res.updatedAt || ''
          updatedAt.value = new Date().toISOString()
          writeManifestCache(remoteTools.value, updatedAt.value, manifestBuiltAt.value)
        } else {
          applyManifestFallback((res && res.error) || '未知错误', errors)
        }
      } catch (err) {
        if (currentManifestSeq !== manifestSeq) return
        applyManifestFallback(formatError(err), errors)
      }
    })()

    const installedTask = (async () => {
      try {
        const res =
          typeof api.listInstalledTools === 'function'
            ? await api.listInstalledTools()
            : await unsupported()
        if (currentInstalledSeq !== installedSeq) return
        if (res && res.success) {
          const next = res.installed || {}
          installedMap.value = next
          writeInstalledCache(next)
        } else {
          errors.push(`获取已安装工具失败：${(res && res.error) || '未知错误'}`)
        }
      } catch (err) {
        if (currentInstalledSeq !== installedSeq) return
        errors.push(`获取已安装工具失败：${formatError(err)}`)
      }
    })()

    await Promise.allSettled([versionTask, manifestTask, installedTask])

    lastManifestAt = Date.now()
    if (silent) {
      if (errors.length) {
        console.warn('[tools-view] 自动刷新工具清单失败:', errors.join('；'))
        scheduleAutoRetry()
      } else {
        loadError.value = ''
      }
      return
    }
    if (currentNonSilentSeq === nonSilentLoadSeq) {
      loadError.value = errors.join('；')
      loading.value = false
    }
    if (errors.length) scheduleAutoRetry()
  }

  async function refreshInstalled() {
    const api = window.api || {}
    if (typeof api.listInstalledTools !== 'function') return
    try {
      const res = await api.listInstalledTools()
      if (res && res.success) {
        const next = res.installed || {}
        installedMap.value = next
        writeInstalledCache(next)
      }
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
    const ok = await showConfirm({
      title: '卸载工具',
      message: `确定卸载「${name}」吗？卸载后可随时重新下载。`,
      confirmText: '卸载',
      danger: true,
    })
    if (!ok) return
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
      onOpenTool({
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

  const batchRunning = ref(false)
  const batchDone = ref(0)
  const batchTotal = ref(0)
  const batchTargets = computed(() =>
    remoteCards.value.filter(
      (card) => !card.blocked && (card.state === 'not-installed' || card.state === 'outdated'),
    ),
  )
  const batchDownloadCount = computed(
    () => batchTargets.value.filter((card) => card.state === 'not-installed').length,
  )
  const batchUpdateCount = computed(
    () => batchTargets.value.filter((card) => card.state === 'outdated').length,
  )
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
    const api = window.api || {}
    if (typeof api.offToolProgress === 'function') {
      try {
        api.offToolProgress(handleProgress)
      } catch {
        /* ignore */
      }
    }
  })

  return {
    loading,
    errorText,
    canRetry,
    remoteCards,
    updatedAtText,
    manifestBuiltAtText,
    batchRunning,
    batchActionable,
    batchLabel,
    batchTitle,
    load,
    installTool,
    removeTool,
    openRemote,
    batchInstall,
    dismissError,
  }
}
