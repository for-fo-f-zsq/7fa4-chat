// 用户信息库、年级颜色体系、展示名与 ranklist 慢速同步
import { reactive } from 'vue'
import { store } from '../store.js'

export const usersJson = reactive({})
export const ranklistOrder = [] // 按 ranklist 顺序存储 uid

export async function loadUsersDb() {
  try {
    if (!window.api?.loadUsersDb) return false
    const r = await window.api.loadUsersDb()
    if (!r.success) {
      console.error('[users-db] 加载失败:', r.error)
      return false
    }
    const obj = r.data
    for (const k of Object.keys(usersJson)) delete usersJson[k]
    Object.assign(usersJson, obj)
    return true
  } catch (e) {
    console.error('[users-db] 加载失败:', e)
    return false
  }
}

// 独立页面（工具 iframe）里没有主进程，由宿主通过桥接把用户快照注入进来
export function applyUsersSnapshot(snapshot) {
  const users = snapshot && snapshot.users
  const names = snapshot && snapshot.usersJson
  const order = snapshot && snapshot.ranklistOrder
  if (users && typeof users === 'object') {
    if (!store.users || typeof store.users !== 'object') store.users = {}
    Object.assign(store.users, users)
  }
  if (names && typeof names === 'object') Object.assign(usersJson, names)
  if (Array.isArray(order)) {
    ranklistOrder.length = 0
    ranklistOrder.push(...order)
  }
}

// ========== 年级颜色系统 ==========
export const COLOR_KEYS = ['x4', 'x5', 'x6', 'c1', 'c2', 'c3', 'g1', 'g2', 'g3', 'd1', 'd2', 'd3', 'd4', 'by', 'jl', 'uk']

export const GRADE_LABELS = {
  x4: '小四', x5: '小五', x6: '小六',
  c1: '初一', c2: '初二', c3: '初三',
  g1: '高一', g2: '高二', g3: '高三',
  d1: '大一', d2: '大二', d3: '大三', d4: '大四',
  by: '毕业', jl: '教练', uk: '其他',
}

export const DEFAULT_PALETTE = {
  x4: '#D97E24', x5: '#C16A15', x6: '#A5530C',
  c1: '#10A093', c2: '#0B8379', c3: '#076A62',
  g1: '#3FA45B', g2: '#2D8F48', g3: '#1E7A38',
  d1: '#4B7AE8', d2: '#3762CC', d3: '#284DB2', d4: '#1D3A96',
  by: '#8D96A7', jl: '#CE4E82', uk: '#828B98',
}

const AVATAR_TINT_FALLBACK = ['#EDF1F9', '#F7EADF', '#EFF2E0', '#E3F0F6', '#F3E8EE', '#E6E9F5', '#F4EEE3', '#E2EFE9']
const USER_GRADE_PROGRESSION = ['x4', 'x5', 'x6', 'c1', 'c2', 'c3', 'g1', 'g2', 'g3', 'd1', 'd2', 'd3', 'd4', 'by']
const FIRST_GRADE_ACADEMIC_YEAR = 2025
const GRADE_STATUS_MAP = { 教练: 'jl', 毕业: 'by', 学前: 'uk', 其他: 'uk' }

export function getAvatarInitial(uid) {
  if (!uid) return '?'
  const user = store.users?.[uid]
  if (user?.realname) return user.realname.charAt(0)
  const name = usersJson?.[uid]?.name
  if (name) return name.charAt(0)
  if (user?.nickname) return user.nickname.charAt(0)
  if (user?.username) return user.username.charAt(0)
  return String(uid).charAt(0)
}

export function avatarTint(key) {
  const s = String(key ?? '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const i = h % AVATAR_TINT_FALLBACK.length
  return `var(--avatar-tint-${i + 1}, ${AVATAR_TINT_FALLBACK[i]})`
}

function gradeToColorKey(grade) {
  const map = {
    小四: 'x4', 小五: 'x5', 小六: 'x6',
    初一: 'c1', 初二: 'c2', 初三: 'c3',
    高一: 'g1', 高二: 'g2', 高三: 'g3',
    大一: 'd1', 大二: 'd2', 大三: 'd3', 大四: 'd4',
    毕业: 'by', 教练: 'jl', 学前: 'uk',
  }
  return map[String(grade == null ? '' : grade).trim()] || ''
}

export function currentGradeAcademicYear() {
  const now = new Date()
  return Math.max(FIRST_GRADE_ACADEMIC_YEAR, now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1)
}

export function graduateYearToColorKey(graduateYear) {
  const year = Number(graduateYear)
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2100) return ''
  const index = currentGradeAcademicYear() + 9 - year
  if (index < 0) return ''
  return USER_GRADE_PROGRESSION[Math.min(index, USER_GRADE_PROGRESSION.length - 1)] || ''
}

export function colorKeyToGraduateYear(colorKey) {
  const index = USER_GRADE_PROGRESSION.indexOf(colorKey)
  if (index < 0 || index >= USER_GRADE_PROGRESSION.length - 1) return undefined
  return currentGradeAcademicYear() + 9 - index
}

export function localGradeColorKey(uid) {
  const info = usersJson?.[uid]
  if (!info) return ''
  return info.colorKey || graduateYearToColorKey(info.graduateYear) || GRADE_STATUS_MAP[info.status] || ''
}

export function isLocalCoach(uid) {
  const info = usersJson?.[uid]
  return !!info && (info.status === '教练' || info.colorKey === 'jl')
}

function coachOverrides(uid, remoteGrade) {
  if (!isLocalCoach(uid)) return false
  const remote = String(remoteGrade == null ? '' : remoteGrade).trim()
  return !remote || remote === '毕业'
}

function colorKeyOf(uid) {
  const localKey = localGradeColorKey(uid)
  const g = store.users?.[uid]?.grade
  if (coachOverrides(uid, g)) return 'jl'
  return gradeToColorKey(g) || localKey
}

function paletteColor(colorKey) {
  if (!colorKey) return ''
  const customPalette = store.setting?.gradeColors || {}
  if (customPalette[colorKey]) return customPalette[colorKey]
  const cssVar = getComputedStyle(document.documentElement).getPropertyValue(`--grade-${colorKey}`).trim()
  if (cssVar) return cssVar
  return DEFAULT_PALETTE[colorKey] || ''
}

export function getGradeColor(uid) {
  return paletteColor(colorKeyOf(uid))
}

export function getGradeLabel(uid) {
  const colorKey = colorKeyOf(uid)
  if (!colorKey) return ''
  return GRADE_LABELS[colorKey] || ''
}

export function getRealname(user) {
  if (!user) return ''
  return user.realname || usersJson?.[user.uid]?.name || ''
}

export function getUsername(uid, users) {
  if (!uid) return ''
  const source = users || store.users
  if (!source) return 'User_' + uid
  const user = source[uid]
  if (!user) {
    const name = usersJson?.[uid]?.name
    return name || 'User_' + uid
  }
  const nickname = user.note || user.nickname || user.username
  const real = getRealname(user)
  return real ? nickname + '(' + real + ')' : nickname || uid
}

export function displayName(user) {
  if (!user) return ''
  const uid = user.uid
  const nick = user.note || user.nickname || user.username || (uid ? 'User_' + uid : '') || ''
  const real = getRealname(user)
  if (real) return `${nick}(${real})`
  if (uid && usersJson?.[uid]?.name) return usersJson[uid].name
  return nick
}

export function isUserHiddenBySetting(u) {
  if (store.setting?.hideNonMutual !== true) return false
  return !(u?.watchee === true && u?.watcher === true)
}

// ========== ranklist 慢速爬取 ==========
let _ranklistFetching = false
let _ranklistTimer = null
const RANKLIST_PAGE_DELAY = 1200

export function startRanklistFetch() {
  if (_ranklistTimer) return
  _doFetchRanklist()
  _ranklistTimer = setInterval(_doFetchRanklist, 10 * 60 * 1000)
}

export function stopRanklistFetch() {
  if (_ranklistTimer) {
    clearInterval(_ranklistTimer)
    _ranklistTimer = null
  }
  _ranklistFetching = false
}

async function _doFetchRanklist() {
  if (_ranklistFetching) return
  _ranklistFetching = true
  try {
    ranklistOrder.length = 0
    let page = 1
    let lastFirstUid = null
    while (true) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      let res
      try {
        res = await fetch(`/ranklist?page=${page}`, { signal: ctrl.signal })
      } catch {
        clearTimeout(timer)
        break
      }
      clearTimeout(timer)
      if (!res.ok) break
      const html = await res.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const rows = doc.querySelectorAll('tbody tr')
      if (rows.length === 0) break
      let firstUid = null
      for (const row of rows) {
        const link = row.querySelector('td.cell.username a[href]')
        if (!link) continue
        const uid = Number(String(link.getAttribute('href') || '').replace('/user/', ''))
        if (!uid) continue
        if (firstUid === null) firstUid = uid
        const pick = (cls) => row.querySelector('td.cell.' + cls)
        const nickname = pick('nickname')?.textContent.trim() || ''
        const username = pick('uid')?.textContent.trim() || ''
        if (!nickname && !username) continue
        const gradeText = pick('graduate_year')?.textContent.trim() || ''
        ranklistOrder.push(uid)
        const old = store.users[uid]
        const newData = {
          uid,
          realname: old?.realname || '',
          username: username || old?.username || '',
          nickname: nickname || old?.nickname || '',
          grade: gradeText || old?.grade || '',
          grade_class: old?.grade_class || '',
          seat: old?.seat || '',
          note: old?.note || '',
          message_ids: old?.message_ids || [],
          lastSendTime: old?.lastSendTime || 0,
          unread: old?.unread || false,
          pinned: old?.pinned || false,
          show: old ? old.show : false,
          watchee: old?.watchee === true,
          watcher: old?.watcher === true,
          _fetchedAt: new Date().toISOString(),
        }
        if (old && old.username === newData.username && old.nickname === newData.nickname && old.seat === newData.seat && old.grade === newData.grade && old._fetchedAt) {
          old._fetchedAt = newData._fetchedAt
          continue
        }
        store.users[uid] = newData
      }
      if (firstUid !== null && firstUid === lastFirstUid) break
      lastFirstUid = firstUid
      page++
      await new Promise((r) => setTimeout(r, RANKLIST_PAGE_DELAY))
    }
  } catch (e) {
    console.error('[ranklist] fetch error:', e)
  }
  _ranklistFetching = false
}
