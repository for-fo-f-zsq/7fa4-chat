// 渲染层字体格式裁剪（electron-vite build 之后执行）
//
// 背景：KaTeX 与 Font Awesome 的 @font-face 都按 `src: url(...woff2) format("woff2"),
// url(...woff) format("woff"), url(...ttf) format("truetype")` 顺序声明多份格式，
// 但 Chromium 永远只会取第一份「自己支持的」——也就是 woff2。三端运行环境
// （Electron / Android WebView / 现代浏览器）全部支持 woff2，其余格式纯属死重量：
//   out/renderer/assets 里 KaTeX+FA 的 woff/ttf 合计约 1.4MB。
//
// 规则：同一字体名（去掉 vite 的 -<hash> 后缀与扩展名）若同时存在 .woff2，
//       则删除它的 .woff / .ttf / .eot / .svg。只对 KaTeX_ / fa- 前缀的字体名生效，
//       避免误删真正的 .svg 图形资源。
//
// 用法：node scripts/prune-renderer-assets.mjs
import fs from 'node:fs';
import path from 'node:path';

const ASSETS = path.resolve(import.meta.dirname, '../out/renderer/assets');

if (!fs.existsSync(ASSETS)) {
  console.log('[prune-assets] 未找到 out/renderer/assets，跳过');
  process.exit(0);
}

const files = fs.readdirSync(ASSETS);
// vite 的 asset hash 是 base64url 字符集，含 `-` 与 `_`，不是 \w。
// 用 \w{8} 会漏掉 KaTeX_Math-Italic-t53AETM-.woff2 / KaTeX_Caligraphic-Regular-Di6jR-x-.woff2
// 这类文件名；漏掉 woff2 后该 base 根本不会进入 byBase，连带它的 woff/ttf 也一并漏删
// （2026-09-20 修，此前有 9 个文件漏网）。
const HASHED = /^(?<base>.+)-[A-Za-z0-9_-]{8}\.(?<ext>[a-z0-9]+)$/;

const byBase = new Map();
for (const f of files) {
  const m = HASHED.exec(f);
  if (!m) continue;
  const { base, ext } = m.groups;
  if (!/^(KaTeX_|fa-)/.test(base)) continue;
  if (!byBase.has(base)) byBase.set(base, new Map());
  byBase.get(base).set(ext, f);
}

const DROP_EXTS = ['woff', 'ttf', 'eot', 'svg'];
let removed = 0;
let bytes = 0;

for (const [base, exts] of byBase) {
  if (!exts.has('woff2')) continue;
  for (const ext of DROP_EXTS) {
    const name = exts.get(ext);
    if (!name) continue;
    const p = path.join(ASSETS, name);
    bytes += fs.statSync(p).size;
    fs.rmSync(p, { force: true });
    removed++;
  }
}

// 兜底校验：残留的非 woff2 字体分两种，只有第一种才是真问题——
//   1) 存在同 base 的 woff2，却因 hash 正则没匹配上而漏删（vite 换了命名规则）；
//   2) 上游本就没提供 woff2（KaTeX_Size3-Regular 就是如此，dist/fonts 下只有 woff/ttf），
//      此时只能保留，否则该字体彻底缺失。
// 用「有 woff2 的 base 集合」把第 2 种排除，避免误报。
const basesWithWoff2 = [...byBase.keys()].filter((b) => byBase.get(b).has('woff2'));
const suspected = files.filter((f) => {
  if (!/^(KaTeX_|fa-)/.test(f) || !/\.(woff|ttf|eot|svg)$/.test(f)) return false;
  if (!fs.existsSync(path.join(ASSETS, f))) return false;
  const stem = f.replace(/\.[a-z0-9]+$/, '');
  return basesWithWoff2.some((b) => stem.startsWith(`${b}-`));
});
if (suspected.length) {
  console.warn(
    `[prune-assets] 漏删 ${suspected.length} 个本可删除的非 woff2 字体（hash 正则可能需更新）：${suspected.slice(0, 4).join(', ')}`
  );
}

console.log(
  `[prune-assets] 删除 ${removed} 个非 woff2 字体文件，释放 ${(bytes / 1048576).toFixed(2)}MB`
);
