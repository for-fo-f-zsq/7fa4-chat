const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUserDataPath: (filename) => ipcRenderer.invoke('get-user-data-path', filename),
  getVersion: () => ipcRenderer.invoke('get-version'),
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
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
  // --- 文件操作 (base64) ---
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectImage: () => ipcRenderer.invoke('select-image'),
  downloadFile: (base64Data, suggestedName, mime) => ipcRenderer.invoke('download-file', base64Data, suggestedName, mime),
  startDragFile: (base64Data, fileName) => ipcRenderer.invoke('start-drag-file', base64Data, fileName),
  clipboardWriteImage: (base64Data) => ipcRenderer.invoke('clipboard-write-image', base64Data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveDataFile: (filename, content) => ipcRenderer.invoke('save-data-file', filename, content),
  loadDataFile: (filename) => ipcRenderer.invoke('load-data-file', filename),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  fetchChangelog: () => ipcRenderer.invoke('fetch-changelog'),
  // --- 新增功能 IPC ---
  setBadgeCount: (count) => ipcRenderer.invoke('set-badge-count', count),
  screenshot: () => ipcRenderer.invoke('screenshot'),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: () => ipcRenderer.invoke('import-data'),
  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getNativeTheme: () => ipcRenderer.invoke('get-native-theme'),
  onNativeThemeChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('native-theme-changed', handler);
    return () => ipcRenderer.removeListener('native-theme-changed', handler);
  },
});
