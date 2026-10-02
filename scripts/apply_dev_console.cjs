#!/usr/bin/env node
'use strict';
/**
 * 把「统一 API v1 + 账户体系 + 静态伺服」接入生产 server.js。
 *
 * 设计原则：
 *  - 幂等：以 marker 判重，重复执行不会叠加改动。
 *  - 安全：改前备份，改后 node --check 不通过则自动回滚。
 *  - 最小侵入：只做 3 处插入 + 1 处路由钩子，不重写既有业务逻辑。
 *
 * 用法：node scripts/apply_dev_console.cjs [serverJsPath]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const target = process.argv[2] || path.join(__dirname, '..', '..', 'website-api', 'server.js');
const MARKER = '// [patch:dev-console]';

if (!fs.existsSync(target)) {
  console.error('✗ 找不到 server.js: ' + target);
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

if (src.includes(MARKER)) {
  console.log('已应用过补丁（找到 marker），跳过。');
  process.exit(0);
}

const original = src;
const applied = [];

function rep(name, from, to) {
  if (!src.includes(from)) {
    throw new Error(`锚点未找到: ${name}`);
  }
  if (src.split(from).length > 2) {
    throw new Error(`锚点不唯一: ${name}`);
  }
  src = src.replace(from, to);
  applied.push(name);
}

// ---------- 1. require 新模块 ----------
rep('require 新模块',
  "const http = require('http');",
  `const http = require('http');
${MARKER} —— 统一 API v1 / 账户体系 / 静态伺服
const __apiContract = require('./api-contract');
const __apiV1 = require('./api-v1');
const __staticServer = require('./static-server');
const __accounts = require('./admin-accounts');
const __audit = require('./audit-log');
const __sysConfig = require('./system-config');
const __legacy = require('./legacy-compat');
// 静态资源根目录：与其自身同级放一份 website（部署时该目录为 /home/ubuntu/website）
const __WEBSITE_ROOT = process.env.WEBSITE_ROOT || require('path').join(__dirname, '..', 'website');`
);

// ---------- 2. 在路由循环前插入 v1 / 静态 处理 ----------
rep('接入 v1 与静态伺服',
  `const server = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  try {
    for (const route of routes) {`,
  `const server = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  try {
    // ${MARKER} ① 统一 API v1（含登录/账户/配置/审计）
    if (__apiV1.handle(req, res)) return;

    // ${MARKER} ② 旧管理接口转发到 v1 实现（保持旧响应形状，保护已发布客户端）
    if (req.method === 'GET' && path === '/api/admin') {
      const u = __apiV1.currentUser(req);
      return __apiContract.send(res, 200, __legacy.legacyAdminProbe(!!u, u && u.username));
    }
    if (req.method === 'POST' && path === '/api/logout') {
      res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
      return __apiContract.send(res, 200, { ok: true });
    }

    for (const route of routes) {`
);

// ---------- 3. 路由未命中时，尝试静态资源（放在 404 之前） ----------
rep('静态资源兜底',
  `    sendJSON(res, 404, { error: 'not found', path });`,
  `    // ${MARKER} ③ 未命中 API 时按静态资源伺服（官网 / 与后台 /dev 同进程）
    if ((req.method === 'GET' || req.method === 'HEAD') && __staticServer.serve(req, res, __WEBSITE_ROOT, path)) return;
    // 前端路由回退（SPA）：仅对「看起来是正常页面路径」的请求返回 index.html。
    // ⚠️ 必须排除路径穿越特征（.. / %2e%2e / 反斜杠）—— 否则越权尝试会拿到首页 200，
    //    虽然不会真泄露文件，但会把攻击探测伪装成正常响应，干扰排查也容易被误判为漏洞。
    const __looksLikeTraversal = /\\.\\.|%2e|%2f|%5c|\\\\/i.test(path);
    if ((req.method === 'GET' || req.method === 'HEAD') &&
        !path.startsWith('/api/') && !path.startsWith('/user/') && !__looksLikeTraversal) {
      if (path.startsWith('/dev') && __staticServer.serveIndex(res, __WEBSITE_ROOT, 'dev/index.html')) return;
      if (__staticServer.serveIndex(res, __WEBSITE_ROOT)) return;
    }
    sendJSON(res, 404, { error: 'not found', path });`
);

// ---------- 写盘 + 校验 + 回滚 ----------
const backup = target + '.bak-devconsole';
fs.writeFileSync(backup, original);
fs.writeFileSync(target, src);

try {
  execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
  console.log('✓ 已应用补丁，语法检查通过：');
  applied.forEach((a) => console.log('   · ' + a));
  console.log('  备份: ' + backup);
} catch (e) {
  fs.writeFileSync(target, original);
  console.error('✗ 语法检查失败，已回滚。错误：');
  console.error(String(e.stderr || e.message).split('\n').slice(0, 12).join('\n'));
  process.exit(1);
}
