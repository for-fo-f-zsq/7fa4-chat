const { contextBridge, ipcRenderer } = require('electron');

// 在线工具安装进度：主进程 webContents.send('tools-progress', payload) → 本文件统一收集后派发给订阅者。
// onToolProgress 返回退订函数，offToolProgress 支持按回调取消（两种用法都兼容）。
const toolProgressListeners = new Set();
ipcRenderer.on('tools-progress', (event, payload) => {
  for (const cb of toolProgressListeners) {
    try { cb(payload) } catch { /* 单个订阅者异常不影响其它订阅者 */ }
  }
});

// 通知 payload 归一化：对象形式原样透传，老的四参数形式转成同一份字段结构。
function normalizeNotifyArgs(payload, body, chatType, targetId) {
  const isPlainObject = !!payload && typeof payload === 'object' && !Array.isArray(payload);
  if (isPlainObject) {
    return { ...payload };
  }
  return {
    title: String(payload ?? ''),
    body: String(body ?? ''),
    chatType,
    targetId,
    count: 1,
    timestamp: Date.now(),
    id: chatType + '_' + targetId
  };
}

function subscribeIpc(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// 窗口状态缓存：主进程在 focus/blur/show/hide/minimize/restore 时主动推 'window-state'，
// 这里留一份，渲染层读 getCachedWindowState() 就是纯内存读取（0 次 IPC 往返）。
// 之前每条通知都要 await 一次 getWindowState() 才知道窗口是否在前台。
let cachedWindowState = null;
ipcRenderer.on('window-state', (event, state) => {
  if (state && typeof state === 'object') cachedWindowState = { ...state };
});
// 首帧兜底：push 还没来之前先问一次（只在 preload 加载时发生一次，之后全靠推送）
try {
  ipcRenderer.invoke('get-window-state').then((state) => {
    if (!cachedWindowState && state && typeof state === 'object') cachedWindowState = { ...state };
  }).catch(() => {});
} catch { /* 老版本主进程没有该 handler 时忽略 */ }

contextBridge.exposeInMainWorld('api', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  loadSetting: () => ipcRenderer.invoke('load-setting'),
  saveSetting: (data) => ipcRenderer.invoke('save-setting', data),
  notify: (payload, body, chatType, targetId) => ipcRenderer.invoke('notify', normalizeNotifyArgs(payload, body, chatType, targetId)),
  onNotifClick: (callback) => subscribeIpc('notif-click', callback),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (callback) => {
    const handler = (event, isMax) => callback(isMax);
    ipcRenderer.on('window-maximized', handler);
    return () => ipcRenderer.removeListener('window-maximized', handler);
  },
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  // 主进程推送的窗口状态（focus/blur/show/hide/minimize/restore）：
  //   onWindowState(cb) → 退订函数；cb 收到 { visible, focused, minimized }
  //   getCachedWindowState() → 最近一次状态（同步、0 IPC），还没收到过时为 null
  onWindowState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, state) => callback(state);
    ipcRenderer.on('window-state', handler);
    return () => ipcRenderer.removeListener('window-state', handler);
  },
  getCachedWindowState: () => (cachedWindowState ? { ...cachedWindowState } : null),
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
  // --- 文件操作 (base64) ---
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectImage: () => ipcRenderer.invoke('select-image'),
  // 拍照：调系统相机应用，返回用户新拍的那张图（base64）。
  // 用户没拍就关掉相机 → { success:false, canceled:true }，调用方静默处理。
  launchCamera: () => ipcRenderer.invoke('launch-camera'),
  // 作废正在等待的拍照请求（用户在等待期间点「取消」时用）
  cancelCamera: () => ipcRenderer.invoke('cancel-camera'),
  downloadFile: (base64Data, suggestedName, mime) => ipcRenderer.invoke('download-file', base64Data, suggestedName, mime),
  // 直接按 URL 下载（主进程抓取，绕过渲染层 CORS —— Electron 渲染进程源与图片站不同源，
  // 且图片由 nginx 静态规则伺服不带 access-control-allow-origin，renderer fetch 必被拦）。
  downloadUrl: (url, suggestedName) => ipcRenderer.invoke('download-url', url, suggestedName),
  // 覆盖写入已保存过的文件（工具类 Ctrl+S 用）。路径不在主进程白名单时返回 unsupported，
  // 调用方应回落到 downloadFile 的另存为对话框。
  saveFileTo: (filePath, base64Data) => ipcRenderer.invoke('save-file-to', filePath, base64Data),
  startFileDrag: (payload) => ipcRenderer.send('start-file-drag', payload),
  clipboardWriteImage: (base64Data) => ipcRenderer.invoke('clipboard-write-image', base64Data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // --- SQLite 用户数据存储（加密） ---
  storeInit: (uid) => ipcRenderer.invoke('store-init', uid),
  storeLoadConvos: (uid) => ipcRenderer.invoke('store-load-convos', uid),
  storeLoadLastMessages: (uid) => ipcRenderer.invoke('store-load-last-messages', uid),
  storeLoadMessages: (uid, kind, cid, limit, before) => ipcRenderer.invoke('store-load-messages', uid, kind, cid, limit, before),
  storeSaveAll: (uid, data) => ipcRenderer.invoke('store-save-all', uid, data),
  storeLoadPrefs: (uid) => ipcRenderer.invoke('store-load-prefs', uid),
  storeExportAll: (uid) => ipcRenderer.invoke('store-export-all', uid),
  storeImportAll: (uid, data) => ipcRenderer.invoke('store-import-all', uid, data),
  // --- 窗口关闭前落盘：主进程通知 → 渲染 flushData → 确认关闭 ---
  onAppFlushBeforeClose: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('app-flush-before-close', listener);
    return () => ipcRenderer.removeListener('app-flush-before-close', listener);
  },
  appFlushDone: () => ipcRenderer.send('app-flush-done'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  fetchChangelog: () => ipcRenderer.invoke('fetch-changelog'),
  // --- 新增功能 IPC ---
  setBadgeCount: (count) => ipcRenderer.invoke('set-badge-count', count),
  // 赞助名单：GitLab 公开仓库 assets/sponsors.json（自建后端已全部下线）
  fetchSponsors: () => ipcRenderer.invoke('fetch-sponsors'),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: () => ipcRenderer.invoke('import-data'),
  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
  clearCache: (uid) => ipcRenderer.invoke('clear-cache', uid),
  // --- 工具 ---
  loadUsersDb: () => ipcRenderer.invoke('load-users-db'),
  clearSessionCookies: () => ipcRenderer.invoke('clear-session-cookies'),
  exportMarkdownPng: (suggestedName, html) => ipcRenderer.invoke('export-markdown-png', suggestedName, html),
  // --- 在线工具（GitLab 886 静态包；下载/校验/安装/卸载/入口 URL 均在主进程执行）---
  fetchToolsManifest: () => ipcRenderer.invoke('tools-fetch-manifest'),
  listInstalledTools: () => ipcRenderer.invoke('tools-list-installed'),
  installTool: (toolMeta) => ipcRenderer.invoke('tools-install', JSON.parse(JSON.stringify(toolMeta))),
  removeTool: (id) => ipcRenderer.invoke('tools-remove', id),
  getToolEntryUrl: (id, entry) => ipcRenderer.invoke('tools-get-entry-url', id, entry),
  onToolProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    toolProgressListeners.add(callback);
    return () => { toolProgressListeners.delete(callback); };
  },
  offToolProgress: (callback) => { toolProgressListeners.delete(callback); },
  // --- 独立工具窗口（桌面端）：主窗打开/响应快照与图片；工具窗初始化/主题同步/拉取用户/回传图片 ---
  openToolWindow: (tool) => ipcRenderer.invoke('open-tool-window', tool),
  onToolSendImage: (callback) => subscribeIpc('tool-send-image', callback),
  onToolUsersRequest: (callback) => subscribeIpc('tool-users-req', callback),
  replyToolUsers: (reqId, snapshot) => ipcRenderer.send('tool-users-res', reqId, snapshot),
  getToolWindowInit: () => ipcRenderer.invoke('tool-window-get-init'),
  onToolWindowInit: (callback) => subscribeIpc('tool-window-init', callback),
  onToolWindowEvent: (callback) => subscribeIpc('tool-window-event', callback),
  onToolThemeChanged: (callback) => subscribeIpc('tool-theme-changed', callback),
  sendToolImage: (payload) => ipcRenderer.invoke('tool-send-image', payload),
  requestToolUsers: () => ipcRenderer.invoke('tool-users-req'),
  // --- 计时器悬浮窗（独立置顶小窗；状态由本窗口推送，见 main/index.js）---
  openTimerFloat: (cfg) => ipcRenderer.invoke('timer-float-open', cfg),
  closeTimerFloat: () => ipcRenderer.invoke('timer-float-close'),
  isTimerFloatOpen: () => ipcRenderer.invoke('timer-float-is-open'),
  updateTimerFloat: (state) => ipcRenderer.send('timer-float-update', state),
  updateTimerFloatConfig: (cfg) => ipcRenderer.send('timer-float-config', cfg),
  // 悬浮窗上的按钮（全部开始/暂停、全部重置、切换置顶）→ 由本窗口执行
  onTimerFloatCommand: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('timer-float-command', handler);
    return () => ipcRenderer.removeListener('timer-float-command', handler);
  },
  // 悬浮窗被关掉（用户点 ✕ / 系统关闭）→ 同步按钮态
  onTimerFloatClosed: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('timer-float-closed', handler);
    return () => ipcRenderer.removeListener('timer-float-closed', handler);
  },
  // 用户拖拽悬浮窗后的新坐标（用于持久化「上次位置」）
  onTimerFloatMoved: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('timer-float-moved', handler);
    return () => ipcRenderer.removeListener('timer-float-moved', handler);
  },
  // --- 屏幕右下角强制站点通知窗（桌面端，由主进程定位到屏幕工作区右下角） ---
  syncSiteNotice: (payload) => ipcRenderer.send('site-notice-sync', payload),
  onSiteNoticeAction: (callback) => subscribeIpc('site-notice-action', callback),
});
