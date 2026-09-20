// electron-builder afterPack 钩子（三端共用）
//
// 职责：
//   1. 保留原有的 Linux 沙箱修复逻辑（electron-builder-sandbox-fix，原先直接挂在 afterPack 上）。
//   2. 在打完包、压缩之前，删除 Electron 官方发行包里对本项目无用的附随文件。
//
// 体积背景（以 Electron 41 / Windows x64 为例，未压缩解包 345MB）：
//   electron.exe 214MB  —— Chromium+V8 主体，不可裁
//   locales/      47MB  —— 55 个语言包，已由 package.json 的 electronLanguages 收敛（此处不再处理）
//   LICENSES.chromium.html 19MB —— 见下方 REMOVABLE
//   icudtl.dat / *.pak / d3dcompiler_47.dll / ffmpeg.dll 等 —— 运行必需，保留
//
// 想恢复某个文件：把它从 REMOVABLE / EXTRA_REMOVABLE 里删掉即可。
const sandboxFix = require('electron-builder-sandbox-fix');
const fs = require('node:fs');
const path = require('node:path');

// 默认移除。
const REMOVABLE = [
  // Chromium 及其内置第三方组件的许可清单（单文件 19MB，纯文本）。
  // electron-builder 在 macOS 目标上本来就会删除它，此处对齐 Windows / Linux，
  // 三个平台行为一致；Electron 自身的 LICENSE 文件保留不动。
  'LICENSES.chromium.html'
];

// 默认保留。这些是 Chromium 的 GPU / 软件渲染回退组件，删掉能再省约 32MB，
// 但只有在「确认目标机器上都用不到」时才建议开启（改动前后需真机各跑一次）：
//   - dxcompiler.dll (25MB)   D3D12 / WebGPU(Dawn) 的着色器编译器
//   - vk_swiftshader.dll (5.4MB) + vulkan-1.dll (0.9MB) + vk_swiftshader_icd.json
//                             无 GPU / 虚拟机环境下的软件 Vulkan 回退
//   - d3dcompiler_47.dll (4.6MB)  ANGLE D3D11 后端依赖，一般不建议删
// 开启方式：把下方 ENABLE_EXTRA 改为 true。
const ENABLE_EXTRA = false;
const EXTRA_REMOVABLE = [
  'dxcompiler.dll',
  'vk_swiftshader.dll',
  'vulkan-1.dll',
  'vk_swiftshader_icd.json'
];

function rmIfExists(p) {
  try {
    if (!fs.existsSync(p)) return 0;
    const size = fs.statSync(p).size;
    fs.rmSync(p, { recursive: true, force: true });
    return size;
  } catch (e) {
    console.warn(`  [after-pack] 删除失败: ${p} (${e.message})`);
    return 0;
  }
}

module.exports = async function afterPack(context) {
  // —— 1. 原有钩子：Linux 下生成 --no-sandbox 包装脚本 ——
  await sandboxFix(context);

  // —— 2. 裁剪 Electron 运行时附随文件 ——
  const { appOutDir } = context;
  const names = ENABLE_EXTRA ? [...REMOVABLE, ...EXTRA_REMOVABLE] : REMOVABLE;
  let saved = 0;
  for (const name of names) {
    saved += rmIfExists(path.join(appOutDir, name));
  }
  if (saved > 0) {
    console.log(`  • [after-pack] 移除 Electron 附随文件 ${(saved / 1048576).toFixed(1)}MB（${names.length} 项）`);
  }
};
