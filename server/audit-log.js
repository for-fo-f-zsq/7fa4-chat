'use strict';
// ============================================================
// 审计日志（audit.json）
//
// 多管理员场景下，「谁把这张海报下架了」「谁删了那条反馈」必须可追溯。
// 每条记录：时间 / 操作者 / 动作 / 目标 / 结果 / 摘要 / IP。
//
// 设计取舍：
//  - 追加写（unshift 到头部）+ 容量上限，天然按时间倒序，读取无需排序。
//  - 达到上限时丢弃最旧记录（审计日志是回溯工具，不需要无限增长）。
//  - 写入失败绝不影响主流程（审计不能成为业务故障源）→ 全部 try/catch 吞掉。
//  - 异步写（setImmediate 批次），避免每次操作都同步落盘拖慢响应。
// ============================================================
const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, 'audit.json');
const MAX_ENTRIES = 5000;

let queue = [];
let flushing = false;

function loadRaw() {
  try {
    const arr = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function load() {
  // 把尚未落盘的在途记录也带出来，保证界面读到的是最新状态
  return queue.concat(loadRaw());
}

function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  setImmediate(() => {
    try {
      const merged = queue.concat(loadRaw()).slice(0, MAX_ENTRIES);
      const tmp = AUDIT_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
      fs.renameSync(tmp, AUDIT_FILE);
      queue = [];
    } catch (e) {
      // 落盘失败：保留队列，下次再试；绝不抛出
      console.error('[audit] flush failed:', e.message);
    } finally {
      flushing = false;
      if (queue.length) flush();
    }
  });
}

/**
 * 记一条审计。
 * @param {object} entry
 * @param {string} entry.actor    操作者用户名（'cli' / 'anonymous' 亦可）
 * @param {string} entry.action   动作标识，如 'poster.review' / 'account.create'
 * @param {string} [entry.target] 目标标识，如 'poster#12' / 'user:alice'
 * @param {string} [entry.result] 'ok' | 'denied' | 'failed'
 * @param {string} [entry.detail] 人类可读摘要
 * @param {string} [entry.ip]     来源 IP
 */
function log(entry) {
  try {
    const rec = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      at: Date.now(),
      at_text: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      actor: String((entry && entry.actor) || 'anonymous').slice(0, 64),
      action: String((entry && entry.action) || 'unknown').slice(0, 64),
      target: String((entry && entry.target) || '').slice(0, 128),
      result: String((entry && entry.result) || 'ok').slice(0, 16),
      detail: String((entry && entry.detail) || '').slice(0, 500),
      ip: String((entry && entry.ip) || '').slice(0, 64),
    };
    queue.unshift(rec);
    flush();
    return rec;
  } catch {
    return null;
  }
}

/**
 * 查询。支持按操作者 / 动作前缀 / 结果 / 时间范围过滤 + 限制条数。
 */
function query({ actor, action, result, since, until, limit = 200, offset = 0 } = {}) {
  let list = load();
  if (actor) list = list.filter((r) => r.actor === actor);
  if (action) list = list.filter((r) => r.action === action || r.action.startsWith(action + '.'));
  if (result) list = list.filter((r) => r.result === result);
  if (since) list = list.filter((r) => r.at >= since);
  if (until) list = list.filter((r) => r.at <= until);
  const total = list.length;
  return { total, items: list.slice(offset, offset + Math.min(limit, 500)) };
}

/** 清理超过保留天数的记录 */
function prune(keepDays) {
  try {
    const cutoff = Date.now() - Math.max(1, Number(keepDays) || 90) * 86400000;
    const all = load();
    const kept = all.filter((r) => r.at >= cutoff);
    const tmp = AUDIT_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(kept, null, 2));
    fs.renameSync(tmp, AUDIT_FILE);
    queue = [];
    return { removed: all.length - kept.length, kept: kept.length };
  } catch (e) {
    return { removed: 0, kept: 0, error: e.message };
  }
}

/** 动作的中文名（界面展示用）。未知动作回落原标识。 */
const ACTION_LABELS = {
  'auth.login': '登录',
  'auth.logout': '登出',
  'auth.login_failed': '登录失败',
  'poster.review': '审核海报',
  'poster.delete': '删除海报',
  'poster.pin': '置顶海报',
  'feedback.delete': '删除反馈',
  'account.create': '创建账户',
  'account.update': '修改账户',
  'account.delete': '删除账户',
  'account.reset_password': '重置密码',
  'config.update': '修改配置',
  'config.reset': '重置配置',
};

function actionLabel(a) {
  return ACTION_LABELS[a] || a;
}

module.exports = { AUDIT_FILE, log, query, prune, load, ACTION_LABELS, actionLabel, MAX_ENTRIES };
