'use strict';
// ============================================================
// 统一 API 契约（v1）
//
// 背景：旧接口风格不一 —— 有的返回 {ok:true}，有的 {success:true}，错误有的 {error:'admin only'}
// 有的是裸字符串，HTTP 状态码也在 400/401/404 之间混用。前端每个页面都得写一套自己的判错逻辑。
//
// 本模块定义**唯一**的响应格式与错误码表，所有 /api/v1/* 必须遵守。
//
// 成功：{ ok: true,  data: <任意> }
// 失败：{ ok: false, error: { code: 'NOT_FOUND', message: '可读描述' } }
//
// HTTP 状态码与业务错误码**分离**：状态码表达传输层语义（401 未登录 / 403 无权限 / 404 不存在…），
// code 表达业务语义，前端据此做分支（如 INVALID_CREDENTIALS 提示密码错、LAST_SUPER 提示不能删）。
// ============================================================

// 错误码 → 默认 HTTP 状态 + 默认文案
const ERRORS = {
  // 400
  BAD_REQUEST:        { status: 400, message: '请求参数不合法' },
  BAD_JSON:           { status: 400, message: '请求体不是合法 JSON' },
  VALIDATION_FAILED:  { status: 400, message: '参数校验未通过' },
  EMPTY_CONTENT:      { status: 400, message: '内容不能为空' },
  TOO_LONG:           { status: 400, message: '内容过长' },
  // 401
  UNAUTHORIZED:       { status: 401, message: '未登录或登录已过期' },
  INVALID_CREDENTIALS:{ status: 401, message: '用户名或密码错误' },
  ACCOUNT_DISABLED:   { status: 401, message: '账户已被禁用' },
  // 403
  FORBIDDEN:          { status: 403, message: '没有权限执行该操作' },
  // 404
  NOT_FOUND:          { status: 404, message: '资源不存在' },
  // 405
  METHOD_NOT_ALLOWED: { status: 405, message: '请求方法不支持' },
  // 409
  CONFLICT:           { status: 409, message: '资源冲突' },
  LAST_SUPER:         { status: 409, message: '系统必须保留至少一个启用的超级管理员' },
  // 413
  PAYLOAD_TOO_LARGE:  { status: 413, message: '请求体过大' },
  // 429
  RATE_LIMITED:       { status: 429, message: '请求过于频繁，请稍后再试' },
  // 500 / 502
  INTERNAL:           { status: 500, message: '服务器内部错误' },
  UPSTREAM:           { status: 502, message: '上游服务异常' },
};

function codeToStatus(code) {
  return (ERRORS[code] && ERRORS[code].status) || 500;
}

/**
 * 发成功响应。
 * @param {http.ServerResponse} res
 * @param {*} data
 * @param {number} [status=200]
 */
function ok(res, data = null, status = 200) {
  send(res, status, { ok: true, data });
}

/**
 * 发失败响应。
 * @param {http.ServerResponse} res
 * @param {string} code  错误码（见 ERRORS）
 * @param {string} [message]  覆盖默认文案
 * @param {object} [extra]  附加信息，如 { fields: {...} }
 */
function fail(res, code, message, extra) {
  const def = ERRORS[code] || { status: 500, message: '未知错误' };
  const body = { ok: false, error: Object.assign({ code, message: message || def.message }, extra || {}) };
  send(res, def.status, body);
}

function send(res, status, body) {
  if (res.headersSent) return;
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    // 管理接口一律不可缓存（数据实时性 + 避免代理串号）
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}

/** 兼容层：旧接口需要旧格式时，把统一结构摊平成旧字段 */
function legacy(res, data, legacyShape) {
  send(res, 200, legacyShape ? legacyShape(data) : data);
}

module.exports = { ERRORS, codeToStatus, ok, fail, send, legacy };
