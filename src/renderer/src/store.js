import { reactive } from 'vue';

// ========== 响应式数据面约定（性能） ==========
// store 是整棵组件树的依赖源，**任何一次无意义的写入都会触发一串重算/重渲染**，所以：
//   1) 会话（users/groups）与消息容器一律「原地增量」更新，不再整份替换：
//      - 新条目才插入，真正变化的条目才写入，删除的条目才 delete；
//      - 未变化的条目保持同一对象引用（见 syncKeyedCollection / pickReusableObject）；
//   2) 写入前先比较，相同值不赋值（Object.assign 同样会走到 set 钩子，值相同时 Vue 会
//      跳过 trigger，但逐字段比较能省掉一趟 avoidable 的 proxy 往返）；
//   3) 连接状态的 _trackAt/_trackState 只是记账用的游标，不参与渲染：放在模块作用域，
//      不写进响应式对象，避免每次 updateConnStatus 都触发 connStatus 依赖方重算。
export const store = reactive({
  self: { uid: null, username: null, nickname: null, realname: null },
  users: {},
  groups: {},
  messages: {},
  stickers: [],
  drafts: {},           // 草稿 { 'user_123': 'text', 'group_456': 'text' }
  mutedConvos: {},      // 免打扰会话 { 'user_123': true }
  hiddenConvos: {},     // 隐藏（不显示）的会话：默认列表过滤，搜索时仍可搜到 { 'user_123': true }
  pinnedConvos: {},     // 置顶会话 { 'user_123': true, 'group_456': true }（桌面/网页统一持久化）
  ownVotes: [],         // 己方投票记录 [{ id, send_time, free }]（24h 内，用于 Token 恢复口径一致）
  pageType: null,
  pageId: null,
  currentGroupId: null,
  setting: {},
  logined: false,        // 是否已登录（默认未登录）
  guestMode: true,       // 游客模式：默认启动即进入主界面（聊天不可用，工具/设置/关于可浏览）；仅主动"去登录"才显示登录页
  initializing: false,  // 首次运行/清缓存后，加载消息期间锁定主界面（由加载序列置位）
  loadingConvoKey: '',  // 当前正在异步加载消息的会话键（'user:123' / 'group:456'）
  fetchNewCount: 0,    // 爬取消息时本轮已获取的新消息数（加载提示展示用）
  online: true,         // 网络在线状态（navigator + API 轮询结果综合）
  netError: false,      // API 层网络异常/会话失效标记（html 响应、fetch 失败均置位），用于"未连接"横幅
  connStatus: {
    state: 'ok',        // 'ok' | 'connecting' | 'reconnecting' | 'offline' | 'rejected'
    online: true,
    apiReachable: true,
    sessionValid: true,
    lastSyncAt: 0,
    lastInfoAt: 0,
    latencyMs: null,
    failCount: 0,
    retryCooldownUntil: 0,
    lastError: '',
    hourly: [],         // 按小时聚合 [{ hourTs, okMs, degradedMs, downMs, latencySum, latencyCount }]（保留最多 72 小时，从旧到新）
    events: [],         // 状态变更日志 [{ ts, state, title, detail }]（最多 30 条，最新在前）
  },
  multiSelectMode: false, // 多选模式
  selectedMsgIds: [],   // 多选选中的消息ID
  tokenLimit: null,     // /chat/info 的 limit：{ time_limit(秒=恢复周期), count_limit(最大token数), ... }
  // 更新检查（仅非 Electron：网页端/安卓端由 utils.checkAppUpdate 写入；桌面端交给 electron-updater）
  update: {
    checked: false,
    checking: false,
    current: '',        // 当前客户端版本
    latest: '',         // 服务端最新版本
    hasUpdate: false,
    apkUrl: '',         // 安卓端 APK 直链
    apkSize: 0,
    error: ''
  },
  notices: [],
});

const HOUR_MS = 3600 * 1000;
const CONN_HOURS_MAX = 72;
const CONN_EVENTS_MAX = 30;
const CONN_TRACK_STEP_MAX_MS = 120 * 1000;
const CONN_PERSIST_INTERVAL_MS = 30 * 1000;
const CONN_HISTORY_STORAGE_KEY = '7fa4_conn_history_v1';

const CONN_STATE_LABELS = {
  ok: '服务连接正常',
  connecting: '正在建立连接',
  reconnecting: '连接异常，尝试重连',
  offline: '网络离线',
  rejected: '登录会话被拒绝或失效',
};

let connHistoryLoaded = false;
let lastPersistAt = 0;
// 状态记账游标：只服务 updateConnStatus / getConnHourlySnapshot 的时长累计，
// 不进响应式对象（否则每次采样都会让依赖 connStatus 的面板重算）。
let connTrackAt = 0;
let connTrackState = '';

function hourStartOf(ts) {
  return Math.floor(Number(ts) / HOUR_MS) * HOUR_MS;
}

function normalizeHourlyBucket(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const hourTs = Number(raw.hourTs);
  if (!Number.isFinite(hourTs) || hourTs <= 0) return null;
  return {
    hourTs,
    okMs: Math.max(0, Number(raw.okMs) || 0),
    degradedMs: Math.max(0, Number(raw.degradedMs) || 0),
    downMs: Math.max(0, Number(raw.downMs) || 0),
    latencySum: Math.max(0, Number(raw.latencySum) || 0),
    latencyCount: Math.max(0, Number(raw.latencyCount) || 0),
  };
}

function pruneOldHourlyBuckets(list, now = Date.now()) {
  const cutoff = hourStartOf(now) - (CONN_HOURS_MAX - 1) * HOUR_MS;
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const b = normalizeHourlyBucket(item);
    if (!b || b.hourTs < cutoff) continue;
    const prev = map.get(b.hourTs);
    if (!prev) {
      map.set(b.hourTs, b);
    } else {
      prev.okMs += b.okMs;
      prev.degradedMs += b.degradedMs;
      prev.downMs += b.downMs;
      prev.latencySum += b.latencySum;
      prev.latencyCount += b.latencyCount;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.hourTs - b.hourTs);
}

function ensureHourlyBucket(hourly, hourTs) {
  let bucket = hourly.find((b) => b.hourTs === hourTs);
  if (!bucket) {
    bucket = { hourTs, okMs: 0, degradedMs: 0, downMs: 0, latencySum: 0, latencyCount: 0 };
    hourly.push(bucket);
    hourly.sort((a, b) => a.hourTs - b.hourTs);
  }
  return bucket;
}

function sameHourlyList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (x === y) continue;
    if (x.hourTs !== y.hourTs
      || x.okMs !== y.okMs
      || x.degradedMs !== y.degradedMs
      || x.downMs !== y.downMs
      || x.latencySum !== y.latencySum
      || x.latencyCount !== y.latencyCount) return false;
  }
  return true;
}

/** 只写真正变化的字段：同值不赋值，避免无谓的响应式 set/trigger。返回是否有字段变化。 */
export function assignChanged(target, patch) {
  if (!target || !patch) return false;
  let changed = false;
  for (const key of Object.keys(patch)) {
    const next = patch[key];
    if (!Object.is(target[key], next)) {
      target[key] = next;
      changed = true;
    }
  }
  return changed;
}

/**
 * 浅比较后决定能否复用旧对象：键集合完全一致且逐字段 Object.is 相等时返回旧对象。
 * 键集合不同（旧对象上带着本层不认识的外来字段，如 show / lastReadId）一律不复用，
 * 保证「整份替换时会把多余字段丢掉」这一原有语义不变。
 */
export function pickReusableObject(oldObj, nextObj) {
  if (!oldObj || !nextObj || oldObj === nextObj) return oldObj || nextObj;
  if (typeof oldObj !== 'object' || typeof nextObj !== 'object') return nextObj;
  const oldKeys = Object.keys(oldObj);
  const nextKeys = Object.keys(nextObj);
  if (oldKeys.length !== nextKeys.length) return nextObj;
  for (const key of nextKeys) {
    if (!Object.is(oldObj[key], nextObj[key])) return nextObj;
  }
  return oldObj;
}

/**
 * 把 next（key → 对象）原地同步进 target：
 *   - next 里的值与 target 相同（同一个对象引用）时不赋值，该键的依赖方不会重算；
 *   - 只有变化/新增的键才重新赋值，next 里没有的键才删除。
 * 语义等价于 `target = { ...next }`，但不换容器对象，也不会让整个集合的依赖方
 * （会话列表、未读角标）因为「容器换了新对象」而全量重算。
 * 「未变化条目保持原对象引用」由调用方先经 pickReusableObject 决定（值相同的旧对象
 * 直接放进 next），本函数只负责把这份 next 无浪费地落盘。
 */
export function syncKeyedCollection(target, next) {
  if (!target || !next) return;
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) delete target[key];
  }
  for (const key of Object.keys(next)) {
    const value = next[key];
    if (target[key] !== value) target[key] = value;
  }
}

function accrueIntervalToHourly(hourly, fromTs, toTs, state) {
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) return;
  const field = state === 'ok'
    ? 'okMs'
    : (state === 'offline' || state === 'rejected' ? 'downMs' : 'degradedMs');
  let cursor = fromTs;
  while (cursor < toTs) {
    const hTs = hourStartOf(cursor);
    const nextH = hTs + HOUR_MS;
    const end = Math.min(toTs, nextH);
    const slice = end - cursor;
    if (slice > 0) {
      const bucket = ensureHourlyBucket(hourly, hTs);
      bucket[field] = Math.min(HOUR_MS, (bucket[field] || 0) + slice);
    }
    cursor = end;
  }
}

function persistConnHistory(force = false, now = Date.now()) {
  if (!force && now - lastPersistAt < CONN_PERSIST_INTERVAL_MS) return;
  lastPersistAt = now;
  try {
    if (typeof localStorage === 'undefined') return;
    const cs = store.connStatus;
    if (!cs) return;
    const payload = {
      hourly: pruneOldHourlyBuckets(cs.hourly, now),
      events: Array.isArray(cs.events) ? cs.events.slice(0, CONN_EVENTS_MAX) : [],
    };
    localStorage.setItem(CONN_HISTORY_STORAGE_KEY, JSON.stringify(payload));
  } catch { /* ignore storage quota/unavailable */ }
}

export function loadConnStatusHistory() {
  if (connHistoryLoaded) return;
  connHistoryLoaded = true;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(CONN_HISTORY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const cs = store.connStatus;
    if (!cs || !parsed || typeof parsed !== 'object') return;
    cs.hourly = pruneOldHourlyBuckets([...(cs.hourly || []), ...(parsed.hourly || [])]);
    if (Array.isArray(parsed.events) && !cs.events.length) {
      cs.events = parsed.events
        .filter((e) => e && typeof e === 'object' && e.ts)
        .slice(0, CONN_EVENTS_MAX);
    }
  } catch { /* ignore invalid cache */ }
}

export function updateConnStatus(patch = {}, opts = {}) {
  if (!store.logined) return;
  const cs = store.connStatus;
  if (!cs) return;
  loadConnStatusHistory();
  if (!Array.isArray(cs.hourly)) cs.hourly = [];
  if (!Array.isArray(cs.events)) cs.events = [];

  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  const prevState = cs.state;
  const prevError = cs.lastError || '';

  if (connTrackAt > 0 && connTrackState) {
    const rawElapsed = Math.max(0, now - connTrackAt);
    const maxStep = Number(opts.maxStepMs) || CONN_TRACK_STEP_MAX_MS;
    const accruedElapsed = Math.min(rawElapsed, maxStep);
    if (accruedElapsed > 0) {
      accrueIntervalToHourly(cs.hourly, now - accruedElapsed, now, connTrackState);
      const pruned = pruneOldHourlyBuckets(cs.hourly, now);
      // 只在真的有桶被裁掉/合并时才换数组：否则每小时都会因为新数组身份让图表重算。
      if (!sameHourlyList(cs.hourly, pruned)) cs.hourly = pruned;
    }
  }

  assignChanged(cs, patch);
  const nextState = cs.state || 'ok';
  connTrackAt = now;
  connTrackState = nextState;

  if (patch.latencyMs !== undefined && Number.isFinite(Number(patch.latencyMs)) && Number(patch.latencyMs) >= 0) {
    const bucket = ensureHourlyBucket(cs.hourly, hourStartOf(now));
    bucket.latencySum += Number(patch.latencyMs);
    bucket.latencyCount += 1;
  }

  const nextError = cs.lastError || '';
  const stateChanged = prevState !== nextState;
  const newError = Boolean(nextError && nextError !== prevError && nextState !== 'ok');

  if (opts.forceEvent || stateChanged || newError) {
    const title = opts.title || CONN_STATE_LABELS[nextState] || nextState;
    const detail = opts.detail !== undefined
      ? opts.detail
      : (nextError || (nextState === 'ok' && cs.latencyMs != null ? `延迟 ${Math.round(cs.latencyMs)} ms` : ''));
    const lastEvt = cs.events[0];
    if (!lastEvt || lastEvt.state !== nextState || lastEvt.title !== title || lastEvt.detail !== detail || now - lastEvt.ts >= 3000) {
      cs.events.unshift({ ts: now, state: nextState, title, detail });
      if (cs.events.length > CONN_EVENTS_MAX) cs.events.length = CONN_EVENTS_MAX;
    }
  }

  persistConnHistory(Boolean(opts.forcePersist || opts.forceEvent || stateChanged || newError), now);
}

export function flushConnStatusHistory(now = Date.now()) {
  if (!store.logined) return;
  const cs = store.connStatus;
  if (!cs) return;
  if (connTrackAt > 0 && connTrackState) {
    updateConnStatus({}, { now, forcePersist: true });
  } else {
    persistConnHistory(true, now);
  }
}

export function getConnHourlySnapshot(hours = 24, now = Date.now()) {
  loadConnStatusHistory();
  const cs = store.connStatus;
  const count = Math.max(1, Math.min(CONN_HOURS_MAX, Number(hours) || 24));
  const currentHour = hourStartOf(now);
  const startHour = currentHour - (count - 1) * HOUR_MS;
  const map = new Map();

  for (const item of (cs && Array.isArray(cs.hourly)) ? cs.hourly : []) {
    if (!item || item.hourTs < startHour || item.hourTs > currentHour) continue;
    map.set(item.hourTs, { ...item });
  }

  if (cs && connTrackAt > 0 && connTrackState && now > connTrackAt) {
    const elapsed = Math.min(Math.max(0, now - connTrackAt), CONN_TRACK_STEP_MAX_MS);
    if (elapsed > 0) {
      const tempList = Array.from(map.values());
      accrueIntervalToHourly(tempList, now - elapsed, now, connTrackState);
      for (const b of tempList) map.set(b.hourTs, b);
    }
  }

  const result = [];
  for (let i = 0; i < count; i++) {
    const hTs = startHour + i * HOUR_MS;
    const raw = map.get(hTs);
    const okMs = raw ? raw.okMs : 0;
    const degradedMs = raw ? raw.degradedMs : 0;
    const downMs = raw ? raw.downMs : 0;
    const totalMs = okMs + degradedMs + downMs;
    const uptimePct = totalMs > 0 ? Math.min(100, (okMs / totalMs) * 100) : null;
    const avgLatencyMs = raw && raw.latencyCount > 0 ? Math.round(raw.latencySum / raw.latencyCount) : null;
    result.push({
      hourTs: hTs,
      okMs,
      degradedMs,
      downMs,
      totalMs,
      uptimePct,
      avgLatencyMs,
    });
  }
  return result;
}

export function resetConnStatusHistory({ clearStorage = true } = {}) {
  connHistoryLoaded = clearStorage;
  lastPersistAt = 0;
  connTrackAt = 0;
  connTrackState = '';
  if (store.connStatus) {
    store.connStatus.hourly = [];
    store.connStatus.events = [];
  }
  if (clearStorage) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(CONN_HISTORY_STORAGE_KEY);
    } catch {}
  }
}
