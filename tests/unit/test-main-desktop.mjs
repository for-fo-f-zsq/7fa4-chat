import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push([name, true, ''])
  } catch (err) {
    results.push([name, false, err && err.stack ? err.stack : String(err)])
  }
}

// ===== 1. storage.js: WAL + synchronous=NORMAL + 指纹去重/增量 + checkpoint + close + free/ownVotes =====
await test('storage.js: synchronous=NORMAL, 增量写入(指纹去重), checkpoint(TRUNCATE), close(), free/token_free 与 ownVotes', async () => {
  const { UserStore, normalizeFree } = require(path.join(ROOT, 'src/main/storage.js'))
  assert.equal(normalizeFree(true), true)
  assert.equal(normalizeFree(1), true)
  assert.equal(normalizeFree('1'), true)
  assert.equal(normalizeFree(null), false)
  assert.equal(normalizeFree(false), false)
  assert.equal(normalizeFree(0), false)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '7fa4-store-test-'))
  const dbPath = path.join(dir, 'data.db')
  try {
    const store = new UserStore(dbPath).init()
    const syncMode = store.db.prepare('PRAGMA synchronous').get()
    // WAL + NORMAL(1)：COMMIT 不再每次 fsync（主进程热路径），进程崩溃仍保证已提交事务
    assert.equal(Number(syncMode.synchronous), 1, 'PRAGMA synchronous 应为 NORMAL (1)')
    const jMode = store.db.prepare('PRAGMA journal_mode').get()
    assert.equal(String(jMode.journal_mode).toLowerCase(), 'wal')

    const snapshot = () => ({
      convos: [{ kind: 'user', cid: 2, meta: { uid: 2, name: 'alice', message_ids: [10, 11, 12] } }],
      messages: {
        'user:2': [
          { id: 10, send_time: 100, content: 'a', token_free: true },
          { id: 11, send_time: 200, content: 'b', token_free: null, free: true },
          { id: 12, send_time: 300, content: 'c', token_free: null },
        ],
      },
      prefs: {
        drafts: { user_2: 'hi' },
        ownVotes: [{ id: 99, send_time: 123456, free: true }],
        ignoredUndef: undefined,
      },
    })

    const r = store.saveAll(1001, snapshot())
    assert.equal(r.success, true)
    assert.equal(r.writes, 6, '首次写入：1 convo + 3 messages + 2 prefs')

    // 重发完全相同的快照（渲染层 10s 定时保存的典型情况）→ 一条语句都不该执行、不该开事务
    const again = store.saveAll(1001, snapshot())
    assert.equal(again.success, true)
    assert.equal(again.writes, 0, '内容未变化时应跳过全部语句')
    assert.equal(again.skipped, true)

    // 只改一条消息 + 新增一条消息 → 只写这 2 条（无论渲染层是否重发了整会话）
    const edited = snapshot()
    edited.messages['user:2'][1].content = 'b-edited'
    edited.messages['user:2'].push({ id: 14, send_time: 400, content: 'e', token_free: null })
    const inc = store.saveAll(1001, edited)
    assert.equal(inc.success, true)
    assert.equal(inc.writes, 2, '仅 1 条改动 + 1 条新增落盘')

    const ck = store.checkpoint()
    assert.equal(ck.success, true)
    if (fs.existsSync(dbPath + '-wal')) {
      assert.equal(fs.statSync(dbPath + '-wal').size, 0, 'checkpoint(TRUNCATE) 后 WAL 应截断为 0')
    }

    const loadedMsgs = store.loadMessages(1001, 'user', 2, 50)
    assert.equal(loadedMsgs.success, true)
    const byId = Object.fromEntries(loadedMsgs.data.map((m) => [m.id, m]))
    assert.equal(byId[10].free, true)
    assert.equal(byId[11].free, true)
    assert.equal(byId[12].free, false)
    assert.equal(byId[11].content, 'b-edited', '增量写入应覆盖被编辑的那一条')
    assert.equal(byId[14].content, 'e', '增量写入应带上新增的那一条')

    const loadedPrefs = store.loadPrefs(1001)
    assert.equal(loadedPrefs.success, true)
    assert.deepEqual(loadedPrefs.data.ownVotes, [{ id: 99, send_time: 123456, free: true }])
    assert.equal('ignoredUndef' in loadedPrefs.data, false)

    // 再写一条触发 WAL 增长，验证 close() 会先 checkpoint 再关闭
    store.saveMessages(1001, 'user', 2, [{ id: 13, send_time: 400, content: 'd', token_free: '1' }])
    store.close()
    assert.equal(store.db, null)

    // 用全新连接直接读取验证落盘
    const reopened = new UserStore(dbPath).init()
    const reloaded = reopened.loadMessages(1001, 'user', 2, 50)
    const msg13 = reloaded.data.find((m) => m.id === 13)
    assert.equal(msg13?.free, true)
    reopened.close()

    // 确认 WAL 文件已被截断/清理
    const walExists = fs.existsSync(dbPath + '-wal')
    if (walExists) assert.equal(fs.statSync(dbPath + '-wal').size, 0)
    // 验证数据库文件可被 sqlite 直接打开
    const rawDb = new DatabaseSync(dbPath)
    const countRow = rawDb.prepare('SELECT COUNT(*) AS cnt FROM messages').get()
    assert.equal(Number(countRow.cnt), 5)
    rawDb.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ===== 2. tool-windows.js: 单实例工具窗口管理 =====
await test('tool-windows.js: 单窗口复用、校验、广播与销毁', async () => {
  let nextWcId = 100
  const createdWindows = []

  class MockBrowserWindow {
    constructor(opts) {
      this.opts = opts
      this.destroyed = false
      this.minimized = false
      this.visible = true
      this.focused = false
      this.listeners = new Map()
      this.menuVisible = true
      this.loaded = null
      const wcId = nextWcId++
      const wcListeners = new Map()
      this.sentMessages = []
      this.webContents = {
        id: wcId,
        on: (ev, cb) => {
          if (!wcListeners.has(ev)) wcListeners.set(ev, [])
          wcListeners.get(ev).push(cb)
        },
        emit: (ev, ...args) => {
          for (const cb of wcListeners.get(ev) || []) cb(...args)
        },
        send: (ch, data) => this.sentMessages.push({ ch, data }),
        setZoomLevel: () => {},
        getZoomLevel: () => 0,
      }
      createdWindows.push(this)
    }
    setMenuBarVisibility(v) { this.menuVisible = v }
    isDestroyed() { return this.destroyed }
    isMinimized() { return this.minimized }
    restore() { this.minimized = false }
    isVisible() { return this.visible }
    show() { this.visible = true }
    focus() { this.focused = true }
    on(ev, cb) {
      if (!this.listeners.has(ev)) this.listeners.set(ev, [])
      this.listeners.get(ev).push(cb)
    }
    emit(ev, ...args) {
      for (const cb of this.listeners.get(ev) || []) cb(...args)
    }
    loadURL(u) { this.loaded = { type: 'url', value: u }; return Promise.resolve() }
    loadFile(f) { this.loaded = { type: 'file', value: f }; return Promise.resolve() }
    destroy() {
      if (this.destroyed) return
      this.destroyed = true
      this.emit('closed')
    }
  }

  const origLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { BrowserWindow: MockBrowserWindow }
    return origLoad.apply(this, arguments)
  }

  try {
    const modPath = path.join(ROOT, 'src/main/tool-windows.js')
    delete require.cache[modPath]
    const { ToolWindowManager } = require(modPath)

    const mgr = new ToolWindowManager({
      preloadPath: '/preload/index.js',
      htmlPath: '/renderer/tool-window.html',
      getIconPath: () => '/icon.png',
      getThemeSetting: () => ({ theme: 'midnight', customVars: null }),
    })

    // 校验非法参数
    assert.equal(mgr.open({ id: '../evil', url: 'tool://evil/index.html' }).success, false)
    assert.equal(mgr.open({ id: 'timer', url: 'https://evil.example/' }).success, false)

    // 首次打开
    const r1 = mgr.open({ id: 'timer', name: '计时器', url: 'tool://timer/index.html', version: '1.0.8' })
    assert.equal(r1.success, true)
    assert.equal(r1.reused, false)
    assert.equal(createdWindows.length, 1)
    const win = createdWindows[0]
    assert.equal(mgr.isToolWebContents(win.webContents), true)
    assert.equal(mgr.isToolWebContents({}), false)

    win.webContents.emit('did-finish-load')
    assert.equal(win.sentMessages.length, 1)
    assert.equal(win.sentMessages[0].ch, 'tool-window-init')
    assert.equal(win.sentMessages[0].data.themeSetting.theme, 'midnight')

    const initMeta = mgr.getInitMetaForSender(win.webContents)
    assert.equal(initMeta.id, 'timer')
    assert.equal(initMeta.url, 'tool://timer/index.html')

    // 重复打开同 toolId → 恢复并聚焦，不新建窗口
    win.minimized = true
    win.focused = false
    const r2 = mgr.open({ id: 'timer', name: '计时器', url: 'tool://timer/index.html', version: '1.0.8' })
    assert.equal(r2.success, true)
    assert.equal(r2.reused, true)
    assert.equal(createdWindows.length, 1)
    assert.equal(win.minimized, false)
    assert.equal(win.focused, true)

    // 广播主题切换
    mgr.broadcast('tool-theme-changed', { theme: 'sage', customVars: null })
    assert.equal(win.sentMessages.at(-1).ch, 'tool-theme-changed')

    // 打开第二个不同工具 & closeAll
    mgr.open({ id: 'image', name: '图片编辑', url: 'tool://image/index.html', version: '1.0.0' })
    assert.equal(createdWindows.length, 2)
    mgr.close('timer')
    assert.equal(win.isDestroyed(), true)
    assert.equal(mgr.getWindow('timer'), null)
    mgr.closeAll()
    assert.equal(createdWindows[1].isDestroyed(), true)
  } finally {
    Module._load = origLoad
  }
})

// ===== 3. 静态结构与删减文件核验 =====
await test('静态检查: 已删通知窗残留、preload 暴露与 electron.vite 配置一致', async () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'src/main/notifications.js')), false)
  assert.equal(fs.existsSync(path.join(ROOT, 'src/preload/notification.js')), false)
  assert.equal(fs.existsSync(path.join(ROOT, 'src/renderer/notification.html')), false)
  assert.equal(fs.existsSync(path.join(ROOT, 'src/renderer/tool-window.html')), true)
  assert.equal(fs.existsSync(path.join(ROOT, 'src/renderer/src/tool-window-main.js')), true)

  const viteCfg = fs.readFileSync(path.join(ROOT, 'config/electron.vite.config.js'), 'utf8')
  assert.equal(viteCfg.includes('notifications.js'), false)
  assert.equal(viteCfg.includes('notification.html'), false)
  assert.equal(viteCfg.includes('tool-windows.js'), true)
  assert.equal(viteCfg.includes('tool-window.html'), true)

  const preloadSrc = fs.readFileSync(path.join(ROOT, 'src/preload/index.js'), 'utf8')
  for (const apiName of [
    'openToolWindow',
    'onToolSendImage',
    'onToolUsersRequest',
    'replyToolUsers',
    'getToolWindowInit',
    'onToolWindowInit',
    'onToolThemeChanged',
    'sendToolImage',
    'requestToolUsers',
    'startFileDrag',
    // 窗口状态推送（渲染层用它替代每条通知一次 getWindowState IPC）
    'onWindowState',
    'getCachedWindowState',
  ]) {
    assert.equal(preloadSrc.includes(apiName), true, `preload 缺少 ${apiName}`)
  }
  assert.equal(preloadSrc.includes('showMainWindow'), false)

  // 桌面端独有开销：自动更新不再 30s 一次；主窗在 focus/blur/show/hide 时主动推 window-state
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src/main/index.js'), 'utf8')
  assert.equal(mainSrc.includes('UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000'), true, '自动更新应为 4 小时周期')
  assert.equal(mainSrc.includes('}, 30000)'), false, '不应保留 30s 的更新检查定时器')
  assert.equal(mainSrc.includes("mainWindow.webContents.send('window-state'"), true, '主窗应推送 window-state')
})

// ===== 4. src/main/index.js 端到端 Mock 集成校验 =====
await test('main/index.js: 退出flush、原生通知、自启动、工具锁与EIO重试、独立工具窗IPC、拖出保存、media权限', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7fa4-main-test-'))
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '7fa4-tmp-test-'))
  const ipcHandlers = new Map()
  const ipcListeners = new Map()
  const appListeners = new Map()
  const pmListeners = new Map()
  const notificationsCreated = []
  const loginItems = []
  const quitAndInstallCalls = []
  const dragCalls = []
  let permissionHandler = null
  let nextWcId = 200
  const allWindows = []

  class MockNativeImage {
    constructor(empty = false) { this._empty = empty }
    isEmpty() { return this._empty }
    resize() { return this }
  }

  class MockNotification {
    constructor(opts) {
      this.opts = opts
      this.listeners = new Map()
      this.shown = false
      notificationsCreated.push(this)
    }
    on(ev, cb) {
      if (!this.listeners.has(ev)) this.listeners.set(ev, [])
      this.listeners.get(ev).push(cb)
    }
    emit(ev, ...args) {
      for (const cb of this.listeners.get(ev) || []) cb(...args)
    }
    show() { this.shown = true }
    static isSupported() { return true }
  }

  class MockBrowserWindow {
    constructor(opts) {
      this.opts = opts
      this.destroyed = false
      this.minimized = false
      this.visible = opts.show !== false
      this.focused = false
      this.listeners = new Map()
      this.sentMessages = []
      const wcListeners = new Map()
      const wcId = nextWcId++
      const self = this
      this.webContents = {
        id: wcId,
        mainFrame: { url: 'http://127.0.0.1:20000/' },
        getURL: () => self.webContents.mainFrame.url,
        isDestroyed: () => self.destroyed,
        isCrashed: () => false,
        on: (ev, cb) => {
          if (!wcListeners.has(ev)) wcListeners.set(ev, [])
          wcListeners.get(ev).push(cb)
        },
        once: (ev, cb) => {
          if (!wcListeners.has(ev)) wcListeners.set(ev, [])
          wcListeners.get(ev).push(cb)
        },
        emit: (ev, ...args) => {
          for (const cb of wcListeners.get(ev) || []) cb(...args)
        },
        send: (ch, ...args) => {
          self.sentMessages.push({ ch, args })
        },
        startDrag: (arg) => dragCalls.push(arg),
        setWindowOpenHandler: () => {},
        setZoomLevel: () => {},
        getZoomLevel: () => 0,
        getType: () => 'window',
      }
      allWindows.push(this)
    }
    static fromWebContents(wc) {
      return allWindows.find((w) => w.webContents === wc) || null
    }
    setMenuBarVisibility() {}
    setAlwaysOnTop() {}
    isDestroyed() { return this.destroyed }
    isMinimized() { return this.minimized }
    isMaximized() { return false }
    restore() { this.minimized = false }
    isVisible() { return this.visible }
    isFocused() { return this.focused }
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() { this.focused = true }
    close() {
      const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
      for (const cb of this.listeners.get('close') || []) cb(ev)
      if (!ev.defaultPrevented) this.destroy()
    }
    destroy() {
      if (this.destroyed) return
      this.destroyed = true
      for (const cb of this.listeners.get('closed') || []) cb()
    }
    on(ev, cb) {
      if (!this.listeners.has(ev)) this.listeners.set(ev, [])
      this.listeners.get(ev).push(cb)
    }
    emit(ev, ...args) {
      for (const cb of this.listeners.get(ev) || []) cb(...args)
    }
    loadURL(u) {
      this.webContents.mainFrame.url = u
      return Promise.resolve()
    }
    loadFile(f) {
      this.webContents.mainFrame.url = 'file://' + String(f).replace(/\\/g, '/')
      return Promise.resolve()
    }
  }

  let fetchStub = async () => new Response('Not Found', { status: 404 })

  const mockApp = {
    isPackaged: false,
    isQuitting: false,
    getVersion: () => '4.0.0',
    getAppPath: () => ROOT,
    getPath: (name) => (name === 'temp' ? tempDir : userDataDir),
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    setLoginItemSettings: (s) => loginItems.push(s),
    setBadgeCount: () => {},
    quit: () => {},
    relaunch: () => {},
    exit: () => {},
    on: (ev, cb) => {
      if (!appListeners.has(ev)) appListeners.set(ev, [])
      appListeners.get(ev).push(cb)
    },
  }

  const mockExpress = () => {
    const fn = () => {}
    fn.use = () => {}
    fn.get = () => {}
    fn.listen = () => {
      const inst = {
        address: () => ({ port: 20000 }),
        on: () => {},
        once: (ev, cb) => {
          if (ev === 'listening') setImmediate(cb)
        },
        close: (cb) => cb && cb(),
      }
      return inst
    }
    return fn
  }
  mockExpress.static = () => () => {}

  const mockElectron = {
    app: mockApp,
    BrowserWindow: MockBrowserWindow,
    Tray: class { setToolTip() {} setContextMenu() {} on() {} },
    Menu: { buildFromTemplate: () => ({}) },
    nativeImage: {
      createFromPath: () => new MockNativeImage(false),
      createFromBuffer: () => new MockNativeImage(false),
    },
    ipcMain: {
      handle: (ch, fn) => ipcHandlers.set(ch, fn),
      on: (ch, fn) => ipcListeners.set(ch, fn),
    },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true, filePath: '' }),
      showMessageBox: async () => ({ response: 0 }),
      showErrorBox: () => {},
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (fn) => { permissionHandler = fn },
      },
    },
    clipboard: { writeText: () => {}, writeImage: () => {} },
    safeStorage: { isEncryptionAvailable: () => false },
    protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
    net: { fetch: (...args) => fetchStub(...args) },
    shell: { openExternal: async () => {} },
    Notification: MockNotification,
    powerMonitor: {
      on: (ev, cb) => {
        if (!pmListeners.has(ev)) pmListeners.set(ev, [])
        pmListeners.get(ev).push(cb)
      },
    },
  }

  const mockAutoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    setFeedURL: () => {},
    on: () => {},
    checkForUpdates: async () => ({ updateInfo: { version: '4.0.0' } }),
    downloadUpdate: async () => {},
    quitAndInstall: () => quitAndInstallCalls.push(Date.now()),
  }

  const origLoad = Module._load
  Module._load = function (request) {
    if (request === 'electron') return mockElectron
    if (request === 'express') return mockExpress
    if (request === 'http-proxy-middleware') return { createProxyMiddleware: () => () => {} }
    if (request === 'electron-updater') return { autoUpdater: mockAutoUpdater }
    return origLoad.apply(this, arguments)
  }

  try {
    const mainPath = path.join(ROOT, 'src/main/index.js')
    const twPath = path.join(ROOT, 'src/main/tool-windows.js')
    delete require.cache[mainPath]
    delete require.cache[twPath]
    require(mainPath)

    // 等待 whenReady 微任务 + startServer setImmediate 完成
    for (let i = 0; i < 10 && allWindows.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    assert.equal(allWindows.length, 1, '主窗口应已创建')
    const mainWin = allWindows[0]
    const mainEvent = { sender: mainWin.webContents, senderFrame: mainWin.webContents.mainFrame }

    // 0) 主窗选项：后台节流保持默认、按主题给实色底（避免白底闪屏）
    assert.equal(mainWin.opts.webPreferences.backgroundThrottling, undefined, '不应关闭 backgroundThrottling')
    assert.equal(mainWin.opts.backgroundColor, '#F7F9FC', '主窗应有主题底色')

    // 0.5) 窗口状态推送（preload 的 getCachedWindowState 数据源）
    mainWin.focused = true
    mainWin.emit('focus')
    assert.deepEqual(mainWin.sentMessages.at(-1), {
      ch: 'window-state',
      args: [{ visible: true, focused: true, minimized: false }],
    })
    mainWin.visible = false
    mainWin.emit('hide')
    assert.deepEqual(mainWin.sentMessages.at(-1), {
      ch: 'window-state',
      args: [{ visible: false, focused: true, minimized: false }],
    })
    mainWin.visible = true
    mainWin.emit('show')

    // 1) media 权限仅放行主窗
    assert.equal(typeof permissionHandler, 'function')
    let permRes = null
    permissionHandler(mainWin.webContents, 'media', (v) => { permRes = v }, { requestingUrl: 'http://127.0.0.1:20000/' })
    assert.equal(permRes, true)
    permissionHandler({ isDestroyed: () => false, getURL: () => 'https://evil.com/' }, 'media', (v) => { permRes = v }, { requestingUrl: 'https://evil.com/' })
    assert.equal(permRes, false)

    // 2) 原生通知 + 点击聚焦主窗并发送 notif-click
    const notifRes = await ipcHandlers.get('notify')(mainEvent, { title: '测试群', body: 'hello', chatType: 'group', targetId: 42 })
    assert.equal(notifRes.success, true)
    assert.equal(notificationsCreated.length, 1)
    assert.deepEqual(notificationsCreated[0].opts, { title: '测试群', body: 'hello', silent: true })
    mainWin.minimized = true
    mainWin.visible = false
    notificationsCreated[0].emit('click')
    assert.equal(mainWin.minimized, false)
    assert.equal(mainWin.visible, true)
    assert.equal(mainWin.focused, true)
    assert.deepEqual(mainWin.sentMessages.at(-1), { ch: 'notif-click', args: [{ chatType: 'group', targetId: 42 }] })

    // 3) 独立工具窗口 + sendImage + getUsers + isAllowedSender(['main','tool'])
    const openRes = await ipcHandlers.get('open-tool-window')(mainEvent, {
      id: 'timer',
      name: '计时器',
      url: 'tool://timer/index.html',
      version: '1.0.8',
    })
    assert.equal(openRes.success, true)
    assert.equal(allWindows.length, 2)
    const toolWin = allWindows[1]
    // 模拟工具窗 loadFile 后的 file:// URL
    toolWin.webContents.mainFrame.url = 'file://' + path.join(ROOT, 'out/renderer/tool-window.html').replace(/\\/g, '/')
    const toolEvent = { sender: toolWin.webContents, senderFrame: toolWin.webContents.mainFrame }

    const sendImgRes = await ipcHandlers.get('tool-send-image')(toolEvent, { data: 'abc', mime: 'image/png', name: 'x.png' })
    assert.equal(sendImgRes.success, true)
    assert.deepEqual(mainWin.sentMessages.at(-1), {
      ch: 'tool-send-image',
      args: [{ data: 'abc', mime: 'image/png', name: 'x.png' }],
    })

    // getUsers 跨窗口转发
    const usersPromise = ipcHandlers.get('tool-users-req')(toolEvent)
    await new Promise((r) => setTimeout(r, 10))
    const reqMsg = mainWin.sentMessages.find((m) => m.ch === 'tool-users-req')
    assert.ok(reqMsg, '主窗应收到 tool-users-req')
    const reqId = reqMsg.args[0]
    ipcListeners.get('tool-users-res')(mainEvent, reqId, { users: { 1: { uid: 1 } }, usersJson: {}, ranklistOrder: [1] })
    const usersSnap = await usersPromise
    assert.equal(usersSnap.users['1'].uid, 1)

    // 4) start-file-drag 清洗文件名并启动原生拖拽
    ipcListeners.get('start-file-drag')(mainEvent, {
      name: '../../evil:dir/报?表*.txt',
      dataB64: Buffer.from('hello-drag').toString('base64'),
    })
    assert.equal(dragCalls.length, 1)
    assert.equal(path.basename(dragCalls[0].file).includes('..'), false)
    assert.equal(fs.readFileSync(dragCalls[0].file, 'utf8'), 'hello-drag')

    // 5) tools-install 并发单飞锁 + 文件落盘 + 关闭已开工具窗
    const helloBuf = Buffer.from('<h1>ok</h1>')
    const { createHash } = await import('node:crypto')
    const helloSha = createHash('sha256').update(helloBuf).digest('hex')
    fetchStub = async () => {
      await new Promise((r) => setTimeout(r, 15))
      return new Response(helloBuf, { status: 200 })
    }
    const meta = {
      id: 'timer',
      name: '计时器',
      version: '1.0.9',
      entry: 'index.html',
      files: [{ path: 'index.html', size: helloBuf.length, sha256: helloSha }],
    }
    const [inst1, inst2] = await Promise.all([
      ipcHandlers.get('tools-install')(mainEvent, meta),
      ipcHandlers.get('tools-install')(mainEvent, meta),
    ])
    assert.equal(inst1.success, true)
    assert.equal(inst2.success, true)
    assert.equal(toolWin.destroyed, true, '更新工具前应关闭对应独立工具窗')

    // 6) save-setting 开机自启动（默认开启，可关闭后再开启）
    if (process.platform === 'win32' || process.platform === 'darwin') {
      assert.equal(loginItems.at(-1).openAtLogin, true, '开机自启动默认应开启')
    }
    await ipcHandlers.get('save-setting')(mainEvent, { launchAtStartup: false })
    if (process.platform === 'win32' || process.platform === 'darwin') {
      assert.equal(loginItems.at(-1).openAtLogin, false)
    }
    await ipcHandlers.get('save-setting')(mainEvent, { launchAtStartup: true })
    if (process.platform === 'win32' || process.platform === 'darwin') {
      assert.equal(loginItems.at(-1).openAtLogin, true)
      assert.deepEqual(loginItems.at(-1).args, ['--autostart'])
    }

    // 7) minimizeToTray 开启时，before-quit 不被拦截，且先等渲染层 flush 再退出
    await ipcHandlers.get('save-setting')(mainEvent, { minimizeToTray: true })
    const beforeQuitEv = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
    for (const cb of appListeners.get('before-quit') || []) cb(beforeQuitEv)
    assert.equal(beforeQuitEv.defaultPrevented, true, '首次 before-quit 应暂停等待 flush')
    await new Promise((r) => setTimeout(r, 10))
    assert.ok(mainWin.sentMessages.some((m) => m.ch === 'app-flush-before-close'), '应发送 app-flush-before-close')
    // 渲染层回执 app-flush-done → 触发 checkpoint 并置 forceClose=true
    ipcListeners.get('app-flush-done')(mainEvent)
    await new Promise((r) => setTimeout(r, 20))
    // 再次关闭主窗应直接放行，不被 minimizeToTray 拦截
    mainWin.close()
    assert.equal(mainWin.destroyed, true, 'flush 完成后关闭主窗应直接销毁')

    // 触发 will-quit 清理
    for (const cb of appListeners.get('will-quit') || []) cb()
  } finally {
    for (const cb of appListeners.get('will-quit') || []) {
      try { cb() } catch {}
    }
    Module._load = origLoad
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
})

// ===== 5. EIO 重试与 install-update 先 flush 后 quitAndInstall =====
await test('main/index.js: EIO 退避重试与 install-update 完整 flush/checkpoint/quitAndInstall 链路', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '7fa4-upd-test-'))
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '7fa4-updtmp-'))
  const ipcHandlers = new Map()
  const ipcListeners = new Map()
  const appListeners = new Map()
  const updaterListeners = new Map()
  const eventsOrder = []
  let mainWin = null

  class MockBrowserWindow {
    constructor() {
      this.destroyed = false
      this.listeners = new Map()
      const self = this
      this.webContents = {
        id: 901,
        mainFrame: { url: 'http://127.0.0.1:20001/' },
        getURL: () => self.webContents.mainFrame.url,
        isDestroyed: () => self.destroyed,
        isCrashed: () => false,
        on: () => {},
        once: () => {},
        send: (ch) => {
          if (ch === 'app-flush-before-close') {
            eventsOrder.push('flush-sent')
            setTimeout(() => {
              eventsOrder.push('flush-done')
              ipcListeners.get('app-flush-done')({ sender: self.webContents, senderFrame: self.webContents.mainFrame })
            }, 10)
          }
        },
        setWindowOpenHandler: () => {},
        setZoomLevel: () => {},
        getZoomLevel: () => 0,
        getType: () => 'window',
      }
      mainWin = this
    }
    static fromWebContents() { return mainWin }
    isDestroyed() { return this.destroyed }
    isMinimized() { return false }
    isMaximized() { return false }
    isVisible() { return true }
    isFocused() { return true }
    on(ev, cb) {
      if (!this.listeners.has(ev)) this.listeners.set(ev, [])
      this.listeners.get(ev).push(cb)
    }
    close() {
      const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
      for (const cb of this.listeners.get('close') || []) cb(ev)
      if (!ev.defaultPrevented) this.destroyed = true
      return !ev.defaultPrevented
    }
    destroy() { this.destroyed = true }
    loadURL() { return Promise.resolve() }
  }

  const mockExpress = () => {
    const fn = () => {}
    fn.use = () => {}
    fn.get = () => {}
    fn.listen = () => ({
      address: () => ({ port: 20001 }),
      on: () => {},
      once: (ev, cb) => { if (ev === 'listening') setImmediate(cb) },
      close: (cb) => cb && cb(),
    })
    return fn
  }
  mockExpress.static = () => () => {}

  const origResourcesPath = process.resourcesPath
  Object.defineProperty(process, 'resourcesPath', { value: ROOT, configurable: true })

  const origFsOpen = fs.promises.open
  let eioInjectLeft = 2
  fs.promises.open = async (...args) => {
    if (String(args[0]).includes('.staging-') && eioInjectLeft > 0) {
      eioInjectLeft--
      const err = new Error('transient EIO')
      err.code = 'EIO'
      throw err
    }
    return origFsOpen(...args)
  }

  const origLoad = Module._load
  let fetchStub = async () => new Response('', { status: 404 })
  Module._load = function (request) {
    if (request === 'electron') {
      return {
        app: {
          isPackaged: true,
          isQuitting: false,
          getVersion: () => '4.0.0',
          getAppPath: () => ROOT,
          getPath: (name) => (name === 'temp' ? tempDir : userDataDir),
          requestSingleInstanceLock: () => true,
          whenReady: () => Promise.resolve(),
          setLoginItemSettings: () => {},
          quit: () => eventsOrder.push('app-quit'),
          on: (ev, cb) => {
            if (!appListeners.has(ev)) appListeners.set(ev, [])
            appListeners.get(ev).push(cb)
          },
        },
        BrowserWindow: MockBrowserWindow,
        Tray: class { setToolTip() {} setContextMenu() {} on() {} },
        Menu: { buildFromTemplate: () => ({}) },
        nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize: function () { return this } }), createFromBuffer: () => ({ isEmpty: () => false }) },
        ipcMain: {
          handle: (ch, fn) => ipcHandlers.set(ch, fn),
          on: (ch, fn) => ipcListeners.set(ch, fn),
        },
        screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
        dialog: { showMessageBox: async () => ({ response: 0 }), showErrorBox: () => {} },
        session: { defaultSession: { setPermissionRequestHandler: () => {} } },
        clipboard: { writeText: () => {}, writeImage: () => {} },
        safeStorage: { isEncryptionAvailable: () => false },
        protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
        net: { fetch: (...args) => fetchStub(...args) },
        shell: { openExternal: async () => {} },
        Notification: class { static isSupported() { return true } },
        powerMonitor: { on: () => {} },
      }
    }
    if (request === 'express') return mockExpress
    if (request === 'http-proxy-middleware') return { createProxyMiddleware: () => () => {} }
    if (request === 'electron-updater') {
      return {
        autoUpdater: {
          autoDownload: false,
          autoInstallOnAppQuit: true,
          setFeedURL: () => {},
          on: (ev, cb) => updaterListeners.set(ev, cb),
          checkForUpdates: async () => ({ updateInfo: { version: '4.0.0' } }),
          downloadUpdate: async () => {},
          quitAndInstall: () => {
            eventsOrder.push('quitAndInstall')
            // 模拟 electron-updater 内部先关闭主窗再退出：此时不得被 mainWindow.on('close') 拦截
            const closed = mainWin.close()
            eventsOrder.push(closed ? 'win-closed' : 'win-blocked')
          },
        },
      }
    }
    return origLoad.apply(this, arguments)
  }

  try {
    const mainPath = path.join(ROOT, 'src/main/index.js')
    const twPath = path.join(ROOT, 'src/main/tool-windows.js')
    delete require.cache[mainPath]
    delete require.cache[twPath]
    require(mainPath)

    for (let i = 0; i < 15 && !mainWin; i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    assert.ok(mainWin)
    const mainEvent = { sender: mainWin.webContents, senderFrame: mainWin.webContents.mainFrame }

    // 测试 EIO 重试：前 2 次 open 抛 EIO，第 3 次成功落盘
    const buf = Buffer.from('console.log(1)')
    const { createHash } = await import('node:crypto')
    const sha = createHash('sha256').update(buf).digest('hex')
    fetchStub = async () => new Response(buf, { status: 200 })
    const inst = await ipcHandlers.get('tools-install')(mainEvent, {
      id: 'calc',
      name: '计算器',
      version: '1.0.0',
      entry: 'index.js',
      files: [{ path: 'index.js', size: buf.length, sha256: sha }],
    })
    assert.equal(inst.success, true)
    assert.equal(eioInjectLeft, 0, '应经历 2 次 EIO 重试并最终成功')

    // 模拟 update-downloaded 后调用 install-update
    updaterListeners.get('update-downloaded')({ version: '4.0.1' })
    await ipcHandlers.get('install-update')(mainEvent)
    assert.deepEqual(eventsOrder, ['flush-sent', 'flush-done', 'quitAndInstall', 'win-closed'])
  } finally {
    fs.promises.open = origFsOpen
    Object.defineProperty(process, 'resourcesPath', { value: origResourcesPath, configurable: true })
    for (const cb of appListeners.get('will-quit') || []) {
      try { cb() } catch {}
    }
    Module._load = origLoad
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
})

let passed = 0
for (const [name, ok, err] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.error(err)
  else passed++
}
console.log(`\n${passed}/${results.length} 通过`)
process.exit(passed === results.length ? 0 : 1)
