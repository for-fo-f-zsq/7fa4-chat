/* 7FA4-Chat /dev 用户分析页逻辑（独立 JS，nginx 对该文件 no-cache，改完即时生效） */
const $ = (id) => document.getElementById(id);

async function load() {
  const err = $('err');
  err.textContent = '';
  try {
    const r = await fetch('/info', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    render(data);
  } catch (e) {
    err.textContent = '加载失败：' + (e.message || e);
    $('updated').textContent = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + '（失败）';
  }
}

function render(data) {
  const stats = data.stats || {};
  const seq = stats.last_30_days || [];
  const daily = stats.daily_active || {};
  const records = data.records || [];

  const todayKey = seq.length ? seq[seq.length - 1].date : '';
  const yestKey = seq.length > 1 ? seq[seq.length - 2].date : '';
  const today = daily[todayKey] || 0;
  const yest = daily[yestKey] || 0;
  const last7 = seq.slice(-7);
  const avg7 = last7.length ? (last7.reduce((s, d) => s + d.active, 0) / last7.length) : 0;
  const total7 = last7.reduce((s, d) => s + d.active, 0);
  const last30 = seq.reduce((s, d) => s + d.active, 0);

  $('k-total').textContent = stats.total_users ?? records.length;
  $('k-today').textContent = today;
  $('k-yest').textContent = yest;
  $('k-avg7').textContent = avg7.toFixed(1);
  $('k-yest-trend').innerHTML = yest > today ? '<b style="color:#e64340">较今日多 ' + (yest - today) + '</b>' : (yest < today ? '<b>较昨日 +' + (today - yest) + '</b>' : '<b>与昨日持平</b>');
  $('k-avg7-trend').innerHTML = '近7日累计 <b>' + total7 + '</b> 人次 · 近30日 <b>' + last30 + '</b> 人次';

  drawChart(seq);
  renderDaily(seq);
  renderUsers(records);

  $('updated').textContent = '更新于 ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/* ---------- 近 30 天活跃折线图（Canvas，无依赖） ---------- */
let hoverIndex = -1;
function drawChart(seq) {
  window._lastSeq = seq;
  const canvas = $('chart');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (!seq.length) return;
  const padL = 34, padR = 12, padT = 14, padB = 26;
  const cw = W - padL - padR, ch = H - padT - padB;
  const max = Math.max(5, ...seq.map(d => d.active));
  const n = seq.length;

  const x = (i) => padL + (n === 1 ? cw / 2 : cw * i / (n - 1));
  const y = (v) => padT + ch - ch * v / max;

  // 网格 + Y 轴刻度
  ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const v = Math.round(max * g / 4);
    const gy = y(v);
    ctx.strokeStyle = '#f0f0f0'; ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
    ctx.fillStyle = '#999'; ctx.fillText(String(v), padL - 6, gy);
  }
  // X 轴日期（每 5 天标一个）
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < n; i++) {
    if (i % 5 !== 0 && i !== n - 1) continue;
    ctx.fillStyle = '#999';
    ctx.fillText(seq[i].date.slice(5), x(i), padT + ch + 6);
  }

  // 面积渐变
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
  grad.addColorStop(0, 'rgba(7,193,96,.28)');
  grad.addColorStop(1, 'rgba(7,193,96,.02)');
  ctx.beginPath();
  seq.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.active)) : ctx.lineTo(x(i), y(d.active)));
  ctx.lineTo(x(n - 1), padT + ch); ctx.lineTo(x(0), padT + ch); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // 折线
  ctx.beginPath();
  seq.forEach((d, i) => i === 0 ? ctx.moveTo(x(i), y(d.active)) : ctx.lineTo(x(i), y(d.active)));
  ctx.strokeStyle = '#07c160'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  // hover 标记
  if (hoverIndex >= 0 && hoverIndex < n) {
    const hx = x(hoverIndex), hy = y(seq[hoverIndex].active);
    ctx.strokeStyle = 'rgba(7,193,96,.35)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + ch); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#07c160'; ctx.fill();
    ctx.fillStyle = '#333'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = 'bold 12px sans-serif';
    const label = seq[hoverIndex].date.slice(5) + ' · ' + seq[hoverIndex].active + ' 人';
    const tw = ctx.measureText(label).width + 14;
    const bx = Math.min(Math.max(hx - tw / 2, 2), W - tw - 2);
    const by = hy > padT + 24 ? hy - 22 : padT + 2;
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, bx + tw / 2, by + 10);
  }
}

$('chart').addEventListener('mousemove', (e) => {
  const canvas = $('chart');
  const rect = canvas.getBoundingClientRect();
  const padL = 34, padR = 12;
  const cw = canvas.clientWidth - padL - padR;
  const data = window._lastSeq || [];
  if (!data.length) return;
  const n = data.length;
  const px = e.clientX - rect.left;
  const idx = Math.round((px - padL) * (n - 1) / cw);
  if (idx >= 0 && idx < n && idx !== hoverIndex) { hoverIndex = idx; drawChart(data); }
});
$('chart').addEventListener('mouseleave', () => { hoverIndex = -1; drawChart(window._lastSeq || []); });

function renderDaily(seq) {
  const box = $('daily-table');
  if (!seq.length) { box.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  const rows = seq.slice().reverse().map((d, i) => {
    // 环比：与前一天比较（seq 正序，反转后第 i 行的前一天为 seq[len-2-i]）
    const prev = i + 1 < seq.length ? seq[seq.length - 2 - i].active : null;
    let delta;
    if (prev === null || prev === undefined) {
      delta = '<span class="flat">–</span>';
    } else if (d.active > prev) {
      delta = '<span class="up">+' + (d.active - prev) + '</span>';
    } else if (d.active < prev) {
      delta = '<span class="down">' + (d.active - prev) + '</span>';
    } else {
      delta = '<span class="flat">0</span>';
    }
    return '<tr><td>' + d.date + '</td><td>' + d.active + '</td><td>' + delta + '</td></tr>';
  }).join('');
  box.innerHTML = '<table><thead><tr><th>日期</th><th>活跃用户</th><th>环比</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderUsers(records) {
  const box = $('user-table');
  $('user-count').textContent = '共 ' + records.length + ' 人，按最近活跃排序';
  if (!records.length) { box.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  const rows = records.slice(0, 300).map(r => {
    const t = r.last_seen_text || '';
    // 版本：未上报（老客户端）按当前版本显示，灰色标注
    const ver = r.version || CURRENT_VERSION;
    const verTd = r.version
      ? '<td>' + esc(ver) + '</td>'
      : '<td class="sub" title="未上报版本，按当前版本显示">' + esc(ver) + '</td>';
    return '<tr><td>' + r.uid + '</td><td>' + esc(r.nickname || '') + '</td><td class="sub">' + esc(r.realname || '') + '</td><td class="sub">' + esc(r.school || '') + '</td><td class="sub">' + esc(r.seat || '') + '</td>' + verTd + '<td class="sub">' + t + '</td></tr>';
  }).join('');
  box.innerHTML = '<table><thead><tr><th>UID</th><th>昵称</th><th>姓名</th><th>学校</th><th>座位</th><th>版本</th><th>最近活跃</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

// 当前版本：老客户端未上报版本时按此显示（发版时同步 package.json 版本）
const CURRENT_VERSION = '3.3.1';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

load();
setInterval(load, 60 * 1000); // 每分钟自动刷新
window.addEventListener('resize', () => drawChart(window._lastSeq || []));
