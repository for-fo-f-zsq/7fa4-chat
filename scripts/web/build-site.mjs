/**
 * 官网及所有网页端功能的统一构建入口（服务器自动部署固定调用 npm run site:build）。
 *
 * 以后新增任何网页前端模块/子应用，只需把构建与同步步骤追加到本脚本中，
 * 无需修改服务器部署配置即可随 GitHub 推送自动上线。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runNodeScript(relScript, args = []) {
  const res = spawnSync(process.execPath, [resolve(root, relScript), ...args], {
    cwd: root,
    stdio: 'inherit'
  });
  if (res.error) {
    console.error(`[site:build] 启动 ${relScript} 失败: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log('[site:build] 1/1 构建网页端 SPA 并同步到 site/public/web/ ...');
runNodeScript('scripts/web/build-web-app.mjs', ['--copy-to-site']);

console.log('[site:build] 全部网页产物构建完成');
