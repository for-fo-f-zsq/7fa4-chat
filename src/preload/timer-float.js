const { contextBridge, ipcRenderer } = require('electron');

// 悬浮窗专用 preload：独立 file:// 页面无 localStorage，状态一律由主窗口经主进程转发
contextBridge.exposeInMainWorld('timerFloat', {
  // 主窗口推来的计时状态（全量覆盖）
  onState: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('timer-float-state', handler);
    return () => ipcRenderer.removeListener('timer-float-state', handler);
  },
  // 悬浮窗外观配置（置顶等），仅用于按钮态展示
  onConfig: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('timer-float-config', handler);
    return () => ipcRenderer.removeListener('timer-float-config', handler);
  },
  // 悬浮窗上的操作（全部开始/暂停、全部重置、切换置顶、关闭）统一回传主进程处理
  command: (payload) => ipcRenderer.send('timer-float-cmd', payload),
  close: () => ipcRenderer.send('timer-float-cmd', { type: 'close' }),
  // 实测内容高度回传：窗口没有卡片底，高度按当前显示几个格自适应
  resize: (height) => ipcRenderer.send('timer-float-resize', height)
});
