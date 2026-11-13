// ========== Android (Capacitor) 一键构建脚本 ==========
// 流程：构建渲染层 (out/renderer) -> cap sync android -> Gradle 打包 APK
// 用法：
//   node scripts/android/build-android.mjs            # 默认打包 Release APK
//   node scripts/android/build-android.mjs --debug    # 打包 Debug APK
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const androidDir = resolve(root, 'android');
const isDebug = process.argv.includes('--debug');
const task = isDebug ? 'assembleDebug' : 'assembleRelease';

function run(cmd, args, cwd = root) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd.endsWith('.cmd') });
  if (res.error) {
    console.error(`[build-android] 执行 ${cmd} 失败: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run(process.execPath, [resolve(root, 'scripts/android/build-android-assets.mjs')]);

const capBin = resolve(root, 'node_modules/@capacitor/cli/bin/capacitor');
if (!existsSync(capBin)) {
  console.error('[build-android] 找不到 @capacitor/cli，请先执行 npm install');
  process.exit(1);
}
console.log('[build-android] cap sync android ...');
run(process.execPath, [capBin, 'sync', 'android']);

const gradlew = resolve(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!existsSync(gradlew)) {
  console.error('[build-android] 找不到 Gradle Wrapper:', gradlew);
  process.exit(1);
}

console.log(`[build-android] ./gradlew ${task} ...`);
const gradleRes = spawnSync(gradlew, [task, '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
if (gradleRes.error) {
  console.error(`[build-android] Gradle 启动失败: ${gradleRes.error.message}`);
  process.exit(1);
}
if (gradleRes.status !== 0) process.exit(gradleRes.status ?? 1);

const apkDir = resolve(
  androidDir,
  `app/build/outputs/apk/${isDebug ? 'debug' : 'release'}`
);
console.log(`[build-android] 完成，APK 输出目录: ${apkDir}`);
