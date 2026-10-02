/**
 * 全局状态
 * ------------------------------------------------------------
 * 用 Vue 的 reactive 做一个极简 store（不引 Pinia，避免额外依赖）：
 *  - session：当前登录身份与权限
 *  - config：系统配置（含轮询间隔）
 *  - 轮询：统一的「定时拉取」调度器，页面注册自己的刷新函数即可
 */

import { reactive, computed, readonly } from 'vue'
import { api, ApiError } from './api.js'

const state = reactive({
  ready: false,          // 首次身份探测是否完成
  authenticated: false,
  user: null,            // { username, role, display_name, last_login_at }
  permissions: [],
  config: {},            // 键值对
  configItems: [],       // 带元信息的配置项
  siteNotice: '',
  polling: true,         // 是否正在轮询
  lastSyncAt: 0,         // 最近一次成功同步时间
})

export const session = readonly(state)

export const isSuper = computed(() => state.user && state.user.role === 'super')

/** 权限判断：前端据此隐藏无权操作（后端仍会二次校验） */
export function can(perm) {
  if (!state.authenticated) return false
  if (state.user && state.user.role === 'super') return true
  return state.permissions.includes(perm)
}

// ==================== 身份 ====================

export async function refreshSession() {
  try {
    const me = await api.me()
    if (!me || !me.authenticated) {
      state.authenticated = false
      state.user = null
      state.permissions = []
      return false
    }
    state.authenticated = true
    state.user = {
      username: me.username,
      role: me.role,
      display_name: me.display_name || '',
      last_login_at: me.last_login_at || 0,
    }
    try {
      const p = await api.permissions()
      state.permissions = (p && p.permissions) || []
    } catch {
      state.permissions = []
    }
    return true
  } catch (e) {
    state.authenticated = false
    state.user = null
    return false
  } finally {
    state.ready = true
  }
}

export async function login(username, password) {
  const r = await api.login(username, password)
  // 登录接口返回的是脱敏账户信息，随后刷新一次拿全量权限
  state.user = {
    username: r.username,
    role: r.role,
    display_name: r.display_name || '',
    last_login_at: Date.now(),
  }
  state.authenticated = true
  await refreshSession()
  await loadConfig()
  return true
}

export async function logout() {
  try {
    await api.logout()
  } catch {
    /* 即便失败也本地清状态 */
  }
  state.authenticated = false
  state.user = null
  state.permissions = []
}

// ==================== 配置 ====================

export async function loadConfig() {
  try {
    const r = await api.getConfig()
    state.config = (r && r.config) || {}
    state.configItems = (r && r.items) || []
    state.siteNotice = state.config.site_notice || ''
    return true
  } catch (e) {
    // 非 super 读不到配置不是错误（权限不足），静默即可
    if (e instanceof ApiError && (e.code === 'FORBIDDEN' || e.code === 'UNAUTHORIZED')) return false
    throw e
  }
}

export async function saveConfig(patch) {
  const r = await api.updateConfig(patch)
  state.config = (r && r.config) || state.config
  state.configItems = (r && r.items) || state.configItems
  state.siteNotice = state.config.site_notice || ''
  bumpPollInterval()
  return r
}

export function setConfigItems(items) {
  if (Array.isArray(items)) state.configItems = items
}

// ==================== 轮询调度 ====================

/**
 * 页面用 registerPoller 注册「定时刷新」。
 *  - 间隔取自系统配置 poll_interval_ms，运行时可随时调整
 *  - 页面切到后台（document.hidden）时跳过，避免无意义请求
 *  - 每个 poller 用 key 唯一标识，组件卸载时 unregister
 */
const pollers = new Map()
let pollTimer = null

export function registerPoller(key, fn) {
  pollers.set(key, fn)
  ensurePollTimer()
}

export function unregisterPoller(key) {
  pollers.delete(key)
  if (pollers.size === 0 && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function pollInterval() {
  const v = Number(state.config.poll_interval_ms)
  return Number.isFinite(v) && v >= 2000 ? v : 15000
}

function ensurePollTimer() {
  if (pollTimer) return
  pollTimer = setInterval(runPollers, pollInterval())
}

/** 配置变更后立刻用新间隔重建定时器 */
function bumpPollInterval() {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = setInterval(runPollers, pollInterval())
}

async function runPollers() {
  if (!state.polling || !state.authenticated) return
  if (typeof document !== 'undefined' && document.hidden) return
  await Promise.all(
    [...pollers.values()].map((fn) =>
      Promise.resolve()
        .then(fn)
        .catch(() => {
          /* 单页轮询失败不影响其它页 */
        })
    )
  )
}

/** 手动触发一次全部轮询（顶栏「立即刷新」按钮用） */
export async function refreshNow() {
  await runPollers()
  state.lastSyncAt = Date.now()
}

export function togglePolling(v) {
  state.polling = v === undefined ? !state.polling : !!v
}

export function markSynced() {
  state.lastSyncAt = Date.now()
}
