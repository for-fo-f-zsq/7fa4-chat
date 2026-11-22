import { computed, reactive, watch } from 'vue'
import { store } from '../../store.js'
import { isWebBrowser } from '../../utils/env.js'
import { gettime1, gettime2 } from '../../utils/format.js'
import { safeFetch } from '../../utils/chatSync.js'
import {
  buildNoticeUpdateUrl,
  parseNoticeTextSegments,
  parseNoticesPayload,
  resolveNoticeJumpUrl,
} from '../../utils/notices.js'

const DEFAULT_API_URL = 'https://jx.7fa4.cn'

const noticeState = reactive({
  loading: false,
  error: '',
  pendingActionIds: {},
})

let fetchInflight = null
let testNoticeSeq = 0

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
    store.notices = (store.notices || []).filter((n) => n._isTest && !n.noticed)
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
        const localTests = (store.notices || []).filter((n) => n._isTest && !n.noticed)
        store.notices = [...localTests, ...parsed.notices]
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

export async function confirmNoticed(id) {
  const nid = Number(id)
  if (!Number.isInteger(nid) || nid === 0) return { success: false, message: '无效的通知编号' }
  const target = Array.isArray(store.notices) ? store.notices.find((n) => n.id === nid) : null

  if (nid < 0 || target?._isTest) {
    store.notices = (store.notices || []).filter((n) => n.id !== nid)
    noticeState.error = ''
    return { success: true }
  }

  const key = `noticed:${nid}`
  if (noticeState.pendingActionIds[key]) return { success: false, busy: true }

  const url = buildNoticeUpdateUrl(nid, 'noticed', '1')
  noticeState.pendingActionIds[key] = true
  noticeState.error = ''
  try {
    const res = await requestNoticeMutation(url)
    if (!res.success) {
      noticeState.error = res.message || '确认通知失败'
      return res
    }
    if (target) target.noticed = true
    return { success: true }
  } finally {
    delete noticeState.pendingActionIds[key]
  }
}

export function sendTestSiteNotice() {
  testNoticeSeq += 1
  const existing = (store.notices || []).filter((n) => !n._isTest)
  const testNotice = {
    id: -testNoticeSeq,
    user_id: store.self?.uid || 0,
    date: Math.floor(Date.now() / 1000),
    notice_text: '这是一条站点测试通知：有未读通知时将在右下角强制显示，不定时关闭，请手动点击「已读 / 确认」。',
    jump_url: '',
    checked: false,
    noticed: false,
    _isTest: true,
  }
  store.notices = [testNotice, ...existing]
  noticeState.error = ''
  return testNotice
}

export function resetNoticeState() {
  store.notices = []
  noticeState.loading = false
  noticeState.error = ''
  for (const k of Object.keys(noticeState.pendingActionIds)) {
    delete noticeState.pendingActionIds[k]
  }
}

export function hasDesktopSiteNoticeWindow() {
  return typeof window !== 'undefined' && typeof window.api?.syncSiteNotice === 'function'
}

export function bindDesktopSiteNoticeBridge() {
  if (!hasDesktopSiteNoticeWindow()) return () => {}

  const payload = computed(() => {
    const unNoticed = (store.notices || []).filter((n) => !n.noticed)
    const cur = unNoticed[0] || null
    if (!cur || (!store.logined && !cur._isTest)) return null
    return {
      notice: {
        id: cur.id,
        relTimeText: cur.date ? gettime1(cur.date) : '',
        fullTimeText: cur.date ? gettime2(cur.date) : '',
        isTest: Boolean(cur._isTest),
        segments: parseNoticeTextSegments(cur.notice_text, getNoticeOriginBase()).map((s) => ({ ...s })),
        jumpHref: resolveNoticeJumpUrl(cur.jump_url, getNoticeOriginBase()),
      },
      totalPending: unNoticed.length,
      error: String(noticeState.error || ''),
      pending: Boolean(noticeState.pendingActionIds[`noticed:${cur.id}`]),
    }
  })

  const stopWatch = watch(
    payload,
    (next) => {
      try { window.api.syncSiteNotice(next) } catch {}
    },
    { immediate: true },
  )

  const offConfirm =
    typeof window.api.onSiteNoticeConfirm === 'function'
      ? window.api.onSiteNoticeConfirm((id) => {
          confirmNoticed(id)
        })
      : () => {}

  return () => {
    stopWatch()
    offConfirm()
    try { window.api.syncSiteNotice(null) } catch {}
  }
}

export function useNotices() {
  const notices = computed(() => store.notices || [])
  const unNoticedList = computed(() => notices.value.filter((n) => !n.noticed))
  const currentPopupNotice = computed(() => unNoticedList.value[0] || null)
  const isPending = (id) => Boolean(noticeState.pendingActionIds[`noticed:${id}`])

  return {
    noticeState,
    notices,
    unNoticedList,
    currentPopupNotice,
    isPending,
    confirmNoticed,
    sendTestSiteNotice,
    openNoticeJumpUrl,
    formatNoticeSegments,
    getNoticeJumpHref,
  }
}
