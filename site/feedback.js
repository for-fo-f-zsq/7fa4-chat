'use strict';

/**
 * 反馈系统（用户端提交 + 后台查看）
 *
 * 路由（Caddy 已剥掉 /7fa4-chat 前缀）：
 *   POST /api/feedback                       提交反馈（JSON，截图以 base64 内嵌，可选）
 *   POST /api/feedback/admin/login           密码登录，成功下发 HttpOnly 签名 cookie
 *   POST /api/feedback/admin/logout          退出
 *   GET  /api/feedback/admin/list            查看全部反馈（需 cookie）
 *   POST /api/feedback/admin/status          标记已处理 / 恢复待处理
 *   GET  /api/feedback/admin/attachment/:id/:file   查看截图（需 cookie）
 *   GET  /feedback                           提交页
 *   GET  /feedback/admin                     管理页
 *
 * 存储：data/feedback/items.json + data/feedback/attachments/<id>/*
 *       密钥 data/feedback/.secret（首次自动生成，用于签发管理 cookie）
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.FEEDBACK_DIR || path.join(__dirname, 'data', 'feedback');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
const SECRET_FILE = path.join(DATA_DIR, '.secret');
const ADMIN_PASSWORD = process.env.FEEDBACK_ADMIN_PASSWORD || 'Zsq20110810';
const PUBLIC_DIR = path.join(__dirname, 'public', 'feedback');

const MAX_BODY = 12 * 1024 * 1024; // 整包上限 12MB（3 张截图 x 最多约 3.5MB base64）
const MAX_CONTENT = 4000;
const MAX_CONTACT = 120;
const MAX_SHOTS = 3;
const MAX_SHOT_BYTES = 3 * 1024 * 1024;
const COOKIE = 'fb_admin';
// cookie 必须落在站点根：对外路径带 /7fa4-chat 前缀（Caddy handle_path 只在服务端剥掉它），
// 写成 Path=/api/feedback 时浏览器永远匹配不上，管理页会一直 401。
const COOKIE_PATH = '/';
const SESSION_MS = 12 * 60 * 60 * 1000;

const PLATFORMS = new Set(['windows', 'linux', 'web', 'macos', 'android', 'unknown']);
const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

/* ------------------------------------------------------------------ 存储 */

let itemsCache = null;
let itemsCacheMtime = 0;
let writeChain = Promise.resolve();

async function ensureDirs() {
  await fsp.mkdir(ATTACH_DIR, { recursive: true });
}

async function readItems() {
  // 用 mtime 判断缓存是否还有效：手工删过 items.json 时（例如清理自检数据），
  // 进程不重启也能立刻看到空列表，不会继续吐旧数据。
  let mtime = 0;
  try {
    mtime = (await fsp.stat(ITEMS_FILE)).mtimeMs;
  } catch (e) {
    itemsCache = [];
    itemsCacheMtime = 0;
    return itemsCache;
  }
  if (itemsCache && mtime === itemsCacheMtime) return itemsCache;
  try {
    const text = await fsp.readFile(ITEMS_FILE, 'utf8');
    const parsed = JSON.parse(text);
    itemsCache = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    itemsCache = [];
  }
  itemsCacheMtime = mtime;
  return itemsCache;
}

function writeItems(items) {
  itemsCache = items;
  writeChain = writeChain.then(async () => {
    await ensureDirs();
    const tmp = ITEMS_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(items, null, 2));
    await fsp.rename(tmp, ITEMS_FILE);
    try { itemsCacheMtime = (await fsp.stat(ITEMS_FILE)).mtimeMs; } catch (e) { itemsCacheMtime = 0; }
  }).catch((e) => console.error('[feedback] 写入失败', e));
  return writeChain;
}

async function getSecret() {
  try {
    return await fsp.readFile(SECRET_FILE, 'utf8');
  } catch (e) {
    const secret = crypto.randomBytes(32).toString('hex');
    await ensureDirs();
    await fsp.writeFile(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

/* ------------------------------------------------------------------ 工具 */

function sendJson(res, status, payload, extra) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...(extra || {})
  });
  res.end(body);
}

function sendFile(res, status, text, type) {
  const body = Buffer.from(text);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of String(raw).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('body_too_large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', (e) => reject(e));
  });
}

async function readJson(req, limit) {
  const text = await readBody(req, limit);
  try {
    return JSON.parse(text || '{}');
  } catch (e) {
    throw Object.assign(new Error('bad_json'), { code: 400 });
  }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* -------------------------------------------------------------- 限流 */
// 简单内存限流：同一 IP 10 分钟内最多 5 条，防刷。
const rate = new Map();
function allowSubmit(ip) {
  const now = Date.now();
  const hit = rate.get(ip);
  if (!hit || now > hit.resetAt) {
    rate.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (hit.count >= 5) return false;
  hit.count++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, v] of rate) if (now > v.resetAt) rate.delete(ip);
}, 5 * 60 * 1000).unref?.();

/* ---------------------------------------------------------- 管理端登录 */

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

async function issueCookie() {
  const secret = await getSecret();
  const exp = String(Date.now() + SESSION_MS);
  return `${exp}.${sign('admin:' + exp, secret)}`;
}

async function isAuthorized(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const secret = await getSecret();
  const expected = sign('admin:' + exp, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* -------------------------------------------------------------- 提交 */

async function submitFeedback(req, res) {
  const ip = clientIp(req);
  if (!allowSubmit(ip)) {
    sendJson(res, 429, { ok: false, error: '提交太频繁了，请过一会儿再试' });
    return;
  }

  let body;
  try {
    body = await readJson(req, MAX_BODY);
  } catch (e) {
    sendJson(res, e.code === 413 ? 413 : 400, { ok: false, error: e.code === 413 ? '内容太大' : '请求格式错误' });
    return;
  }

  const content = String(body.content || '').trim();
  if (!content) {
    sendJson(res, 400, { ok: false, error: '反馈内容不能为空' });
    return;
  }
  if (content.length > MAX_CONTENT) {
    sendJson(res, 400, { ok: false, error: `反馈内容最多 ${MAX_CONTENT} 字` });
    return;
  }

  const platformRaw = String(body.platform || '').toLowerCase();
  const platform = PLATFORMS.has(platformRaw) ? platformRaw : 'unknown';
  const id = 'f' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');

  // 截图：可选，最多 3 张，base64 内嵌
  const attachments = [];
  const shots = Array.isArray(body.screenshots) ? body.screenshots.slice(0, MAX_SHOTS) : [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i] || {};
    const type = String(shot.type || '').toLowerCase();
    if (!IMAGE_TYPES[type]) continue;
    let buf;
    try {
      buf = Buffer.from(String(shot.data || '').replace(/^data:[^,]*,/, ''), 'base64');
    } catch (e) {
      continue;
    }
    if (!buf.length || buf.length > MAX_SHOT_BYTES) continue;
    const dir = path.join(ATTACH_DIR, id);
    await fsp.mkdir(dir, { recursive: true });
    const file = `shot-${i + 1}${IMAGE_TYPES[type]}`;
    await fsp.writeFile(path.join(dir, file), buf);
    attachments.push({ file, type, size: buf.length, name: String(shot.name || file).slice(0, 120) });
  }

  const item = {
    id,
    createdAt: new Date().toISOString(),
    platform,
    version: String(body.version || '').slice(0, 40),
    contact: String(body.contact || '').slice(0, MAX_CONTACT),
    page: String(body.page || '').slice(0, 200),
    ua: String(req.headers['user-agent'] || '').slice(0, 300),
    ip,
    content,
    status: 'new',
    attachments
  };

  const items = await readItems();
  items.unshift(item);
  await writeItems(items);
  console.log(`[feedback] 新反馈 ${id} platform=${platform} shots=${attachments.length}`);
  sendJson(res, 200, { ok: true, id });
}

/* ---------------------------------------------------------- 管理端接口 */

async function adminApi(req, res, pathname) {
  const sub = pathname.slice('/api/feedback/admin'.length) || '/';

  if (sub === '/login' && req.method === 'POST') {
    let body;
    try {
      body = await readJson(req, 64 * 1024);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: '请求格式错误' });
      return;
    }
    if (!safeEqual(body.password || '', ADMIN_PASSWORD)) {
      sendJson(res, 401, { ok: false, error: '密码错误' });
      return;
    }
    const token = await issueCookie();
    const secure = String(req.headers['x-forwarded-proto'] || '').includes('https');
    sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `${COOKIE}=${token}; HttpOnly; Path=${COOKIE_PATH}; Max-Age=${SESSION_MS / 1000}; SameSite=Lax${secure ? '; Secure' : ''}`
    });
    return;
  }

  if (sub === '/logout' && req.method === 'POST') {
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; Path=${COOKIE_PATH}; Max-Age=0; SameSite=Lax` });
    return;
  }

  if (!(await isAuthorized(req))) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }

  if (sub === '/list' && (req.method === 'GET' || req.method === 'HEAD')) {
    const items = await readItems();
    sendJson(res, 200, {
      ok: true,
      total: items.length,
      newCount: items.filter((it) => it.status !== 'handled').length,
      items: items.map((it) => ({
        ...it,
        attachments: (it.attachments || []).map((a) => ({
          ...a,
          url: `/api/feedback/admin/attachment/${encodeURIComponent(it.id)}/${encodeURIComponent(a.file)}`
        }))
      }))
    });
    return;
  }

  if (sub === '/status' && req.method === 'POST') {
    let body;
    try {
      body = await readJson(req, 8 * 1024);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: '请求格式错误' });
      return;
    }
    const status = body.status === 'handled' ? 'handled' : 'new';
    const items = await readItems();
    const item = items.find((it) => it.id === body.id);
    if (!item) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    item.status = status;
    await writeItems(items);
    sendJson(res, 200, { ok: true });
    return;
  }

  const attMatch = /^\/attachment\/([A-Za-z0-9_-]+)\/([A-Za-z0-9._-]+)$/.exec(sub);
  if (attMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const items = await readItems();
    const item = items.find((it) => it.id === attMatch[1]);
    const meta = item && (item.attachments || []).find((a) => a.file === attMatch[2]);
    if (!meta) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }
    const abs = path.join(ATTACH_DIR, item.id, meta.file);
    try {
      const buf = await fsp.readFile(abs);
      res.writeHead(200, {
        'Content-Type': meta.type,
        'Content-Length': buf.length,
        'Cache-Control': 'private, max-age=3600'
      });
      res.end(buf);
    } catch (e) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not_found' });
}

/* ---------------------------------------------------------------- 页面 */

async function servePage(res, file) {
  try {
    const buf = await fsp.readFile(path.join(PUBLIC_DIR, file));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-cache' });
    res.end(buf);
  } catch (e) {
    sendFile(res, 404, 'Not Found', 'text/plain; charset=utf-8');
  }
}

/* -------------------------------------------------------------- 入口 */

/** @returns {Promise<boolean>} 是否已处理该请求 */
async function handle(req, res, pathname) {
  // 桌面端 / 网页版客户端直接向这里 POST，跨源需要 CORS；只对公开提交口开放，管理口仍限同源 cookie。
  if (pathname === '/api/feedback' && (req.method === 'POST' || req.method === 'OPTIONS')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }
    await submitFeedback(req, res);
    return true;
  }
  if (pathname.startsWith('/api/feedback/admin')) {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return true;
    }
    await adminApi(req, res, pathname);
    return true;
  }
  if (pathname === '/feedback' || pathname === '/feedback/') {
    await servePage(res, 'index.html');
    return true;
  }
  if (pathname === '/feedback/admin' || pathname === '/feedback/admin/') {
    await servePage(res, 'admin.html');
    return true;
  }
  return false;
}

module.exports = { handle, DATA_DIR };
