'use strict';
// ============================================================
// 管理员账户库（admins.json）
//
// 背景：原实现把管理员密码交给 nginx 的 htpasswd 静态校验，后端只是被动签发会话 Cookie，
// 没有任何账户概念，因此无法「在界面上创建/管理其他管理员」。
// 本模块建立真正的账户存储：用户名 + scrypt 加盐哈希 + 角色 + 状态。
//
// 安全要点：
//  - 密码只存 scrypt 哈希（salt 随机、逐账户独立），永不明文、永不落日志。
//  - 校验用 timingSafeEqual 防时序侧信道。
//  - 原子写（tmp + rename），避免进程中断写坏账户库把自己锁在外面。
//  - 权限分级：super（可管账户） / ops（只能管内容）。
//  - 不变式：系统必须**始终至少有一个启用状态的 super**，否则拒绝降级/删除/禁用，
//    防止把最后一个超级管理员弄没导致永久锁死。
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ACCOUNTS_FILE = path.join(__dirname, 'admins.json');

// scrypt 参数：N=16384 是 Node 默认，64MB 内存上限足够，单次校验 ~50ms 可接受
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

const ROLES = ['super', 'ops'];
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

// ---------- 存储 ----------
function loadRaw() {
  try {
    const obj = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    if (!obj || typeof obj !== 'object') return { version: 1, accounts: {} };
    if (!obj.accounts || typeof obj.accounts !== 'object') obj.accounts = {};
    return obj;
  } catch {
    return { version: 1, accounts: {} };
  }
}

function saveRaw(obj) {
  const tmp = ACCOUNTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ACCOUNTS_FILE);
}

// ---------- 密码哈希 ----------
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(password), s, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return { algo: 'scrypt', salt: s, hash: dk.toString('hex'), N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p };
}

function verifyPassword(password, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  try {
    const dk = crypto.scryptSync(String(password), rec.salt, KEY_LEN, {
      N: rec.N || SCRYPT_N, r: rec.r || SCRYPT_r, p: rec.p || SCRYPT_p,
    });
    const expect = Buffer.from(rec.hash, 'hex');
    // 长度不等时 timingSafeEqual 会抛，先挡掉
    if (expect.length !== dk.length) return false;
    return crypto.timingSafeEqual(expect, dk);
  } catch {
    return false;
  }
}

// ---------- 不变式 ----------
function activeSupers(obj) {
  return Object.values(obj.accounts).filter((a) => a && a.role === 'super' && a.status === 'active');
}

/** 脱敏视图：绝不下发 salt / hash */
function publicView(a) {
  return {
    username: a.username,
    role: a.role,
    status: a.status,
    display_name: a.display_name || '',
    note: a.note || '',
    created_at: a.created_at || 0,
    created_by: a.created_by || '',
    last_login_at: a.last_login_at || 0,
    password_changed_at: a.password_changed_at || 0,
  };
}

function list() {
  const obj = loadRaw();
  return Object.values(obj.accounts)
    .map(publicView)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

function get(username) {
  const obj = loadRaw();
  const a = obj.accounts[String(username || '').toLowerCase()];
  return a ? publicView(a) : null;
}

function count() {
  return Object.keys(loadRaw().accounts).length;
}

// ---------- 变更操作 ----------
// 统一返回 { ok:true, account } 或 { ok:false, code, message }
function fail(code, message) { return { ok: false, code, message }; }

function validatePassword(pw) {
  const s = String(pw || '');
  if (s.length < 8) return '密码至少 8 位';
  if (s.length > 200) return '密码过长';
  return '';
}

/**
 * 创建账户。actor 为操作者用户名（'cli' 表示命令行救援）。
 */
function create({ username, password, role = 'ops', display_name = '', note = '', actor = 'cli' } = {}) {
  const name = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(name)) return fail('bad_username', '用户名只能含字母/数字/下划线/点/连字符，长度 3-32');
  const pwErr = validatePassword(password);
  if (pwErr) return fail('bad_password', pwErr);
  if (ROLES.indexOf(role) < 0) return fail('bad_role', '角色只能是 ' + ROLES.join(' / '));

  const obj = loadRaw();
  if (obj.accounts[name]) return fail('exists', '该用户名已存在');

  obj.accounts[name] = {
    username: name,
    role,
    status: 'active',
    display_name: String(display_name || '').slice(0, 64),
    note: String(note || '').slice(0, 200),
    created_at: Date.now(),
    created_by: String(actor || '').slice(0, 32),
    ...hashPassword(password),
  };
  saveRaw(obj);
  return { ok: true, account: publicView(obj.accounts[name]) };
}

/**
 * 删除账户。invariant：不能删掉最后一个启用 super。
 */
function remove(username, actor = 'cli') {
  const name = String(username || '').trim().toLowerCase();
  const obj = loadRaw();
  const rec = obj.accounts[name];
  if (!rec) return fail('not_found', '账户不存在');
  if (rec.role === 'super' && rec.status === 'active' && activeSupers(obj).length <= 1) {
    return fail('last_super', '不能删除最后一个启用的超级管理员');
  }
  delete obj.accounts[name];
  saveRaw(obj);
  return { ok: true, username: name };
}

/**
 * 更新账户（角色 / 状态 / 显示名 / 备注）。password 单独走 setPassword。
 */
function update(username, patch = {}, actor = 'cli') {
  const name = String(username || '').trim().toLowerCase();
  const obj = loadRaw();
  const rec = obj.accounts[name];
  if (!rec) return fail('not_found', '账户不存在');

  const nextRole = patch.role !== undefined ? String(patch.role) : rec.role;
  const nextStatus = patch.status !== undefined ? String(patch.status) : rec.status;
  if (ROLES.indexOf(nextRole) < 0) return fail('bad_role', '角色不合法');
  if (['active', 'disabled'].indexOf(nextStatus) < 0) return fail('bad_status', '状态不合法');

  // 会把「最后一个启用 super」降格 / 禁用 → 拒绝
  const losingSuper =
    rec.role === 'super' && rec.status === 'active' &&
    (nextRole !== 'super' || nextStatus !== 'active');
  if (losingSuper && activeSupers(obj).length <= 1) {
    return fail('last_super', '不能降级或禁用最后一个启用的超级管理员');
  }

  rec.role = nextRole;
  rec.status = nextStatus;
  if (patch.display_name !== undefined) rec.display_name = String(patch.display_name || '').slice(0, 64);
  if (patch.note !== undefined) rec.note = String(patch.note || '').slice(0, 200);
  rec.updated_at = Date.now();
  saveRaw(obj);
  return { ok: true, account: publicView(rec) };
}

/**
 * 重置密码。actor='cli' 或操作者用户名。
 */
function setPassword(username, password, actor = 'cli') {
  const name = String(username || '').trim().toLowerCase();
  const pwErr = validatePassword(password);
  if (pwErr) return fail('bad_password', pwErr);
  const obj = loadRaw();
  const rec = obj.accounts[name];
  if (!rec) return fail('not_found', '账户不存在');
  Object.assign(rec, hashPassword(password));
  rec.password_changed_at = Date.now();
  rec.password_changed_by = String(actor || '').slice(0, 32);
  saveRaw(obj);
  return { ok: true, username: name };
}

/**
 * 校验登录。成功返回 { ok:true, account }，失败 { ok:false, reason }。
 * reason 不区分「用户不存在」与「密码错误」，避免用户名枚举。
 */
function authenticate(username, password) {
  const name = String(username || '').trim().toLowerCase();
  const obj = loadRaw();
  const rec = obj.accounts[name];
  if (!rec) {
    // 不存在也走一次哈希，抹平响应时间差（防用户名枚举）
    hashPassword(String(password || ''), '0'.repeat(32));
    return { ok: false, reason: 'invalid' };
  }
  if (!verifyPassword(password, rec)) return { ok: false, reason: 'invalid' };
  if (rec.status !== 'active') return { ok: false, reason: 'disabled' };
  rec.last_login_at = Date.now();
  saveRaw(obj);
  return { ok: true, account: publicView(rec) };
}

/**
 * 引导：账户库为空时创建初始超级管理员。
 * 仅由 CLI 调用（不暴露网络入口），密码由运维在命令行提供。
 */
function ensureBootstrap(username, password) {
  const obj = loadRaw();
  if (Object.keys(obj.accounts).length > 0) return fail('not_empty', '账户库非空，跳过引导');
  return create({ username, password, role: 'super', actor: 'bootstrap', display_name: '初始超级管理员' });
}

module.exports = {
  ACCOUNTS_FILE,
  ROLES,
  list,
  get,
  count,
  create,
  remove,
  update,
  setPassword,
  authenticate,
  ensureBootstrap,
  // 供测试注入
  _internal: { hashPassword, verifyPassword, loadRaw, activeSupers },
  // 供兼容层复用：旧会话 Cookie 也走这里查账户是否存在且启用
  isActive(username) {
    const a = get(username);
    return !!(a && a.status === 'active');
  },
};
