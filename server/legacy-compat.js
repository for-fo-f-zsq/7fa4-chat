'use strict';
// ============================================================
// 旧接口兼容层
//
// 为什么必须存在：已发布的客户端（3.5.2 及更早）把服务端路径**硬编码**在代码里
// （src/main/index.js 的 /info、web-api.js 的 /api/posters、/api/feedback 等），
// 用户手里的安装包无法远程更新 —— 一旦改路径/改响应结构，这些人会直接失去
// 上报、发现页、海报、反馈功能，且我们无法修复。所以旧路径必须永久可用。
//
// 策略：旧路径保留原有**响应结构**（有些是 {success}, 有些是 {ok}, 有些是 {error}），
//      内部统一转发到新实现。新代码只写 /api/v1/*。
//
// 本模块只做「形状转换」，不重复业务逻辑 —— 业务全部由各 handler 提供。
// ============================================================

/**
 * 旧 POST /api/feedback 的响应：{ok:true, id} 或 {error:'...'}
 * 新实现返回统一契约，这里摊平回旧形状。
 */
function legacyFeedbackCreate(result) {
  if (result && result.ok) return { ok: true, id: result.id };
  return { error: (result && result.error) || 'bad request' };
}

/**
 * 旧 GET /api/feedback 的响应：{list:[...]}
 */
function legacyFeedbackList(list) {
  return { list: Array.isArray(list) ? list : [] };
}

/**
 * 旧 GET /api/posters 的响应：
 *   列表 {success:true, items:[...]}
 *   随机 {success:true, item:{...}|null}
 * 注意旧接口用 success 而非 ok，且随机模式无结果时 item:null 而非报错。
 */
function legacyPosterList(items) {
  return { success: true, items: Array.isArray(items) ? items : [] };
}
function legacyPosterRandom(item) {
  return { success: true, item: item || null };
}

/**
 * 旧 GET /api/stats 的响应：{total, stats, records, admin, adminUser}
 * records 仅管理员可见（非管理员返回 []）。
 */
function legacyStats({ total, stats, records, admin, adminUser }) {
  return {
    total: total || 0,
    stats: stats || {},
    records: admin ? (records || []) : [],
    admin: !!admin,
    adminUser: admin ? (adminUser || '') : '',
  };
}

/**
 * 旧 GET /api/admin 探针：{admin, adminUser}
 */
function legacyAdminProbe(admin, adminUser) {
  return { admin: !!admin, adminUser: admin ? (adminUser || '') : '' };
}

/**
 * 旧 POST /api/login 响应：成功 {ok:true, adminUser}，失败 {error:'incorrect credentials'}
 * 旧实现失败文案固定为英文（客户端/旧页面据此判断过），保持不变。
 */
function legacyLoginOk(username) {
  return { ok: true, adminUser: username };
}
function legacyLoginFail() {
  return { error: 'incorrect credentials' };
}

/**
 * 旧 /api/health：{ok:true}
 */
function legacyHealth() {
  return { ok: true };
}

// 旧路径 → 新 v1 路径的映射（供文档/自检用，也让「哪些还在用旧路径」一目了然）
const LEGACY_ROUTES = {
  'POST /info':                  '客户端加密上报（保持原实现，不转发）',
  'GET  /api/stats':             '/api/v1/stats（管理员视图）',
  'GET  /api/admin':             '/api/v1/auth/me（探针形状转换）',
  'POST /api/login':             '/api/v1/auth/login（响应摊平为 {ok,adminUser}）',
  'POST /api/logout':            '/api/v1/auth/logout',
  'GET  /api/login_check':       '兼容保留（返回 200，供仍走 htpasswd 流程的旧页面）',
  'GET  /api/feedback':          '/api/v1/feedback（管理员）',
  'POST /api/feedback':          '/api/v1/feedback（公开提交）',
  'DELETE /api/feedback':        '/api/v1/feedback/:id（管理员）',
  'GET  /api/posters':           '/api/v1/posters（公开列表 / ?random=1）',
  'GET  /api/posters/:id.:ext':  '海报图片字节（保持原实现）',
  'POST /api/posters':           '/api/v1/posters（客户端投稿，AES 载荷）',
  'GET  /api/admin/posters':     '/api/v1/admin/posters（管理员）',
  'POST /api/admin/posters/review': '/api/v1/admin/posters/review',
  'GET  /api/sponsors':          '赞助列表（保持原实现）',
  'GET  /api/discover/people':   '推荐用户（保持原实现，客户端依赖）',
  'GET  /api/discover/groups':   '推荐群组（保持原实现）',
  'GET  /user/:uid/photo':       '用户照片（管理员）',
  'POST /user/:uid/photo':       '用户照片上传（AES 载荷）',
};

module.exports = {
  legacyFeedbackCreate,
  legacyFeedbackList,
  legacyPosterList,
  legacyPosterRandom,
  legacyStats,
  legacyAdminProbe,
  legacyLoginOk,
  legacyLoginFail,
  legacyHealth,
  LEGACY_ROUTES,
};
