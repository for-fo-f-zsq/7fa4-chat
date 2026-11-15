const { contextBridge, ipcRenderer } = require('electron');

// 通知弹窗专用 preload：只暴露通知卡片需要的固定几个通道，
// 窗口本身是 sandbox + contextIsolation，渲染层拿不到任意 IPC。
// 通道名与主进程 handleAllowedIpc(..., ['notification']) 一一对应，改任何一边都要同步。
function on(channel, callback) {
  const handler = (event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('api', {
  loadSetting: () => ipcRenderer.invoke('load-setting'),
  // 主进程推送新提醒（窗口复用时同一通道连发多条）
  onNotifData: (cb) => on('notif-data', cb),
  // 主窗聚焦/用户已读 → 清空当前卡片
  onNotifClear: (cb) => on('notif-clear', cb),
  // 卡片实测高度回传，主进程按锚点伸缩窗口；传 0 表示收起（窗口隐藏复用）
  resize: (height) => ipcRenderer.invoke('notification-resize', height),
  // 点卡片：拉起主窗并跳到会话，同时销毁通知窗
  notificationAction: (chatType, targetId) => ipcRenderer.invoke('notification-action', chatType, targetId),
  closeNotif: () => ipcRenderer.invoke('close-notification'),
  // 旧页面兼容：只显示主窗、不跳会话（主进程内部会顺带清空通知）
  showMainWindow: (chatType, targetId) => ipcRenderer.invoke('show-mainwindow', chatType, targetId)
});
