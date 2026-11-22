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
    history: [],        // 近期状态采样 [{ ts, state, latencyMs, error }]（最多 40 条，从旧到新）
    events: [],         // 状态变更日志 [{ ts, state, title, detail }]（最多 15 条，最新在前）
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

const CONN_HISTORY_MAX = 40;
const CONN_EVENTS_MAX = 15;
const CONN_SAMPLE_INTERVAL_MS = 15000;

const CONN_STATE_LABELS = {
  ok: '服务连接正常',
  connecting: '正在建立连接',
  reconnecting: '连接异常，尝试重连',
  offline: '网络离线',
  rejected: '登录会话被拒绝或失效',
};

export function updateConnStatus(patch = {}, opts = {}) {
  const cs = store.connStatus;
  if (!cs) return;
  if (!Array.isArray(cs.history)) cs.history = [];
  if (!Array.isArray(cs.events)) cs.events = [];

  const prevState = cs.state;
  const prevError = cs.lastError || '';
  Object.assign(cs, patch);

  const now = Date.now();
  const nextState = cs.state || 'ok';
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

  const lastSample = cs.history[cs.history.length - 1];
  const sampleMode = opts.sample;
  const shouldSample =
    sampleMode === 'force' ||
    stateChanged ||
    (sampleMode === true && (nextState !== 'ok' || !lastSample || now - lastSample.ts >= CONN_SAMPLE_INTERVAL_MS));
  if (shouldSample) {
    cs.history.push({
      ts: now,
      state: nextState,
      latencyMs: Number.isFinite(Number(cs.latencyMs)) ? Number(cs.latencyMs) : null,
      error: nextError,
    });
    if (cs.history.length > CONN_HISTORY_MAX) {
      cs.history.splice(0, cs.history.length - CONN_HISTORY_MAX);
    }
  }
}

export function resetConnStatusHistory() {
  if (!store.connStatus) return;
  store.connStatus.history = [];
  store.connStatus.events = [];
}
