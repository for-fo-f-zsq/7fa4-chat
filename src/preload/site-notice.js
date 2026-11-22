const { contextBridge, ipcRenderer } = require('electron');

// 屏幕右下角强制通知窗专用 preload：独立页面，只通过主进程与主窗口同步状态及回传手动确认事件
contextBridge.exposeInMainWorld('siteNotice', {
  onState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, data) => callback(data);
    ipcRenderer.on('site-notice-state', handler);
    return () => ipcRenderer.removeListener('site-notice-state', handler);
  },
  confirm: (id) => ipcRenderer.send('site-notice-cmd', { type: 'confirm', id }),
  openJump: (url) => ipcRenderer.send('site-notice-cmd', { type: 'jump', url }),
  resize: (height) => ipcRenderer.send('site-notice-resize', height),
});
