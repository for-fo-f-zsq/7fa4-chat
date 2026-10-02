'use strict';
// ============================================================
// 系统配置（config.json）
//
// 目标：把原先写死在代码里的可调参数搬到后台界面，改完**热生效**（无需重启进程）。
// 做法：定义 schema（键 / 类型 / 范围 / 默认值 / 说明），读取时与默认值合并，
//      写入时逐项校验。任何一项非法就整体拒绝，避免半套配置生效。
// ============================================================
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');

// 每项：type 决定校验方式；min/max 约束数值；choices 约束枚举
const SCHEMA = {
  poll_interval_ms: {
    type: 'number', min: 2000, max: 300000, default: 15000,
    label: '后台轮询间隔', unit: 'ms',
    desc: '管理后台自动拉取数据的间隔。过小会增加服务器压力，建议 ≥10000。',
  },
  poster_max_size_kb: {
    type: 'number', min: 128, max: 8192, default: 2048, unit: 'KB',
    label: '海报图片大小上限',
    desc: '投稿海报解码后的字节上限。改动需同步调整 nginx client_max_body_size。',
  },
  poster_list_max: {
    type: 'number', min: 10, max: 1000, default: 200,
    label: '海报公开列表条数上限',
    desc: '公开接口最多返回多少张海报。',
  },
  poster_min_interval_sec: {
    type: 'number', min: 0, max: 3600, default: 60, unit: '秒',
    label: '海报投稿限频',
    desc: '同一用户两次投稿的最小间隔，0 表示不限频。',
  },
  startup_poster_enabled: {
    type: 'boolean', default: true,
    label: '启用开屏海报',
    desc: '关闭后客户端启动不再展示开屏海报。',
  },
  startup_poster_duration_ms: {
    type: 'number', min: 0, max: 30000, default: 3000, unit: 'ms',
    label: '开屏海报停留时长',
    desc: '开屏海报强制停留时长，0 表示可立即关闭。',
  },
  register_enabled: {
    type: 'boolean', default: true,
    label: '开放账户登录',
    desc: '关闭后所有管理员都暂时无法登录（仅 CLI 可恢复），请谨慎使用。',
  },
  audit_keep_days: {
    type: 'number', min: 1, max: 3650, default: 90, unit: '天',
    label: '审计日志保留天数',
    desc: '超过该天数的审计记录会被自动清理。',
  },
  site_notice: {
    type: 'string', maxLen: 500, default: '',
    label: '后台公告',
    desc: '显示在管理后台顶部的提示（留空则不显示）。',
  },
};

function defaults() {
  const out = {};
  for (const [k, v] of Object.entries(SCHEMA)) out[k] = v.default;
  return out;
}

function loadRaw() {
  try {
    const obj = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

/** 与默认值合并后的完整配置 */
function get() {
  return Object.assign(defaults(), loadRaw());
}

function saveRaw(obj) {
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}

function coerce(key, raw) {
  const spec = SCHEMA[key];
  if (!spec) return { ok: false, message: `未知配置项: ${key}` };
  if (spec.type === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };
    if (raw === 'true' || raw === 1 || raw === '1') return { ok: true, value: true };
    if (raw === 'false' || raw === 0 || raw === '0') return { ok: true, value: false };
    return { ok: false, message: `${key} 需要布尔值` };
  }
  if (spec.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, message: `${key} 需要数字` };
    if (spec.min !== undefined && n < spec.min) return { ok: false, message: `${key} 不能小于 ${spec.min}` };
    if (spec.max !== undefined && n > spec.max) return { ok: false, message: `${key} 不能大于 ${spec.max}` };
    return { ok: true, value: Math.round(n) };
  }
  if (spec.type === 'string') {
    const s = String(raw == null ? '' : raw);
    if (spec.maxLen && s.length > spec.maxLen) return { ok: false, message: `${key} 长度不能超过 ${spec.maxLen}` };
    return { ok: true, value: s };
  }
  return { ok: false, message: `${key} 类型不支持` };
}

/**
 * 批量更新。任一项非法则整体拒绝（避免半套配置生效）。
 * @returns {{ok:boolean, config?:object, message?:string}}
 */
function update(patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, message: '参数不合法' };
  const next = loadRaw();
  const applied = {};
  for (const [k, v] of Object.entries(patch)) {
    const r = coerce(k, v);
    if (!r.ok) return { ok: false, message: r.message };
    next[k] = r.value;
    applied[k] = r.value;
  }
  saveRaw(next);
  return { ok: true, config: get(), applied };
}

/** 重置为默认值（清空覆盖项） */
function reset(keys) {
  if (!keys || !keys.length) {
    saveRaw({});
    return { ok: true, config: get() };
  }
  const next = loadRaw();
  for (const k of keys) {
    if (!SCHEMA[k]) return { ok: false, message: `未知配置项: ${k}` };
    delete next[k];
  }
  saveRaw(next);
  return { ok: true, config: get() };
}

/** 带元信息（供后台渲染表单） */
function describe() {
  const cfg = get();
  return Object.entries(SCHEMA).map(([key, spec]) => ({
    key,
    value: cfg[key],
    type: spec.type,
    label: spec.label || key,
    desc: spec.desc || '',
    unit: spec.unit || '',
    min: spec.min,
    max: spec.max,
    maxLen: spec.maxLen,
    default: spec.default,
    isDefault: cfg[key] === spec.default,
  }));
}

module.exports = { SCHEMA, CONFIG_FILE, list: describe, get, update, reset, defaults, _coerce: coerce };
