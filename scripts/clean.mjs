// ========== 清理构建产物与本地临时缓存 ==========
// 用法：
//   node scripts/clean.mjs          # 清理构建产物 (out / build / dist-tools / site/public/web / tmp)
//   node scripts/clean.mjs --all    # 额外清理 Android Gradle 构建输出
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cleanAll = process.argv.includes('--all');

const targets = [
  'out',
  'build',
  'dist-tools',
  'site/public/web',
  'tmp'
];

if (cleanAll) {
  targets.push(
    'android/build',
    'android/app/build',
    'android/app/src/main/assets/public',
    'android/capacitor-cordova-android-plugins/build'
  );
}

let removed = 0;
for (const rel of targets) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) continue;
  rmSync(abs, { recursive: true, force: true });
  console.log('[clean] removed:', rel);
  removed++;
}

if (removed === 0) {
  console.log('[clean] 工作区已干净，无需清理');
} else {
  console.log(`[clean] 完成，共清理 ${removed} 个目录`);
}
