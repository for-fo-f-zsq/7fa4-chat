import { computed, reactive } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'
import { safeFetch } from '../../utils/chatSync.js'
import {
  buildNoticeUpdateUrl,
  normalizeNoticeFlag,
  parseNoticeTextSegments,
  parseNoticesPayload,
  resolveNoticeJumpUrl,
} from '../../utils/notices.js'

const DEFAULT_API_URL = 'https://jx.7fa4.cn'

const noticeState = reactive({
  modalOpen: false,
  loading: false,
  error: '',
  pendingActionIds: {},
})

let fetchInflight = null

export function getNoticeOriginBase() {
  if (isWebBrowser() && typeof location !== 'undefined') return location.origin
  const raw = String(store.setting?.apiUrl || DEFAULT_API_URL)
    .replace(/^http:\/\//, 'https://')
    .replace(/\/+$/, '')
  return `${raw}:8888`
}

export function openNoticeJumpUrl(jumpUrl) {
  const safe = resolveNoticeJumpUrl(jumpUrl, getNoticeOriginBase())
  if (!safe) return false
  if (typeof window !== 'undefined' && window.api?.openExternal) {
    window.api.openExternal(safe)
    return true
  }
  if (typeof window !== 'undefined' && window.open) {
    window.open(safe, '_blank', 'noopener,noreferrer')
    return true
  }
  return false
}

export function formatNoticeSegments(noticeText) {
  return parseNoticeTextSegments(noticeText, getNoticeOriginBase())
}

export function getNoticeJumpHref(jumpUrl) {
  return resolveNoticeJumpUrl(jumpUrl, getNoticeOriginBase())
}

async function requestNoticeMutation(url) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      ...(ctrl ? { signal: ctrl.signal } : {}),
    })
    const ctype = (res.headers?.get?.('content-type') || '').toLowerCase()
    if (!res.ok) {
      return { success: false, message: `请求失败 (${res.status})` }
    }
    if (ctype.includes('text/html')) {
      return { success: false, message: '登录状态已失效，请重新登录后再试' }
    }
    const rawText = await res.text()
    if (!rawText || !rawText.trim()) return { success: true }
    try {
      const data = JSON.parse(rawText)
      if (data && typeof data === 'object' && data.success === false) {
        return { success: false, message: data.err?.message || data.message || '操作失败' }
      }
      return { success: true, data }
    } catch {
      return { success: true }
    }
  } catch (e) {
    return { success: false, message: e?.message || '网络请求失败' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function fetchNotices({ silent = true } = {}) {
  if (!store.logined) {
    store.notices = []
    return { ok: false, notices: [] }
  }
  if (fetchInflight) return fetchInflight
  noticeState.loading = true
  if (!silent) noticeState.error = ''
  fetchInflight = (async () => {
    try {
      const res = await safeFetch('/notices', { credentials: 'include' }, 10000)
      const data = await res.json()
      const parsed = parseNoticesPayload(data)
      if (parsed.ok) {
        store.notices = parsed.notices
        noticeState.error = ''
      } else if (!silent) {
        noticeState.error = data?.err?.message || data?.message || '获取通知失败'
      }
      return parsed
    } catch (e) {
      if (!silent) noticeState.error = e?.message || '获取通知失败'
      return { ok: false, notices: store.notices || [] }
    } finally {
      noticeState.loading = false
      fetchInflight = null
    }
  })()
  return fetchInflight
}

export async function setNoticeField(id, field, result) {
  const nid = Number(id)
  if (!Number.isInteger(nid) || nid <= 0) return { success: false, message: '无效的通知编号' }
  const key = `${field}:${nid}`
  if (noticeState.pendingActionIds[key]) return { success: false, busy: true }

  const nextValue = normalizeNoticeFlag(result)
  const url = buildNoticeUpdateUrl(nid, field, nextValue ? '1' : '')
  noticeState.pendingActionIds[key] = true
  noticeState.error = ''
  try {
    const res = await requestNoticeMutation(url)
    if (!res.success) {
      noticeState.error = res.message || '更新通知状态失败'
      return res
    }
    const target = Array.isArray(store.notices) ? store.notices.find((n) => n.id === nid) : null
    if (target) target[field] = nextValue
    return { success: true }
  } finally {
    delete noticeState.pendingActionIds[key]
  }
}

export async function markAllNoticesChecked() {
  const list = (store.notices || []).filter((n) => !n.checked)
  if (!list.length) return { success: true, count: 0 }
  let done = 0
  for (const item of list) {
    const res = await setNoticeField(item.id, 'checked', '1')
    if (res.success) done++
  }
  return { success: done === list.length, count: done }
}

export function resetNoticeState() {
  store.notices = []
  noticeState.modalOpen = false
  noticeState.loading = false
  noticeState.error = ''
  for (const k of Object.keys(noticeState.pendingActionIds)) {
    delete noticeState.pendingActionIds[k]
  }
}

export function openNoticeModal() {
  noticeState.modalOpen = true
  fetchNotices({ silent: false })
}

export function closeNoticeModal() {
  noticeState.modalOpen = false
}

export function useNotices() {
  const notices = computed(() => store.notices || [])
  const unNoticedList = computed(() => notices.value.filter((n) => !n.noticed))
  const currentPopupNotice = computed(() => unNoticedList.value[0] || null)
  const uncheckedCount = computed(() => notices.value.filter((n) => !n.checked).length)
  const hasUnreadOrPending = computed(() => uncheckedCount.value > 0 || unNoticedList.value.length > 0)

  const isPending = (id, field) => Boolean(noticeState.pendingActionIds[`${field}:${id}`])

  return {
    noticeState,
    notices,
    unNoticedList,
    currentPopupNotice,
    uncheckedCount,
    hasUnreadOrPending,
    isPending,
    fetchNotices,
    confirmNoticed: (id) => setNoticeField(id, 'noticed', '1'),
    markNoticeChecked: (id, checked = true) => setNoticeField(id, 'checked', checked ? '1' : ''),
    markAllNoticesChecked,
    openNoticeModal,
    closeNoticeModal,
    openNoticeJumpUrl,
    formatNoticeSegments,
    getNoticeJumpHref,
  }
}
