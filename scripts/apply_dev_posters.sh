#!/bin/bash
# 海报审核页（/dev）+ nginx 放宽上传体上限（幂等）
#   1) 部署 /home/ubuntu/website/dev/posters.html + posters.js
#   2) index.html / feedback.html 顶部导航各插入「海报审核」页签
#   3) nginx 插入 `location = /api/posters`（client_max_body_size 4m），nginx -t + reload
# 用法：bash apply_dev_posters.sh
set -e

DEV=/home/ubuntu/website/dev
cd "$DEV"

# 重跑时保留上一版（首次运行无旧文件则跳过）
if [ -f posters.html ]; then cp -f posters.html posters.html.bak-posters; fi
if [ -f posters.js ];   then cp -f posters.js   posters.js.bak-posters;   fi

# ---------- 1) posters.html ----------
cat > posters.html <<'HTMLEOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>7FA4 Chat · 海报审核</title>
<style>
  :root {
    --bg: #f3f5fa;
    --card: #ffffff;
    --text: #1c2333;
    --text-sub: #8a93a6;
    --border: #eceff5;
    --primary: #4f7dff;
    --up: #07c160;
    --down: #e64340;
    --radius: 16px;
    --shadow: 0 1px 2px rgba(28,35,51,.04), 0 8px 24px -12px rgba(28,35,51,.10);
    --grad: linear-gradient(135deg,#4f7dff,#8b5cf6);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .topbar {
    position: sticky; top: 0; z-index: 20;
    background: rgba(255,255,255,.86);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
  }
  .topbar-inner {
    max-width: 1180px; margin: 0 auto; padding: 14px 20px;
    display: flex; align-items: center; gap: 16px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-dot {
    width: 34px; height: 34px; border-radius: 10px;
    background: var(--grad);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 800; font-size: 15px;
    box-shadow: 0 4px 12px -4px rgba(79,125,255,.55);
  }
  .brand h1 { font-size: 17px; font-weight: 700; line-height: 1.2; }
  .brand small { display: block; color: var(--text-sub); font-size: 11px; font-weight: 400; margin-top: 1px; }
  .nav { display: flex; gap: 4px; background: #eef1f7; padding: 4px; border-radius: 12px; margin-left: 8px; }
  .nav a {
    text-decoration: none; color: var(--text-sub); font-size: 13px; font-weight: 500;
    padding: 7px 16px; border-radius: 9px; transition: all .18s;
  }
  .nav a.active { background: #fff; color: var(--primary); box-shadow: 0 1px 4px rgba(28,35,51,.08); }
  .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .updated { color: var(--text-sub); font-size: 12px; }
  .refresh {
    border: none; background: var(--grad); color: #fff; font-size: 13px;
    padding: 8px 16px; border-radius: 10px; cursor: pointer; font-weight: 500;
    box-shadow: 0 4px 12px -4px rgba(79,125,255,.5); transition: transform .12s, opacity .15s;
  }
  .refresh:hover { transform: translateY(-1px); opacity: .94; }
  .refresh:active { transform: scale(.97); }
  .err { color: var(--down); font-size: 12px; }

  .wrap { max-width: 1180px; margin: 22px auto 60px; padding: 0 20px; }
  .bar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .bar h2 { font-size: 16px; font-weight: 700; }
  .bar h2::before { content: ''; display: inline-block; width: 4px; height: 15px; border-radius: 2px; background: var(--grad); margin-right: 8px; vertical-align: -2px; }
  .bar .count { color: var(--text-sub); font-size: 12.5px; }
  .filters { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
  .filter-chip {
    border: 1px solid var(--border); background: var(--card); color: var(--text-sub);
    font-size: 12.5px; padding: 7px 14px; border-radius: 20px; cursor: pointer;
    transition: all .15s;
  }
  .filter-chip:hover { border-color: var(--primary); color: var(--primary); }
  .filter-chip.active { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 500; }
  .filter-chip .n { opacity: .75; margin-left: 5px; font-variant-numeric: tabular-nums; }

  .p-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; }
  .p-card {
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); overflow: hidden; display: flex; flex-direction: column;
    transition: box-shadow .15s, transform .12s;
  }
  .p-card:hover { box-shadow: 0 2px 4px rgba(28,35,51,.05), 0 14px 32px -14px rgba(28,35,51,.16); transform: translateY(-1px); }
  .p-shot {
    display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; background: #eef1f7;
    border-bottom: 1px solid var(--border); cursor: zoom-in;
  }
  .p-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .p-id { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .p-uid { color: var(--text-sub); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .p-meta { color: var(--text-sub); font-size: 11.5px; line-height: 1.6; font-variant-numeric: tabular-nums; }
  .p-actions { margin-top: auto; padding-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
  .p-actions button {
    flex: 1 1 72px; min-width: 0; white-space: nowrap;
    border: none; font-size: 12px; font-weight: 600;
    padding: 8px 4px; border-radius: 10px; cursor: pointer; transition: all .15s;
  }
  .p-actions button:disabled { opacity: .55; cursor: not-allowed; }
  .ok-btn { background: rgba(7,193,96,.10); color: #079e51; }
  .ok-btn:hover:not(:disabled) { background: var(--up); color: #fff; }
  .no-btn { background: rgba(230,67,64,.08); color: var(--down); }
  .no-btn:hover:not(:disabled) { background: var(--down); color: #fff; }
  .pin-btn { background: rgba(79,125,255,.10); color: var(--primary); }
  .pin-btn:hover:not(:disabled) { background: var(--primary); color: #fff; }
  .pin-btn.on { background: var(--primary); color: #fff; }
  .del-btn { flex: 0 0 100%; background: #f1f3f8; color: var(--text-sub); }
  .del-btn:hover:not(:disabled) { background: rgba(230,67,64,.10); color: var(--down); }
  .state-chip {
    display: inline-flex; align-items: center; font-size: 11px; font-weight: 600;
    padding: 2.5px 9px; border-radius: 12px;
  }
  .state-pending { background: rgba(232,163,61,.14); color: #b57d1f; }
  .state-approved { background: rgba(7,193,96,.12); color: #079e51; }
  .state-rejected { background: rgba(230,67,64,.10); color: var(--down); }
  .state-pinned { background: rgba(79,125,255,.12); color: var(--primary); }

  .auth-zone { display: flex; align-items: center; gap: 10px; }
  .auth-name {
    display: inline-flex; align-items: center; gap: 7px;
    background: rgba(7,193,96,.10); color: #079e51;
    font-size: 12.5px; font-weight: 600; padding: 7px 13px; border-radius: 10px;
  }
  .auth-name i { width: 7px; height: 7px; border-radius: 50%; background: var(--up); box-shadow: 0 0 0 3px rgba(7,193,96,.18); }
  .auth-btn {
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    font-size: 12.5px; font-weight: 600; padding: 7px 16px; border-radius: 10px; cursor: pointer;
    transition: all .15s;
  }
  .auth-btn.login { border-color: transparent; background: var(--grad); color: #fff; box-shadow: 0 4px 12px -4px rgba(79,125,255,.5); }
  .auth-btn.login:hover { transform: translateY(-1px); opacity: .94; }
  .auth-btn.logout:hover { border-color: var(--down); color: var(--down); background: rgba(230,67,64,.05); }
  .login-mask {
    position: fixed; inset: 0; z-index: 100; display: flex;
    align-items: center; justify-content: center;
    background: rgba(20,26,40,.45); backdrop-filter: blur(4px);
  }
  .login-box {
    width: 330px; max-width: 92vw; background: var(--card);
    border: 1px solid var(--border); border-radius: 18px;
    box-shadow: 0 24px 60px -20px rgba(20,26,40,.4);
    padding: 24px 26px;
  }
  .login-head { display: flex; align-items: center; justify-content: space-between; }
  .login-head h3 { font-size: 16px; font-weight: 700; }
  .login-x {
    border: none; background: none; color: var(--text-sub); font-size: 20px;
    cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 8px;
  }
  .login-x:hover { background: #f1f3f8; color: var(--text); }
  .login-sub { color: var(--text-sub); font-size: 12px; margin: 6px 0 16px; }
  .login-label { display: block; font-size: 12.5px; color: var(--text-sub); margin: 12px 0 6px; font-weight: 600; }
  .login-input {
    width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 13.5px;
    border: 1px solid var(--border); border-radius: 10px; background: #f8f9fc; color: var(--text);
    outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .login-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79,125,255,.15); background: #fff; }
  .login-err { color: var(--down); font-size: 12px; min-height: 18px; margin-top: 10px; }
  .login-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
  .login-cancel {
    border: 1px solid var(--border); background: var(--card); color: var(--text-sub);
    font-size: 13px; padding: 9px 18px; border-radius: 10px; cursor: pointer;
  }
  .login-cancel:hover { color: var(--text); }
  .login-submit {
    border: none; background: var(--grad); color: #fff; font-size: 13px; font-weight: 600;
    padding: 9px 22px; border-radius: 10px; cursor: pointer;
    box-shadow: 0 6px 16px -6px rgba(79,125,255,.55); transition: opacity .15s;
  }
  .login-submit:disabled { opacity: .6; cursor: not-allowed; }
  .empty { padding: 56px 20px; text-align: center; color: var(--text-sub); font-size: 13.5px; }
  .empty .big { font-size: 34px; display: block; margin-bottom: 10px; opacity: .6; }
  footer { text-align: center; color: #b6bdc9; font-size: 12px; margin-top: 22px; }
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-inner">
    <div class="brand">
      <div class="brand-dot">7</div>
      <div>
        <h1>7FA4 Chat · 管理后台</h1>
        <small>海报审核</small>
      </div>
    </div>
    <nav class="nav">
      <a href="/dev/">用户统计</a>
      <a href="/dev/feedback.html">用户反馈</a>
      <a href="/dev/posters.html" class="active">海报审核</a>
    </nav>
    <div class="topbar-right">
      <span class="updated" id="updated">加载中…</span>
      <span class="err" id="err"></span>
      <button class="refresh" onclick="load()">刷新</button>
      <div class="auth-zone" id="auth-zone"></div>
    </div>
  </div>
</div>

<div class="wrap">
  <div class="bar">
    <h2>海报审核</h2>
    <span class="count" id="p-count"></span>
    <div class="filters" id="filters">
      <button class="filter-chip active" data-s="pending">待审<span class="n" id="n-pending"></span></button>
      <button class="filter-chip" data-s="approved">已发布<span class="n" id="n-approved"></span></button>
      <button class="filter-chip" data-s="rejected">已拒绝<span class="n" id="n-rejected"></span></button>
    </div>
  </div>
  <div class="p-grid" id="p-grid">加载中…</div>
  <footer>通过后立即出现在客户端开屏与「发现 → 海报墙」· 下架 / 删除后立即消失 · 置顶的在开屏与海报墙优先展示</footer>
</div>

<script src="/dev/posters.js"></script>
</body>
</html>
HTMLEOF
echo 'posters.html written'

# ---------- 2) posters.js ----------
cat > posters.js <<'JSEOF'
/* 7FA4-Chat /dev 海报审核页逻辑（独立页，nginx 对该文件 no-cache） */
/* 接口：GET /api/admin/posters?status=  POST /api/admin/posters/review  GET /api/admin */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATE_LABEL = { pending: '待审', approved: '已发布', rejected: '已拒绝' };
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—');

let status = 'pending';
let isAdmin = false;
let adminUser = '';
let items = [];

async function load() {
  const err = $('err');
  err.textContent = '';
  try {
    // 用 location.origin 绝对地址：登出后地址栏可能残留错误凭据，相对路径解析会带凭据导致 fetch 报错
    const [listRes, aRes] = await Promise.all([
      fetch(location.origin + '/api/admin/posters?status=' + status, { cache: 'no-store', credentials: 'same-origin' }),
      fetch(location.origin + '/api/admin', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null),
    ]);
    if (aRes && aRes.ok) {
      const d = await aRes.json().catch(() => null);
      isAdmin = !!(d && d.admin);
      adminUser = (d && d.adminUser) || '';
    }
    updateAuthUI();
    if (listRes.status === 401) {
      $('p-grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="big">🔒</span>需要管理员登录</div>';
      $('p-count').textContent = '';
      $('updated').textContent = '未授权';
      return;
    }
    if (!listRes.ok) throw new Error('HTTP ' + listRes.status);
    const data = await listRes.json();
    items = data.items || [];
    const c = data.counts || {};
    $('n-pending').textContent = c.pending || 0;
    $('n-approved').textContent = c.approved || 0;
    $('n-rejected').textContent = c.rejected || 0;
    render();
    $('updated').textContent = '更新于 ' + fmtTime(Date.now());
  } catch (e) {
    err.textContent = '加载失败：' + (e.message || e);
    $('p-grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="big">⚠️</span>加载失败</div>';
  }
}

/* ---------- 顶栏登录/退出（会话 Cookie 方案，与反馈页一致） ---------- */
function updateAuthUI() {
  const zone = $('auth-zone');
  if (!zone) return;
  if (isAdmin) {
    zone.innerHTML =
      '<span class="auth-name"><i></i>' + esc(adminUser || '管理员') + '</span>' +
      '<button class="auth-btn logout" onclick="doLogout()">退出登录</button>';
  } else {
    zone.innerHTML = '<button class="auth-btn login" onclick="openLogin()">登录</button>';
  }
}

function openLogin() {
  closeLogin();
  document.body.insertAdjacentHTML('beforeend',
    '<div class="login-mask" id="login-mask">' +
      '<div class="login-box">' +
        '<div class="login-head"><h3>管理员登录</h3><button class="login-x" onclick="closeLogin()" aria-label="关闭">×</button></div>' +
        '<p class="login-sub">登录后可审核与管理海报（通过 / 拒绝 / 下架 / 置顶 / 删除）</p>' +
        '<label class="login-label" for="login-user">用户名</label>' +
        '<input class="login-input" id="login-user" autocomplete="username" placeholder="请输入用户名">' +
        '<label class="login-label" for="login-pass">密码</label>' +
        '<input class="login-input" id="login-pass" type="password" autocomplete="current-password" placeholder="请输入密码">' +
        '<div class="login-err" id="login-err"></div>' +
        '<div class="login-actions">' +
          '<button class="login-cancel" onclick="closeLogin()">取消</button>' +
          '<button class="login-submit" id="login-submit" onclick="submitLogin()">登录</button>' +
        '</div>' +
      '</div>' +
    '</div>');
  const mask = document.getElementById('login-mask');
  document.getElementById('login-user').focus();
  document.getElementById('login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitLogin(); } });
  document.getElementById('login-user').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('login-pass').focus(); });
  mask.addEventListener('click', (e) => { if (e.target === mask) closeLogin(); });
}

function closeLogin() {
  const m = document.getElementById('login-mask');
  if (m) m.remove();
}

async function submitLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-err');
  const btn = document.getElementById('login-submit');
  if (!user || !pass) { err.textContent = '请输入用户名和密码'; return; }
  btn.disabled = true; btn.textContent = '登录中…';
  try {
    // nginx auth_basic 用 htpasswd 校验；通过后后端签发会话 Cookie
    const cred = btoa(unescape(encodeURIComponent(user + ':' + pass)));
    const r = await fetch(location.origin + '/api/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Authorization': 'Basic ' + cred, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (r.ok) { closeLogin(); load(); }
    else if (r.status === 401) err.textContent = '用户名或密码错误';
    else err.textContent = '登录失败（HTTP ' + r.status + '）';
  } catch (e) {
    err.textContent = '网络错误：' + (e.message || e);
  } finally {
    const b = document.getElementById('login-submit');
    if (b) { b.disabled = false; b.textContent = '登录'; }
  }
}

async function doLogout() {
  try { await fetch(location.origin + '/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  load();
}

function render() {
  $('p-count').textContent = STATE_LABEL[status] + ' ' + items.length + ' 张';
  const box = $('p-grid');
  if (!items.length) {
    box.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="big">🖼️</span>暂无' + STATE_LABEL[status] + '海报</div>';
    return;
  }
  box.innerHTML = items.map(card).join('');
}

/* 按钮用 data-* 传参 + 事件委托，避免在 HTML 字符串里嵌引号 */
function mkBtn(act, label, cls, id) {
  return '<button class="' + cls + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';
}

/* 待审：通过 / 拒绝 · 已通过：下架(可逆) / 置顶 / 彻底删除 · 已拒绝：通过 / 彻底删除 */
function actionsFor(p) {
  if (p.status === 'pending') {
    return mkBtn('approve', '通过', 'ok-btn', p.id) +
      mkBtn('reject', '拒绝', 'no-btn', p.id) +
      mkBtn('delete', '删除', 'del-btn', p.id);
  }
  if (p.status === 'approved') {
    return mkBtn('reject', '下架', 'no-btn', p.id) +
      mkBtn(p.pinned ? 'unpin' : 'pin', p.pinned ? '取消置顶' : '置顶', 'pin-btn' + (p.pinned ? ' on' : ''), p.id) +
      mkBtn('delete', '删除', 'del-btn', p.id);
  }
  return mkBtn('approve', '通过', 'ok-btn', p.id) + mkBtn('delete', '删除', 'del-btn', p.id);
}

function card(p) {
  // 未通过审核的图只有管理员能取（后端按 admin_session 判定），<img> 同源请求会自动带上 Cookie
  return '<div class="p-card">' +
    '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img class="p-shot" src="' + esc(p.url) + '" alt="海报 ' + p.id + '" loading="lazy"></a>' +
    '<div class="p-body">' +
      '<div class="p-id">#' + p.id +
        ' <span class="state-chip state-' + esc(p.status) + '">' + STATE_LABEL[p.status] + '</span>' +
        (p.pinned ? ' <span class="state-chip state-pinned">置顶</span>' : '') +
      '</div>' +
      '<div class="p-uid">投稿人 UID ' + esc(p.uid) + '</div>' +
      '<div class="p-meta">' + esc(p.w || 0) + '×' + esc(p.h || 0) + ' · ' + fmtSize(p.size || 0) + '</div>' +
      '<div class="p-meta">投稿 ' + fmtTime(p.created_at) + (p.reviewed_at ? '<br>审核 ' + fmtTime(p.reviewed_at) : '') + '</div>' +
      '<div class="p-meta">IP ' + esc(p.ip || '—') + '</div>' +
      '<div class="p-actions">' + actionsFor(p) + '</div>' +
    '</div>' +
  '</div>';
}

async function run(id, action, label) {
  // 删除不可恢复；下架会让海报立刻从开屏与海报墙消失（可在「已拒绝」页签重新通过）
  if (action === 'delete' && !confirm('彻底删除 #' + id + '？图片文件与记录将一并移除，不可恢复。')) return;
  if (action === 'reject' && !confirm(label + ' #' + id + '？' +
      (label === '下架' ? '该海报将立即从开屏与海报墙消失，可在「已拒绝」页签重新通过。' : '拒绝后该海报不会对外公开。'))) return;
  try {
    const r = await fetch(location.origin + '/api/admin/posters/review', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    if (!r.ok) { alert(label + '失败 HTTP ' + r.status); return; }
    if (action === 'pin' || action === 'unpin') { await load(); return; } // 原地刷新按钮状态
    items = items.filter((p) => p.id !== id); // 通过 / 下架 / 删除 都会离开当前页签
    render();
    load(); // 刷新三个页签的计数
  } catch (e) { alert(label + '失败：' + e.message); }
}

function bindEvents() {
  const wrap = $('filters');
  wrap.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    wrap.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
    status = chip.dataset.s;
    $('p-grid').innerHTML = '加载中…';
    load();
  });
  $('p-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    run(Number(btn.dataset.id), btn.dataset.act, btn.textContent.trim());
  });
}
bindEvents();
load();
setInterval(() => load(), 60 * 1000); // 每分钟自动刷新
JSEOF
echo 'posters.js written'

# ---------- 3) 导航页签注入（index.html / feedback.html） ----------
python3 <<'PYNAVEOF'
import io, os
targets = [
    ('/home/ubuntu/website/dev/index.html',
     '      <a href="/dev/" class="active">用户统计</a>\n      <a href="/dev/feedback.html">用户反馈</a>',
     '      <a href="/dev/" class="active">用户统计</a>\n      <a href="/dev/feedback.html">用户反馈</a>\n      <a href="/dev/posters.html">海报审核</a>'),
    ('/home/ubuntu/website/dev/feedback.html',
     '      <a href="/dev/">用户统计</a>\n      <a href="/dev/feedback.html" class="active">用户反馈</a>',
     '      <a href="/dev/">用户统计</a>\n      <a href="/dev/feedback.html" class="active">用户反馈</a>\n      <a href="/dev/posters.html">海报审核</a>'),
]
for path, old, new in targets:
    src = io.open(path, encoding='utf-8').read()
    if '/dev/posters.html' in src:
        print('nav already patched:', path)
        continue
    assert old in src, 'nav anchor missing in ' + path
    bak = path + '.bak-posters'
    if not os.path.exists(bak):
        io.open(bak, 'w', encoding='utf-8').write(src)
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
    print('nav patched:', path)
PYNAVEOF

# ---------- 4) nginx：放宽海报投稿的请求体上限 ----------
sudo python3 <<'PYNGXEOF'
import io, os, shutil
NGINX_CONF = '/etc/nginx/sites-enabled/website'
src = io.open(NGINX_CONF, encoding='utf-8').read()
if 'location = /api/posters' in src:
    print('nginx already patched, skip')
    raise SystemExit(0)
anchor = """    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }"""
assert anchor in src, 'nginx anchor missing'
addition = anchor + """
    # 海报投稿：图片较大，单独放宽请求体上限
    # （nginx 中 `=` 精确匹配优先级高于 `^~` 前缀匹配，因此不会放宽其余 /api/* 接口）
    location = /api/posters {
        client_max_body_size 4m;
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }"""
# 备份必须落在 sites-available（非 nginx 加载目录）：
# 若放在 sites-enabled，会与 website 构成重复的 chat.forfof.cloud server 块，
# 触发 `conflicting server name "chat.forfof.cloud" ... ignored` 警告（先加载者生效，行为不确定）。
bak = '/etc/nginx/sites-available/website.bak-posters'
if not os.path.exists(bak):
    shutil.copy2(NGINX_CONF, bak)
# 清理历史版本误留在加载目录中的同名备份
stale = NGINX_CONF + '.bak-posters'
if os.path.exists(stale):
    os.remove(stale)
    print('removed stale backup in sites-enabled:', stale)
io.open(NGINX_CONF, 'w', encoding='utf-8').write(src.replace(anchor, addition, 1))
print('nginx patched')
PYNGXEOF

sudo nginx -t
sudo systemctl reload nginx
echo 'nginx reloaded'

echo "--- /dev/posters.html ---"
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: chat.forfof.cloud' http://127.0.0.1/dev/posters.html
echo "--- /dev/posters.js ---"
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: chat.forfof.cloud' http://127.0.0.1/dev/posters.js
echo "--- nav posters.html 命中数（index/feedback/posters 各应为 1）---"
grep -c 'posters.html' index.html feedback.html posters.html
echo "--- node --check posters.js ---"
node --check posters.js && echo 'posters.js syntax ok'
