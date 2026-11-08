// ========== Web/Android 渲染层构建 ==========
// 流程：electron-vite build（渲染层产物 → out/renderer）→ 裁剪用不到的字体
// 注意：GeoGebra 已随 math 工具包分发（dist-tools/math/<version>/geogebra/），
// 客户端不再内置数学页，这里也不再需要把 GeoGebra 复制进 out/renderer。
// 用法：node scripts/build-web.mjs   （之后 npx cap sync android）
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const outRenderer = resolve(root, 'out/renderer');

console.log('[build-web] electron-vite build ...');
execSync('npx electron-vite build', { cwd: root, stdio: 'inherit' });

// 去掉 out/renderer/assets 里 Chromium 用不到的非 woff2 字体（约 1.4MB）
execSync('node scripts/prune-renderer-assets.mjs', { cwd: root, stdio: 'inherit' });

if (!existsSync(outRenderer)) {
  console.error('[build-web] 构建产物缺失: out/renderer');
  process.exit(1);
}

console.log('[build-web] 完成。下一步: npx cap sync android && cd android && ./gradlew assembleDebug');
