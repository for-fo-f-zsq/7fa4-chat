'use strict';

const { BrowserWindow } = require('electron');

const TOOL_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

function isValidToolUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return false;
  try {
    const u = new URL(rawUrl);
    return u.protocol === 'tool:';
  } catch {
    return false;
  }
}

class ToolWindowManager {
  /**
   * @param {object} opts
   * @param {string} opts.preloadPath
   * @param {string} opts.htmlPath
   * @param {string} [opts.devServerUrl]
   * @param {() => string} [opts.getIconPath]
   * @param {() => { theme?: string, customVars?: Record<string, string>|null }} [opts.getThemeSetting]
   */
  constructor({ preloadPath, htmlPath, devServerUrl = '', getIconPath, getThemeSetting } = {}) {
    this.preloadPath = preloadPath;
    this.htmlPath = htmlPath;
    this.devServerUrl = devServerUrl;
    this.getIconPathFn = typeof getIconPath === 'function' ? getIconPath : null;
    this.getThemeSettingFn = typeof getThemeSetting === 'function' ? getThemeSetting : null;
    this.windows = new Map(); // toolId -> BrowserWindow
    this.metaByWebContentsId = new Map(); // webContents.id -> { id, name, url, version }
    this.pendingEventsByToolId = new Map(); // toolId -> { name, data }
  }

  getWindow(toolId) {
    const id = String(toolId || '');
    const win = this.windows.get(id);
    if (!win || win.isDestroyed()) {
      this.windows.delete(id);
      return null;
    }
    return win;
  }

  isToolWebContents(webContents) {
    if (!webContents) return false;
    for (const [id, win] of this.windows.entries()) {
      if (!win || win.isDestroyed()) {
        this.windows.delete(id);
        continue;
      }
      if (win.webContents === webContents) return true;
    }
    return false;
  }

  getThemeSetting() {
    try {
      const t = this.getThemeSettingFn ? this.getThemeSettingFn() : null;
      return {
        theme: (t && typeof t.theme === 'string' && t.theme) || 'default',
        customVars: t && t.customVars && typeof t.customVars === 'object' ? t.customVars : null
      };
    } catch {
      return { theme: 'default', customVars: null };
    }
  }

  getInitMetaForSender(webContents) {
    if (!webContents) return null;
    const meta = this.metaByWebContentsId.get(webContents.id);
    if (!meta) return null;
    const pendingEvent = this.pendingEventsByToolId.get(meta.id) || null;
    if (pendingEvent) this.pendingEventsByToolId.delete(meta.id);
    return {
      ...meta,
      pendingEvent,
      themeSetting: this.getThemeSetting()
    };
  }

  broadcast(channel, payload) {
    for (const [id, win] of this.windows.entries()) {
      if (!win || win.isDestroyed()) {
        this.windows.delete(id);
        continue;
      }
      try {
        win.webContents.send(channel, payload);
      } catch { /* ignore closing window */ }
    }
  }

  open(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object') {
      return { success: false, error: '工具参数无效' };
    }
    const id = String(rawPayload.id || '');
    const name = String(rawPayload.name || id || '工具');
    const url = String(rawPayload.url || '');
    const version = String(rawPayload.version || '');
    const pendingEvent = rawPayload.event && typeof rawPayload.event === 'object' && typeof rawPayload.event.name === 'string'
      ? { name: rawPayload.event.name, data: rawPayload.event.data }
      : null;

    if (!TOOL_ID_RE.test(id)) return { success: false, error: '工具 ID 无效' };
    if (!isValidToolUrl(url)) return { success: false, error: '工具地址无效' };

    const existing = this.getWindow(id);
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      if (!existing.isVisible()) existing.show();
      existing.focus();
      if (pendingEvent) {
        try {
          existing.webContents.send('tool-window-event', pendingEvent);
        } catch { /* ignore */ }
      }
      return { success: true, reused: true };
    }

    if (pendingEvent) {
      this.pendingEventsByToolId.set(id, pendingEvent);
    }

    const iconPath = this.getIconPathFn ? this.getIconPathFn() : undefined;
    const win = new BrowserWindow({
      width: 1024,
      height: 740,
      minWidth: 640,
      minHeight: 480,
      title: name,
      icon: iconPath,
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        sandbox: true
      }
    });
    win.setMenuBarVisibility(false);

    const wcId = win.webContents.id;
    const meta = { id, name, url, version };
    this.windows.set(id, win);
    this.metaByWebContentsId.set(wcId, meta);

    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (!input.control && !input.meta) return;
      const key = String(input.key || '').toLowerCase();
      if (key === '=' || key === '+') {
        event.preventDefault();
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 1);
      } else if (key === '-') {
        event.preventDefault();
        win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 1);
      } else if (key === '0') {
        event.preventDefault();
        win.webContents.setZoomLevel(0);
      } else if (key === 'w') {
        event.preventDefault();
        win.close();
      }
    });

    win.on('closed', () => {
      if (this.windows.get(id) === win) this.windows.delete(id);
      this.metaByWebContentsId.delete(wcId);
      this.pendingEventsByToolId.delete(id);
    });

    win.webContents.on('did-finish-load', () => {
      if (win.isDestroyed()) return;
      const ev = this.pendingEventsByToolId.get(id) || null;
      if (ev) this.pendingEventsByToolId.delete(id);
      try {
        win.webContents.send('tool-window-init', {
          ...meta,
          pendingEvent: ev,
          themeSetting: this.getThemeSetting()
        });
      } catch { /* ignore */ }
    });

    if (this.devServerUrl) {
      const base = this.devServerUrl.replace(/\/+$/, '');
      win.loadURL(`${base}/tool-window.html`).catch((err) => {
        console.error(`[ToolWindow] 加载工具窗失败 (${id}):`, err && err.message);
      });
    } else {
      win.loadFile(this.htmlPath).catch((err) => {
        console.error(`[ToolWindow] 加载工具窗失败 (${id}):`, err && err.message);
      });
    }

    return { success: true, reused: false };
  }

  close(toolId) {
    const id = String(toolId || '');
    const win = this.getWindow(id);
    if (!win) return;
    const wcId = win.webContents.id;
    this.windows.delete(id);
    this.metaByWebContentsId.delete(wcId);
    try {
      win.destroy();
    } catch { /* ignore */ }
  }

  closeAll() {
    for (const id of [...this.windows.keys()]) {
      this.close(id);
    }
  }
}

module.exports = { ToolWindowManager };
