/**
 * 官网主页构建脚本：vite build（config/vite.site.config.mjs）→ site/public/
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'site/public');
const assetsDir = join(outDir, 'assets');
const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');

if (!existsSync(viteBin)) {
  console.error('[build-site-home] 找不到 vite：' + viteBin + '（请先 npm install）');
  process.exit(1);
}

// 清理上次构建的带 hash 的 site-* 字体与 CSS 资源，避免重复累加
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    if (name.startsWith('site-')) {
      rmSync(join(assetsDir, name), { force: true });
    }
  }
}

const r = spawnSync(process.execPath, [viteBin, 'build', '--config', 'config/vite.site.config.mjs'], {
  cwd: root,
  stdio: 'inherit'
});

if (r.error) {
  console.error('[build-site-home] 启动 vite 失败：' + r.error.message);
  process.exit(1);
}
if (r.status !== 0) process.exit(r.status ?? 1);

const requiredOutputs = [
  'index.html',
  'feedback/index.html',
  'feedback/admin.html',
  '404.html'
];
for (const rel of requiredOutputs) {
  const filePath = join(outDir, rel);
  if (!existsSync(filePath)) {
    console.error('[build-site-home] 产物缺失：' + filePath);
    process.exit(1);
  }
}

const index = join(outDir, 'index.html');
console.log('[build-site-home] 完成：' + outDir + ' (' + requiredOutputs.length + ' 页, index.html ' + statSync(index).size + ' B)');
