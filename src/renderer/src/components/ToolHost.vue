<template>
  <div class="tool-host">
    <iframe
      :key="frameKey"
      ref="iframeRef"
      class="tool-host-frame"
      :src="entryUrl"
      :title="toolName"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerpolicy="no-referrer"
      allow="clipboard-read; clipboard-write"
      @load="onFrameLoad"
      @error="onFrameError"
    ></iframe>

    <!-- 悬浮返回按钮：工具自身也可通过 bridge 的 close 事件返回 -->
    <button class="tool-host-back" type="button" title="返回工具列表" @click="onBackClick">
      <i class="fas fa-arrow-left"></i>
      <span>返回</span>
    </button>

    <div v-if="status === 'loading'" class="tool-host-overlay tool-host-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>工具加载中…</span>
    </div>

    <div v-else-if="status === 'error'" class="tool-host-overlay tool-host-error">
      <i class="fas fa-exclamation-triangle"></i>
      <p class="tool-host-error-msg">{{ errorMessage || '工具加载失败' }}</p>
      <button class="tool-host-retry" type="button" @click="retry">
        <i class="fas fa-rotate-right"></i>
        <span>重试</span>
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * 远程工具宿主（iframe 容器）
 *
 * 只负责 DOM / iframe 生命周期与 UI 状态：
 *   - iframe load 后通过 MessageChannel 把 port2 交给工具，并发送 { type:'tool:init', appVersion, platform }
 *   - RPC / 事件逻辑全部在 tools/tool-bridge-host.js，便于复用与单测
 *   - 主题变化、timerFloat 事件转发、悬浮返回按钮、加载 / 错误 / 重试
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { store } from '../store.js'
import { ranklistOrder, usersJson } from '../utils.js'
import {
  buildInitMessage,
  collectThemeState,
  createAppHostHandlers,
  createToolBridgeHost,
  detectPlatform,
  forwardTimerFloatEvents,
  watchAppTheme,
} from '../tools/tool-bridge-host.js'

const props = defineProps({
  /** { remote: true, id, url, name, version } */
  tool: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['back'])

/** 超过该时长仍未 load 视为加载失败（跨域被拦时 iframe 可能永不触发 load） */
const LOAD_TIMEOUT = 25000
/** getVersion 等待上限：主进程繁忙时不能拖过工具侧 20s 的 init 等待窗口，超时先发 init */
const VERSION_TIMEOUT = 3000

const iframeRef = ref(null)
/** 变更该值以重建 iframe（重试） */
const frameKey = ref(0)
/** loading | ready | error */
const status = ref('loading')
const errorMessage = ref('')
const appVersion = ref('')
const platform = ref(detectPlatform())
const entryUrl = computed(() => (props.tool && typeof props.tool.url === 'string' ? props.tool.url : ''))
const toolName = computed(() => (props.tool && props.tool.name ? props.tool.name : '工具'))

let bridge = null
let stopThemeWatch = null
let cleanupTimerFloat = null
let loadTimer = null
let versionPromise = null

function startLoadTimeout() {
  clearLoadTimeout()
  loadTimer = setTimeout(() => {
    loadTimer = null
    if (status.value !== 'loading') return
    status.value = 'error'
    errorMessage.value = '工具加载超时，请检查网络后重试'
  }, LOAD_TIMEOUT)
}

function clearLoadTimeout() {
  if (loadTimer) {
    clearTimeout(loadTimer)
    loadTimer = null
  }
}

/** 给 Promise 加超时兜底：到点后用 fallback 继续，避免阻塞后续流程 */
function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(fallback), ms)
    Promise.resolve(promise).then(finish, () => finish(fallback))
  })
}

function ensureVersion() {
  if (!versionPromise) {
    versionPromise = (async () => {
      try {
        const api = window.api
        if (api && typeof api.getVersion === 'function') {
          const value = await api.getVersion()
          if (typeof value === 'string') appVersion.value = value
        }
      } catch (err) {
        console.warn('[tool-host] 获取版本号失败:', err)
      }
      return appVersion.value
    })()
  }
  return versionPromise
}

/** getEnv 的最新值（bridge 收到 RPC 时才读取，避免使用过期数据） */
function currentEnv() {
  return {
    toolId: (props.tool && props.tool.id) || '',
    appVersion: appVersion.value,
    platform: platform.value,
    theme: collectThemeState(),
  }
}

function pushTheme() {
  if (bridge) bridge.emit('theme', collectThemeState())
}

function handleReady() {
  // 工具侧 bridge 已就绪：补推一次当前主题（工具可能在 ready 前注册了 onTheme）
  pushTheme()
}

function connectBridge() {
  disconnectBridge()
  const frame = iframeRef.value
  const win = frame && frame.contentWindow
  if (!win || typeof MessageChannel === 'undefined') return
  try {
    const channel = new MessageChannel()
    // 每次建立桥接时重新组装方法表：window.api 由平台层在启动时注入，晚于本文档求值也能拿到
    const handlers = createAppHostHandlers({
      api: window.api || null,
      store,
      usersJson,
      ranklistOrder,
      toolId: (props.tool && props.tool.id) || '',
      // getPlatform 与 getEnv 保持一致（desktop/android），不直接用桌面 preload 的 windows/macos
      platform: platform.value,
    })
    // 工具内「返回」按钮可通过 closeTool 走后门（spec §7）：先回包，等微任务再切回工具列表
    handlers.closeTool = () => {
      setTimeout(() => emit('back'), 0)
      return { success: true }
    }
    bridge = createToolBridgeHost({
      port: channel.port1,
      handlers,
      env: currentEnv,
      onReady: handleReady,
      onClose: () => emit('back'),
      onEvent: (name, data) => {
        console.warn(`[tool-host] 未处理的工具事件: ${name}`, data)
      },
      onError: (err) => console.warn('[tool-host] bridge 错误:', err),
    })
    win.postMessage(
      buildInitMessage({
        appVersion: appVersion.value,
        platform: platform.value,
        // init 就带上当前主题，工具侧可避免首屏闪白
        theme: collectThemeState(),
      }),
      '*',
      [channel.port2],
    )
  } catch (err) {
    console.warn('[tool-host] 建立工具桥接失败:', err)
    bridge = null
  }
}

function disconnectBridge() {
  if (!bridge) return
  try {
    bridge.dispose()
  } catch {
    /* ignore */
  }
  bridge = null
}

async function onFrameLoad() {
  clearLoadTimeout()
  status.value = 'ready'
  // 版本号正常几毫秒就拿到；卡住时最多等 3s，随后用空字符串发 init（getEnv 后续仍会补到真实版本）
  await withTimeout(ensureVersion(), VERSION_TIMEOUT)
  connectBridge()
}

function onFrameError() {
  clearLoadTimeout()
  status.value = 'error'
  errorMessage.value = '工具页面加载失败，请检查文件是否完整或稍后重试'
}

function retry() {
  frameKey.value += 1
  status.value = 'loading'
  errorMessage.value = ''
  startLoadTimeout()
}

function onBackClick() {
  emit('back')
}

onMounted(async () => {
  // 打开页面前先拿应用版本：init 消息需要同步带上（拿不到也不能阻塞加载）
  ensureVersion()
  if (!entryUrl.value) {
    status.value = 'error'
    errorMessage.value = '工具地址无效，请回到工具列表重新打开'
    return
  }
  startLoadTimeout()
  stopThemeWatch = watchAppTheme(() => pushTheme())
  cleanupTimerFloat = forwardTimerFloatEvents(window.api, (name, data) => {
    if (bridge) bridge.emit(name, data)
  })
})

onBeforeUnmount(() => {
  clearLoadTimeout()
  if (stopThemeWatch) {
    stopThemeWatch()
    stopThemeWatch = null
  }
  if (cleanupTimerFloat) {
    cleanupTimerFloat()
    cleanupTimerFloat = null
  }
  disconnectBridge()
})
</script>
