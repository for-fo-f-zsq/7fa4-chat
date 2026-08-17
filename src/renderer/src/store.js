import { reactive } from 'vue';

export const store = reactive({
  self: { uid: null, username: null, nickname: null, realname: null },
  users: {},
  groups: {},
  messages: {},
  stickers: [],
  drafts: {},           // 草稿 { 'user_123': 'text', 'group_456': 'text' }
  favorites: [],        // 收藏的消息 [{ id, content, sender, send_time, fromType, fromId, savedAt }]
  mutedConvos: {},      // 免打扰会话 { 'user_123': true }
  hiddenConvos: {},     // 隐藏的会话 { 'user_123': true }
  deletedMsgIds: [],    // 已删除的消息ID列表，防止轮询重新拉回
  pageType: null,
  pageId: null,
  currentGroupId: null,
  setting: {},
  logined: false,        // 是否已登录（默认未登录）
  guestMode: true,       // 游客模式：默认启动即进入主界面（聊天/收藏不可用，工具/设置/关于可浏览）；仅主动"去登录"才显示登录页
  initializing: false,  // 首次运行/清缓存后，加载消息期间锁定主界面（由加载序列置位）
  online: true,         // 网络在线状态（navigator + API 轮询结果综合）
  netError: false,      // API 层网络异常/会话失效标记（html 响应、fetch 失败均置位），用于"未连接"横幅
  multiSelectMode: false, // 多选模式
  selectedMsgIds: [],   // 多选选中的消息ID
  tokenLimit: null,     // /chat/info 的 limit：{ time_limit(秒=恢复周期), count_limit(最大token数), ... }
});
