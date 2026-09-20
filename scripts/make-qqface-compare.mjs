// 生成 QQ 表情三档对比页（原 GIF / q75 WebP / q60 WebP），供人工肉眼抽查。
// 用分层抽样挑代表性样本：大文件（细节多）、中等、小文件（56px）。
// 用法：node scripts/make-qqface-compare.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/renderer/public/qqface');
const Q75 = path.join(ROOT, 'tmp/qqface-webp-full');
const Q60 = path.join(ROOT, 'tmp/qqface-webp-q60');
const OUT = path.join(ROOT, 'tmp/qqface-compare.html');

const gifs = fs.readdirSync(SRC).filter(f => f.endsWith('.gif'))
  .map(f => ({ f, kb: fs.statSync(path.join(SRC, f)).size / 1024 }))
  .sort((a, b) => b.kb - a.kb);

if (!fs.existsSync(Q60)) { console.error('缺 q60 档，请先跑 --out tmp/qqface-webp-q60'); process.exit(1); }

// 分层抽样：最大 10 + 中段 10 + 最小 10
const n = gifs.length;
const picks = [...gifs.slice(0, 10), ...gifs.slice(Math.floor(n / 2) - 5, Math.floor(n / 2) + 5), ...gifs.slice(-10)];

const rows = picks.map(({ f, kb }) => {
  const base = path.basename(f, '.gif');
  const p75 = path.join(Q75, base + '.webp');
  const p60 = path.join(Q60, base + '.webp');
  const kb75 = fs.existsSync(p75) ? fs.statSync(p75).size / 1024 : 0;
  const kb60 = fs.existsSync(p60) ? fs.statSync(p60).size / 1024 : 0;
  const pct = (v) => ((v / kb) * 100).toFixed(0) + '%';
  return `<div class="item">
  <div class="name">${base} <span class="meta">GIF ${kb.toFixed(1)}KB</span></div>
  <div class="three">
    <figure><img src="../src/renderer/public/qqface/${f}"><figcaption>原 GIF<br><b>${kb.toFixed(1)}KB</b></figcaption></figure>
    <figure><img src="./qqface-webp-full/${base}.webp"><figcaption>q75 WebP<br><b>${kb75.toFixed(1)}KB</b> (${pct(kb75)})</figcaption></figure>
    <figure><img src="./qqface-webp-q60/${base}.webp"><figcaption>q60 WebP<br><b>${kb60.toFixed(1)}KB</b> (${pct(kb60)})</figcaption></figure>
  </div>
</div>`;
}).join('\n');

const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>QQ 表情 WebP 转换对比</title>
<style>
body{background:#1b1d22;color:#e6e8ee;font:14px/1.5 -apple-system,"Segoe UI",sans-serif;margin:0;padding:24px}
h1{font-size:18px;margin:0 0 6px}.note{color:#9aa3b2;margin-bottom:20px}
.item{background:#24272e;border-radius:10px;padding:12px 14px;margin-bottom:12px}
.name{font-weight:600;margin-bottom:8px}.meta{color:#9aa3b2;font-weight:400;font-size:12px}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
figure{margin:0;text-align:center}img{width:96px;height:96px;image-rendering:auto;background:#3a3f4a;border-radius:8px}
figcaption{margin-top:6px;font-size:12px;color:#9aa3b2}figcaption b{color:#e6e8ee}
/* 消息里的实际尺寸（22px）对照 */
.small img{width:22px;height:22px}
</style></head><body>
<h1>QQ 表情 WebP 转换对比（原 GIF / q75 / q60）</h1>
<div class="note">同一行三列并排播放。注意看：① 透明背景是否发黑 ② 动画是否正常 ③ 边缘/渐变是否出现色块。共 ${picks.length} 个抽样（最大 / 中段 / 最小各 10）。</div>
${rows}
</body></html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('对比页已生成: ' + OUT);
console.log(`抽样 ${picks.length} 个；q75 目录 ${fs.readdirSync(Q75).length} 个文件，q60 目录 ${fs.readdirSync(Q60).length} 个文件`);
