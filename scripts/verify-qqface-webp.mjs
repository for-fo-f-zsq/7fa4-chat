// QQ 表情 GIF -> 动画 WebP 转换验证（不替换任何源文件）
//
// 背景：src/renderer/public/qqface 370 张 GIF 共 36MB，是安装包内最大的可压缩项。
// 历史教训：此前用 PIL 逐帧重编码丢透明通道变黑底，被用户打回；必须逐张断言「有 alpha」。
// 结论：用 ffmpeg 显式 -pix_fmt yuva420p（保留 alpha）+ -loop 0（保留动画），
//        可选 -s 96:96 降采样（picker 显示 56px、消息里 72px，128px 过剩）。
//
// 用法：node scripts/verify-qqface-webp.mjs [--count N] [--size 96]
// 产出：tmp/qqface-webp-verify/ 下每档样张 + tmp/qqface-webp-report.json
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG ||
  'C:/Users/zhoushengqing/.workbuddy/binaries/python/envs/default/lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe';

const SRC = path.resolve(import.meta.dirname, '../src/renderer/public/qqface');
const OUT = path.resolve(import.meta.dirname, '../tmp/qqface-webp-verify');
const REPORT = path.resolve(import.meta.dirname, '../tmp/qqface-webp-report.json');

const args = process.argv.slice(2);
const argCount = args.indexOf('--count');
const COUNT = argCount >= 0 ? parseInt(args[argCount + 1], 10) : 12;
const argSize = args.indexOf('--size');
const SIZE = argSize >= 0 ? parseInt(args[argSize + 1], 10) : null;

if (!fs.existsSync(FFMPEG)) {
  console.error(`[webp-verify] 找不到 ffmpeg: ${FFMPEG}`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

// 源 GIF 元信息
function probeGif(file) {
  const r = spawnSync(FFMPEG, ['-i', file, '-hide_banner'], { encoding: 'utf8' });
  const line = (r.stderr || '').split('\n').find(l => l.includes('Video:')) || '';
  const m = line.match(/(\d+)x(\d+)/);
  return {
    w: m ? +m[1] : 0,
    h: m ? +m[2] : 0,
    pix: (line.match(/(bgra|rgb|rgba|pal8)/) || ['?'])[0]
  };
}

function runFfmpeg(args) {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr || '' };
}

// 用系统 Chrome headless 真实解码 WebP，验证 alpha 与动画（ffmpeg 精简版无法解动画 WebP）。
// 通过 canvas 读回像素：若 alpha 通道存在且有透明像素，则 d[3] 会有 <255 的值。
// 动画判断：轮询两次截图比较像素是否变化（>50ms 间隔）。
function probeWebpChrome(file) {
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(chrome)) return { ok: false, err: 'no chrome' };
  const html = path.join(OUT, '__probe.html');
  const rel = path.relative(OUT, file).replace(/\\/g, '/');
  const js = `
const img=new Image();
img.onload=()=>{
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
  const x=c.getContext('2d');x.drawImage(img,0,0);
  const d=x.getImageData(0,0,c.width,c.height).data;
  let transparent=0;for(let i=3;i<d.length;i+=4){if(d[i]<255)transparent++;}
  // 动画检测：100ms 后再画一次比较
  setTimeout(()=>{
    const x2=c.getContext('2d');x2.drawImage(img,0,0);
    const d2=x2.getImageData(0,0,c.width,c.height).data;
    let diff=0;for(let i=0;i<d.length;i+=400){if(d[i]!==d2[i])diff++;}
    document.title=JSON.stringify({w:img.naturalWidth,h:img.naturalHeight,alpha:transparent>0,animated:diff>0,transparentPx:transparent,diffPx:diff});
  },150);
};
img.onerror=()=>{document.title=JSON.stringify({error:true});};
img.src='${rel}';
`;
  fs.writeFileSync(html, `<html><head><meta charset="utf-8"></head><body><script>${js}</script></body></html>`, 'utf8');
  const url = 'file:///' + html.replace(/\\/g, '/');
  // 关键：file:// 下 canvas 读像素必须加 --allow-file-access-from-files，否则 getImageData 被当跨域 tainted 抛 SecurityError
  const r = spawnSync(chrome, ['--headless', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=2000', '--dump-dom', url], { encoding: 'utf8', timeout: 30000 });
  const m = (r.stdout || '').match(/<title>([^<]+)<\/title>/);
  if (!m) return { ok: false, err: 'no title', raw: (r.stdout || '').slice(0, 200) };
  try {
    const data = JSON.parse(m[1].replace(/&quot;/g, '"'));
    return { ok: !data.error, ...data };
  } catch (e) {
    return { ok: false, err: 'parse fail: ' + m[1] };
  }
}

function probeWebp(file) {
  // 优先用 Chrome 真实解码（能判 alpha + 动画），失败则回退 ffmpeg 静态探测
  const cr = probeWebpChrome(file);
  if (cr.ok) return { hasAlpha: !!cr.alpha, animated: !!cr.animated, w: cr.w || 0, h: cr.h || 0, method: 'chrome', transparentPx: cr.transparentPx || 0 };
  const r = spawnSync(FFMPEG, ['-i', file, '-hide_banner'], { encoding: 'utf8' });
  const s = r.stderr || '';
  const hasAlpha = /yuva420p|yuva444p|argb|bgra/.test(s);
  const m = s.match(/(\d+)x(\d+)/);
  return { hasAlpha, animated: false, w: m ? +m[1] : 0, h: m ? +m[2] : 0, method: 'ffmpeg-fallback' };
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.gif'))
  .sort((a, b) => fs.statSync(path.join(SRC, b)).size - fs.statSync(path.join(SRC, a)).size)
  .slice(0, COUNT);

const rows = [];
for (const name of files) {
  const src = path.join(SRC, name);
  const base = path.basename(name, '.gif');
  const gifSize = fs.statSync(src).size;
  const meta = probeGif(src);

  const variants = [
    { tag: 'q75', args: ['-y', '-v', 'error', '-i', src, '-c:v', 'libwebp', '-lossless', '0', '-q:v', '75', '-loop', '0', '-pix_fmt', 'yuva420p', path.join(OUT, `${base}-q75.webp`)] },
    { tag: 'q60', args: ['-y', '-v', 'error', '-i', src, '-c:v', 'libwebp', '-lossless', '0', '-q:v', '60', '-loop', '0', '-pix_fmt', 'yuva420p', path.join(OUT, `${base}-q60.webp`)] },
  ];
  if (SIZE) {
    for (const v of variants) {
      v.args.splice(4, 0, '-vf', `scale=${SIZE}:${SIZE}:flags=lanczos`);
      v.args[v.args.length - 1] = path.join(OUT, `${base}-${v.tag}-s${SIZE}.webp`);
    }
  }

  const rec = { name, gifKB: +(gifSize / 1024).toFixed(1), srcW: meta.w, srcH: meta.h, srcPix: meta.pix, variants: {} };
  for (const v of variants) {
    const outFile = v.args[v.args.length - 1];
    const r = runFfmpeg(v.args);
    if (r.code !== 0 || !fs.existsSync(outFile)) {
      rec.variants[v.tag] = { ok: false, err: r.stderr.trim().slice(0, 120) };
      continue;
    }
    const webpSize = fs.statSync(outFile).size;
    const probe = probeWebp(outFile);
    rec.variants[v.tag] = {
      ok: true,
      webpKB: +(webpSize / 1024).toFixed(1),
      ratio: +(webpSize / gifSize).toFixed(3),
      w: probe.w, h: probe.h, hasAlpha: probe.hasAlpha, animated: probe.animated, method: probe.method
    };
  }
  rows.push(rec);
  console.log(`[webp-verify] ${name} ${rec.gifKB}KB (${meta.w}x${meta.h} ${meta.pix}) -> ` +
    Object.entries(rec.variants).map(([k, v]) => v.ok ? `${k}=${v.webpKB}KB(${v.ratio}x, alpha=${v.hasAlpha ? 'Y' : 'N'})` : `${k}=FAIL`).join(' '));
}

fs.writeFileSync(REPORT, JSON.stringify({ ffmpeg: FFMPEG, count: rows.length, size: SIZE, rows }, null, 2), 'utf8');

// 汇总与断言
let gifSum = 0, q75Sum = 0, q60Sum = 0, failCount = 0, alphaFail = 0, animFail = 0;
for (const r of rows) {
  gifSum += r.gifKB;
  for (const [k, v] of Object.entries(r.variants)) {
    if (!v.ok) { failCount++; continue; }
    if (!v.hasAlpha) alphaFail++;
    if (v.animated === false) animFail++;
    if (k === 'q75') q75Sum += v.webpKB;
    if (k === 'q60') q60Sum += v.webpKB;
  }
}
console.log('\n[webp-verify] ===== 汇总 =====');
console.log(`样本数: ${rows.length}，GIF 合计: ${gifSum.toFixed(1)}KB`);
console.log(`q75 合计: ${q75Sum.toFixed(1)}KB（${(q75Sum / gifSum).toFixed(3)}x）`);
console.log(`q60 合计: ${q60Sum.toFixed(1)}KB（${(q60Sum / gifSum).toFixed(3)}x）`);
console.log(`转换失败: ${failCount}，缺 alpha: ${alphaFail}，丢动画: ${animFail}`);
console.log(`报告: ${REPORT}`);
if (failCount > 0 || alphaFail > 0 || animFail > 0) {
  console.error('\n[webp-verify] FAIL：存在失败/丢 alpha/丢动画的样本，不允许替换。');
  process.exit(1);
}
console.log('\n[webp-verify] PASS：全部样本转换成功，保留 alpha 与动画。');
