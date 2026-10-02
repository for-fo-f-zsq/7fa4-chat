'use strict';
// ============================================================
// 统一 API v1 路由层
//
// 职责：把「账户 / 会话 / 配置 / 审计 / 内容管理」全部收敛到一套契约下。
// 所有响应走 api-contract（{ok,data} / {ok,error:{code,message}}）。
//
// 会话：沿用 HMAC 签名的 admin_session Cookie（HttpOnly/Secure/SameSite=Lax），
//      但**身份来源从 htpasswd 改为账户库**，并在每次请求校验账户仍然启用
//      —— 这样「禁用某账户」能立即生效，无需等 Cookie 过期。
//
// 权限：super 可管账户与配置；ops 只能管内容（海报/反馈）。
// ============================================================
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const C = require('./api-contract');
const accounts = require('./admin-accounts');
const sysConfig = require('./system-config');
const audit = require('./audit-log');

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL = 7 * 24 * 3600 * 1000; // 7 天
const SESSION_SECRET_FILE = path.join(__dirname, '.session_secret');
let sessionSecret = process.env.SESSION_SECRET || '';

function getSessionSecret() {
  if (sessionSecret) return sessionSecret;
  try { sessionSecret = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim(); } catch {}
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(SESSION_SECRET_FILE, sessionSecret, { mode: 0o600 }); } catch {}
  }
  return sessionSecret;
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {} }
  }
  return out;
}

function signSession(user, role) {
  const payload = Buffer.from(JSON.stringify({ u: user, r: role, exp: Date.now() + SESSION_TTL })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const expect = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  // 定长比较防时序侧信道
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!p || !p.exp || p.exp <= Date.now()) return null;
    return { username: String(p.u || ''), role: String(p.r || '') };
  } catch { return null; }
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.socket && req.socket.remoteAddress || '');
}

/**
 * 解析当前身份。Cookie 有效 **且** 账户仍存在、仍启用 才算登录。
 * 角色以账户库为准（而非 Cookie 里的旧值），保证改角色立即生效。
 */
function currentUser(req) {
  const sess = verifySession(parseCookies(req)[SESSION_COOKIE]);
  if (!sess) return null;
  const acc = accounts.get(sess.username);
  if (!acc || acc.status !== 'active') return null;
  return acc;
}

function requireAuth(req, res) {
  const u = currentUser(req);
  if (!u) { C.fail(res, 'UNAUTHORIZED'); return null; }
  return u;
}

function requireSuper(req, res) {
  const u = requireAuth(req, res);
  if (!u) return null;
  if (u.role !== 'super') { C.fail(res, 'FORBIDDEN', '需要超级管理员权限'); return null; }
  return u;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { code: 'PAYLOAD_TOO_LARGE' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function jsonBody(req, res, limit = 64 * 1024) {
  let raw;
  try { raw = await readBody(req, limit); }
  catch (e) { C.fail(res, e.code === 'PAYLOAD_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST', e.message); return null; }
  try { return JSON.parse(raw || '{}'); }
  catch { C.fail(res, 'BAD_JSON'); return null; }
}

// ==================== 认证 ====================

function handleLogin(req, res, ctx) {
  return jsonBody(req, res, 8 * 1024).then((body) => {
    if (body === null) return;
    // 兼容两种提交：JSON body 或 Authorization: Basic
    let username = body.username, password = body.password;
    if (!username && req.headers.authorization) {
      const m = /^Basic\s+(.+)$/i.exec(String(req.headers.authorization));
      if (m) {
        const dec = Buffer.from(m[1], 'base64').toString('utf8');
        const i = dec.indexOf(':');
        username = dec.slice(0, i); password = dec.slice(i + 1);
      }
    }
    if (!sysConfig.get().register_enabled) {
      audit.log({ actor: String(username || '?'), action: 'auth.login_failed', result: 'denied', detail: '登录功能已关闭', ip: ctx.ip });
      return C.fail(res, 'FORBIDDEN', '登录功能已暂时关闭');
    }
    const r = accounts.authenticate(username, password);
    if (!r.ok) {
      const code = r.reason === 'disabled' ? 'ACCOUNT_DISABLED' : 'INVALID_CREDENTIALS';
      audit.log({ actor: String(username || '?').slice(0, 64), action: 'auth.login_failed', result: 'denied', detail: r.reason, ip: ctx.ip });
      return C.fail(res, code);
    }
    const token = signSession(r.account.username, r.account.role);
    res.setHeader('Set-Cookie',
      `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL / 1000)}`);
    audit.log({ actor: r.account.username, action: 'auth.login', result: 'ok', ip: ctx.ip });
    C.ok(res, { username: r.account.username, role: r.account.role, display_name: r.account.display_name });
  });
}

function handleLogout(req, res, ctx) {
  const u = currentUser(req);
  if (u) audit.log({ actor: u.username, action: 'auth.logout', result: 'ok', ip: ctx.ip });
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  C.ok(res, { ok: true });
}

/** 当前登录身份 —— 前端据此判断是否显示管理界面 */
function handleMe(req, res) {
  const u = currentUser(req);
  if (!u) return C.ok(res, { authenticated: false });
  C.ok(res, {
    authenticated: true,
    username: u.username,
    role: u.role,
    display_name: u.display_name,
    last_login_at: u.last_login_at,
  });
}

/** 当前会话可执行的权限清单 —— 前端据此隐藏无权按钮 */
function handlePermissions(req, res) {
  const u = currentUser(req);
  if (!u) return C.ok(res, { authenticated: false, permissions: [] });
  const perms = ['content.view', 'content.manage', 'audit.view'];
  if (u.role === 'super') perms.push('account.manage', 'config.manage');
  C.ok(res, { authenticated: true, role: u.role, permissions: perms });
}

// ==================== 账户管理（仅 super） ====================

function handleAccountList(req, res, ctx) {
  const u = requireSuper(req, res);
  if (!u) return;
  C.ok(res, { accounts: accounts.list() });
}

function handleAccountCreate(req, res, ctx) {
  const u = requireSuper(req, res);
  if (!u) return;
  return jsonBody(req, res).then((body) => {
    if (body === null) return;
    const r = accounts.create({
      username: body.username,
      password: body.password,
      role: body.role || 'ops',
      display_name: body.display_name,
      note: body.note,
      actor: u.username,
    });
    if (!r.ok) {
      const codeMap = { bad_username: 'VALIDATION_FAILED', bad_password: 'VALIDATION_FAILED', bad_role: 'VALIDATION_FAILED', exists: 'CONFLICT' };
      audit.log({ actor: u.username, action: 'account.create', target: String(body.username || ''), result: 'failed', detail: r.message, ip: ctx.ip });
      return C.fail(res, codeMap[r.code] || 'BAD_REQUEST', r.message);
    }
    audit.log({ actor: u.username, action: 'account.create', target: r.account.username, result: 'ok', detail: `角色 ${r.account.role}`, ip: ctx.ip });
    C.ok(res, { account: r.account }, 201);
  });
}

function handleAccountUpdate(req, res, ctx, username) {
  const u = requireSuper(req, res);
  if (!u) return;
  return jsonBody(req, res).then((body) => {
    if (body === null) return;
    const r = accounts.update(username, {
      role: body.role, status: body.status, display_name: body.display_name, note: body.note,
    }, u.username);
    if (!r.ok) {
      const code = r.code === 'last_super' ? 'LAST_SUPER' : (r.code === 'not_found' ? 'NOT_FOUND' : 'VALIDATION_FAILED');
      audit.log({ actor: u.username, action: 'account.update', target: username, result: 'failed', detail: r.message, ip: ctx.ip });
      return C.fail(res, code, r.message);
    }
    audit.log({ actor: u.username, action: 'account.update', target: username, result: 'ok', detail: JSON.stringify({ role: body.role, status: body.status }).slice(0, 200), ip: ctx.ip });
    C.ok(res, { account: r.account });
  });
}

function handleAccountDelete(req, res, ctx, username) {
  const u = requireSuper(req, res);
  if (!u) return;
  // 不允许删自己（避免误操作把自己踢下线后无人管理）
  if (u.username === String(username).toLowerCase()) {
    return C.fail(res, 'FORBIDDEN', '不能删除当前登录的账户');
  }
  const r = accounts.remove(username, u.username);
  if (!r.ok) {
    const code = r.code === 'last_super' ? 'LAST_SUPER' : (r.code === 'not_found' ? 'NOT_FOUND' : 'BAD_REQUEST');
    audit.log({ actor: u.username, action: 'account.delete', target: username, result: 'failed', detail: r.message, ip: ctx.ip });
    return C.fail(res, code, r.message);
  }
  audit.log({ actor: u.username, action: 'account.delete', target: username, result: 'ok', ip: ctx.ip });
  C.ok(res, { username });
}

function handleAccountResetPassword(req, res, ctx, username) {
  const u = requireSuper(req, res);
  if (!u) return;
  return jsonBody(req, res).then((body) => {
    if (body === null) return;
    const r = accounts.setPassword(username, body.password, u.username);
    if (!r.ok) {
      const code = r.code === 'not_found' ? 'NOT_FOUND' : 'VALIDATION_FAILED';
      audit.log({ actor: u.username, action: 'account.reset_password', target: username, result: 'failed', detail: r.message, ip: ctx.ip });
      return C.fail(res, code, r.message);
    }
    audit.log({ actor: u.username, action: 'account.reset_password', target: username, result: 'ok', ip: ctx.ip });
    C.ok(res, { username: r.username });
  });
}

// ==================== 系统配置（仅 super） ====================

function handleConfigGet(req, res) {
  const u = requireSuper(req, res);
  if (!u) return;
  C.ok(res, { config: sysConfig.get(), items: sysConfig.list() });
}

function handleConfigUpdate(req, res, ctx) {
  const u = requireSuper(req, res);
  if (!u) return;
  return jsonBody(req, res).then((body) => {
    if (body === null) return;
    const patch = body.patch || body;
    const r = sysConfig.update(patch);
    if (!r.ok) {
      audit.log({ actor: u.username, action: 'config.update', result: 'failed', detail: r.message, ip: ctx.ip });
      return C.fail(res, 'VALIDATION_FAILED', r.message);
    }
    audit.log({ actor: u.username, action: 'config.update', result: 'ok', detail: JSON.stringify(r.applied).slice(0, 300), ip: ctx.ip });
    C.ok(res, { config: r.config, items: sysConfig.list() });
  });
}

function handleConfigReset(req, res, ctx) {
  const u = requireSuper(req, res);
  if (!u) return;
  return jsonBody(req, res).then((body) => {
    if (body === null) return;
    const r = sysConfig.reset(body.keys);
    if (!r.ok) return C.fail(res, 'VALIDATION_FAILED', r.message);
    audit.log({ actor: u.username, action: 'config.reset', result: 'ok', detail: (body.keys || []).join(',') || '全部', ip: ctx.ip });
    C.ok(res, { config: r.config, items: sysConfig.list() });
  });
}

// ==================== 审计日志 ====================

function handleAuditList(req, res) {
  const u = requireAuth(req, res);
  if (!u) return;
  const url = new URL(req.url, 'http://x');
  const q = {
    actor: url.searchParams.get('actor') || undefined,
    action: url.searchParams.get('action') || undefined,
    result: url.searchParams.get('result') || undefined,
    since: Number(url.searchParams.get('since')) || undefined,
    until: Number(url.searchParams.get('until')) || undefined,
    limit: Number(url.searchParams.get('limit')) || 200,
    offset: Number(url.searchParams.get('offset')) || 0,
  };
  const r = audit.query(q);
  C.ok(res, { total: r.total, items: r.items.map((x) => Object.assign({}, x, { action_label: audit.actionLabel(x.action) })) });
}

// ==================== 路由表 ====================

/**
 * 尝试处理 v1 请求。返回 true 表示已处理（含已发错误响应），false 表示不属于 v1。
 */
function handle(req, res) {
  const pathname = (req.url || '/').split('?')[0];
  if (!pathname.startsWith('/api/v1/')) return false;
  const seg = pathname.slice('/api/v1/'.length).split('/').filter(Boolean);
  const ctx = { ip: clientIp(req), method: req.method };

  const route = seg.join('/');

  // --- 认证 ---
  if (route === 'auth/login' && req.method === 'POST') { handleLogin(req, res, ctx); return true; }
  if (route === 'auth/logout' && req.method === 'POST') { handleLogout(req, res, ctx); return true; }
  if (route === 'auth/me' && req.method === 'GET') { handleMe(req, res); return true; }
  if (route === 'auth/permissions' && req.method === 'GET') { handlePermissions(req, res); return true; }

  // --- 账户 ---
  if (route === 'accounts' && req.method === 'GET') { handleAccountList(req, res, ctx); return true; }
  if (route === 'accounts' && req.method === 'POST') { handleAccountCreate(req, res, ctx); return true; }
  if (seg[0] === 'accounts' && seg.length === 2 && req.method === 'PATCH') { handleAccountUpdate(req, res, ctx, seg[1]); return true; }
  if (seg[0] === 'accounts' && seg.length === 2 && req.method === 'DELETE') { handleAccountDelete(req, res, ctx, seg[1]); return true; }
  if (seg[0] === 'accounts' && seg[2] === 'password' && req.method === 'POST') { handleAccountResetPassword(req, res, ctx, seg[1]); return true; }

  // --- 配置 ---
  if (route === 'config' && req.method === 'GET') { handleConfigGet(req, res); return true; }
  if (route === 'config' && req.method === 'PATCH') { handleConfigUpdate(req, res, ctx); return true; }
  if (route === 'config/reset' && req.method === 'POST') { handleConfigReset(req, res, ctx); return true; }

  // --- 审计 ---
  if (route === 'audit' && req.method === 'GET') { handleAuditList(req, res); return true; }

  C.fail(res, 'NOT_FOUND', `未知接口 /api/v1/${route}`);
  return true;
}

module.exports = {
  handle,
  SESSION_COOKIE,
  currentUser,
  requireAuth,
  requireSuper,
  signSession,
  verifySession,
  _internal: { parseCookies, jsonBody },
};
