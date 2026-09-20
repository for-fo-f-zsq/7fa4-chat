// 把 KaTeX 运行期资源（样式表 + woff2 字体）从 node_modules 同步到 resources/katex。
//
// 背景：主进程的「导出 Markdown 为 PNG」会在离屏窗口里加载 katex.min.css，
// 原先该路径直接写死为 node_modules/katex/dist/katex.min.css，导致 electron-builder
// 必须把整个 katex 包（3.8MB：src 源码 1.1MB + contrib 0.17MB + woff/ttf 全格式字体
// 2.3MB + 自身依赖 0.23MB）原样打进 app.asar。
//
// 实际只有 katex.min.css（24KB）+ 20 个 woff2（296KB）是运行期需要的：
// katex.min.css 的 @font-face 按 woff2 → woff → ttf 顺序声明，Chromium 只取第一份
// 自己支持的格式（woff2），其余格式永远不会被请求，因此不必拷贝。
//
// 产出目录 resources/katex 由 package.json 的 extraResources 放进安装包的 resources/，
// 主进程在打包环境下从 process.resourcesPath/katex 读取。
//
// 用法：node scripts/sync-katex-assets.mjs（已挂在 npm run build 里）
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'node_modules', 'katex', 'dist');
const OUT = path.join(root, 'resources', 'katex');

if (!fs.existsSync(SRC)) {
  console.error('[katex-assets] 未找到 node_modules/katex/dist，请先执行 npm install');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'katex.min.css'), path.join(OUT, 'katex.min.css'));

const fontDir = path.join(SRC, 'fonts');
const fonts = fs.existsSync(fontDir)
  ? fs.readdirSync(fontDir).filter((f) => f.endsWith('.woff2'))
  : [];
for (const f of fonts) {
  fs.copyFileSync(path.join(fontDir, f), path.join(OUT, 'fonts', f));
}

if (!fonts.length) {
  console.error('[katex-assets] katex/dist/fonts 下没有 woff2，导出 PNG 的公式字体会缺失');
  process.exit(1);
}

const bytes = fs.statSync(path.join(OUT, 'katex.min.css')).size +
  fonts.reduce((n, f) => n + fs.statSync(path.join(OUT, 'fonts', f)).size, 0);
console.log(
  `[katex-assets] 同步 katex.min.css + ${fonts.length} 个 woff2（${(bytes / 1024).toFixed(0)}KB）到 resources/katex`
);
