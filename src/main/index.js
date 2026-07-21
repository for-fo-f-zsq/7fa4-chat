const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog, session, clipboard, nativeTheme, desktopCapturer } = require('electron');
const fs = require('fs').promises;
const fsCb = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const https = require('https');
const http = require('http');
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
            if (setting.minimizeToTray !== undefined) minimizeToTray = setting.minimizeToTray;
            if (setting.apiUrl) currentApiUrl = setting.apiUrl.replace(/\/$/, '');
            if (setting.autoUpdate !== undefined) autoUpdateEnabled = setting.autoUpdate;
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

ipcMain.handle('get-user-data-path', (event, filename) => path.join(app.getPath('userData'), filename));

ipcMain.handle('get-version', () => app.getVersion());

let cachedSetting = null;

async function loadSettingFromFile() {
    try {
        const filePath = path.join(app.getPath('userData'), 'setting.7c');
        const content = await fs.readFile(filePath, 'utf8');
        cachedSetting = JSON.parse(content);
    } catch { cachedSetting = {}; }
    return cachedSetting;
}

async function saveSettingToFile(data) {
    cachedSetting = data;
    try {
        const filePath = path.join(app.getPath('userData'), 'setting.7c');
        await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
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
        webPreferences: { sandbox: false, nodeIntegration: true, contextIsolation: false }
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

ipcMain.handle('open-external', (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
});

ipcMain.handle('save-data-file', async (event, filename, content) => {
    try {
        const filePath = path.join(app.getPath('userData'), filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('load-data-file', async (event, filename) => {
    try {
        const filePath = path.join(app.getPath('userData'), filename);
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

    // 定时检查更新（每 5 秒）
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
    }, 5000);
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

// 截图：截取主屏幕并保存到临时文件，返回路径
ipcMain.handle('screenshot', async () => {
    try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
        if (!sources.length) return { success: false, error: '未找到屏幕' };
        const image = sources[0].thumbnail;
        const pngBuffer = image.toPNG();
        const base64Data = pngBuffer.toString('base64');
        return { success: true, data: base64Data, size: pngBuffer.length, mime: 'image/png', name: `screenshot_${Date.now()}.png` };
    } catch (e) { return { success: false, error: e.message }; }
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
