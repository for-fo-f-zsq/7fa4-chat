/**
 * 统一 API 客户端
 * ------------------------------------------------------------
 * 后端 /api/v1/* 的契约固定为：
 *   成功 → { ok: true,  data: ... }
 *   失败 → { ok: false, error: { code, message } }
 * 本模块把这两种情况收敛成 Promise resolve / reject，
 * 让调用方只需要处理「数据」或「异常」两种分支。
 */

/** 业务异常：带 code，便于调用方区分（如 ACCOUNT_DISABLED） */
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message || code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** 网络层异常（断网 / 超时 / 非 JSON 响应） */
export class NetError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'NetError'
    this.status = status
  }
}

const BASE = '/api/v1'

/**
 * 发起一次 v1 请求。
 * @param {string} method
 * @param {string} path 相对 /api/v1 的路径，如 '/accounts'
 * @param {object} [opts]
 * @param {any}    [opts.body]    JSON 请求体
 * @param {object} [opts.query]   query 参数（undefined/null 会被跳过）
 * @param {number} [opts.timeout] 毫秒，默认 15000
 * @param {AbortSignal} [opts.signal]
 */
async function request(method, path, opts = {}) {
  const { body, query, timeout = 15000, signal } = opts

  let url = BASE + path
  if (query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.append(k, String(v))
    }
    const s = qs.toString()
    if (s) url += '?' + s
  }

  // 超时控制：与外部 signal 合并（任一触发即取消）
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeout)
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason)
    else signal.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true })
  }

  let res
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: Object.assign(
        { Accept: 'application/json' },
        body !== undefined ? { 'Content-Type': 'application/json' } : {}
      ),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if (e && e.name === 'AbortError') {
      throw new NetError(signal && signal.aborted ? '请求已取消' : '请求超时，请检查网络')
    }
    throw new NetError('无法连接到服务器')
  }
  clearTimeout(timer)

  // 读完 body 再判断：后端即使在 4xx/5xx 也会给统一契约
  const text = await res.text()
  let payload = null
  try {
    payload = JSON.parse(text)
  } catch {
    throw new NetError(
      res.ok ? '服务器返回了非 JSON 响应' : `服务器错误 (HTTP ${res.status})`,
      res.status
    )
  }

  if (payload && payload.ok === true) return payload.data

  // 旧接口兜底：万一命中了兼容层（{success:...}），也尽量让调用方拿到数据
  if (payload && payload.ok === undefined && payload.success === true) {
    return payload
  }

  const err = (payload && payload.error) || {}
  throw new ApiError(err.code || 'INTERNAL', err.message || `请求失败 (HTTP ${res.status})`, res.status)
}

export const api = {
  get: (p, opts) => request('GET', p, opts),
  post: (p, body, opts) => request('POST', p, Object.assign({ body }, opts)),
  patch: (p, body, opts) => request('PATCH', p, Object.assign({ body }, opts)),
  del: (p, opts) => request('DELETE', p, opts),

  // ---------- 认证 ----------
  me: () => request('GET', '/auth/me'),
  login: (username, password) => request('POST', '/auth/login', { body: { username, password } }),
  logout: () => request('POST', '/auth/logout'),
  permissions: () => request('GET', '/auth/permissions'),

  // ---------- 账户 ----------
  listAccounts: () => request('GET', '/accounts'),
  createAccount: (payload) => request('POST', '/accounts', { body: payload }),
  updateAccount: (username, payload) =>
    request('PATCH', `/accounts/${encodeURIComponent(username)}`, { body: payload }),
  setAccountPassword: (username, password) =>
    request('POST', `/accounts/${encodeURIComponent(username)}/password`, { body: { password } }),
  removeAccount: (username) =>
    request('DELETE', `/accounts/${encodeURIComponent(username)}`),

  // ---------- 系统配置 ----------
  getConfig: () => request('GET', '/config'),
  updateConfig: (patch) => request('PATCH', '/config', { body: patch }),
  resetConfig: (keys) => request('POST', '/config/reset', { body: { keys } }),

  // ---------- 审计 ----------
  getAudit: (params) => request('GET', '/audit', { query: params }),
}
