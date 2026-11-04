const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, dialog, session, clipboard, safeStorage, protocol, net } = require('electron');
const fs = require('fs').promises;
const fsCb = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { pathToFileURL } = require('url');
let autoUpdater;
try { ({ autoUpdater } = require('electron-updater')); } catch { autoUpdater = null; }

// —— 本地资源特权协议（geo:// GeoGebra 资源、tool:// 已安装的在线工具）——
// 必须在 app ready 之前注册 scheme 特权；两者都按标准安全源处理，iframe/fetch 才能正常加载。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'geo',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: 'tool',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);
// 资源根：打包后 resources/geogebra，开发时项目 resources/geogebra
function geogebraRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'geogebra');
  return path.resolve(__dirname, '../../resources/geogebra');
}

const { createProxyMiddleware } = require('http-proxy-middleware');
const { UserStore, migrateLegacy, importLegacyData } = require('./storage');

let mainWindow;
let tray = null;
let serverStarted = false;
let serverInstance = null;
// 本地代理服务器实际监听端口：不再固定 1145，由「上次用过的端口 → 端口区间 → 系统分配」依次决定
let serverPort = 0;
// electron-vite 注入的 dev server 地址及其端口（生产为空）；白名单 / cookie 归属都要用它
const rendererEnvUrl = process.env.ELECTRON_RENDERER_URL || '';
let devOriginPort = '';
try { devOriginPort = new URL(rendererEnvUrl).port || ''; } catch { devOriginPort = ''; }
// 端口握手文件：主进程写实际端口，electron.vite.config.js 的 dev 转发每次请求读它跟随
const DEV_PORT_FILE = path.join(os.tmpdir(), '7fa4-chat-dev-port');
function writeDevPortFile(port) {
    if (app.isPackaged) return;
    try {
        if (port > 0) fsCb.writeFileSync(DEV_PORT_FILE, String(port));
        else fsCb.rmSync(DEV_PORT_FILE, { force: true });
    } catch { /* 握手文件写失败只影响 dev 转发，不影响启动 */ }
}
// 上次成功的端口记在 userData 里复用：页面 origin 含端口，端口一变 localStorage / OJ cookie 就清零
const PORT_BAND_START = 20000;
const PORT_BAND_SIZE = 20;
function portRecordFile() { return path.join(app.getPath('userData'), 'local-port'); }
function readRememberedPort() {
    try {
        const p = Number(fsCb.readFileSync(portRecordFile(), 'utf8').trim());
        return (Number.isInteger(p) && p >= 1024 && p < 65536) ? p : 0;
    } catch { return 0; }
}
function rememberPort(port) {
    try { fsCb.writeFileSync(portRecordFile(), String(port)); } catch { /* 记不住就下次重新挑，不影响启动 */ }
}
function portCandidates() {
    const list = [];
    const remembered = readRememberedPort();
    if (remembered) list.push(remembered);
    for (let i = 0; i < PORT_BAND_SIZE; i++) list.push(PORT_BAND_START + i);
    list.push(0); // 兜底：系统分配空闲端口
    return list;
}
let minimizeToTray = true;
let forceClose = false;   // 数据已落盘，允许真正关闭
let flushPending = false; // 正在等待渲染进程 flush 确认
let pendingRestart = false; // 托盘"重启"：flush 完成后 relaunch
let currentApiUrl = 'https://jx.7fa4.cn';
let userStore = null; // SQLite 用户数据存储（whenReady 初始化）

// Linux/AppImage 下 execPath 指向临时挂载点，relaunch 后挂载点失效会导致新进程无法启动。
// Electron 官方建议：不要在 AppImage 用 app.relaunch()，而改用"启动新进程后让本进程以优雅方式退出"。
// 统一走 app.quit()（BSD/退出时机干净），并显式重建主进程对象，避免 Linux 直接退出不再打开。
function appRestart() {
  try {
    // 借助 stdin/stdout 或退出码 0 平滑退出；quitAndInstall 的 quit 流程足够干净。
    // 关键差异：Linux 下不要用 app.exit(0)（硬杀），否则新实例在旧实例释放单实例锁之前启动 → 误判已有实例而退出。
    app.isQuitting = true;
    if (process.platform === 'linux' && process.env.APPIMAGE) {
      // AppImage：app.relaunch() 在 Linux 上不可靠（新实例与旧实例的单实例锁竞态，导致新实例立即退出、看起来"只关闭不重开"）。
      // 改为派生一个分离的等待进程：等本进程退出（单实例锁随之释放）后再执行同一个 AppImage 重新打开。
      const { spawn } = require('child_process');
      const appImage = process.env.APPIMAGE;
      const pid = process.pid;
      // sh 存活循环等 pid 消失 → 再等 1s 让锁/挂载稳定 → exec 变成 AppImage 进程（detached 不受本进程退出影响）
      const script = `while kill -0 ${pid} 2>/dev/null; do sleep 0.2; done; sleep 1; exec "${appImage}"`;
      const child = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' });
      child.unref();
      app.exit(0); // 数据已 flush 完成，直接退出释放单实例锁
      return;
    }
    app.relaunch();
    app.quit();
  } catch (err) {
    console.error('[Restart] 重启失败:', err && err.message);
    app.quit();
  }
}

function startServer(preferPort) {
    // 返回 Promise<实际端口>（0=失败）；preferPort 用于重启时原地重绑旧端口（页面 origin 已固定）
    return new Promise((resolve) => {
    if (serverStarted) return resolve(serverPort);
    const serverApp = express();

    // 仅放行本机页面/dev server 请求（防 CSRF 借道、DNS rebinding）；端口运行时确定，白名单须在请求时算
    // dev server 端口可能因 5173 被占自增，用 electron-vite 注入的真实端口而非写死 5173
    const loopbackHit = (h, port) => port > 0 && (h === `localhost:${port}` || h === `127.0.0.1:${port}` || h === `[::1]:${port}`);
    const isAllowedHost = (host) => {
        if (!host) return false;
        const h = host.toLowerCase();
        if (loopbackHit(h, serverPort)) return true;
        return loopbackHit(h, Number(devOriginPort) || 0);
    };
    serverApp.use((req, res, next) => {
        const host = (req.headers.host || '').toLowerCase();
        if (!isAllowedHost(host)) return res.status(403).end('Forbidden');
        const origin = req.headers.origin;
        if (origin) {
            let originOk = false;
            try { originOk = isAllowedHost(new URL(origin).host); } catch {}
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
    serverApp.use('/logout', createProxyMiddleware({
        target: currentApiUrl + ':8888/logout',
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

    // 端口不再固定（1145 曾被其他账户的进程长期占用且杀不掉，导致应用起不来）：优先复用上次的端口
    // ——页面 origin 含端口，端口一变 localStorage / OJ cookie 就清零；复用不了就在区间里挑，最后交给系统
    const prefer = (Number.isInteger(preferPort) && preferPort > 0) ? preferPort : 0;
    const candidates = prefer ? [prefer, 0] : portCandidates();
    let settled = false;
    const giveUp = () => {
        serverStarted = false;
        serverInstance = null;
        serverPort = 0;
        writeDevPortFile(0);
        if (!settled) { settled = true; resolve(0); }
    };
    const tryListen = (i) => {
        if (i >= candidates.length) return giveUp();
        const want = candidates[i];
        const inst = serverApp.listen(want);
        inst.once('listening', () => {
            serverStarted = true;
            serverInstance = inst;
            serverPort = inst.address().port;
            console.log('Server started on port', serverPort);
            rememberPort(serverPort);
            writeDevPortFile(serverPort);
            inst.on('error', (err) => console.error('Server error:', err));
            if (!settled) { settled = true; resolve(serverPort); }
        });
        inst.once('error', (err) => {
            console.error('[Server] 端口 ' + want + ' 不可用，尝试下一个:', err && err.code || err && err.message);
            inst.close(() => {});
            tryListen(i + 1);
        });
    };
    tryListen(0);
    });
}

function stopServer() {
    // 等端口真正释放后再重启（避免重绑 EADDRINUSE）；刻意不清空 serverPort，重启方要用
    return new Promise((resolve) => {
        if (!serverStarted || !serverInstance) return resolve();
        const inst = serverInstance;
        serverInstance = null;
        serverStarted = false;
        inst.close(() => resolve());
    });
}

// 渲染进程加载：等价地址候选 + 重试，全失败则显示诊断页，避免静默白屏
function rendererUrlCandidates(rawUrl) {
    const list = [];
    const push = (u) => { if (u && !list.includes(u)) list.push(u); };
    push(rawUrl);
    try {
        const u = new URL(rawUrl);
        const port = u.port || (u.protocol === 'https:' ? '443' : '80');
        const scheme = u.protocol === 'https:' ? 'https' : 'http';
        const name = u.hostname;
        if (name === 'localhost') {
            push(scheme + '://127.0.0.1:' + port + '/');
            push(scheme + '://[::1]:' + port + '/');
        } else if (name === '127.0.0.1') {
            push(scheme + '://[::1]:' + port + '/');
        } else if (name === '[::1]' || name === '::1') {
            push(scheme + '://127.0.0.1:' + port + '/');
        }
    } catch { /* 非法 URL 就只试原地址 */ }
    return list;
}

function rendererFailPage(tried) {
    const items = tried
        .map((t) => '<li style="margin:2px 0"><code style="color:#8ab4f8">' + t.url + '</code> → ' + t.err + '</li>')
        .join('');
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>界面加载失败</title></head>'
        + '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#1b1c1f;color:#e6e6e6;font:14px/1.7 \'Microsoft YaHei\',system-ui,sans-serif">'
        + '<div style="max-width:640px;margin:16px;padding:26px 30px;border:1px solid #34363b;border-radius:12px;background:#232428">'
        + '<h1 style="margin:0 0 6px;font-size:18px;-webkit-app-region:drag">⚠️ 界面加载失败</h1>'
        + '<p style="margin:0 0 12px;color:#9aa0a6;font-size:13px">窗口没能连上渲染进程服务，所以之前显示为空白。</p>'
        + '<ul style="margin:0 0 12px;padding-left:20px;color:#cfd2d6;font-size:13px">' + items + '</ul>'
        + '<p style="margin:0;color:#9aa0a6;font-size:13px">开发模式常见原因：5173 端口被残留进程占用，或 dev server 尚未就绪。<br>'
        + '处理：结束残留的 node/vite 进程后重新执行 <code>npm run dev</code>。<br>'
        + '本窗口可通过托盘图标关闭。</p>'
        + '</div></body></html>';
}

async function loadRenderer(win, candidates) {
    const tried = [];
    for (const url of candidates) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await win.loadURL(url);
                if (url !== candidates[0] || attempt > 1) console.log('[Window] 渲染进程已加载（备用地址）:', url);
                return true;
            } catch (err) {
                const code = (err && (err.code || err.errno)) || '';
                const msg = (err && err.message) || String(err);
                if (attempt >= 3) tried.push({ url, err: String(code ? code + ' ' + msg : msg).trim() });
                else await new Promise((r) => setTimeout(r, 500));
            }
        }
    }
    console.error('[Window] 渲染进程加载失败:\n' + tried.map((t) => '  - ' + t.url + ' -> ' + t.err).join('\n'));
    try {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(rendererFailPage(tried)));
    } catch { /* 兜底页都失败就只能空窗口了 */ }
    return false;
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
            // Ctrl/Cmd+W：关闭窗口（走下面的 close 拦截：托盘/确认后放行）
            event.preventDefault()
            mainWindow.close()
        }
    });

    // 开发态用 electron-vite 注入的地址，失败自动重试/换候选，最终兜底诊断页
    // 本地服务没起来时不能再回退到 1145（那是别人的进程），直接显示诊断页
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
        || (serverPort > 0 ? 'http://127.0.0.1:' + serverPort : '');
    if (rendererUrl) {
        loadRenderer(mainWindow, rendererUrlCandidates(rendererUrl)).catch((err) => {
            console.error('[Window] loadRenderer 异常:', err && err.message);
        });
    } else {
        const tried = [{ url: '(本地服务未启动)', err: '端口绑定失败，详见主进程日志' }];
        mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(rendererFailPage(tried))).catch(() => {});
    }

    mainWindow.on('close', (event) => {
        if (minimizeToTray && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return;
        }
        // 真正关闭前：先通知渲染进程落盘（convo 30s / pref 1.5s 节流数据也能保存）
        // 渲染层 flushData 完成后发 app-flush-done → forceClose=true → 下一轮 close 才真正放行
        // 关键：只要 forceClose 未置位，无论第几次 close（托盘退出 → app.quit() 会二次触发）都拦截，
        // 避免二次 quit 抢先把窗口销毁、flush 未完成导致节流数据丢失。
        if (!forceClose) {
            event.preventDefault();
            if (!flushPending) {
                flushPending = true;
                mainWindow.webContents.send('app-flush-before-close');
                // 超时兜底：2s 内渲染层未回 app-flush-done 则强制关闭（防渲染进程卡死/崩溃）
                setTimeout(() => {
                    if (!forceClose) {
                        forceClose = true;
                        flushPending = false;
                        if (pendingRestart) {
                            pendingRestart = false;
                            appRestart();
                            return;
                        }
                        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
                    }
                }, 2000);
            }
            // flushPending 已 true（二次 quit 触发）：继续等待 flush 完成，不在此放行
            return;
        }
    });

    // 拦截 Ctrl/Cmd+R 与 F5 刷新：刷新会清空内存数据（10s 定时器未到点会丢未保存数据）
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.key === 'F5' || input.key === 'r' || input.key === 'R')) {
            if (input.key === 'F5' || input.control || input.meta) {
                event.preventDefault();
            }
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
        _maxStateTimer = setTimeout(() => {            _maxStateTimer = null;
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
        { label: '重启', click: () => {
            // 完整落盘后重启：设标记 + close（触发 flush 拦截），app-flush-done 时 relaunch
            pendingRestart = true;
            app.isQuitting = true;
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
            else { pendingRestart = false; appRestart(); }
        }},
        { label: '退出', click: () => {
            app.isQuitting = true;
            // 先触发 close：让渲染层 flush 节流数据（convo/prefs）落盘后再真正退出，
            // 不要直接 app.quit()——那样会绕过 close 的 flush 拦截时序。
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
            else app.quit();
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
            // 注册 geo:// 协议：映射到本地 GeoGebra 资源（防路径穿越）
            protocol.handle('geo', (request) => {
                try {
                    const url = new URL(request.url);
                    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
                    const root = geogebraRoot();
                    const resolved = path.resolve(root, rel);
                    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
                        return new Response('Forbidden', { status: 403 });
                    }
                    return net.fetch(pathToFileURL(resolved).toString());
                } catch (err) {
                    return new Response('Not Found', { status: 404 });
                }
            });
            // 注册 tool:// 协议：tool://<id>/<relpath> → userData/tools/<id>/<当前版本>/<relpath>
            // 版本号以 installed.json 为准（版本目录不可变，升级只改 installed.json 指向）；防路径穿越同 geo://
            protocol.handle('tool', async (request) => {
                try {
                    const url = new URL(request.url);
                    // tool:// 是标准 scheme：id 落在 hostname（会被小写化，安装时已限制小写），其余在 pathname
                    const id = url.hostname;
                    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
                    const installed = await readInstalledMeta(id);
                    if (!installed) return new Response('Not Found', { status: 404 });
                    const entry = rel || pickToolEntry(installed);
                    if (!entry) return new Response('Not Found', { status: 404 });
                    const root = toolVersionDir(id, installed.version);
                    const resolved = path.resolve(root, entry);
                    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
                        return new Response('Forbidden', { status: 403 });
                    }
                    const response = await net.fetch(pathToFileURL(resolved).toString());
                    if (!response.ok) return response;
                    // file:// 的 Response 可能不带 Content-Type，而 ES module / CSS 对 MIME 有强校验：
                    // Vite 产物都是 <script type="module">，这里按扩展名补齐，避免模块加载被拒。
                    const headers = new Headers(response.headers);
                    const mime = toolMimeType(resolved);
                    if (mime) headers.set('Content-Type', mime);
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers
                    });
                } catch (err) {
                    return new Response('Not Found', { status: 404 });
                }
            });
            // 初始化 SQLite 用户数据存储
            try {
                userStore = new UserStore(path.join(app.getPath('userData'), 'data.db')).init();
            } catch (e) {
                console.error('[Store] SQLite 初始化失败:', e.message);
            }
            const setting = await loadSettingFromFile();
            // 迁移旧版明文密码：磁盘上仍是明文时立即加密重写
            if (setting.loginPassword && !String(setting.loginPassword).startsWith(PWD_ENC_PREFIX)) {
                await saveSettingToFile(setting);
            }
            if (setting.minimizeToTray !== undefined) minimizeToTray = setting.minimizeToTray;
            if (setting.apiUrl) {
                currentApiUrl = setting.apiUrl.replace(/^http:\/\//, 'https://').replace(/\/$/, '');
                // 旧设置存的 http 地址升级为 https 并写回，保证渲染进程读到一致值
                if (currentApiUrl !== setting.apiUrl) {
                    setting.apiUrl = currentApiUrl;
                    await saveSettingToFile(setting);
                }
            }
            // 与设置面板默认值保持一致（面板默认勾选开启）
            autoUpdateEnabled = setting.autoUpdate !== false;
            // 先启动本地代理并取得实际端口，再创建窗口（窗口要 loadURL 到该端口）
            await startServer();
            createWindow();
            createTray();
            initAutoUpdater();
        } catch (err) {
            console.error('Startup error:', err);
            dialog.showErrorBox('启动错误', err.message || String(err));
        }
    });
}

app.on('will-quit', () => {
    // 清掉 dev 端口握手文件，避免下次 dev 转发读到已失效的端口
    writeDevPortFile(0);
});

app.on('window-all-closed', () => {
    // 用户主动退出（托盘/菜单"退出"）：即使 minimizeToTray 也强制退出
    // 原因：close 拦截（flush）会中断 app.quit() 的首次流程，窗口随后被强制关闭，
    // 若这里不兜底，minimizeToTray=true 时应用会留在托盘/任务栏不退出
    if (app.isQuitting) { app.quit(); return; }
    if (!minimizeToTray && process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-version', () => app.getVersion());

// 客户端平台（反馈客户端信息按 OS 细分：windows/linux/macos；web/android 由各自适配层提供）
ipcMain.handle('get-platform', () => {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  if (p === 'linux') return 'linux';
  return 'desktop';
});

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
        currentApiUrl = data.apiUrl.replace(/^http:\/\//, 'https://').replace(/\/$/, '');
        stopServer().then(() => startServer(serverPort));
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
        show: false, // 先隐藏创建，避免新窗口抢焦点打断其他窗口输入
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
        // 无焦点显示：置顶但绝不抢占当前窗口焦点
        notificationWin.showInactive();
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

// 独立小型无边框置顶窗（file://renderer/timer-float.html）：状态由主窗口经主进程全量推来，单一数据源在主窗口
// 窗口是透明的、高度按当前显示几个格自适应（渲染层实测内容高度后回传，见 timer-float-resize）
const TIMER_FLOAT_WIDTH = 268;
const TIMER_FLOAT_MIN_H = 64;
const TIMER_FLOAT_MAX_H = 480;
const TIMER_FLOAT_SIZE = { width: TIMER_FLOAT_WIDTH, height: 132 };
let timerFloatHeight = TIMER_FLOAT_SIZE.height; // 当前高度（预设位置与自适应都以它为准）
let timerFloatWin = null;
let timerFloatState = null; // 缓存最近一次状态：窗口「刚加载完」时补发一次
let timerFloatConfig = { x: null, y: null, pos: 'br', onTop: true };
let timerFloatMoveTimer = null;

function timerFloatPagePath() {
    return app.isPackaged
        ? path.join(__dirname, '../renderer/timer-float.html')
        : path.join(app.getAppPath(), 'src/renderer/timer-float.html');
}

// 四角预设位置（用户只选「左上/右上/左下/右下」，不需要手动算坐标）
function timerFloatPresetPos(pos) {
    const { workArea } = screen.getPrimaryDisplay();
    const w = TIMER_FLOAT_SIZE.width;
    const h = timerFloatHeight;
    const M = 16;
    switch (pos) {
        case 'tl': return { x: workArea.x + M, y: workArea.y + M };
        case 'tr': return { x: workArea.x + workArea.width - w - M, y: workArea.y + M };
        case 'bl': return { x: workArea.x + M, y: workArea.y + workArea.height - h - M };
        default: return { x: workArea.x + workArea.width - w - M, y: workArea.y + workArea.height - h - M };
    }
}

function closeTimerFloat() {
    if (timerFloatWin && !timerFloatWin.isDestroyed()) timerFloatWin.close();
}

function openTimerFloat(cfg) {
    if (cfg && typeof cfg === 'object') timerFloatConfig = { ...timerFloatConfig, ...cfg };
    // 已存在（重复点「悬浮」）→ 只把窗口拉到前面
    if (timerFloatWin && !timerFloatWin.isDestroyed()) {
        timerFloatWin.showInactive();
        return { success: true };
    }
    // 优先用上次拖拽记住的坐标；没有则按「位置」预设
    let pos = null;
    const hasSaved = Number.isFinite(timerFloatConfig.x) && Number.isFinite(timerFloatConfig.y);
    if (hasSaved) pos = { x: Math.round(timerFloatConfig.x), y: Math.round(timerFloatConfig.y) };
    else pos = timerFloatPresetPos(timerFloatConfig.pos);

    timerFloatWin = new BrowserWindow({
        width: TIMER_FLOAT_SIZE.width,
        height: timerFloatHeight,
        x: pos.x,
        y: pos.y,
        frame: false,
        transparent: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        alwaysOnTop: timerFloatConfig.onTop !== false,
        show: false, // 先隐藏加载，等状态推过去再显示，避免闪一下空壳
        webPreferences: {
            preload: path.join(__dirname, '../preload/timer-float.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    // 'floating' 层级：能压住普通窗口，但不至于像 screen-saver 那样挡系统级弹窗
    timerFloatWin.setAlwaysOnTop(timerFloatConfig.onTop !== false, 'floating');
    timerFloatWin.on('closed', () => {
        timerFloatWin = null;
        if (timerFloatMoveTimer) { clearTimeout(timerFloatMoveTimer); timerFloatMoveTimer = null; }
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('timer-float-closed');
    });
    // 拖拽后记住位置（防抖：拖动过程会连续触发 moved）
    timerFloatWin.on('moved', () => {
        if (!timerFloatWin || timerFloatWin.isDestroyed()) return;
        if (timerFloatMoveTimer) clearTimeout(timerFloatMoveTimer);
        timerFloatMoveTimer = setTimeout(() => {
            timerFloatMoveTimer = null;
            if (!timerFloatWin || timerFloatWin.isDestroyed()) return;
            const [x, y] = timerFloatWin.getPosition();
            timerFloatConfig = { ...timerFloatConfig, x, y };
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('timer-float-moved', { x, y });
        }, 400);
    });
    timerFloatWin.loadFile(timerFloatPagePath());
    timerFloatWin.webContents.on('did-finish-load', () => {
        if (!timerFloatWin || timerFloatWin.isDestroyed()) return;
        timerFloatWin.webContents.send('timer-float-config', timerFloatConfig);
        if (timerFloatState) timerFloatWin.webContents.send('timer-float-state', timerFloatState);
        // 无焦点显示：置顶但绝不抢占当前窗口焦点
        timerFloatWin.showInactive();
    });
    return { success: true };
}

ipcMain.handle('timer-float-open', (event, cfg) => openTimerFloat(cfg));
ipcMain.handle('timer-float-close', () => { closeTimerFloat(); return { success: true }; });
// 渲染层（可能刚重载过）问一句：悬浮窗现在还开着吗？→ 用来对齐「开关」状态
ipcMain.handle('timer-float-is-open', () => !!(timerFloatWin && !timerFloatWin.isDestroyed()));

// 主窗口推送状态（全量覆盖，不做增量）
ipcMain.on('timer-float-update', (event, state) => {
    timerFloatState = state || null;
    if (timerFloatWin && !timerFloatWin.isDestroyed()) {
        timerFloatWin.webContents.send('timer-float-state', timerFloatState);
    }
});

// 渲染层实测内容高度回传 → 窗口高度随「当前显示几个格」自适应（宽度恒定）
ipcMain.on('timer-float-resize', (event, raw) => {
    const h = Math.round(Number(raw));
    if (!Number.isFinite(h) || h <= 0) return;
    const next = Math.min(TIMER_FLOAT_MAX_H, Math.max(TIMER_FLOAT_MIN_H, h));
    if (next === timerFloatHeight) return;
    timerFloatHeight = next;
    if (!timerFloatWin || timerFloatWin.isDestroyed()) return;
    const b = timerFloatWin.getBounds();
    if (b.height === next) return;
    // 窗口在屏幕下半部分时保持「底边不动」，否则保持顶边，避免改高度时整窗上下跳
    const { workArea } = screen.getDisplayMatching(b);
    const anchorBottom = (b.y + b.height) > (workArea.y + workArea.height / 2);
    const y = anchorBottom ? (b.y + b.height - next) : b.y;
    timerFloatWin.setBounds({ x: b.x, y, width: TIMER_FLOAT_WIDTH, height: next });
});

// 主窗口推送外观配置（位置/置顶）
ipcMain.on('timer-float-config', (event, cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    const prevTop = timerFloatConfig.onTop !== false;
    timerFloatConfig = { ...timerFloatConfig, ...cfg };
    const nextTop = timerFloatConfig.onTop !== false;
    if (timerFloatWin && !timerFloatWin.isDestroyed()) {
        if (prevTop !== nextTop) timerFloatWin.setAlwaysOnTop(nextTop, 'floating');
        timerFloatWin.webContents.send('timer-float-config', timerFloatConfig);
        // 位置改了（且没被手动拖过）→ 立刻挪窗
        if (cfg.pos && !Number.isFinite(cfg.x)) {
            const p = timerFloatPresetPos(cfg.pos);
            timerFloatWin.setPosition(p.x, p.y);
        }
    }
});

// 悬浮窗上的按钮 → 交回主窗口执行（保持单一数据源）
ipcMain.on('timer-float-cmd', (event, payload) => {
    const type = payload && payload.type;
    if (type === 'close') { closeTimerFloat(); return; }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('timer-float-command', payload);
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
// 工具类「直接写回原文件」（Ctrl+S 覆盖已保存过的文件）的路径白名单：
// 只有本进程曾通过保存/打开对话框返回给渲染层的路径才可直写，
// 否则渲染层一旦被注入就能往任意路径落文件。
const writableFilePaths = new Set();

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
        writableFilePaths.add(filePaths[0]);
        return {
            success: true,
            name: path.basename(filePaths[0]),
            // 原始绝对路径：工具类（Markdown 等）据此实现「Ctrl+S 写回原文件」；
            // 同时记入白名单 —— 用户主动选过的文件才允许被工具覆写。
            path: filePaths[0],
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
        writableFilePaths.add(filePaths[0]);
        return {
            success: true,
            name: path.basename(filePaths[0]),
            path: filePaths[0], // 同上：供图片编辑器「保存」写回原文件
            size: buf.length,
            data: buf.toString('base64'),
            mime: mimeMap[ext] || 'image/png'
        };
    } catch (e) { return { success: false, error: e.message }; }
});

// 拍照：调**系统相机应用**取图，不自建取景器（用户 2026-10-02 决策）。
// Windows 11 / macOS 都自带相机且能出图；自己用 getUserMedia 画取景器要处理权限、
// 前后摄、镜像、非安全上下文等一堆边角，且拍出来的图还要再走一遍压缩，属于重复造轮子。
//
// 判定「用户拍了哪张」的策略：调用前后各列一次系统图片目录（Pictures / 桌面 / 相机胶卷），
// 取差集（新增文件）→ 按 mtime 取最新一张 → 读成 base64 返回。
// 之所以轮询而非用 fs.watch：跨平台差异大（Windows 是 ReadDirectoryChangesW，
// 网络盘 / 重定向目录会静默失效），而拍照本身是低频操作，1s 轮询完全够用且行为可预期。
//
// ⚠️ 「用户没拍照就退出相机」必须靠**窗口焦点**判定，不能只等差集超时（2026-10-02 修）：
// 相机是独立进程/窗口，拉起时本窗口 blur、用户关掉相机后本窗口 focus 回来。
// 只靠差集的话，差集永远是空 → 白等满 90s 才返回 canceled，
// 表现为「退出相机后再点拍照按钮没反应」（按钮被 cameraBusy 锁住 90 秒）。
// 判定顺序：先看有没有新图（用户拍完随手关相机 = 最常见路径，命中即走），
// 否则一旦「曾经 blur 过、现在又 focus 回来且已经过一轮扫描」就判定用户放弃 → 立即返回。
const cameraWaiters = new Set();

ipcMain.handle('cancel-camera', async () => {
    // 用户主动点了「取消」：作废所有正在等待的拍照请求
    for (const w of [...cameraWaiters]) w.canceled = true;
    return { success: true };
});

ipcMain.handle('launch-camera', async (event) => {
    const os = require('os');
    const { spawn } = require('child_process');
    const home = os.homedir();

    // 候选目录：各平台相机默认存放位置
    const dirs = process.platform === 'win32'
        ? [path.join(home, 'Pictures'), path.join(home, 'Pictures', 'Camera Roll'), path.join(home, 'Desktop')]
        : process.platform === 'darwin'
            ? [path.join(home, 'Pictures'), path.join(home, 'Pictures', 'Photo Booth Library'), path.join(home, 'Desktop')]
            : [path.join(home, 'Pictures'), path.join(home, 'Desktop')];

    const IMG_RE = /\.(jpe?g|png|heic|webp|bmp)$/i;
    const listImages = async () => {
        const set = new Map(); // absPath -> mtimeMs
        for (const d of dirs) {
            try {
                const names = await fs.readdir(d);
                for (const n of names) {
                    if (!IMG_RE.test(n)) continue;
                    const abs = path.join(d, n);
                    try {
                        const st = await fs.stat(abs);
                        if (st.isFile()) set.set(abs, st.mtimeMs);
                    } catch { /* 读不到就跳过 */ }
                }
            } catch { /* 目录不存在就跳过 */ }
        }
        return set;
    };

    // 先启动相机，避免「快照→启动」之间漏掉用户的连拍
    const before = await listImages();
    const beforeTime = Date.now();

    try {
        if (process.platform === 'win32') {
            // Windows 11 相机有 AUMID；旧版回退 microsoft.windows.camera:
            spawn('cmd', ['/c', 'start', '', 'microsoft.windows.camera:'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else if (process.platform === 'darwin') {
            spawn('open', ['-a', 'Photo Booth'], { detached: true, stdio: 'ignore' }).unref();
        } else {
            // Linux：无统一相机应用，给出明确提示交由渲染层展示
            return { success: false, error: '当前系统请用「文件」选择图片' };
        }
    } catch (e) {
        return { success: false, error: '打开相机失败：' + (e.message || '') };
    }

    // 焦点探针：记录「本窗口是否因拉起相机而失焦过」。
    // 相机自己关掉后 focus 回来 = 用户放弃（除非这期间已经有新图了）。
    const win = mainWindow;
    const waiter = { blurred: false, canceled: false };
    cameraWaiters.add(waiter);
    const onBlur = () => { waiter.blurred = true; };
    const onFocus = () => { waiter.refocused = true; };
    waiter.refocused = false;
    if (win && !win.isDestroyed()) {
        win.on('blur', onBlur);
        win.on('focus', onFocus);
    }

    const done = (v) => {
        cameraWaiters.delete(waiter);
        if (win && !win.isDestroyed()) {
            win.removeListener('blur', onBlur);
            win.removeListener('focus', onFocus);
        }
        return v;
    };

    // 轮询等待新图片出现：最多 90s，每 1s 检查一次。
    const DEADLINE = Date.now() + 90000;
    while (Date.now() < DEADLINE) {
        await new Promise((r) => setTimeout(r, 1000));
        if (waiter.canceled) return done({ success: false, canceled: true });

        const now = await listImages();
        let newest = null;
        for (const [abs, mtime] of now) {
            if (before.has(abs)) continue;
            // 只认「比启动时刻新」的文件，避免差集里混进别的进程刚落的图
            if (mtime < beforeTime - 5000) continue;
            if (!newest || mtime > newest[1]) newest = [abs, mtime];
        }
        if (newest) {
            try {
                const buf = await fs.readFile(newest[0]);
                const ext = path.extname(newest[0]).toLowerCase();
                const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.bmp': 'image/bmp', '.webp': 'image/webp', '.heic': 'image/heic' };
                return done({
                    success: true,
                    name: path.basename(newest[0]),
                    path: newest[0],
                    size: buf.length,
                    data: buf.toString('base64'),
                    mime: mimeMap[ext] || 'image/jpeg'
                });
            } catch (e) {
                return done({ success: false, error: '读取照片失败：' + (e.message || '') });
            }
        }

        // 没有新图，但相机窗口「已经关掉了」→ 用户没拍照就退出，立即收尾。
        // 必须等一轮扫描后才认：blur→focus 可能只是启动瞬间的抖动。
        if (waiter.blurred && waiter.refocused) {
            // 再多等一拍，确认文件不是正在写入（有些相机是关窗后才落盘）
            await new Promise((r) => setTimeout(r, 1200));
            const after = await listImages();
            let late = null;
            for (const [abs, mtime] of after) {
                if (before.has(abs)) continue;
                if (mtime < beforeTime - 5000) continue;
                if (!late || mtime > late[1]) late = [abs, mtime];
            }
            if (late) {
                try {
                    const buf = await fs.readFile(late[0]);
                    const ext = path.extname(late[0]).toLowerCase();
                    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.bmp': 'image/bmp', '.webp': 'image/webp', '.heic': 'image/heic' };
                    return done({
                        success: true,
                        name: path.basename(late[0]),
                        path: late[0],
                        size: buf.length,
                        data: buf.toString('base64'),
                        mime: mimeMap[ext] || 'image/jpeg'
                    });
                } catch { /* 落到下面的 canceled */ }
            }
            return done({ success: false, canceled: true });
        }
    }
    return done({ success: false, canceled: true });
});

ipcMain.handle('download-file', async (event, base64Data, suggestedName, mime) => {
    try {
        const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName || 'download' });
        if (canceled || !savePath) return { success: false, canceled: true };
        const buf = Buffer.from(base64Data, 'base64');
        await fs.writeFile(savePath, buf);
        writableFilePaths.add(savePath); // 记入白名单，后续 Ctrl+S 可直接覆写
        return { success: true, path: savePath };
    } catch (e) { return { success: false, error: e.message }; }
});

// 从 URL 下载（主进程侧抓取后再落盘）。
// ⚠️ 必须放在主进程：渲染层 fetch 远程资源会被 CORS 拦（渲染进程源是本地服务端口，远程站点
// 通常不带 access-control-allow-origin），表现为「Failed to fetch」；而 <img> 加载不受同源
// 策略限制，所以图能显示却下不下来。Node 侧没有同源策略，抓取稳定。
ipcMain.handle('download-url', async (event, url, suggestedName) => {
    try {
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { success: false, error: '地址无效' };
        const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName || 'download' });
        if (canceled || !savePath) return { success: false, canceled: true };
        const res = await net.fetch(url);
        if (!res.ok) return { success: false, error: 'HTTP ' + res.status };
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(savePath, buf);
        writableFilePaths.add(savePath); // 记入白名单，后续 Ctrl+S 可直接覆写
        return { success: true, path: savePath, size: buf.length };
    } catch (e) { return { success: false, error: (e && e.message) || '下载失败' }; }
});

// 覆盖写入已保存过的文件（不弹对话框）。unsupported 表示路径不受信，
// 渲染层据此回落到「另存为」对话框，而不是直接报失败。
ipcMain.handle('save-file-to', async (event, filePath, base64Data) => {
    try {
        if (typeof filePath !== 'string' || !filePath) return { success: false, unsupported: true };
        if (!writableFilePaths.has(filePath)) return { success: false, unsupported: true };
        const buf = Buffer.from(String(base64Data || ''), 'base64');
        await fs.writeFile(filePath, buf);
        return { success: true, path: filePath };
    } catch (e) { return { success: false, error: e.message }; }
});

// 导出 Markdown 为 PNG：保存对话框选路径 + offscreen 渲染截图（替代原 tool-export-markdown-to-png）
ipcMain.handle('export-markdown-png', async (event, suggestedName, html) => {
    let exportWin = null;
    let tmpHtml = null;
    try {
        if (typeof html !== 'string' || !html) throw new Error('内容无效');
        const defName = (typeof suggestedName === 'string' && suggestedName) ? suggestedName.replace(/\.(md|markdown)$/i, '.png') : 'export.png';
        const { canceled, filePath: outPath } = await dialog.showSaveDialog(mainWindow, {
            defaultPath: defName,
            filters: [{ name: 'PNG 图片', extensions: ['png'] }]
        });
        if (canceled || !outPath) return { success: false, canceled: true };

        const WIDTH = 900;
        const PAD = 28;
        // 引入 KaTeX 样式与字体，保证公式排版正确（file:// 相对 css 解析字体）。
        // 打包后读安装包 resources/katex（构建期由 scripts/sync-katex-assets.mjs 生成，
        // 只含 katex.min.css + woff2 字体）；开发模式回落到 node_modules。
        // 这样做是为了让运行时不再依赖 node_modules/katex 整个包（3.8MB，含源码/全格式字体）。
        const katexCssPath = app.isPackaged
            ? path.join(process.resourcesPath, 'katex', 'katex.min.css')
            : path.join(app.getAppPath(), 'node_modules', 'katex', 'dist', 'katex.min.css');
        const katexCssUrl = pathToFileURL(katexCssPath).href;
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

// ========== SQLite 用户数据存储（data.db，AES-256-GCM 加密） ==========
// 取代旧的单文件 data/<uid>.7c：拆分 convos/messages/prefs/kv 四表 + 事务写入 + 加密
function storeReady() {
    if (userStore) return true;
    console.error('[Store] 存储未初始化');
    return false;
}

// 初始化当前用户：迁移旧版单文件（幂等）
// 渲染进程数据落盘完成后确认关闭（配合 close 拦截：先 flush 再关窗）
ipcMain.on('app-flush-done', () => {
    forceClose = true;
    flushPending = false;
    if (pendingRestart) {
        // 重启：flush 已落盘 → 安排新实例并优雅退出
        pendingRestart = false;
        appRestart();
        return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle('store-init', async (event, uid) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    if (uid == null) return { success: false, error: '缺少 uid' };
    try {
        const legacyPath = path.join(app.getPath('userData'), 'data', `${uid}.7c`);
        const r = migrateLegacy(userStore, legacyPath, Number(uid));
        return r;
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('store-load-convos', async (event, uid) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    return userStore.loadConvos(Number(uid));
});

// 全量快照（唯一保存通道）：会话元数据 + 偏好 + 待写消息，单事务原子
ipcMain.handle('store-save-all', async (event, uid, data) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    if (!data || typeof data !== 'object') return { success: false, error: 'data 需为对象' };
    return userStore.saveAll(Number(uid), data);
});

ipcMain.handle('store-load-messages', async (event, uid, kind, cid, limit, before) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    return userStore.loadMessages(Number(uid), kind, Number(cid), limit, before);
});

// 每个会话最新一条消息（会话列表预览/排序）
ipcMain.handle('store-load-last-messages', async (event, uid) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    return userStore.loadLastMessages(Number(uid));
});

ipcMain.handle('store-load-prefs', async (event, uid) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    return userStore.loadPrefs(Number(uid));
});

// 全量导出（备份）：所有会话元数据 + 全部消息（解密）+ 偏好
ipcMain.handle('store-export-all', async (event, uid) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    return userStore.exportAll(Number(uid));
});

// 恢复备份：把备份 JSON 写入 SQLite（消息按会话归属，事务批量）
ipcMain.handle('store-import-all', async (event, uid, data) => {
    if (!storeReady()) return { success: false, error: '存储未初始化' };
    if (!data || typeof data !== 'object') return { success: false, error: '备份数据格式异常' };
    return importLegacyData(userStore, Number(uid), data);
});

// ========== GitLab 静态资源（项目 886） ==========
// 自建后端已全部下线：客户端更新、更新日志、赞助名单全部改读公开的 GitLab 项目 886
// （发布包只保留 latest/，赞助名单放在仓库 assets/sponsors.json）。
// 9080 站点必须与「API 网址」设置一致：选 jx 就访问 jx.7fa4.cn:9080，选 in 就访问 in.7fa4.cn:9080，
// 两套地址是分开的镜像，不能交叉混用。
function gitlabWebBase() {
    return `${currentApiUrl.replace(/\/+$/, '')}:9080`;
}
function gitlabApiBase() {
    return `${gitlabWebBase()}/api/v4/projects/886`;
}
function gitlabLatestPackage() {
    return `${gitlabApiBase()}/packages/generic/7FA4-Chat/latest`;
}
// 赞助名单：公开仓库的 assets/sponsors.json，匿名 raw 即可读取
function gitlabSponsorsFile() {
    return `${gitlabApiBase()}/repository/files/assets%2Fsponsors.json/raw?ref=master`;
}

// ========== 在线工具（tools）：GitLab 静态包下载 / 本地安装 / tool:// 入口 ==========
// GitLab 仓库 886 的 tools/ 目录：tools/tools.json 是清单，tools/<id>/<version>/ 是不可变静态包。
// 本地布局（spec §3）：userData/tools/<id>/<version>/... + userData/tools/<id>/installed.json，
// installed.json = { version, installedAt, size, files:[{path,size,sha256}] }，记录当前生效版本。
const TOOL_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;       // tool:// 的 hostname 会被小写化，工具 id 统一限制为小写
const TOOL_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
const TOOL_SHA256_RE = /^[0-9a-f]{64}$/;
const TOOL_ICON_RE = /^[a-z0-9][a-z0-9 _-]{0,63}$/i; // 展示用 Font Awesome class（如 "fas fa-calculator"）
const TOOL_MANIFEST_TIMEOUT = 20000;              // 清单拉取超时 20s（spec §4）
const TOOL_FILE_TIMEOUT = 60000;                  // 单个文件下载超时 60s

// 工具包基址：generic package「TOOLS」的最新版目录
//   https://<api-host>:9080/api/v4/projects/886/packages/generic/TOOLS/latest
// 跟随「API 网址」设置（jx / in 两套镜像），复用上面的 gitlabWebBase()；
// 包内布局与 dist-tools 一致：tools.json + <id>/<version>/...（发布时整包替换，不保留旧版本）。
function toolsRawBase() {
    return `${gitlabWebBase()}/api/v4/projects/886/packages/generic/TOOLS/latest`;
}
function toolsRoot() {
    return path.join(app.getPath('userData'), 'tools');
}
function toolVersionDir(id, version) {
    return path.join(toolsRoot(), String(id), String(version));
}
function toolInstalledFile(id) {
    return path.join(toolsRoot(), String(id), 'installed.json');
}

// tool:// 响应的 MIME 表：file:// 的 Response 可能不带 Content-Type，
// 而 <script type="module"> / CSS 对 MIME 有强校验（工具包是 Vite 产物，入口与资源都是 module）。
const TOOL_MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
};
function toolMimeType(file) {
    return TOOL_MIME_TYPES[path.extname(file).toLowerCase()] || '';
}

// 包内相对路径校验：拒绝绝对路径、盘符、空段、. 与 .. 段（防路径穿越第一道）
function isSafeToolRelPath(p) {
    if (typeof p !== 'string' || !p || p.includes('\0')) return false;
    if (p.startsWith('/') || p.startsWith('\\')) return false;
    if (/^[A-Za-z]:/.test(p)) return false;
    const segs = p.split(/[\\/]+/);
    return segs.every((s) => s && s !== '.' && s !== '..');
}

// 清单条目归一化：非法条目返回 null（整份清单里其它工具仍可用）；size 以 files 之和为准
function normalizeToolMeta(tool) {
    if (!tool || typeof tool !== 'object') return null;
    const id = String(tool.id || '');
    const version = String(tool.version || '');
    if (!TOOL_ID_RE.test(id) || !TOOL_VERSION_RE.test(version)) return null;
    const dir = `${id}/${version}`;
    // dir 必须与 id/version 一致，避免清单把下载指向任意目录
    if (tool.dir !== undefined && String(tool.dir) !== dir) return null;
    const entry = tool.entry === undefined ? 'index.html' : String(tool.entry);
    if (!isSafeToolRelPath(entry)) return null;
    if (!Array.isArray(tool.files) || tool.files.length === 0) return null;
    const seen = new Set();
    const files = [];
    for (const f of tool.files) {
        if (!f || typeof f !== 'object') return null;
        const rel = String(f.path || '');
        if (!isSafeToolRelPath(rel) || seen.has(rel)) return null;
        seen.add(rel);
        const size = Number(f.size);
        const sha256 = String(f.sha256 || '').toLowerCase();
        if (!Number.isInteger(size) || size < 0) return null;
        if (!TOOL_SHA256_RE.test(sha256)) return null;
        files.push({ path: rel, size, sha256 });
    }
    if (!seen.has(entry)) return null; // 入口必须是包内文件
    // 图标只是展示用的 Font Awesome class：只接受安全的 class 字符集，非法时回落到占位图标
    const rawIcon = typeof tool.icon === 'string' ? tool.icon.trim() : '';
    const icon = TOOL_ICON_RE.test(rawIcon) ? rawIcon : 'fas fa-puzzle-piece';
    return {
        id,
        name: String(tool.name || id),
        desc: String(tool.desc || ''),
        icon,
        version,
        dir,
        entry,
        size: files.reduce((n, f) => n + f.size, 0),
        minAppVersion: String(tool.minAppVersion || ''),
        files
    };
}

// 语义化版本比较（与 renderer utils.js 的 compareVersion 同逻辑）：返回 1 / 0 / -1
function compareToolVersion(a, b) {
    const pa = String(a || '').split('.').map(Number);
    const pb = String(b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
}

// installed.json 读取：不存在 / 损坏 / 版本号非法均视为未安装
async function readInstalledMeta(id) {
    if (!TOOL_ID_RE.test(String(id))) return null;
    try {
        const meta = JSON.parse(await fs.readFile(toolInstalledFile(id), 'utf8'));
        if (!meta || typeof meta !== 'object') return null;
        if (!TOOL_VERSION_RE.test(String(meta.version || ''))) return null;
        return meta;
    } catch {
        return null;
    }
}

// 入口推断：installed.json（spec 形状）不含 entry，优先 index.html，否则取第一个 html
function pickToolEntry(installed, preferred) {
    const files = Array.isArray(installed && installed.files)
        ? installed.files.map((f) => String(f.path || ''))
        : [];
    if (preferred && isSafeToolRelPath(String(preferred)) && files.includes(String(preferred))) {
        return String(preferred);
    }
    if (files.includes('index.html')) return 'index.html';
    const html = files.find((p) => /\.html?$/i.test(p));
    return html || null;
}

// 原子写：同目录临时文件 + rename，避免半截 installed.json 被读到
async function writeFileAtomic(file, data) {
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, data, 'utf8');
    try {
        await fs.rename(tmp, file);
    } catch (e) {
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw e;
    }
}

// 拉取并校验远端工具清单（tools/tools.json）
async function fetchToolsManifest() {
    try {
        const res = await net.fetch(`${toolsRawBase()}/tools.json`, {
            signal: AbortSignal.timeout(TOOL_MANIFEST_TIMEOUT)
        });
        if (!res.ok) return { success: false, tools: [], error: `HTTP ${res.status}` };
        const data = await res.json().catch(() => null);
        if (!data || typeof data !== 'object' || !Array.isArray(data.tools)) {
            return { success: false, tools: [], error: '工具清单格式异常' };
        }
        const tools = [];
        for (const item of data.tools) {
            const meta = normalizeToolMeta(item);
            if (meta) tools.push(meta);
            else console.warn('[Tools] 忽略无效的清单条目:', item && item.id);
        }
        return { success: true, tools, updatedAt: String(data.updatedAt || '') };
    } catch (e) {
        return { success: false, tools: [], error: e.message || '获取工具清单失败' };
    }
}

// 安装 / 更新：逐文件下载并校验 size+sha256 → 全部落临时目录 → 原子替换版本目录 → 原子写 installed.json
// 进度：{ id, phase:'download', index, count, path, received, total }（received 为累计字节数）
async function installTool(sender, toolMeta) {
    const meta = normalizeToolMeta(toolMeta);
    if (!meta) return { success: false, error: '工具信息无效' };
    // 防御：应用版本低于 minAppVersion 时服务端也不放行（UI 层已禁用按钮）
    if (meta.minAppVersion && compareToolVersion(app.getVersion(), meta.minAppVersion) < 0) {
        return { success: false, error: `请先更新应用（需要 v${meta.minAppVersion} 及以上）` };
    }
    const idDir = path.join(toolsRoot(), meta.id);
    const targetDir = toolVersionDir(meta.id, meta.version);
    const stagingDir = path.join(idDir, `.staging-${meta.version}-${process.pid}-${Date.now()}`);
    const sendProgress = (payload) => {
        try {
            if (sender && !sender.isDestroyed()) sender.send('tools-progress', payload);
        } catch { /* 窗口已关闭：下载继续但不再推进度 */ }
    };
    const count = meta.files.length;
    let received = 0;
    try {
        await fs.mkdir(stagingDir, { recursive: true });
        for (let i = 0; i < count; i++) {
            const file = meta.files[i];
            // 该实例的 generic 包不支持嵌套路径（file_name 不能含 `/`），
            // 所以包内文件名是把「dir/file.path」里的 `/` 全部换成 `__` 的扁平名，
            // 与 scripts/publish-tools.mjs 的映射规则必须保持一致。
            const flatName = `${meta.dir}/${file.path}`.replaceAll('/', '__');
            const fileUrl = `${toolsRawBase()}/${encodeURIComponent(flatName)}`;
            const res = await net.fetch(fileUrl, { signal: AbortSignal.timeout(TOOL_FILE_TIMEOUT) });
            if (!res.ok) throw new Error(`下载 ${file.path} 失败（HTTP ${res.status}）`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length !== file.size) throw new Error(`文件大小校验失败：${file.path}`);
            const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            if (sha256 !== file.sha256) throw new Error(`SHA-256 校验失败：${file.path}`);
            const dest = path.resolve(stagingDir, ...file.path.split('/'));
            // 第二道防线：拼接后的落点必须仍在临时目录内
            if (!dest.startsWith(stagingDir + path.sep)) throw new Error(`文件路径非法：${file.path}`);
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.writeFile(dest, buf);
            received += buf.length;
            sendProgress({
                id: meta.id,
                phase: 'download',
                index: i + 1,
                count,
                path: file.path,
                received,
                total: meta.size
            });
        }
        // 临时目录 → 版本目录；installed.json 最后原子写入（写成功才算安装完成）
        await fs.rm(targetDir, { recursive: true, force: true });
        await fs.rename(stagingDir, targetDir);
        const installed = {
            version: meta.version,
            installedAt: new Date().toISOString(),
            size: meta.size,
            files: meta.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 }))
        };
        await writeFileAtomic(toolInstalledFile(meta.id), JSON.stringify(installed, null, 2));
        return { success: true };
    } catch (e) {
        // 失败清理半成品；不动旧版本目录与旧 installed.json
        await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
        return { success: false, error: e.message || '安装工具失败' };
    }
}

// 已安装列表：{ [id]: { version, installedAt, size } }
async function listInstalledTools() {
    const installed = {};
    let entries = [];
    try {
        entries = await fs.readdir(toolsRoot(), { withFileTypes: true });
    } catch {
        entries = []; // 首次使用：目录还不存在
    }
    for (const entry of entries) {
        if (!entry.isDirectory() || !TOOL_ID_RE.test(entry.name)) continue;
        const meta = await readInstalledMeta(entry.name);
        if (!meta) continue;
        installed[entry.name] = {
            version: String(meta.version),
            installedAt: String(meta.installedAt || ''),
            size: Number(meta.size) || 0
        };
    }
    return { success: true, installed };
}

async function removeTool(id) {
    if (!TOOL_ID_RE.test(String(id))) return { success: false, error: '工具 ID 无效' };
    try {
        await fs.rm(path.join(toolsRoot(), String(id)), { recursive: true, force: true });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message || '卸载工具失败' };
    }
}

// 入口 URL：tool://<id>/<entry>，由 tool:// 协议映射到当前已安装版本目录
async function getToolEntryUrl(id, entry) {
    if (!TOOL_ID_RE.test(String(id))) return { success: false, error: '工具 ID 无效' };
    const installed = await readInstalledMeta(String(id));
    if (!installed) return { success: false, error: '工具未安装' };
    const entryPath = pickToolEntry(installed, entry);
    if (!entryPath) return { success: false, error: '工具入口文件缺失' };
    const encoded = entryPath.split('/').map(encodeURIComponent).join('/');
    return { success: true, url: `tool://${String(id)}/${encoded}` };
}

// ========== 在线工具 IPC ==========
ipcMain.handle('tools-fetch-manifest', () => fetchToolsManifest());
ipcMain.handle('tools-install', (event, toolMeta) => installTool(event.sender, toolMeta));
ipcMain.handle('tools-list-installed', () => listInstalledTools());
ipcMain.handle('tools-remove', (event, id) => removeTool(id));
ipcMain.handle('tools-get-entry-url', (event, id, entry) => getToolEntryUrl(id, entry));

// ========== 自动更新 ==========
let updateDownloaded = false;
let autoUpdateEnabled = false;
let updateCheckTimer = null;
let isDownloading = false;

// electron-updater 的更新源固定指向 GitLab 项目 886 的 latest/ 包目录。
// GitLab 侧每次发版只保留最新一版包（见 .github/workflows/release.yml）。
function applyUpdateFeedUrl() {
    if (!autoUpdater) return;
    const feedUrl = gitlabLatestPackage();
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

// ========== 获取远程 CHANGELOG（GitLab latest/CHANGELOG，Markdown，渲染层自行渲染） ==========
ipcMain.handle('fetch-changelog', async () => {
    try {
        const res = await net.fetch(`${gitlabLatestPackage()}/CHANGELOG`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
        const markdown = await res.text();
        if (!markdown || markdown.trim().length === 0) {
            return { success: false, error: '更新日志为空' };
        }
        return { success: true, markdown };
    } catch (e) {
        return { success: false, error: e.message || '获取更新日志失败' };
    }
});

// ========== 赞助列表（GitLab 公开仓库 assets/sponsors.json） ==========
ipcMain.handle('fetch-sponsors', async () => {
    try {
        const res = await net.fetch(gitlabSponsorsFile(), { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return { success: false, list: [], error: `HTTP ${res.status}` };
        const data = await res.json().catch(() => null);
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.list) ? data.list : null);
        if (list) return { success: true, list };
        return { success: false, list: [], error: '赞助名单格式异常' };
    } catch (e) {
        return { success: false, list: [], error: e.message || '网络错误' };
    }
});

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
        // 加上 SQLite 数据文件（data.db 及 WAL/SHM）
        for (const f of ['data.db', 'data.db-wal', 'data.db-shm']) {
            try { totalSize += (await fs.stat(path.join(app.getPath('userData'), f))).size; } catch {}
        }
        return { success: true, size: totalSize };
    } catch (e) { return { success: false, error: e.message }; }
});

// 清理本地缓存（删除旧 data 目录 + 清空 SQLite 消息表，保留会话元数据与偏好）
ipcMain.handle('clear-cache', async () => {
    try {
        const dataDir = path.join(app.getPath('userData'), 'data');
        await fs.rm(dataDir, { recursive: true, force: true });
        if (userStore) userStore.clearAllMessages();
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

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

// ========== 退出登录 ==========
// 退出登录：清除会话 cookie（含 HttpOnly），渲染进程 document.cookie 无法删除 HttpOnly cookie
ipcMain.handle('clear-session-cookies', async () => {
    try {
        const ses = session.defaultSession;
        if (ses) {
            await ses.cookies.flushStore();
            await ses.clearStorageData({ storages: ['cookies'] });
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message || '清除失败' }; }
});


