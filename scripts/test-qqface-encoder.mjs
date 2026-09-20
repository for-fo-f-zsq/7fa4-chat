// 诊断 QQ 表情 WebP 编码器：对比 libwebp（静态编码器，疑似错误用法）vs libwebp_anim（动画编码器）
//
// 背景：用户肉眼发现 libwebp 产物存在"层间重叠"（历史帧透出）。ffmpeg 提供两个 webp 编码器，
// 多帧动画必须用 libwebp_anim；用静态编码器 libwebp 会写出错误的帧合成元数据（blend/dispose）。
//
// 用法：node scripts/test-qqface-encoder.mjs
// 产出：tmp/qqface-encoder-test/ 下各变体 + tmp/qqface-encoder-test.html 对比页
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG ||
  'C:/Users/zhoushengqing/.workbuddy/binaries/python/envs/default/lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/renderer/public/qqface');
const OUT = path.join(ROOT, 'tmp/qqface-encoder-test');
const HTML = path.join(ROOT, 'tmp/qqface-encoder-test.html');

fs.mkdirSync(OUT, { recursive: true });

// 用户截图里出问题的 3 个 + 再补 5 个代表（含 56px 小图）
const SAMPLES = ['s324.gif', 's342.gif', 's405.gif', 's0.gif', 's100.gif', 's317.gif', 's86.gif', 's1.gif'];

const VARIANTS = [
  { tag: 'libwebp-q75', enc: 'libwebp', q: '75' },
  { tag: 'libwebp_anim-q75', enc: 'libwebp_anim', q: '75' },
  { tag: 'libwebp_anim-q60', enc: 'libwebp_anim', q: '60' },
  { tag: 'libwebp_anim-lossless', enc: 'libwebp_anim', q: '100', lossless: '1' },
];

const results = [];
for (const name of SAMPLES) {
  const src = path.join(SRC, name);
  if (!fs.existsSync(src)) continue;
  const base = path.basename(name, '.gif');
  const rec = { name, gifKB: +(fs.statSync(src).size / 1024).toFixed(1), variants: {} };
  for (const v of VARIANTS) {
    const out = path.join(OUT, `${base}__${v.tag}.webp`);
    const args = ['-y', '-v', 'error', '-i', src, '-c:v', v.enc, '-lossless', v.lossless || '0'];
    if (!v.lossless) args.push('-q:v', v.q);
    args.push('-loop', '0', '-pix_fmt', 'yuva420p', '-an', out);
    const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
    const ok = r.status === 0 && fs.existsSync(out);
    rec.variants[v.tag] = { ok, kb: ok ? +(fs.statSync(out).size / 1024).toFixed(1) : 0, err: ok ? '' : (r.stderr || '').slice(0, 100) };
  }
  results.push(rec);
  console.log(`[enc-test] ${name} GIF=${rec.gifKB}KB  ` + VARIANTS.map(v => `${v.tag}=${rec.variants[v.tag].kb}KB`).join('  '));
}

const cols = VARIANTS.map(v => `<th>${v.tag}</th>`).join('');
const rows = results.map(r => `<tr>
  <td class="n">${path.basename(r.name, '.gif')}<div class="kb">GIF ${r.gifKB}KB</div></td>
  <td><img src="../src/renderer/public/qqface/${r.name}"></td>
  ${VARIANTS.map(v => `<td>${r.variants[v.tag].ok
    ? `<img src="./qqface-encoder-test/${path.basename(r.name, '.gif')}__${v.tag}.webp"><div class="kb">${r.variants[v.tag].kb}KB</div>`
    : '<span class="fail">FAIL</span>'}</td>`).join('')}
</tr>`).join('\n');

fs.writeFileSync(HTML, `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>WebP 编码器对比（libwebp vs libwebp_anim）</title><style>
body{background:#1b1d22;color:#e6e8ee;font:13px/1.4 -apple-system,"Segoe UI",sans-serif;margin:0;padding:20px}
h1{font-size:17px;margin:0 0 4px}.note{color:#9aa3b2;margin-bottom:16px}
table{border-collapse:collapse}th,td{padding:8px 10px;text-align:center;vertical-align:middle}
th{color:#9aa3b2;font-weight:500;font-size:12px;border-bottom:1px solid #333}
td.n{text-align:left;font-weight:600;padding-right:16px}
img{width:72px;height:72px;background:#3a3f4a;border-radius:6px;display:block;margin:0 auto}
.kb{font-size:11px;color:#9aa3b2;margin-top:3px}.fail{color:#ff6b6b}
tr+tr td{border-top:1px solid #2c2f36}
</style></head><body>
<h1>WebP 编码器对比</h1>
<div class="note">看第 3 列起的四档是否还有「层间重叠 / 残影」。若 libwebp_anim 干净，则改用该编码器。</div>
<table><tr><th>表情</th><th>原 GIF</th>${cols}</tr>${rows}</table>
</body></html>`, 'utf8');
console.log('\n对比页: ' + HTML);
