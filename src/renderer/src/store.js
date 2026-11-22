import { reactive } from 'vue';

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
    _trackAt: 0,
    _trackState: '',
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
  const cs = store.connStatus;
  if (!cs) return;
  loadConnStatusHistory();
  if (!Array.isArray(cs.hourly)) cs.hourly = [];
  if (!Array.isArray(cs.events)) cs.events = [];

  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  const prevState = cs.state;
  const prevError = cs.lastError || '';

  if (cs._trackAt > 0 && cs._trackState) {
    const rawElapsed = Math.max(0, now - cs._trackAt);
    const maxStep = Number(opts.maxStepMs) || CONN_TRACK_STEP_MAX_MS;
    const accruedElapsed = Math.min(rawElapsed, maxStep);
    if (accruedElapsed > 0) {
      accrueIntervalToHourly(cs.hourly, now - accruedElapsed, now, cs._trackState);
      cs.hourly = pruneOldHourlyBuckets(cs.hourly, now);
    }
  }

  Object.assign(cs, patch);
  const nextState = cs.state || 'ok';
  cs._trackAt = now;
  cs._trackState = nextState;

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
  const cs = store.connStatus;
  if (!cs) return;
  if (cs._trackAt > 0 && cs._trackState) {
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

  if (cs && cs._trackAt > 0 && cs._trackState && now > cs._trackAt) {
    const elapsed = Math.min(Math.max(0, now - cs._trackAt), CONN_TRACK_STEP_MAX_MS);
    if (elapsed > 0) {
      const tempList = Array.from(map.values());
      accrueIntervalToHourly(tempList, now - elapsed, now, cs._trackState);
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
  if (store.connStatus) {
    store.connStatus.hourly = [];
    store.connStatus.events = [];
    store.connStatus._trackAt = 0;
    store.connStatus._trackState = '';
  }
  if (clearStorage) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(CONN_HISTORY_STORAGE_KEY);
    } catch {}
  }
}
