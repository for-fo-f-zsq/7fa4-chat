#!/usr/bin/env node
'use strict';
/**
 * 一键部署管理后台到服务器（本地执行）。
 *
 * 做四件事：
 *   ① 构建 dev-console 前端 → dist/
 *   ② 打包「服务端模块 + 前端产物」为一个 tar，scp 到服务器
 *   ③ 在服务器上解包、应用 server.js 补丁、跑 CLI 初始化管理员账户
 *   ④ 重启 pm2 并做健康检查
 *
 * 之所以把补丁放在服务器侧执行：server.js 是线上唯一真源，
 * 本地那份可能陈旧，必须改服务器上的实体文件。
 *
 * 用法：
 *   node scripts/deploy_dev_console.cjs            # 完整流程
 *   node scripts/deploy_dev_console.cjs --dry-run  # 只做①②，不上传
 *   node scripts/deploy_dev_console.cjs --skip-build
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONSOLE_DIR = path.join(ROOT, 'dev-console');
const SERVER_DIR = path.join(ROOT, 'server');

// 服务器参数（与现有运维一致）
const SSH_KEY = process.env.DEPLOY_SSH_KEY || 'D:/projects/main/.ssh/tencent_server.key';
const SSH_HOST = process.env.DEPLOY_SSH_HOST || 'ubuntu@forfof.cloud';
const API_DIR = process.env.DEPLOY_API_DIR || '/home/ubuntu/website-api';
const WEBSITE_DIR = process.env.DEPLOY_WEBSITE_DIR || '/home/ubuntu/website';
const PM2_NAME = process.env.DEPLOY_PM2_NAME || 'website-api';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP_BUILD = args.includes('--skip-build');

const NODE = process.execPath;

function log(step, msg) {
  console.log(`\n[${step}] ${msg}`);
}
function sh(cmd, opts = {}) {
  return execFileSync(cmd[0], cmd.slice(1), Object.assign({ stdio: 'inherit' }, opts));
}
function ssh(remoteCmd, opts = {}) {
  const r = spawnSync('ssh', [
    '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=20',
    SSH_HOST,
    remoteCmd,
  ], Object.assign({ encoding: 'utf8' }, opts));
  // 手动转发子进程输出：默认 execFileSync 失败时会把整段命令回显，噪音极大
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`\n✗ 远程命令失败（exit ${r.status}）。已中止，服务器上的既有文件未被删除。`);
    process.exit(1);
  }
  return r.stdout || '';
}
function scp(local, remote) {
  return execFileSync('scp', [
    '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=20',
    local,
    `${SSH_HOST}:${remote}`,
  ], { stdio: 'inherit' });
}

/**
 * 打 tar.gz。
 * Windows 上 `tar` 会解析到 C:\Windows\System32\tar.exe（bsdtar），
 * 它对「相对成员 + 绝对输出路径」组合会莫名失败；Git Bash 的 GNU tar 正常。
 * 因此优先用 Git Bash 的 tar，全都失败时退回纯 Node 实现。
 */
function makeTar(cwd, outFile, members) {
  const candidates = [
    'C:/Program Files/Git/usr/bin/tar.exe',
    'C:/Program Files/Git/bin/tar.exe',
    '/usr/bin/tar',
    '/bin/tar',
    'tar',
  ];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['-czf', outFile, ...members], { cwd, stdio: 'pipe' });
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) return;
    } catch {
      /* 试下一个 */
    }
  }
  // 兜底：Node 侧生成 tar（不压缩，体积略大但可靠）
  console.log('  · tar 命令不可用，改用 Node 内置打包');
  const tarBuf = tarGzNode(cwd, members);
  fs.writeFileSync(outFile, tarBuf);
}

/** 极简 tar.gz 实现（仅用 zlib，无外部依赖） */
function tarGzNode(cwd, members) {
  const zlib = require('zlib');
  const blocks = [];
  function addEntry(relPath, fullPath) {
    const st = fs.statSync(fullPath);
    const isDir = st.isDirectory();
    const header = Buffer.alloc(512);
    const name = relPath.replace(/\\/g, '/');
    if (name.length > 100) throw new Error('路径过长: ' + name);
    header.write(name, 0, 100, 'utf8');
    // ⚠️ 目录必须带执行位（0755），否则解包后无法进入 → 后续 cp 全部 Permission denied。
    // 这是本脚本最容易踩的坑：Node 写入的 tar 头完全由这里决定，不写对就是死锁式失败。
    header.write((isDir ? '000755' : '000644') + ' \0', 100, 8, 'ascii'); // mode
    header.write('000000 \0', 108, 8, 'ascii');   // uid
    header.write('000000 \0', 116, 8, 'ascii');   // gid
    header.write((isDir ? '00000000000' : st.size.toString(8).padStart(11, '0')) + ' ', 124, 12, 'ascii');
    header.write(Math.floor(st.mtimeMs / 1000).toString(8).padStart(11, '0') + ' ', 136, 12, 'ascii');
    header.write('        ', 148, 8, 'ascii');    // checksum 占位（8 空格）
    header.write(isDir ? '5' : '0', 156, 1, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(header);
    if (!isDir) {
      blocks.push(fs.readFileSync(fullPath));
      const pad = (512 - (st.size % 512)) % 512;
      if (pad) blocks.push(Buffer.alloc(pad));
    }
  }
  function walk(rel) {
    const full = path.join(cwd, rel);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      addEntry(rel + '/', full);
      for (const n of fs.readdirSync(full)) walk(path.join(rel, n));
    } else {
      addEntry(rel, full);
    }
  }
  for (const m of members) walk(m);
  blocks.push(Buffer.alloc(1024)); // 结尾两个空块
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
}

// ---------- ① 构建 ----------
if (!SKIP_BUILD) {
  log('1/5', '构建前端（Vue 3 + Vite 自托管）');
  const viteBin = path.join(CONSOLE_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) {
    console.error('✗ 找不到 vite。请先在 dev-console/ 安装依赖，或复用根 node_modules。');
    process.exit(1);
  }
  sh([NODE, viteBin, 'build'], { cwd: CONSOLE_DIR });
} else {
  log('1/5', '跳过构建（--skip-build）');
}

const distDir = path.join(CONSOLE_DIR, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('✗ dist/index.html 不存在，构建可能失败。');
  process.exit(1);
}

// ---------- ② 打包 ----------
log('2/5', '打包服务端模块 + 前端产物');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'devdeploy-'));
const stageApi = path.join(stage, 'api');
const stageWebDev = path.join(stage, 'web', 'dev');
fs.mkdirSync(stageApi, { recursive: true });
fs.mkdirSync(stageWebDev, { recursive: true });

const SERVER_MODULES = [
  'api-contract.js',
  'admin-accounts.js',
  'api-v1.js',
  'audit-log.js',
  'system-config.js',
  'static-server.js',
  'legacy-compat.js',
  'admin-cli.js',
];
for (const m of SERVER_MODULES) {
  const src = path.join(SERVER_DIR, m);
  if (!fs.existsSync(src)) {
    console.error('✗ 缺少服务端模块: ' + src);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(stageApi, m));
}
// 补丁脚本（在服务器侧对真实 server.js 执行）
fs.copyFileSync(
  path.join(ROOT, 'scripts', 'apply_dev_console.cjs'),
  path.join(stageApi, 'apply_dev_console.cjs')
);

// 前端产物 → web/dev/
copyDir(distDir, stageWebDev);

const tarPath = path.join(stage, 'deploy.tar.gz');
makeTar(stage, tarPath, ['api', 'web']);
const sizeMB = (fs.statSync(tarPath).size / 1024 / 1024).toFixed(2);
console.log(`  ✓ 包大小 ${sizeMB} MB`);

if (DRY) {
  console.log(`\n--dry-run：产物已生成，未上传。\n  包路径: ${tarPath}`);
  process.exit(0);
}

// ---------- ③ 上传 + 解包 + 打补丁 ----------
log('3/5', '上传到服务器');
const remoteTar = `/tmp/dev-console-${Date.now()}.tar.gz`;
scp(tarPath, remoteTar);

log('4/5', '解包 / 应用补丁 / 初始化账户');
ssh(`
set -e
cd ${API_DIR}

echo "--- 备份现有文件 ---"
mkdir -p .deploy-backup/$(date +%Y%m%d-%H%M%S)
BK=.deploy-backup/$(date +%Y%m%d-%H%M%S)
cp -a server.js "$BK/server.js.bak" 2>/dev/null || true

echo "--- 解包 ---"
TMP=\$(mktemp -d)
# 解包后统一放宽权限：tar 头里的目录权限位若没带 x，会在后续 cp 时报 Permission denied。
# 这里做一次兜底 chmod，不依赖打包端的正确性。
tar -xzf ${remoteTar} -C "\$TMP"
chmod -R u+rwX "\$TMP" 2>/dev/null || true

echo "--- 安装服务端模块 ---"
# ⚠️ 必须同时含 .cjs：打补丁脚本是 apply_dev_console.cjs，
# 只用 *.js 通配会漏掉它，导致后面 node apply_dev_console.cjs 报 MODULE_NOT_FOUND。
cp -a "$TMP/api/"*.js ${API_DIR}/
cp -a "$TMP/api/"*.cjs ${API_DIR}/ 2>/dev/null || true
chmod +x ${API_DIR}/admin-cli.js || true

echo "--- 安装前端产物 ---"
mkdir -p ${WEBSITE_DIR}/dev
rm -rf ${WEBSITE_DIR}/dev/*
cp -a "$TMP/web/dev/." ${WEBSITE_DIR}/dev/
# 静态资源要能被 nginx（www-data）读取
chmod -R a+rX ${WEBSITE_DIR}/dev/ 2>/dev/null || true

echo "--- 应用 server.js 补丁 ---"
node ${API_DIR}/apply_dev_console.cjs ${API_DIR}/server.js

echo "--- 清理临时文件 ---"
rm -rf "$TMP" ${remoteTar}

echo "--- 检查账户库 ---"
if [ -f ${API_DIR}/admins.json ]; then
  node ${API_DIR}/admin-cli.js list || true
else
  echo "!! 尚未初始化管理员账户，请执行："
  echo "   cd ${API_DIR} && node admin-cli.js create <用户名> --role super"
fi

echo "OK"
`);

// ---------- ④ 重启 + 健康检查 ----------
log('5/5', '重启服务并做健康检查');
ssh(`
set -e
cd ${API_DIR}
pm2 restart ${PM2_NAME} --update-env
sleep 2
echo "--- 健康检查 ---"
curl -fsS http://127.0.0.1:8090/api/health && echo
echo "--- v1 探针 ---"
curl -fsS http://127.0.0.1:8090/api/v1/auth/me && echo
echo "--- 后台首页 ---"
curl -fsS -o /dev/null -w "HTTP %{http_code}\\n" http://127.0.0.1:8090/dev/
pm2 logs ${PM2_NAME} --lines 15 --nostream || true
`);

try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
部署完成。

后续手动步骤（需要 sudo）：
  1. 移除 nginx 的 auth_basic（改用账户体系）：
       sudo nano /etc/nginx/sites-enabled/<站点>
       删除 /dev 与 /api 下的 auth_basic / auth_basic_user_file 两行
       sudo nginx -t && sudo systemctl reload nginx

  2. 若尚未创建管理员：
       ssh -i ${SSH_KEY} ${SSH_HOST}
       cd ${API_DIR} && node admin-cli.js create admin --role super

  3. 确认 WEBSITE_ROOT 指向正确（默认 ../website）：
       在 pm2 配置里加环境变量 WEBSITE_ROOT=${WEBSITE_DIR}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
