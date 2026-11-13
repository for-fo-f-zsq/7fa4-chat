// ========== Android (Capacitor) 渲染层构建 ==========
// 流程：electron-vite build（渲染层产物 → out/renderer）→ 裁剪用不到的非 woff2 字体
// 注意：纯浏览器网页端请走 npm run build:web（config/vite.web.config.mjs → out/web/）。
// 用法：node scripts/android/build-android-assets.mjs  （或 npm run build:android:assets）
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outRenderer = resolve(root, 'out/renderer');
const electronViteBin = resolve(root, 'node_modules/electron-vite/bin/electron-vite.js');

function runNode(args, label) {
  const res = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (res.error) {
    console.error(`[build-android-assets] ${label} 启动失败: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log('[build-android-assets] electron-vite build ...');
runNode([electronViteBin, 'build', '--config', 'config/electron.vite.config.js'], 'electron-vite');

// 去掉 out/renderer/assets 里 Chromium/WebView 用不到的非 woff2 字体（约 1.4MB）
runNode([resolve(root, 'scripts/desktop/prune-renderer-assets.mjs')], 'prune-renderer-assets');

if (!existsSync(outRenderer)) {
  console.error('[build-android-assets] 构建产物缺失: out/renderer');
  process.exit(1);
}

console.log('[build-android-assets] 完成。下一步: npm run sync:android');
