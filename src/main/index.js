const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog, session, clipboard, nativeTheme, safeStorage } = require('electron');
const fs = require('fs').promises;
const fsCb = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
let ptyLib = null;
try { ptyLib = require('node-pty'); } catch (e) { ptyLib = null; }
let autoUpdater;
try { ({ autoUpdater } = require('electron-updater')); } catch { autoUpdater = null; }

const { createProxyMiddleware } = require('http-proxy-middleware');

let mainWindow;
let tray = null;
let serverStarted = false;
let serverInstance = null;
let minimizeToTray = true;
let currentApiUrl = 'http://jx.7fa4.cn';

function startServer() {
    if (serverStarted) return;
    const serverApp = express();

    // —— 本地代理安全防护 ——
    // 仅放行本机页面/开发服务器的请求，阻止外部网页 CSRF 借道、DNS rebinding 与局域网滥用
    const ALLOWED_HOSTS = new Set(['localhost:1145', '127.0.0.1:1145', '[::1]:1145']);
    const ALLOWED_ORIGINS = new Set([
        'http://localhost:1145', 'http://127.0.0.1:1145', 'http://[::1]:1145',
        'http://localhost:5173', 'http://127.0.0.1:5173' // electron-vite dev server
    ]);
    serverApp.use((req, res, next) => {
        const host = (req.headers.host || '').toLowerCase();
        if (!ALLOWED_HOSTS.has(host)) return res.status(403).end('Forbidden');
        const origin = req.headers.origin;
        if (origin) {
            let originOk = false;
            try { originOk = ALLOWED_ORIGINS.has(new URL(origin).origin); } catch {}
            if (!originOk) return res.status(403).end('Forbidden');
        }
        const fetchSite = req.headers['sec-fetch-site'];
        if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
            return res.status(403).end('Forbidden');
        }
        next();
    });

    serverApp.use('/api', createProxyMiddleware({
        target: currentApiUrl + ':8888/api',
        changeOrigin: true
    }));
    serverApp.use('/chat', createProxyMiddleware({
        target: currentApiUrl + ':8888/chat',
        changeOrigin: true
    }));
    serverApp.use('/user', createProxyMiddleware({
        target: currentApiUrl + ':8888/user',
        changeOrigin: true
    }));
    serverApp.use('/ranklist', createProxyMiddleware({
        target: currentApiUrl + ':8888/ranklist',
        changeOrigin: true
    }));

    const rendererDir = app.isPackaged
        ? path.join(__dirname, '../renderer')
        : null;
    if (rendererDir) {
        serverApp.use(express.static(rendererDir));
        serverApp.get('/{*splat}', (req, res) => {
            res.sendFile(path.join(rendererDir, 'index.html'));
        });
    }

    const PORT = 1145;
    serverInstance = serverApp.listen(PORT, () => {
        serverStarted = true;
        console.log('Server started on port', PORT);
    });
    serverInstance.on('error', (err) => {
        console.error('Server error:', err);
        serverStarted = false;
        serverInstance = null;
    });
}

function stopServer() {
    if (!serverStarted || !serverInstance) return;
    serverInstance.close();
    serverInstance = null;
    serverStarted = false;
}

function createWindow() {
    let iconPath;
    if (app.isPackaged)
        iconPath = path.join(process.resourcesPath, 'icon/icon.png');
    else
        iconPath = path.join(__dirname, '../../icon/icon.png');
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 830,
        frame: false,
        icon:iconPath,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            backgroundThrottling: false
        }
    });

    // 统一应用级页面缩放快捷键：Ctrl/Cmd + = / + 放大，Ctrl/Cmd + - 缩小，Ctrl/Cmd + 0 复位
    // （Electron 默认菜单的放大加速键只认 Ctrl+Plus，主键盘 = 不匹配，这里手动接管保证一致）
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return
        if (!input.control && !input.meta) return
        const key = String(input.key || '').toLowerCase()
        if (key === '=' || key === '+') {
            event.preventDefault()
            mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 1)
        } else if (key === '-') {
            event.preventDefault()
            mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 1)
        } else if (key === '0') {
            event.preventDefault()
            mainWindow.webContents.setZoomLevel(0)
        } else if (key === 'w') {
            // Ctrl/Cmd+W：不关闭整个应用，转给渲染层关闭当前 IDE 标签
            event.preventDefault()
            mainWindow.webContents.send('app-ctrl-w')
        }
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        mainWindow.loadURL('http://localhost:1145');
    }

    mainWindow.on('close', (event) => {
        if (minimizeToTray && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // --- 最大化状态推送（按钮图标实时刷新） ---
    const sendMaximizedState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());
        }
    };
    mainWindow.on('maximize', sendMaximizedState);
    mainWindow.on('unmaximize', sendMaximizedState);
    // Aero Snap（拖到屏幕顶部）等场景可能不触发 maximize 事件，用防抖 resize 兜底
    let _maxStateTimer = null;
    mainWindow.on('resize', () => {
        if (_maxStateTimer) clearTimeout(_maxStateTimer);
        _maxStateTimer = setTimeout(() => {
            _maxStateTimer = null;
            sendMaximizedState();
        }, 100);
    });
    mainWindow.webContents.once('did-finish-load', sendMaximizedState);
}

function createTray() {
    if (tray) return;
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon/icon.png')
        : path.join(__dirname, '../../icon/icon.png');

    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        { label: '显示窗口', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { label: '退出', click: () => {
            app.isQuitting = true;
            app.quit();
        }}
    ]);
    tray.setToolTip('7FA4 Chat');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { mainWindow.show(); mainWindow.focus(); });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            const setting = await loadSettingFromFile();
            // 迁移旧版明文密码：磁盘上仍是明文时立即加密重写
            if (setting.loginPassword && !String(setting.loginPassword).startsWith(PWD_ENC_PREFIX)) {
                await saveSettingToFile(setting);
            }
            if (setting.minimizeToTray !== undefined) minimizeToTray = setting.minimizeToTray;
            if (setting.apiUrl) currentApiUrl = setting.apiUrl.replace(/\/$/, '');
            // 与设置面板默认值保持一致（面板默认勾选开启）
            autoUpdateEnabled = setting.autoUpdate !== false;
            startServer();
            createWindow();
            createTray();
            initAutoUpdater();
        } catch (err) {
            console.error('Startup error:', err);
            dialog.showErrorBox('启动错误', err.message || String(err));
        }
    });
}

app.on('window-all-closed', () => {
    if (!minimizeToTray && process.platform !== 'darwin') app.quit();
});

// 校验 userData 相对路径，拒绝路径穿越
function safeUserDataPath(filename) {
    if (typeof filename !== 'string' || !filename || filename.includes('\0')) throw new Error('非法路径');
    const userData = path.resolve(app.getPath('userData'));
    const resolved = path.resolve(userData, filename);
    if (resolved !== userData && !resolved.startsWith(userData + path.sep)) throw new Error('路径越界');
    return resolved;
}

ipcMain.handle('get-user-data-path', (event, filename) => {
    try { return safeUserDataPath(filename); } catch { return null; }
});

ipcMain.handle('get-version', () => app.getVersion());

let cachedSetting = null;

// ========== 密码加密存储（safeStorage：Windows DPAPI / macOS Keychain / Linux keyring） ==========
const PWD_ENC_PREFIX = 'enc7f:';

function encryptPassword(value) {
    if (typeof value !== 'string' || !value) return value;
    try {
        if (safeStorage.isEncryptionAvailable()) {
            return PWD_ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
        }
        console.warn('[setting] safeStorage 不可用，密码将以明文保存（Linux 无 keyring 时）');
    } catch (e) {
        console.error('[setting] 密码加密失败，回退明文:', e.message);
    }
    return value;
}

function decryptPassword(value) {
    if (typeof value !== 'string' || !value.startsWith(PWD_ENC_PREFIX)) return value;
    try {
        return safeStorage.decryptString(Buffer.from(value.slice(PWD_ENC_PREFIX.length), 'base64'));
    } catch (e) {
        console.error('[setting] 密码解密失败（keyring 变化？）:', e.message);
        return '';
    }
}

async function loadSettingFromFile() {
    try {
        const filePath = path.join(app.getPath('userData'), 'setting.7c');
        const content = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed.loginPassword) parsed.loginPassword = decryptPassword(parsed.loginPassword);
        cachedSetting = parsed;
    } catch { cachedSetting = {}; }
    return cachedSetting;
}

async function saveSettingToFile(data) {
    cachedSetting = data;
    try {
        const filePath = path.join(app.getPath('userData'), 'setting.7c');
        const toSave = { ...data };
        if (toSave.loginPassword) toSave.loginPassword = encryptPassword(toSave.loginPassword);
        await fs.writeFile(filePath, JSON.stringify(toSave), 'utf8');
        return true;
    } catch { return false; }
}

ipcMain.handle('load-setting', async () => {
    if (!cachedSetting) await loadSettingFromFile();
    return JSON.parse(JSON.stringify(cachedSetting));
});

ipcMain.handle('save-setting', async (event, data) => {
    const oldMinimizeToTray = minimizeToTray;
    const oldApiUrl = (cachedSetting || {}).apiUrl;
    const oldAutoUpdate = autoUpdateEnabled;
    const result = await saveSettingToFile(data);
    if (data.minimizeToTray !== undefined && data.minimizeToTray !== oldMinimizeToTray) {
        minimizeToTray = data.minimizeToTray;
    }
    if (data.apiUrl !== undefined && data.apiUrl !== oldApiUrl) {
        currentApiUrl = data.apiUrl.replace(/\/$/, '');
        stopServer();
        startServer();
        // API 网址变了，刷新自动更新源并立即重新检查
        applyUpdateFeedUrl();
        if (app.isPackaged && autoUpdater) {
            autoUpdater.checkForUpdates().catch(err => console.error('[Updater] API变更后检查更新失败:', err.message));
        }
    }
    if (data.autoUpdate !== undefined && data.autoUpdate !== oldAutoUpdate) {
        autoUpdateEnabled = data.autoUpdate;
        if (autoUpdateEnabled) {
            startUpdateCheckTimer();
        } else {
            stopUpdateCheckTimer();
        }
    }
    return result;
});

let notificationWin = null;

ipcMain.handle('notify', (e, { sender, content, chatType, targetId }) => {
    if (notificationWin && !notificationWin.isDestroyed()) return;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const isLinux = process.platform === 'linux';
    notificationWin = new BrowserWindow({
        width: 340, height: 100, frame: false, alwaysOnTop: true, transparent: true,
        x: isLinux ? width : width - 348,
        y: isLinux ? height : height - 108,
        webPreferences: {
            preload: path.join(__dirname, '../preload/notification.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    notificationWin.on('closed', () => { notificationWin = null; });
    const notifPath = app.isPackaged
        ? path.join(__dirname, '../renderer/notification.html')
        : path.join(app.getAppPath(), 'src/renderer/notification.html');
    notificationWin.loadFile(notifPath);
    notificationWin.webContents.on('did-finish-load', () => {
        notificationWin.webContents.send('notif-data', { sender, content, chatType, targetId });
    });
});

ipcMain.handle('close-notification', () => {
    if (notificationWin && !notificationWin.isDestroyed()) notificationWin.close();
});

ipcMain.handle('show-mainwindow', (e, chatType, targetId) => {
    mainWindow.hide();
    mainWindow.show();
    mainWindow.focus();
    if (chatType && targetId) {
        mainWindow.webContents.send('notif-click', { chatType, targetId });
    }
});

ipcMain.handle('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('window-maximize', () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.handle('window-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle('window-is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);

ipcMain.handle('get-window-state', () => {
    if (!mainWindow) return { visible: false, focused: false, minimized: false };
    return { visible: mainWindow.isVisible(), focused: mainWindow.isFocused(), minimized: mainWindow.isMinimized() };
});

ipcMain.handle('clipboard-write-text', async (event, text) => {
    clipboard.writeText(text);
    return { success: true };
});

  // --- 文件操作 (base64) ---
ipcMain.handle('select-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: '选择要发送的文件' });
    if (canceled || !filePaths.length) return { success: false, canceled: true };
    try {
        const buf = await fs.readFile(filePaths[0]);
        const ext = path.extname(filePaths[0]).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
            '.bmp': 'image/bmp', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf', '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
            '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar', '.gz': 'application/gzip',
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.avi': 'video/x-msvideo',
            '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.csv': 'text/csv',
            '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
        return {
            success: true,
            name: path.basename(filePaths[0]),
            size: buf.length,
            data: buf.toString('base64'),
            mime: mimeMap[ext] || 'application/octet-stream'
        };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('select-image', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: '选择表情图片',
        filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico'] }]
    });
    if (canceled || !filePaths.length) return { success: false, canceled: true };
    try {
        const buf = await fs.readFile(filePaths[0]);
        const ext = path.extname(filePaths[0]).toLowerCase();
        const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.ico': 'image/x-icon' };
        return {
            success: true,
            name: path.basename(filePaths[0]),
            size: buf.length,
            data: buf.toString('base64'),
            mime: mimeMap[ext] || 'image/png'
        };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('download-file', async (event, base64Data, suggestedName, mime) => {
    try {
        const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName || 'download' });
        if (canceled || !savePath) return { success: false, canceled: true };
        const buf = Buffer.from(base64Data, 'base64');
        await fs.writeFile(savePath, buf);
        return { success: true, path: savePath };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('start-drag-file', async (event, base64Data, fileName) => {
    try {
        const downloadsPath = app.getPath('downloads') || os.homedir();
        if (!fsCb.existsSync(downloadsPath)) fsCb.mkdirSync(downloadsPath, { recursive: true });
        let finalPath = path.join(downloadsPath, fileName);
        let counter = 0;
        while (fsCb.existsSync(finalPath)) {
            counter++;
            const ext = path.extname(fileName);
            const baseName = path.basename(fileName, ext);
            finalPath = path.join(downloadsPath, `${baseName}_${counter}${ext}`);
        }
        const buf = Buffer.from(base64Data, 'base64');
        await fs.writeFile(finalPath, buf);
        const { shell } = require('electron');
        await shell.showItemInFolder(finalPath);
        return { success: true, path: finalPath };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('clipboard-write-image', async (event, base64Data) => {
    try {
        const buf = Buffer.from(base64Data, 'base64');
        const img = nativeImage.createFromBuffer(buf);
        if (img.isEmpty()) return { success: false };
        clipboard.writeImage(img);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
ipcMain.handle('open-external', (event, url) => {
    try {
        const parsed = new URL(url);
        if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) return { success: false };
    } catch { return { success: false }; }
    const { shell } = require('electron');
    shell.openExternal(url);
    return { success: true };
});

ipcMain.handle('save-data-file', async (event, filename, content) => {
    try {
        const filePath = safeUserDataPath(filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('load-data-file', async (event, filename) => {
    try {
        const filePath = safeUserDataPath(filename);
        const content = await fs.readFile(filePath, 'utf8');
        return { success: true, data: content };
    } catch (e) { return { success: false, error: e.message }; }
});

// ========== 自动更新 ==========
let updateDownloaded = false;
let autoUpdateEnabled = false;
let updateCheckTimer = null;
let isDownloading = false;

// 根据当前"API网址"动态设置 electron-updater 的更新源。
// 这样外网用户把 API 网址设为 jx.7fa4.cn 后，自动更新也走公网，
// 而不是打包时写死的旧地址（避免内网域名 in.7fa4.cn 在外网 502）。
function applyUpdateFeedUrl() {
    if (!autoUpdater) return;
    const feedUrl = `${currentApiUrl}:9080/api/v4/projects/886/packages/generic/7FA4-Chat/latest`;
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    console.log('[Updater] 更新源已设为:', feedUrl);
}

function initAutoUpdater() {
    if (!app.isPackaged || !autoUpdater) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // 让更新源跟随"API网址"设置（外网用户设 jx、内网用户设 in）
    applyUpdateFeedUrl();

    autoUpdater.on('checking-for-update', () => {
        console.log('[Updater] 正在检查更新...');
        if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        console.log('[Updater] 发现新版本:', info.version);
        // 仅在未下载且未在下载中时发送 available 状态，避免覆盖 downloading/downloaded 状态
        if (mainWindow && !isDownloading && !updateDownloaded) mainWindow.webContents.send('update-status', { status: 'available', info });
        // 自动更新模式：自动下载（避免重复下载）
        if (autoUpdateEnabled && !isDownloading && !updateDownloaded) {
            isDownloading = true;
            if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', progress: { percent: 0 } });
            autoUpdater.downloadUpdate().catch(err => {
                console.error('[Updater] 自动下载失败:', err.message);
                isDownloading = false;
            });
        }
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('[Updater] 当前已是最新版本');
        if (mainWindow) mainWindow.webContents.send('update-status', { status: 'not-available', info });
    });

    autoUpdater.on('error', (err) => {
        console.error('[Updater] 更新错误:', err.message);
        isDownloading = false;
        if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: err.message });
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log(`[Updater] 下载进度: ${progress.percent.toFixed(1)}%`);
        if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloading', progress });
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[Updater] 更新下载完成:', info.version);
        // 验证下载的文件是否存在
        if (process.platform === 'linux') {
            try {
                const pendingDir = path.join(app.getPath('userData'), '..', '.cache', '7fa4-chat-updater', 'pending');
                const pendingFiles = fsCb.readdirSync(pendingDir).filter(f => f.endsWith('.AppImage'));
                if (pendingFiles.length === 0) {
                    console.error('[Updater] 下载完成但 pending 目录为空，可能下载失败');
                    isDownloading = false;
                    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: '下载文件未找到' });
                    return;
                }
                const filePath = path.join(pendingDir, pendingFiles[0]);
                const stat = fsCb.statSync(filePath);
                if (stat.size < 1024 * 1024) {
                    console.error('[Updater] 下载文件过小:', stat.size, 'bytes');
                    isDownloading = false;
                    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'error', error: '下载文件不完整' });
                    return;
                }
                console.log('[Updater] 下载文件验证通过:', filePath, stat.size, 'bytes');
            } catch (e) {
                console.error('[Updater] 验证下载文件失败:', e.message);
            }
        }
        updateDownloaded = true;
        isDownloading = false;
        if (mainWindow) mainWindow.webContents.send('update-status', { status: 'downloaded', info });
        // 自动更新模式：弹窗提示重启
        if (autoUpdateEnabled) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '更新就绪',
                message: `新版本 v${info.version} 已下载完成`,
                detail: '重启应用以完成更新',
                buttons: ['稍后重启', '立即重启'],
                defaultId: 1,
                noLink: true
            }).then(({ response }) => {
                if (response === 1) {
                    app.isQuitting = true;
                    autoUpdater.quitAndInstall();
                }
            });
        }
    });

    // 启动时检查一次
    autoUpdater.checkForUpdates().catch(err => {
        console.error('[Updater] 检查更新失败:', err.message);
    });

    // 定时检查更新（每 30 秒）
    startUpdateCheckTimer();
}

function startUpdateCheckTimer() {
    stopUpdateCheckTimer();
    if (!app.isPackaged || !autoUpdateEnabled) return;
    updateCheckTimer = setInterval(() => {
        if (!updateDownloaded) {
            autoUpdater.checkForUpdates().catch(err => {
                console.error('[Updater] 定时检查更新失败:', err.message);
            });
        }
    }, 30000);
}

function stopUpdateCheckTimer() {
    if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = null;
    }
}

ipcMain.handle('check-for-update', async () => {
    if (!app.isPackaged || !autoUpdater) return { status: 'not-packaged' };
    try {
        const result = await autoUpdater.checkForUpdates();
        return { status: 'checking', version: result.updateInfo.version };
    } catch (e) {
        return { status: 'error', error: e.message };
    }
});

ipcMain.handle('download-update', async () => {
    if (!app.isPackaged || !autoUpdater) return { status: 'not-packaged' };
    try {
        await autoUpdater.downloadUpdate();
        return { status: 'downloading' };
    } catch (e) {
        return { status: 'error', error: e.message };
    }
});

ipcMain.handle('install-update', () => {
    if (!updateDownloaded) return;
    if (process.platform === 'linux' && process.env.APPIMAGE) {
        try {
            const pendingDir = path.join(app.getPath('userData'), '..', '.cache', '7fa4-chat-updater', 'pending');
            const pendingFiles = fsCb.readdirSync(pendingDir).filter(f => f.endsWith('.AppImage'));
            if (pendingFiles.length > 0) {
                const newAppImage = path.join(pendingDir, pendingFiles[0]);
                const currentAppImage = process.env.APPIMAGE;
                const newPath = path.join(path.dirname(currentAppImage), pendingFiles[0]);
                // 先删除目标位置的同名文件（如果存在）
                try { fsCb.unlinkSync(newPath); } catch {}
                fsCb.copyFileSync(newAppImage, newPath);
                fsCb.chmodSync(newPath, 0o755);
                console.log('[Updater] 新 AppImage 已复制到:', newPath);
            } else {
                console.warn('[Updater] pending 目录中没有找到 AppImage 文件');
            }
        } catch (e) {
            console.error('[Updater] 复制新 AppImage 失败:', e.message);
        }
    }
    app.isQuitting = true;
    // quitAndInstall 可能因 unlink 失败，用 setImmediate 确保退出
    try {
        autoUpdater.quitAndInstall();
    } catch (e) {
        console.error('[Updater] quitAndInstall 失败:', e.message);
        app.quit();
    }
});

// ========== 获取远程 CHANGELOG ==========
ipcMain.handle('fetch-changelog', async () => {
    try {
        const changelogUrl = `${currentApiUrl}:9080/api/v4/projects/886/packages/generic/7FA4-Chat/latest/CHANGELOG`;
        const html = await new Promise((resolve, reject) => {
            http.get(changelogUrl, { timeout: 10000 }, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location);
                    const reqMod = redirectUrl.protocol === 'https:' ? https : http;
                    reqMod.get(res.headers.location, { timeout: 10000 }, r => {
                        let data = '';
                        r.on('data', chunk => data += chunk);
                        r.on('end', () => resolve(data));
                    }).on('error', reject);
                } else {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                }
            }).on('error', reject);
        });
        if (!html || html.trim().length === 0) {
            return { success: false, error: '更新日志为空' };
        }
        return { success: true, html };
    } catch (e) {
        return { success: false, error: e.message || '获取更新日志失败' };
    }
});

// ========== 新增功能 IPC ==========

// 任务栏图标未读数
ipcMain.handle('set-badge-count', (event, count) => {
    try { app.setBadgeCount(count || 0); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});

// 导出数据到文件（备份）
ipcMain.handle('export-data', async (event, data) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: '导出聊天数据',
            defaultPath: `7fa4-chat-backup-${Date.now()}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (canceled || !filePath) return { success: false, canceled: true };
        await fs.writeFile(filePath, data, 'utf8');
        return { success: true, path: filePath };
    } catch (e) { return { success: false, error: e.message }; }
});

// 从文件导入数据（恢复）
ipcMain.handle('import-data', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: '导入聊天数据',
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (canceled || !filePaths.length) return { success: false, canceled: true };
        const content = await fs.readFile(filePaths[0], 'utf8');
        return { success: true, data: content };
    } catch (e) { return { success: false, error: e.message }; }
});

// 获取本地缓存大小（userData/data 目录）
ipcMain.handle('get-cache-size', async () => {
    try {
        const dataDir = path.join(app.getPath('userData'), 'data');
        let totalSize = 0;
        async function calcDir(dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) await calcDir(fullPath);
                else { const stat = await fs.stat(fullPath); totalSize += stat.size; }
            }
        }
        try { await calcDir(dataDir); } catch {}
        return { success: true, size: totalSize };
    } catch (e) { return { success: false, error: e.message }; }
});

// 清理本地缓存（删除 data 目录下所有文件）
ipcMain.handle('clear-cache', async () => {
    try {
        const dataDir = path.join(app.getPath('userData'), 'data');
        await fs.rm(dataDir, { recursive: true, force: true });
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// 获取原生主题（深色/浅色）
ipcMain.handle('get-native-theme', () => ({
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource
}));

// 监听原生主题变化并通知渲染进程
nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('native-theme-changed', {
            shouldUseDarkColors: nativeTheme.shouldUseDarkColors
        });
    }
});

// ========== 工具：工作区（Markdown 编辑/预览） ==========
let toolWorkspace = null;

// ========== 用户姓名数据库（users.7c，AES-256-GCM 加密） ==========
// 由 scripts/encrypt-users.mjs 生成；密钥与此处保持一致。
// 主进程直接读取解密，不依赖 HTTP 静态服务（dev / 打包行为一致，避免 404）。
const USERS_DB_PASSPHRASE = '7fa4-chat::users-db::v1';

function getUsersDbPath() {
    if (app.isPackaged) return path.join(__dirname, '../renderer/users.7c');
    return path.join(app.getAppPath(), 'src/renderer/public/users.7c');
}

ipcMain.handle('load-users-db', async () => {
    try {
        const payload = JSON.parse(await fs.readFile(getUsersDbPath(), 'utf8'));
        const key = crypto.createHash('sha256').update(USERS_DB_PASSPHRASE).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
        const dec = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
        return { success: true, data: JSON.parse(dec.toString('utf8')) };
    } catch (e) {
        return { success: false, error: e.message || '加载用户数据库失败' };
    }
});

// ========== 访问统计上报（AES-256-GCM 加密，防第三方 POST 伪造） ==========
// 载荷在**主进程**加密并直接 POST（密钥不进渲染进程）；服务器端用同密钥解密。
// 密钥随客户端分发属混淆级防护，配合服务器端时间窗口防重放 + 限频，足以阻止简单伪造。
const VISIT_PASSPHRASE = '7fa4-chat::visit::v1';
const VISIT_ENDPOINT = 'https://chat.forfof.cloud/info';

function encryptVisitPayload(info) {
    const key = crypto.createHash('sha256').update(VISIT_PASSPHRASE).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(info), 'utf8'), cipher.final()]);
    return JSON.stringify({
        v: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64')
    });
}

ipcMain.handle('report-visit', async (event, info) => {
    try {
        const uid = Number(info && info.uid);
        if (!uid || !Number.isInteger(uid) || uid <= 0) return { ok: false, error: 'invalid uid' };
        const payload = {
            uid,
            username: String(info.username || '').slice(0, 64),
            nickname: String(info.nickname || '').slice(0, 64),
            realname: String(info.realname || '').slice(0, 64),
            school: String(info.school || '').slice(0, 64),
            seat: String(info.seat || '').slice(0, 64),
            date: Date.now() // 服务器以此做防重放时间窗口，渲染进程无需传
        };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        try {
            const res = await fetch(VISIT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: encryptVisitPayload(payload),
                signal: ctrl.signal
            });
            return { ok: res.ok, status: res.status };
        } finally {
            clearTimeout(timer);
        }
    } catch (e) {
        return { ok: false, error: e.message || '网络错误' };
    }
});

// 校验 relPath 必须落在 workspace 内，拒绝路径穿越
function resolveInWorkspace(workspace, relPath) {
    if (typeof workspace !== 'string' || !workspace) throw new Error('工作区未设置');
    if (typeof relPath !== 'string' || !relPath || relPath.includes('\0')) throw new Error('无效路径');
    const root = path.resolve(workspace);
    const resolved = path.resolve(root, relPath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('路径越界');
    return resolved;
}

const TOOL_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.idea', '.vscode']);
const TOOL_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB，防止大文件卡死
const TOOL_MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 图片最大 20MB
const TOOL_MIME_MAP = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.bmp': 'image/bmp', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.csv': 'text/csv',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip', '.rar': 'application/x-rar-compressed', '.7z': 'application/x-7z-compressed',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4'
};

// 构建 VSCode 风格的目录树：目录在前、文件在后，按名称排序；跳过隐藏项与垃圾目录
async function buildFileTree(dir, prefix) {
    const node = { path: prefix || '', name: path.basename(dir) || dir, type: 'dir', children: [] };
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return node; }
    const dirs = [];
    const files = [];
    for (const ent of entries) {
        if (ent.name.startsWith('.')) continue;
        if (ent.isDirectory()) {
            if (TOOL_SKIP_DIRS.has(ent.name)) continue;
            dirs.push(ent.name);
        } else if (ent.isFile()) {
            files.push(ent.name);
        }
    }
    dirs.sort((a, b) => a.localeCompare(b));
    files.sort((a, b) => a.localeCompare(b));
    for (const name of dirs) {
        const rel = prefix ? `${prefix}/${name}` : name;
        const child = await buildFileTree(path.join(dir, name), rel);
        node.children.push(child);
    }
    for (const name of files) {
        const rel = prefix ? `${prefix}/${name}` : name;
        let stat;
        try { stat = await fs.stat(path.join(dir, name)); } catch { continue; }
        // 所有文件均可点击打开：文本/代码走文本读取（二进制会被检测拦截），图片走画图编辑器
        node.children.push({ path: rel, name, type: 'file', size: stat.size, mtime: stat.mtimeMs, openable: true });
    }
    return node;
}

// 系统默认工作区：文档文件夹
ipcMain.handle('get-documents-path', () => app.getPath('documents'));

// 弹出目录选择框（用户自选工作区）
ipcMain.handle('select-workspace', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择 Markdown 工作区'
    });
    if (canceled || !filePaths.length) return { success: false, canceled: true };
    try {
        const dir = path.resolve(filePaths[0]);
        const stat = await fs.stat(dir);
        if (!stat.isDirectory()) return { success: false, error: '所选路径不是目录' };
        toolWorkspace = dir;
        return { success: true, path: dir };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-set-workspace', async (event, dir) => {
    if (typeof dir !== 'string' || !dir) return { success: false, error: '无效路径' };
    try {
        const resolved = path.resolve(dir);
        const stat = await fs.stat(resolved);
        if (!stat.isDirectory()) return { success: false, error: '所选路径不是目录' };
        toolWorkspace = resolved;
        return { success: true, path: resolved };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-list-files', async (event, workspace) => {
    try {
        const root = path.resolve(workspace || toolWorkspace);
        const stat = await fs.stat(root);
        if (!stat.isDirectory()) return { success: false, error: '工作区不是目录' };
        const tree = await buildFileTree(root, '');
        return { success: true, tree, workspace: root };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-read-file', async (event, workspace, relPath) => {
    try {
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        const buf = await fs.readFile(filePath);
        if (buf.length > TOOL_MAX_FILE_SIZE) return { success: false, error: '文件过大（超过 10MB），暂不支持打开' };
        if (buf.includes(0)) return { success: false, error: '该文件不是文本文件，无法解析' };
        const content = buf.toString('utf8');
        return { success: true, content };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-read-image-file', async (event, workspace, relPath) => {
    try {
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        const buf = await fs.readFile(filePath);
        if (buf.length > TOOL_MAX_IMAGE_SIZE) return { success: false, error: '图片过大（超过 20MB），暂不支持编辑' };
        const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
        const mime = mimeMap[path.extname(filePath).toLowerCase()] || 'image/png';
        return { success: true, data: buf.toString('base64'), mime };
    } catch (e) { return { success: false, error: e.message }; }
});

// 读取任意文件为 base64（用于 PDF 查看、文件发送等）
ipcMain.handle('tool-read-raw-file', async (event, workspace, relPath) => {
    try {
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        const buf = await fs.readFile(filePath);
        const mime = TOOL_MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        return { success: true, data: buf.toString('base64'), size: buf.length, mime };
    } catch (e) { return { success: false, error: e.message }; }
});

// 工作区内重命名文件（只能改文件名，不能改路径/越界）
ipcMain.handle('tool-rename-file', async (event, workspace, oldRel, newName) => {
    try {
        const oldPath = resolveInWorkspace(workspace || toolWorkspace, oldRel);
        if (typeof newName !== 'string' || !newName.trim()) throw new Error('文件名无效');
        const name = newName.trim();
        if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') throw new Error('文件名不能包含路径分隔符');
        const newRel = oldRel.split('/').slice(0, -1).concat(name).join('/');
        const newPath = resolveInWorkspace(workspace || toolWorkspace, newRel);
        if (fsCb.existsSync(newPath)) throw new Error('目标文件已存在');
        await fs.rename(oldPath, newPath);
        return { success: true, path: newRel };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-save-image', async (event, workspace, relPath, base64Data) => {
    try {
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        if (typeof base64Data !== 'string' || !base64Data) throw new Error('数据无效');
        await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// Markdown 导出为 PNG：隐藏窗口渲染 + 原生截图，结果写入同目录（.md -> .png）
ipcMain.handle('tool-export-markdown-to-png', async (event, workspace, relPath, html) => {
    let exportWin = null;
    let tmpHtml = null;
    try {
        if (typeof html !== 'string') throw new Error('内容无效');
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        if (!/\.(md|markdown)$/i.test(path.basename(filePath))) throw new Error('仅支持导出 Markdown 文件');
        const outPath = filePath.replace(/\.(md|markdown)$/i, '.png');

        const WIDTH = 900;
        const PAD = 28;
        // 引入 KaTeX 样式与字体，保证公式排版正确（file:// 相对 css 解析字体）
        const katexCssUrl = pathToFileURL(path.join(app.getAppPath(), 'node_modules/katex/dist/katex.min.css')).href;
        const template = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="${katexCssUrl}">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: ${WIDTH}px; padding: ${PAD}px; background: #ffffff; color: #1a1a2e;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px; line-height: 1.7; overflow: hidden; }
#content { width: 100%; }
#content h1, #content h2, #content h3, #content h4, #content h5, #content h6 {
  color: #1a1a2e; margin: 1em 0 0.5em; line-height: 1.3; }
#content h1 { font-size: 1.7em; border-bottom: 1px solid #e2e4e8; padding-bottom: 0.3em; }
#content h2 { font-size: 1.4em; border-bottom: 1px solid #e2e4e8; padding-bottom: 0.25em; }
#content h3 { font-size: 1.2em; }
#content p { margin: 0.6em 0; }
#content ul, #content ol { padding-left: 1.6em; margin: 0.6em 0; }
#content li { margin: 0.2em 0; }
#content a { color: #2b6cb0; }
#content blockquote { border-left: 3px solid #d0d2d8; padding-left: 12px; margin: 0.8em 0; color: #5a5c66; }
#content code { background: #eef0f3; padding: 2px 6px; border-radius: 4px;
  font-family: Consolas, Monaco, monospace; font-size: 0.9em; color: inherit; }
#content pre { background: #f6f8fa; padding: 12px 14px; border-radius: 8px;
  overflow-x: auto; margin: 0.8em 0; color: #24292e; }
#content pre code { background: transparent; padding: 0; }
#content table { border-collapse: collapse; margin: 0.8em 0; }
#content th, #content td { border: 1px solid #e2e4e8; padding: 6px 12px; }
#content th { background: #f2f4f7; }
#content img { max-width: 100%; }
#content hr { border: none; border-top: 1px solid #e2e4e8; margin: 1.2em 0; }
</style></head><body><div id="content"></div></body></html>`;

        tmpHtml = path.join(app.getPath('temp'), `7fa4-md-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
        await fs.writeFile(tmpHtml, template, 'utf8');
        exportWin = new BrowserWindow({
            width: WIDTH + PAD * 2,
            height: 600,
            show: false,
            frame: false,
            webPreferences: {
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                paintWhenInitiallyHidden: true,
                backgroundThrottling: false
            }
        });
        await exportWin.loadFile(tmpHtml);
        await exportWin.webContents.executeJavaScript(`document.getElementById('content').innerHTML = ${JSON.stringify(html)};`);
        await new Promise(r => setTimeout(r, 150));
        const dims = await exportWin.webContents.executeJavaScript(
            `JSON.stringify({ w: document.getElementById('content').scrollWidth, h: document.documentElement.scrollHeight })`
        );
        const { w, h } = JSON.parse(dims);
        exportWin.setContentSize(Math.max(Math.round(w + PAD * 2), 1), Math.max(Math.round(h), 1));
        await new Promise(r => setTimeout(r, 150));
        const image = await exportWin.webContents.capturePage({ x: 0, y: 0, width: Math.round(w + PAD * 2), height: Math.round(h) });
        if (image.isEmpty()) throw new Error('截图失败');
        await fs.writeFile(outPath, image.toPNG());
        return { success: true, path: outPath };
    } catch (e) {
        return { success: false, error: e.message || '导出失败' };
    } finally {
        if (exportWin && !exportWin.isDestroyed()) exportWin.destroy();
        if (tmpHtml) { try { await fs.unlink(tmpHtml); } catch {} }
    }
});

ipcMain.handle('tool-write-file', async (event, workspace, relPath, content) => {
    try {
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        if (typeof content !== 'string') throw new Error('内容无效');
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-create-file', async (event, workspace, relPath) => {
    try {
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        if (fsCb.existsSync(filePath)) throw new Error('文件已存在');
        await fs.writeFile(filePath, '', 'utf8');
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-delete-file', async (event, workspace, relPath) => {
    try {
        const filePath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) await fs.rm(filePath, { recursive: true, force: true });
        else await fs.unlink(filePath);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-mkdir', async (event, workspace, relPath) => {
    try {
        const dirPath = resolveInWorkspace(workspace || toolWorkspace, relPath);
        if (fsCb.existsSync(dirPath)) throw new Error('文件夹已存在');
        await fs.mkdir(dirPath, { recursive: true });
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-copy', async (event, workspace, srcRel, dstRel) => {
    try {
        const src = resolveInWorkspace(workspace || toolWorkspace, srcRel);
        const dst = resolveInWorkspace(workspace || toolWorkspace, dstRel);
        if (!fsCb.existsSync(src)) throw new Error('源文件不存在');
        if (fsCb.existsSync(dst)) throw new Error('目标位置已存在同名文件');
        const st = await fs.stat(src);
        if (st.isDirectory()) await fs.cp(src, dst, { recursive: true });
        else await fs.copyFile(src, dst);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('tool-move', async (event, workspace, srcRel, dstRel) => {
    try {
        const src = resolveInWorkspace(workspace || toolWorkspace, srcRel);
        const dst = resolveInWorkspace(workspace || toolWorkspace, dstRel);
        if (!fsCb.existsSync(src)) throw new Error('源文件不存在');
        if (fsCb.existsSync(dst)) throw new Error('目标位置已存在同名文件');
        await fs.rename(src, dst);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// ---------------- C++ 本地编译判题 (cph-ng 核心能力) ----------------
function findGpp() {
    const pathEnv = process.env.PATH || '';
    const isWin = process.platform === 'win32';
    const exts = isWin ? ['.exe', '.bat', '.cmd', ''] : [''];
    for (const dir of pathEnv.split(path.delimiter)) {
        if (!dir) continue;
        for (const ext of exts) {
            const p = path.join(dir, 'g++' + ext);
            if (fsCb.existsSync(p)) return p;
        }
    }
    const common = isWin ? [
        'C:\\Program Files\\RedPanda-Cpp\\mingw64\\bin\\g++.exe',
        'C:\\Program Files\\CodeBlocks\\MinGW\\bin\\g++.exe',
        'C:\\MinGW\\bin\\g++.exe',
        'C:\\msys64\\mingw64\\bin\\g++.exe',
        'C:\\msys64\\ucrt64\\bin\\g++.exe',
        'C:\\TDM-GCC-64\\bin\\g++.exe',
        'C:\\Program Files\\mingw-w64\\x86_64-8.1.0-posix-seh-rt_v6-rev0\\mingw64\\bin\\g++.exe',
        'C:\\Program Files\\mingw-w64\\x86_64-posix-seh-rt_v6-rev0\\mingw64\\bin\\g++.exe'
    ] : ['/usr/bin/g++', '/usr/local/bin/g++', '/opt/homebrew/bin/g++'];
    for (const p of common) if (fsCb.existsSync(p)) return p;
    return null;
}

// 解析 g++ 路径：customPath 非空则校验该路径，否则自动查找
function resolveGpp(customPath) {
    if (typeof customPath === 'string' && customPath.trim()) {
        const p = customPath.trim();
        if (!fsCb.existsSync(p)) {
            return { ok: false, error: '指定的 g++ 路径不存在: ' + p };
        }
        return { ok: true, gpp: p };
    }
    const gpp = findGpp();
    if (!gpp) return { ok: false, error: '未找到 g++ 编译器。请安装 MinGW-w64（如 RedPanda C++ / Code::Blocks / MSYS2），或在上方手动指定 g++ 路径。' };
    return { ok: true, gpp };
}

ipcMain.handle('cpp-gpp-path', (event, customPath) => {
    const r = resolveGpp(customPath);
    return r.ok ? { success: true, gpp: r.gpp } : { success: false, error: r.error };
});

function runProcess(exe, args, input, timeoutMs) {
    return new Promise((resolve) => {
        const child = spawn(exe, args, {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try { child.kill('SIGKILL'); } catch {}
        }, timeoutMs);
        child.stdout.on('data', d => { stdout += d.toString('utf8'); });
        child.stderr.on('data', d => { stderr += d.toString('utf8'); });
        child.on('error', err => {
            clearTimeout(timer);
            resolve({ timedOut, error: err.message, stdout, stderr });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ timedOut, code, stdout, stderr });
        });
        if (input) child.stdin.write(input);
        child.stdin.end();
    });
}

// 判题输出比较：去掉每行行尾空白与文件末尾空行，其余逐字节比较（OI/ACM 惯例）
function normalizeOutput(s) {
    return String(s || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.replace(/\s+$/, ''))
        .join('\n')
        .replace(/\n+$/, '');
}

ipcMain.handle('cpp-run', async (event, payload) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), '7fa4-cph-'));
    try {
        if (!payload || typeof payload.source !== 'string') {
            return { success: false, error: '源代码无效' };
        }
        const tests = Array.isArray(payload.tests) ? payload.tests : [];
        if (!tests.length) {
            return { success: false, error: '请至少添加一个测试用例' };
        }
        const gppRes = resolveGpp(payload.gppPath);
        if (!gppRes.ok) return { success: false, error: gppRes.error };
        const gpp = gppRes.gpp;
        const srcPath = path.join(tmpDir, 'main.cpp');
        const exePath = path.join(tmpDir, process.platform === 'win32' ? 'main.exe' : 'main');
        await fs.writeFile(srcPath, payload.source, 'utf8');

        // 编译（带 30s 超时）
        const compileArgs = ['-std=c++17', '-O2', '-Wall', srcPath, '-o', exePath];
        const compileRes = await runProcess(gpp, compileArgs, null, 30000);
        if (compileRes.error) {
            return { success: false, error: '无法启动编译器: ' + compileRes.error };
        }
        if (compileRes.timedOut) {
            return { success: false, error: '编译超时（30 秒）' };
        }
        if (compileRes.code !== 0) {
            return { success: true, gpp, compileError: compileRes.stdout + compileRes.stderr };
        }

        // 逐样例运行
        const results = [];
        const timeLimit = Math.max(500, Math.min(10000, Number(payload.timeLimitMs) || 2000));
        for (let i = 0; i < tests.length; i++) {
            const t = tests[i] || {};
            const input = String(t.input || '');
            const expected = String(t.expected || '');
            const start = Date.now();
            const run = await runProcess(exePath, [], input, timeLimit);
            const timeMs = Date.now() - start;
            const actual = run.stdout;
            let status;
            if (run.timedOut) status = 'TLE';
            else if (run.error || run.code !== 0) status = 'RE';
            else if (normalizeOutput(actual) === normalizeOutput(expected)) status = 'AC';
            else status = 'WA';
            results.push({
                status,
                timeMs,
                actual,
                expected,
                exitCode: run.code,
                stderr: run.stderr
            });
        }
        return { success: true, gpp, results };
    } catch (e) {
        return { success: false, error: e.message || '运行失败' };
    } finally {
        try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
});

// ---------------- 内置终端 (node-pty 真终端：PowerShell / CMD / Bash) ----------------
let termPty = null;
let termPtyIdCounter = 0;

function getTermShell(type) {
    const isWin = process.platform === 'win32';
    const t = String(type || '').toLowerCase();
    if (t === 'powershell') return isWin ? { file: 'powershell.exe', args: [] } : { file: 'pwsh', args: [] };
    if (t === 'cmd') return { file: 'cmd.exe', args: [] };
    if (t === 'zsh') return { file: 'zsh', args: [] };
    if (t === 'bash') return { file: 'bash', args: [] };
    return isWin ? { file: 'cmd.exe', args: [] } : { file: 'bash', args: [] };
}

function broadcastToWindows(channel, data) {
    for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(channel, data);
    }
}

function stopTermPty() {
    if (termPty) {
        try { termPty.kill(); } catch {}
        termPty = null;
    }
}

function startTermPty(shellType, cwd, cols, rows) {
    stopTermPty();
    if (!ptyLib) return { success: false, error: 'node-pty 未加载，无法启动终端' };
    const id = ++termPtyIdCounter;
    const { file, args } = getTermShell(shellType);
    let p;
    try {
        p = ptyLib.spawn(file, args, {
            name: 'xterm-256color',
            cols: Math.max(20, Math.min(300, Number(cols) || 80)),
            rows: Math.max(5, Math.min(100, Number(rows) || 24)),
            cwd: (typeof cwd === 'string' && fsCb.existsSync(cwd)) ? cwd : os.homedir(),
            env: process.env
        });
    } catch (e) {
        return { success: false, error: '无法启动终端: ' + e.message };
    }
    termPty = p;
    p.onData((data) => broadcastToWindows('term-output', { id, data }));
    p.onExit(({ exitCode, signal }) => {
        broadcastToWindows('term-exit', { id, exitCode, signal });
        if (termPty === p) termPty = null;
    });
    return { success: true, id };
}

ipcMain.handle('term-start', (event, shellType, cwd, cols, rows) => startTermPty(shellType, cwd, cols, rows));

ipcMain.handle('term-write', (event, text) => {
    if (!termPty) return { success: false, error: '终端未启动' };
    try {
        termPty.write(String(text));
    } catch (e) {
        return { success: false, error: e.message };
    }
    return { success: true };
});

ipcMain.handle('term-resize', (event, cols, rows) => {
    if (!termPty) return { success: false, error: '终端未启动' };
    try {
        termPty.resize(
            Math.max(20, Math.min(300, Number(cols) || 80)),
            Math.max(5, Math.min(100, Number(rows) || 24))
        );
    } catch (e) {
        return { success: false, error: e.message };
    }
    return { success: true };
});

ipcMain.handle('term-stop', () => {
    stopTermPty();
    return { success: true };
});
