// 全量转换 QQ 表情 GIF -> 动画 WebP
//
// 安全性设计（针对历史"PIL 重编码丢透明变黑底"踩坑）：
//   1. 默认只转换到 tmp/qqface-webp-full/ 并做三重断言，不碰源文件；
//   2. 加 --apply 才会把 webp 拷进 src/renderer/public/qqface 并删除 gif；
//   3. 三重断言（全部自动化，无需肉眼）：
//      a) alpha 保留：系统 Chrome headless 真实解码 + canvas 读回像素（--allow-file-access-from-files）
//      b) 帧数一致：GIF 用 ffmpeg 解码计数，WebP 直接解析 RIFF 容器里的 ANMF chunk 数
//      c) 尺寸一致：webp 宽高必须等于 gif 宽高（未加 --size 时）
//
// 用法：node scripts/convert-qqface-webp.mjs [--apply] [--q 75] [--size 96]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG ||
  'C:/Users/zhoushengqing/.workbuddy/binaries/python/envs/default/lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/renderer/public/qqface');
const STAGE_DEFAULT = path.join(ROOT, 'tmp/qqface-webp-full');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const qi = argv.indexOf('--q'); const Q = qi >= 0 ? argv[qi + 1] : '75';
const si = argv.indexOf('--size'); const SIZE = si >= 0 ? parseInt(argv[si + 1], 10) : null;
// 注：实测 --size 降采样会让文件更大（GIF 平坦色块比缩放后的平滑边缘好压），
//     269 张 128px 降到 96px 后总量 22.81MB -> 28.95MB，故默认不降采样。
const oi = argv.indexOf('--out');
const OUT_ARG = oi >= 0 ? path.resolve(ROOT, argv[oi + 1]) : null;
// 输出目录与报告：--out 可指定独立目录（便于并行跑多档做对比）
const STAGE = OUT_ARG || STAGE_DEFAULT;
const REPORT = path.join(ROOT, 'tmp/qqface-webp-full-report' + (OUT_ARG ? '-' + path.basename(STAGE) : '') + '.json');

if (!fs.existsSync(FFMPEG)) { console.error('找不到 ffmpeg: ' + FFMPEG); process.exit(1); }
fs.mkdirSync(STAGE, { recursive: true });

// GIF 帧数（ffmpeg 解码，gif 它能正常解）
function gifFrames(file) {
  const r = spawnSync(FFMPEG, ['-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = (r.stderr || '') + (r.stdout || '');
  const m = [...s.matchAll(/frame=\s*(\d+)/g)];
  return m.length ? +m[m.length - 1][1] : 0;
}
// WebP 帧数（解析 RIFF 容器 ANMF chunk，无需解码）
function webpFrames(buf) {
  let n = 0;
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] === 0x41 && buf[i + 1] === 0x4e && buf[i + 2] === 0x4d && buf[i + 3] === 0x46) n++; // 'ANMF'
  }
  return n; // 0 = 静态图
}
// WebP 尺寸（解析 VP8X 头）

// Chrome 批量 alpha 断言（每批一次进程，避免 370 次启动）
function chromeAlphaBatch(items) {
  if (!fs.existsSync(CHROME)) return items.map(() => ({ alpha: null, err: 'no chrome' }));
  const probes = items.map(it => {
    const rel = './' + path.basename(it.out);
    return `(async()=>{try{const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=${JSON.stringify(rel)};});const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let t=0;for(let i=3;i<d.length;i+=4){if(d[i]<255)t++;}R[${JSON.stringify(it.name)}]={w:img.naturalWidth,h:img.naturalHeight,alpha:t>0,tpx:t};}catch(e){R[${JSON.stringify(it.name)}]={error:true};}})()`;
  }).join(',');
  const js = `const R={};Promise.all([${probes}]).then(()=>{document.getElementById('out').textContent=JSON.stringify(R);});`;
  const html = path.join(STAGE, '__batch.html');
  fs.writeFileSync(html, `<html><head><meta charset="utf-8"></head><body><pre id="out"></pre><script>${js}</script></body></html>`, 'utf8');
  const url = 'file:///' + html.replace(/\\/g, '/');
  const r = spawnSync(CHROME, ['--headless', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=15000', '--dump-dom', url], { encoding: 'utf8', timeout: 90000 });
  const m = (r.stdout || '').match(/<pre id="out">([^<]*)<\/pre>/);
  if (!m) return items.map(() => ({ alpha: null, err: 'no out' }));
  let data = {};
  try { data = JSON.parse(m[1].replace(/&quot;/g, '"')); } catch (e) { return items.map(() => ({ alpha: null, err: 'parse' })); }
  return items.map(it => data[it.name] || { alpha: null, err: 'missing' });
}

const gifs = fs.readdirSync(SRC).filter(f => f.endsWith('.gif'));
console.log(`[convert] 共 ${gifs.length} 张 GIF，q=${Q}${SIZE ? ' size=' + SIZE : ''} -> ${STAGE}`);

const rows = [];
let done = 0;
for (const name of gifs) {
  const src = path.join(SRC, name);
  const base = path.basename(name, '.gif');
  const out = path.join(STAGE, base + '.webp');
  const args = ['-y', '-v', 'error', '-i', src];
  if (SIZE) args.push('-vf', `scale='if(gt(iw,${SIZE}),${SIZE},iw)':'if(gt(ih,${SIZE}),${SIZE},ih)':flags=lanczos`);
  args.push('-c:v', 'libwebp', '-lossless', '0', '-q:v', Q, '-loop', '0', '-pix_fmt', 'yuva420p', '-an', out);
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  const rec = { name, gifKB: +(fs.statSync(src).size / 1024).toFixed(1) };
  if (r.status !== 0 || !fs.existsSync(out)) {
    rec.ok = false; rec.err = (r.stderr || '').slice(0, 120);
  } else {
    const buf = fs.readFileSync(out);
    rec.ok = true;
    rec.webpKB = +(buf.length / 1024).toFixed(1);
    rec.ratio = +(buf.length / fs.statSync(src).size).toFixed(3);
    rec.gifFrames = gifFrames(src);
    rec.webpFrames = webpFrames(buf);
    const gd = gifDims(src); rec.gw = gd.w; rec.gh = gd.h;
    rec.framesMatch = rec.gifFrames === rec.webpFrames || (rec.gifFrames === 1 && rec.webpFrames === 0);
  }
  rows.push(rec);
  done++;
  if (done % 40 === 0) console.log(`[convert] ${done}/${gifs.length} ...`);
}

// Chrome alpha 批量断言（每 60 张一批）
console.log('[convert] Chrome alpha 批量断言...');
const ALPHA_CHUNK = 60;
for (let i = 0; i < rows.length; i += ALPHA_CHUNK) {
  const batch = rows.slice(i, i + ALPHA_CHUNK).map(r => ({ name: r.name, out: path.join(STAGE, path.basename(r.name, '.gif') + '.webp') }));
  const res = chromeAlphaBatch(batch);
  res.forEach((rr, j) => {
    rows[i + j].alpha = rr.alpha; rows[i + j].alphaErr = rr.err;
    rows[i + j].chromeW = rr.w; rows[i + j].chromeH = rr.h;
    // 尺寸断言：未降采样时必须与源 GIF 完全一致（用 Chrome 真值，比自解析 RIFF 可靠）
    rows[i + j].dimsMatch = SIZE ? true : (rr.w === rows[i + j].gw && rr.h === rows[i + j].gh);
  });
  console.log(`[convert] alpha 断言 ${Math.min(i + ALPHA_CHUNK, rows.length)}/${rows.length}`);
}

const gifSum = rows.reduce((s, r) => s + r.gifKB, 0);
const webpSum = rows.reduce((s, r) => s + (r.webpKB || 0), 0);
const failConvert = rows.filter(r => !r.ok);
const failAlpha = rows.filter(r => r.ok && r.alpha !== true);
const failFrames = rows.filter(r => r.ok && !r.framesMatch);
const failDims = rows.filter(r => r.ok && r.dimsMatch === false);
console.log('\n[convert] ===== 汇总 =====');
console.log(`总数: ${rows.length}`);
console.log(`GIF 合计: ${(gifSum / 1024).toFixed(2)}MB -> WebP 合计: ${(webpSum / 1024).toFixed(2)}MB（${(webpSum / gifSum).toFixed(3)}x，省 ${((gifSum - webpSum) / 1024).toFixed(2)}MB）`);
console.log(`转换失败: ${failConvert.length}，缺 alpha: ${failAlpha.length}，帧数不符: ${failFrames.length}，尺寸不符: ${failDims.length}`);
if (failConvert.length) console.log('转换失败样例:', failConvert.slice(0, 5).map(r => r.name + ':' + r.err).join(' | '));
if (failFrames.length) console.log('帧数不符样例:', failFrames.slice(0, 5).map(r => `${r.name}(gif=${r.gifFrames}/webp=${r.webpFrames})`).join(' | '));
if (failDims.length) console.log('尺寸不符样例:', failDims.slice(0, 5).map(r => `${r.name}(gif=${r.gw}x${r.gh}/webp=${r.chromeW}x${r.chromeH})`).join(' | '));
fs.writeFileSync(REPORT, JSON.stringify({ q: Q, size: SIZE, total: rows.length, gifMB: +(gifSum / 1024).toFixed(2), webpMB: +(webpSum / 1024).toFixed(2), failConvert: failConvert.length, failAlpha: failAlpha.length, failFrames: failFrames.length, failDims: failDims.length, rows }, null, 2), 'utf8');
console.log('报告: ' + REPORT);

if (failConvert.length || failAlpha.length || failFrames.length || failDims.length) {
  console.error('\n[convert] FAIL：存在异常样本，未执行 --apply。请检查报告。');
  process.exit(1);
}
if (APPLY) {
  console.log('\n[convert] --apply：拷贝 webp 进 public/qqface 并删除 gif ...');
  for (const r of rows) {
    fs.copyFileSync(path.join(STAGE, path.basename(r.name, '.gif') + '.webp'), path.join(SRC, path.basename(r.name, '.gif') + '.webp'));
    fs.unlinkSync(path.join(SRC, r.name));
  }
  console.log('[convert] 完成。请把 qqfaceUrl 改为 .webp 引用。');
} else {
  console.log('\n[convert] PASS：全部样本通过三重断言。确认无误后加 --apply 应用。');
}


// GIF 尺寸（ffmpeg 读，可靠）。WebP 尺寸不再自写 RIFF 解析——VP8X 的 canvas 宽高在
// chunk 头 8 字节之后（flags 1B + reserved 3B 之后才是 w/h 各 3B），此前偏移算错会读出
// 垃圾值（19x24321）。改用 Chrome headless 的 naturalWidth/naturalHeight 作为真值做断言。
function gifDims(file) {
  const r = spawnSync(FFMPEG, ['-i', file, '-hide_banner'], { encoding: 'utf8' });
  const line = (r.stderr || '').split('\n').find(l => l.includes('Video:')) || '';
  const m = line.match(/(\d+)x(\d+)/);
  return { w: m ? +m[1] : 0, h: m ? +m[2] : 0 };
}
