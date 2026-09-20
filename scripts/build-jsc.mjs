// 打包前将主进程 index.js 编译为 index.jsc（V8 字节码），并放置 loader.js。
// 流程：electron-vite build -> 本脚本 -> electron-builder
// 入口由 electron-builder 的 extraMetadata.main 指向 ./out/main/loader.js，
// loader 先 require('bytenode') 再加载 index.jsc，打包产物里不包含主进程源码明文。
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { copyFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = require('electron'); // electron 可执行文件路径
const compileScript = join(root, 'scripts', 'compile-main.cjs');
const mainDir = join(root, 'out', 'main');

const input = join(mainDir, 'index.js');
if (!existsSync(input)) {
  console.error('[jsc] 未找到 out/main/index.js，请先执行 electron-vite build');
  process.exit(1);
}

const r = spawnSync(electronPath, [compileScript], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true
});
if (r.status !== 0) {
  console.error('[jsc] 编译进程退出码:', r.status);
  process.exit(r.status ?? 1);
}

copyFileSync(join(root, 'src', 'main', 'loader.js'), join(mainDir, 'loader.js'));
console.log('[jsc] loader.js 已就位:', join(mainDir, 'loader.js'));

// 移除明文入口：build.extraMetadata.main 指向 ./out/main/loader.js，index.js 在打包产物里
// 不再被引用。留着它等于把主进程明文 JS 一起塞进 app.asar，bytenode 的编译保护形同虚设
// （2026-09-20 修：此前 asar 内 index.js 47KB 明文与 index.jsc 并存，可直接阅读）。
// electron-vite dev 不经过本脚本，开发模式仍使用 out/main/index.js。
unlinkSync(input);
console.log('[jsc] 已移除明文入口 out/main/index.js');
