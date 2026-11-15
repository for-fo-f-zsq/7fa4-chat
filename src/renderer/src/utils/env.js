// 运行环境、站点 URL、版本比较、字体大小与非 Electron 更新检查
import { store } from '../store.js'

const DEFAULT_API_URL = 'https://jx.7fa4.cn'
const GITLAB_PROJECT_PATH = 'student-archive/7fa4-chat'
const OFFICIAL_SITE_PATH = '/7fa4-chat/'

/** 是否为「纯网页浏览器」环境（排除 Electron 与 Android Capacitor 外壳） */
export function isWebBrowser() {
  if (typeof window === 'undefined') return false
  if (!window.__7FA4_WEB__) return false
  if (window.__7FA4_NATIVE__ === true) return false
  return window.__7FA4_PLATFORM__ !== 'android'
}

/** 当前选择的 API 源站（含协议，去掉末尾斜杠） */
function currentApiOrigin() {
  if (isWebBrowser() && typeof location !== 'undefined') return location.protocol + '//' + location.hostname
  return String(store.setting?.apiUrl || DEFAULT_API_URL)
    .replace(/^http:\/\//, 'https://')
    .replace(/\/+$/, '')
}

export function gitlabWebBase() {
  return `${currentApiOrigin()}:9080`
}

export function gitlabProjectUrl() {
  return `${gitlabWebBase()}/projects/886`
}

export function gitlabIssuesUrl() {
  return `${gitlabWebBase()}/${GITLAB_PROJECT_PATH}/-/issues`
}

export function gitlabPackagesUrl() {
  return `${gitlabWebBase()}/${GITLAB_PROJECT_PATH}/-/packages`
}

export function gitlabRawUrl(path) {
  return `${gitlabWebBase()}/${GITLAB_PROJECT_PATH}/-/raw/master/${String(path).replace(/^\/+/, '')}`
}

export function officialSiteUrl() {
  if (isWebBrowser()) return `${location.origin}${OFFICIAL_SITE_PATH}`
  return `${currentApiOrigin()}:8888${OFFICIAL_SITE_PATH}`
}

export function officialDownloadUrl() {
  return `${officialSiteUrl()}#downloads`
}

export function feedbackApiUrl() {
  return `${officialSiteUrl()}api/feedback`
}

export function feedbackPageUrl(platform, version) {
  const base = `${officialSiteUrl()}feedback/`
  const qs = new URLSearchParams()
  if (platform) qs.set('platform', platform)
  if (version) qs.set('version', version)
  const q = qs.toString()
  return q ? `${base}?${q}` : base
}

/** 版本号比较：返回 1（a>b）/ 0 / -1 */
export function compareVersion(a, b) {
  const pa = String(a || '').split('.').map(Number)
  const pb = String(b || '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** 静默检查更新（仅非 Electron：网页端 / 安卓端），写回 store.update */
export async function checkAppUpdate() {
  if (!window.__7FA4_WEB__) return store.update
  if (typeof window.api?.fetchVersionInfo !== 'function') return store.update
  store.update.checking = true
  try {
    const r = await window.api.fetchVersionInfo()
    if (r && r.success) {
      const latest = r.latestVersion || ''
      const cur = await window.api.getVersion().catch(() => '')
      store.update.current = cur || ''
      store.update.latest = latest
      store.update.hasUpdate = !!latest && compareVersion(latest, cur) > 0
      const apk = (r.artifacts || []).find((a) => a && a.platform === 'android')
      store.update.apkUrl = (apk && apk.url) || ''
      store.update.apkSize = (apk && apk.size) || 0
      store.update.error = ''
    } else {
      store.update.error = (r && r.error) || '获取最新版本失败'
    }
  } catch (e) {
    store.update.error = (e && e.message) || '网络错误'
  } finally {
    store.update.checking = false
    store.update.checked = true
  }
  return store.update
}

export function applyFontSize(size) {
  const root = document.documentElement
  root.style.setProperty('--font-size-base', size + 'px')
  root.style.setProperty('--font-size-small', size - 2 + 'px')
  root.style.setProperty('--font-size-large', size + 2 + 'px')
}
