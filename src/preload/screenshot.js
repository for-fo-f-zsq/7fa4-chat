const { contextBridge, ipcRenderer } = require('electron');

// 截图选区遮罩专用 preload：以最小权限暴露 IPC（窗口本身 sandbox + contextIsolation）
contextBridge.exposeInMainWorld('shot', {
  // 主进程把底图（当前屏快照）送进来
  onData: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('shot-data', handler);
    return () => ipcRenderer.removeListener('shot-data', handler);
  },
  // 框选完成：交回裁剪后的 PNG（纯 base64，不含 data: 前缀）+ 建议文件名
  finish: (payload) => ipcRenderer.invoke('screenshot-finish', payload),
  cancel: () => ipcRenderer.invoke('screenshot-cancel')
});
