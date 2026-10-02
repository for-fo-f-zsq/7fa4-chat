/**
 * 旧接口客户端（与线上 server.js 的真实路由一一对应）
 * ------------------------------------------------------------
 * 为什么后台仍走旧路径？
 *   海报取图、开屏随机、客户端投稿等路径被已发布客户端（3.5.2）硬编码依赖，
 *   路径和响应形状都不能动。后台沿用同一批接口，天然保证「后台看到的」
 *   与「客户端看到的」是同一份数据。
 *
 * 真实路由（来自 server.js 路由表）：
 *   GET    /api/stats                     → { total, stats, records, admin, adminUser }
 *   GET    /api/feedback                  → { list: [...] }
 *   DELETE /api/feedback?id=123           → { ok: true }
 *   GET    /api/posters                   → { success, items }   （仅 approved）
 *   GET    /api/posters?random=1          → { success, item }
 *   GET    /api/admin/posters?status=...  → { success, status, items, counts }
 *   POST   /api/admin/posters/review      → { ok, ... }  body: { id, action, ... }
 *   GET    /api/health                    → { ok: true }
 *   GET    /api/admin                     → { admin, adminUser }
 */

async function legacy(method, path, body) {
  let res
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: Object.assign(
        { Accept: 'application/json' },
        body !== undefined ? { 'Content-Type': 'application/json' } : {}
      ),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('无法连接到服务器')
  }
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`服务器返回了非 JSON 响应 (HTTP ${res.status})`)
  }
  // 旧接口的错误形状是 { error: '文案' }；兼容层偶尔会回 v1 的 { error: {code,message} }。
  // 两者都要能翻译成可读文案，否则前端只能显示 "[object Object]"。
  const errOf = (d) => {
    if (!d || !d.error) return ''
    if (typeof d.error === 'string') return d.error
    if (typeof d.error === 'object') return d.error.message || d.error.code || ''
    return ''
  }
  const okFlag = data && (data.success === true || data.ok === true)
  const hasPayload = data && (data.items !== undefined || data.list !== undefined || data.total !== undefined)
  if (!res.ok && !okFlag && !hasPayload) {
    throw new Error(errOf(data) || `请求失败 (HTTP ${res.status})`)
  }
  const onlyErr = errOf(data)
  if (onlyErr && !okFlag && !hasPayload) {
    throw new Error(onlyErr)
  }
  return data
}

export const legacyApi = {
  // ---------- 统计 ----------
  stats: () => legacy('GET', '/api/stats'),

  /**
   * 用户明细（旧「用户统计」页最核心的一块）。
   *
   * ⚠️ 权限：`records` 只在**管理员已登录**时由服务端返回（未登录恒为 `[]`，
   *    见 server.js legacyStats 的 `records: admin ? records : []`）。
   *    所以这里用 `admin` 标志位区分「未登录」与「真的没有用户」——
   *    否则未登录会被误渲染成「暂无用户」。
   *
   * 活跃天数取 `days` 对象的键数（服务端按北京时间日期打点）。
   *
   * @returns {Promise<{admin:boolean, adminUser:string, total:number, users:Array}>}
   */
  statsUsers: async () => {
    const d = await legacy('GET', '/api/stats')
    const stats = d.stats || {}
    const raw = Array.isArray(d.records) ? d.records : []
    return {
      admin: !!d.admin,
      adminUser: d.adminUser || '',
      total: stats.total_users != null ? stats.total_users : raw.length,
      users: raw.map((r) => ({
        uid: r.uid,
        // 显示名优先昵称 → 真名 → 登录名 → UID 兜底
        name: r.nickname || r.realname || r.username || 'UID ' + r.uid,
        school: r.school || '',
        version: r.version || '3.2.3',
        activeDays: r.days && typeof r.days === 'object' ? Object.keys(r.days).length : 0,
        lastSeen: r.last_seen || 0,
        lastSeenText: r.last_seen_text || '',
        firstSeen: r.first_seen || 0,
      })),
    }
  },

  // ---------- 反馈 ----------
  /** @returns {Promise<Array>} 反馈数组（服务端倒序，最新在上） */
  listFeedback: async () => {
    const d = await legacy('GET', '/api/feedback')
    const list = Array.isArray(d.list) ? d.list : []
    return list.map((f) => ({
      id: f.id,
      content: f.content || '',
      uid: f.uid || 0,
      user: f.user || '',
      client: f.client || null,
      image: f.image || '',
      create_time: f.create_time || 0,
      create_time_text: f.create_time_text || '',
    }))
  },
  removeFeedback: (id) => legacy('DELETE', `/api/feedback?id=${encodeURIComponent(id)}`),

  // ---------- 海报（管理员） ----------
  /**
   * @param {'pending'|'approved'|'rejected'|'all'} status
   * @returns {Promise<{items:Array, counts:Object}>}
   */
  adminPosters: async (status = 'pending') => {
    const d = await legacy('GET', `/api/admin/posters?status=${encodeURIComponent(status)}`)
    return {
      items: Array.isArray(d.items) ? d.items : [],
      counts: d.counts && typeof d.counts === 'object' ? d.counts : {},
    }
  },

  /** 公开列表（仅 approved），用于总览数字校验 */
  publicPosters: async () => {
    const d = await legacy('GET', '/api/posters')
    return Array.isArray(d.items) ? d.items : []
  },

  /**
   * 审核动作。
   * @param {number} id
   * @param {'approve'|'reject'|'pin'|'unpin'|'delete'} action
   */
  reviewPoster: (id, action) =>
    legacy('POST', '/api/admin/posters/review', { id, action }),

  /**
   * 拖拽调序：传完整 id 顺序数组，服务端按序写 sort_at（幂等）。
   * @param {number[]} order
   */
  reorderPosters: (order) =>
    legacy('POST', '/api/admin/posters/review', { action: 'reorder', order }),

  /** 重置为默认排序（清空全部 sort_at） */
  resetPosterOrder: () =>
    legacy('POST', '/api/admin/posters/review', { action: 'reorder', reset: true }),

  // ---------- 探针 ----------
  health: () => legacy('GET', '/api/health'),
  adminProbe: () => legacy('GET', '/api/admin'),
}
