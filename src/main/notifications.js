'use strict';

const { BrowserWindow, screen } = require('electron');

// 桌面通知卡片的窗口管理（纯主进程 CJS 模块，不依赖 index.js 内部状态）。
//
// 为什么单独拆一个模块：旧实现把窗口创建硬编码在 index.js 的 'notify' handler 里，
// 只能「开一次、用完即弃」，于是第二条提醒被 `if (notificationWin) return` 直接吞掉；
// 尺寸/位置也写死右下角。这里把「单实例复用 + 未加载完先排队 + 锚点定位 + 按内容高度伸缩」
// 收敛成一处，index.js 只负责 IPC 白名单与业务分发。
//
// 安全基线：窗口永远 frame:false + 透明 + 不可缩放/移动/最大化 + 关 sandbox 以外的全部宽松项，
// preload 只暴露固定几个 invoke 通道（见 src/preload/notification.js）。

const NOTIF_WIDTH = 372;
const NOTIF_HEIGHT = 120;
const NOTIF_MIN_HEIGHT = 80;
const NOTIF_MAX_HEIGHT = 720;
// 窗口外边距。注意页内还有 8px 阴影留白（notification.html 的 .card margin），
// 所以「可见卡片到屏幕边缘」= M + 8。取 6px → 可见距离约 14px，与 Windows 原生通知观感一致
//（原为 16px，可见 24px，明显偏内）。四角定位与 resize 锚点全用这一个常量，改这里即可。
const NOTIF_MARGIN = 6;
// 建窗/加载期间攒下的提醒上限：popup-ui 一屏最多 4 张卡，多的补发过去也只会被挤掉
const PENDING_LIMIT = 4;

function clampHeight(h) {
  return Math.min(NOTIF_MAX_HEIGHT, Math.max(NOTIF_MIN_HEIGHT, Math.round(h)));
}

class NotificationManager {
  /**
   * @param {object} opts
   * @param {string} opts.preloadPath 通知窗 preload 绝对路径
   * @param {string} opts.htmlPath    通知页 html 绝对路径（dev 走 src/renderer，打包走 out/renderer）
   * @param {() => boolean} opts.isEnabled 主进程最后一道闸门（设置里的 notifDesktop）
   * @param {() => (import('electron').BrowserWindow|null)} [opts.getMainWindow]
   *        主窗引用（用于把卡片放到主窗所在显示器）；不传则退回主显示器
   */
  constructor({ preloadPath, htmlPath, isEnabled, getMainWindow } = {}) {
    this.preloadPath = preloadPath;
    this.htmlPath = htmlPath;
    this.isEnabledFn = typeof isEnabled === 'function' ? isEnabled : null;
    this.getMainWindowFn = typeof getMainWindow === 'function' ? getMainWindow : null;
    this.win = null;
    // 页面是否已完成首帧加载：false 时 notify 只能排队，等 did-finish-load 再补发
    this.ready = false;
    // 未发出的提醒（按到达顺序，同 id 只留最新一条）：建窗 + 加载通常只有几百毫秒，
    // 但一个群里连着几条消息正好落在这段时间里，只留最后一条会真的丢掉别的会话的提醒。
    this.pending = [];
    this.position = 'br';
    // 窗口当前实际所在的那个锚点：设置里改「弹窗位置」后，复用的旧窗口要立刻挪过去，
    // 否则会先在旧角落闪一下，等渲染层回传 resize 才跳到新位置
    this.appliedPosition = null;
    this.height = NOTIF_HEIGHT;
  }

  isEnabled() {
    try {
      return this.isEnabledFn ? this.isEnabledFn() !== false : true;
    } catch {
      // 读设置抛错时按「开」处理：宁可多弹一次，也不要静默失灵
      return true;
    }
  }

  // 供 index.js 的 isAllowedSender 判定 sender 归属
  getWindow() {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  notify(payload) {
    if (!this.isEnabled()) return;
    if (!payload || typeof payload !== 'object') return;
    if (payload.position) this.position = String(payload.position);

    const win = this.getWindow();
    if (!win) {
      // 新窗口按默认高度起步，等渲染层实测内容高度后由 resize() 定尺寸
      this.height = NOTIF_HEIGHT;
      this.queue(payload);
      this.createWindow();
      return; // 数据在 did-finish-load 里补发
    }
    if (!this.ready) {
      // 还在加载：排队等 did-finish-load（此时也记下新锚点，加载完一次性挪到位）
      this.queue(payload);
      return;
    }
    this.applyPositionIfChanged(win);
    this.send(payload);
  }

  // 渲染层实测内容高度后回传；<=0 表示「本批提醒显示完了」→ 只隐藏不销毁，留着复用
  resize(height) {
    const raw = Math.round(Number(height));
    if (!Number.isFinite(raw)) return;
    const win = this.getWindow();
    if (raw <= 0) {
      if (win) win.hide();
      return;
    }
    this.height = clampHeight(raw);
    if (!win) return;
    const bounds = win.getBounds();
    if (bounds.height === this.height && bounds.width === NOTIF_WIDTH) return;
    win.setBounds(this.boundsFor(this.height));
    this.appliedPosition = this.position;
  }

  // 清空卡片内容（主窗获得焦点 / 用户已读 / 开关关掉）：窗口本身保留复用
  clear() {
    this.pending = [];
    const win = this.getWindow();
    if (!win) return;
    try { win.webContents.send('notif-clear'); } catch { /* 窗口正在销毁 */ }
  }

  close() {
    this.pending = [];
    this.ready = false;
    this.appliedPosition = null;
    const win = this.getWindow();
    this.win = null;
    if (win) {
      try { win.destroy(); } catch { /* 已经没了就算了 */ }
    }
  }

  // 退出路径复用 close：destroy 是同步的，不会在 quit 过程中被 close 拦截拖住
  destroy() {
    this.close();
  }

  // 同 id 的提醒在排队时只留最新一条（与 popup-ui 按 id 合并的行为一致），并限制总数
  queue(payload) {
    const key = payload.id || [payload.chatType, payload.targetId, payload.title].join('|');
    this.pending = this.pending.filter((p) => (p.id || [p.chatType, p.targetId, p.title].join('|')) !== key);
    this.pending.push(payload);
    if (this.pending.length > PENDING_LIMIT) this.pending.splice(0, this.pending.length - PENDING_LIMIT);
  }

  send(payload) {
    const win = this.getWindow();
    if (!win) return;
    try { win.webContents.send('notif-data', payload); } catch { return; }
    // 上一批提醒已被 resize(0) 隐藏时，新提醒要把窗口重新亮出来（依旧不抢焦点）
    if (!win.isVisible()) win.showInactive();
  }

  // 位置设置变了 → 先把复用的旧窗口挪到新角落（高度等渲染层回传 resize 再定）
  applyPositionIfChanged(win) {
    if (!win || !this.appliedPosition || this.appliedPosition === this.position) return;
    try {
      win.setBounds(this.boundsFor(this.height));
      this.appliedPosition = this.position;
    } catch { /* 挪不动就等 resize */ }
  }

  // 卡片跟随主窗所在的显示器（副屏用户也能在自己屏幕角落看到提醒）；取不到就用主显示器
  workArea() {
    try {
      const main = this.getMainWindowFn ? this.getMainWindowFn() : null;
      if (main && !main.isDestroyed()) return screen.getDisplayMatching(main.getBounds()).workArea;
    } catch { /* getBounds 在窗口销毁瞬间可能抛错 */ }
    return screen.getPrimaryDisplay().workArea;
  }

  // 按 position 锚点算坐标：四角预设，底边/顶边与左右边分别锚定，改高度时不会整窗乱跳
  boundsFor(height) {
    const h = clampHeight(height);
    const workArea = this.workArea();
    const pos = this.position || 'br';
    const isLeft = pos === 'tl' || pos === 'bl';
    const isTop = pos === 'tl' || pos === 'tr';
    const x = isLeft ? workArea.x + NOTIF_MARGIN : workArea.x + workArea.width - NOTIF_WIDTH - NOTIF_MARGIN;
    const y = isTop ? workArea.y + NOTIF_MARGIN : workArea.y + workArea.height - h - NOTIF_MARGIN;
    return { x: Math.round(x), y: Math.round(y), width: NOTIF_WIDTH, height: h };
  }

  createWindow() {
    const bounds = this.boundsFor(this.height);
    const win = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false, // 先隐藏加载，内容到位再 showInactive，避免闪一下空壳/抢焦点
      hasShadow: false,
      // 刻意不设 focusable / 不调用 focus()：「绝不抢焦点」全靠 show:false + showInactive()。
      // focusable:false 在 Linux 上会让窗口停止与 WM 交互（卡片可能点不动），且 Windows 上
      // 还隐含 skipTaskbar 之外的行为差异，收益为零、风险明确，所以不用。
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false // 卡片动画/倒计时在窗口失焦时不能降频
      }
    });
    this.win = win;
    this.ready = false;
    this.appliedPosition = this.position;

    // 'screen-saver' 层级：压住全屏应用与普通置顶窗，保证提醒一定能看见
    win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') {
      // macOS：全屏 Space 里也要能出现
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    // 透明无边框窗在某些平台上默认会忽略鼠标，显式打开保证卡片可点（关闭按钮/点卡片跳会话）
    win.setIgnoreMouseEvents(false);

    win.on('closed', () => {
      this.win = null;
      this.ready = false;
    });

    // 加载失败 / 渲染进程崩溃：这类窗口「活着但永远发不出卡」，必须销毁，
    // 下一条 notify 才会重建（否则提醒会一直静默丢失）
    const rebuildNextTime = () => {
      if (this.getWindow() !== win) return;
      this.close();
    };
    win.webContents.on('did-fail-load', rebuildNextTime);
    win.webContents.on('render-process-gone', rebuildNextTime);

    win.webContents.on('did-finish-load', () => {
      if (!this.getWindow()) return;
      this.ready = true;
      // 加载期间改过位置 → 在第一次显示前就挪到位，避免先在旧角落闪一下
      this.applyPositionIfChanged(win);
      const queued = this.pending;
      this.pending = [];
      for (const item of queued) {
        try { win.webContents.send('notif-data', item); } catch { /* 逐个发，单条失败不影响其它 */ }
      }
      if (queued.length) {
        // 无焦点显示：置顶但绝不抢占当前窗口焦点
        win.showInactive();
      }
    });

    win.loadFile(this.htmlPath);
  }
}

module.exports = { NotificationManager };
