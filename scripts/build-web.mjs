// ========== Web/Android 渲染层构建 ==========
// 流程：electron-vite build（渲染层产物 → out/renderer）→ 复制 GeoGebra 离线包到静态资源
// Electron 端 GeoGebra 走 extraResources + geo:// 协议；Web/Android 端无自定义协议，
// 改为普通静态路径 /geogebra/（MathTool.vue 按 window.__7FA4_WEB__ 分支）。
// 用法：node scripts/build-web.mjs   （之后 npx cap sync android）
import { execSync } from 'child_process';
import { cpSync, existsSync, rmSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const outRenderer = resolve(root, 'out/renderer');
const ggbSrc = resolve(root, 'resources/geogebra');
const ggbDst = resolve(outRenderer, 'geogebra');

console.log('[build-web] electron-vite build ...');
execSync('npx electron-vite build', { cwd: root, stdio: 'inherit' });

if (!existsSync(outRenderer)) {
  console.error('[build-web] 构建产物缺失: out/renderer');
  process.exit(1);
}
if (!existsSync(ggbSrc)) {
  console.warn('[build-web] 未找到 resources/geogebra，跳过 GeoGebra 复制（工具页将无法加载 GeoGebra）');
} else {
  console.log('[build-web] 复制 GeoGebra → out/renderer/geogebra ...');
  rmSync(ggbDst, { recursive: true, force: true });
  mkdirSync(ggbDst, { recursive: true });
  cpSync(ggbSrc, ggbDst, { recursive: true });
  console.log('[build-web] GeoGebra 复制完成');
}

console.log('[build-web] 完成。下一步: npx cap sync android && cd android && ./gradlew assembleDebug');
