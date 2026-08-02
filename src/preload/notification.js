const { contextBridge, ipcRenderer } = require('electron');

// 通知弹窗专用 preload：以最小权限暴露 IPC（窗口本身 sandbox + contextIsolation）
contextBridge.exposeInMainWorld('api', {
  loadSetting: () => ipcRenderer.invoke('load-setting'),
  onNotifData: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('notif-data', handler);
    return () => ipcRenderer.removeListener('notif-data', handler);
  },
  showMainWindow: (chatType, targetId) => ipcRenderer.invoke('show-mainwindow', chatType, targetId),
  closeNotif: () => ipcRenderer.invoke('close-notification')
});
