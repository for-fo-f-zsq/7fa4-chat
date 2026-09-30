const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  loadSetting: () => ipcRenderer.invoke('load-setting'),
  saveSetting: (data) => ipcRenderer.invoke('save-setting', data),
  notify: (sender, content, chatType, targetId) => ipcRenderer.invoke('notify', { sender, content, chatType, targetId }),
  showMainWindow: () => ipcRenderer.invoke('show-mainwindow'),
  onNotifClick: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('notif-click', handler);
    return () => ipcRenderer.removeListener('notif-click', handler);
  },
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
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
  // --- 文件操作 (base64) ---
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectImage: () => ipcRenderer.invoke('select-image'),
  downloadFile: (base64Data, suggestedName, mime) => ipcRenderer.invoke('download-file', base64Data, suggestedName, mime),
  // 覆盖写入已保存过的文件（工具类 Ctrl+S 用）。路径不在主进程白名单时返回 unsupported，
  // 调用方应回落到 downloadFile 的另存为对话框。
  saveFileTo: (filePath, base64Data) => ipcRenderer.invoke('save-file-to', filePath, base64Data),
  clipboardWriteImage: (base64Data) => ipcRenderer.invoke('clipboard-write-image', base64Data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  // --- SQLite 用户数据存储（加密） ---
  storeInit: (uid) => ipcRenderer.invoke('store-init', uid),
  storeLoadConvos: (uid) => ipcRenderer.invoke('store-load-convos', uid),
  storeLoadLastMessages: (uid) => ipcRenderer.invoke('store-load-last-messages', uid),
  storeLoadMessages: (uid, kind, cid, limit, before) => ipcRenderer.invoke('store-load-messages', uid, kind, cid, limit, before),
  storeSearchMessages: (uid, opts) => ipcRenderer.invoke('store-search-messages', uid, opts),
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
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  fetchChangelog: () => ipcRenderer.invoke('fetch-changelog'),
  // --- 新增功能 IPC ---
  setBadgeCount: (count) => ipcRenderer.invoke('set-badge-count', count),
  sendFeedback: (data) => ipcRenderer.invoke('send-feedback', data),
  fetchSponsors: () => ipcRenderer.invoke('fetch-sponsors'),
  fetchDiscoverPeople: (uid, limit) => ipcRenderer.invoke('discover-people', uid, limit),
  // 海报：开屏随机一张 / 发现页海报墙列表 / 投稿（需服务端审核通过才公开）
  fetchPosters: () => ipcRenderer.invoke('fetch-posters'),
  fetchRandomPoster: () => ipcRenderer.invoke('fetch-random-poster'),
  submitPoster: (payload) => ipcRenderer.invoke('submit-poster', payload),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: () => ipcRenderer.invoke('import-data'),
  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  // --- 工具 ---
  loadUsersDb: () => ipcRenderer.invoke('load-users-db'),
  // --- 截图（Win + Shift + S 矩形框选 → 图片编辑器）---
  // 手动触发截图框选；全局快捷键被系统占用时的兜底入口
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  // 查询实际生效的截图快捷键（候选键自动降级，UI 需如实展示，否则用户按了没反应也不知道）
  getScreenshotHotkey: () => ipcRenderer.invoke('get-screenshot-hotkey'),
  onScreenshotCaptured: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('screenshot-captured', handler);
    return () => ipcRenderer.removeListener('screenshot-captured', handler);
  },
  reportVisit: (info) => ipcRenderer.invoke('report-visit', info),
  clearSessionCookies: () => ipcRenderer.invoke('clear-session-cookies'),
  exportMarkdownPng: (suggestedName, html) => ipcRenderer.invoke('export-markdown-png', suggestedName, html),
});
