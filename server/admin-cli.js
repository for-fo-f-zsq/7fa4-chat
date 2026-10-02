#!/usr/bin/env node
'use strict';
// ============================================================
// 管理员救援 CLI
//
// 为什么必须有：改用账户库（不再依赖 nginx htpasswd）后，若账户库损坏、或最后一个
// 超级管理员忘记密码，界面上就没有任何入口能恢复 —— 会永久锁死。
// 本 CLI 需要 SSH 登录服务器才能执行（不暴露网络入口），是唯一的总救援通道。
//
// 用法（在服务器 /home/ubuntu/website-api 下）：
//   node admin-cli.js list                          列出账户
//   node admin-cli.js create <用户名> <角色>        创建账户（密码交互输入）
//   node admin-cli.js reset-password <用户名>       重置密码（交互输入）
//   node admin-cli.js disable <用户名>              禁用账户
//   node admin-cli.js enable <用户名>               启用账户
//   node admin-cli.js role <用户名> <super|ops>     修改角色
//   node admin-cli.js remove <用户名>               删除账户
//   node admin-cli.js bootstrap <用户名>            账户库为空时创建初始超级管理员
//
// 密码通过 **隐藏交互输入** 提供（不回显、不进 shell 历史）；
// 若确实需要非交互（如自动化），可加 --password=<pw>，但会留在进程列表里，谨慎使用。
// ============================================================
const accounts = require('./admin-accounts');

const rawArgs = process.argv.slice(2);
// 位置参数需过滤掉 --password=xxx 这类开关，否则会被当成角色名/用户名
const args = rawArgs.filter((a) => !a.startsWith('--'));
const cmd = (args[0] || '').toLowerCase();

function inlinePassword() {
  const hit = rawArgs.find((a) => a.startsWith('--password='));
  return hit ? hit.slice('--password='.length) : '';
}

/** 隐藏输入读密码（不回显）。非 TTY 时退回读 stdin 一行。 */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => { buf += c; if (buf.includes('\n')) { resolve(buf.split('\n')[0]); stdin.pause(); } });
      stdin.on('end', () => resolve(buf.trim()));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let pw = '';
    const onData = (ch) => {
      switch (ch) {
        case '\n': case '\r': case '\u0004':
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
          process.stdout.write('\n'); resolve(pw); break;
        case '\u0003': // Ctrl+C
          stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); break;
        case '\u007f': case '\b': // Backspace
          if (pw.length) { pw = pw.slice(0, -1); process.stdout.write('\b \b'); } break;
        default:
          if (ch >= ' ') { pw += ch; process.stdout.write('*'); }
      }
    };
    stdin.on('data', onData);
  });
}

async function readNewPassword(confirmTwice = true) {
  const inline = inlinePassword();
  if (inline) return inline;
  const pw = await askHidden('新密码（不回显）: ');
  if (!confirmTwice) return pw;
  const again = await askHidden('再次输入确认: ');
  if (pw !== again) { console.error('\n✗ 两次输入不一致'); process.exit(1); }
  return pw;
}

function out(label, v) { console.log(label, v); }
function die(msg) { console.error('✗ ' + msg); process.exit(1); }

(async () => {
  switch (cmd) {
    case 'list': {
      const list = accounts.list();
      if (!list.length) { out('（账户库为空）', ''); break; }
      console.log('用户名'.padEnd(18), '角色'.padEnd(8), '状态'.padEnd(10), '最后登录');
      console.log('-'.repeat(64));
      for (const a of list) {
        const last = a.last_login_at ? new Date(a.last_login_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '从未';
        console.log(String(a.username).padEnd(18), String(a.role).padEnd(8), String(a.status).padEnd(10), last);
      }
      break;
    }

    case 'create': {
      const username = args[1]; const role = args[2] || 'ops';
      if (!username) die('用法: node admin-cli.js create <用户名> [super|ops]');
      const pw = await readNewPassword();
      const r = accounts.create({ username, password: pw, role, actor: 'cli' });
      if (!r.ok) die(r.message);
      out('✓ 已创建', `${r.account.username}（${r.account.role}）`);
      break;
    }

    case 'bootstrap': {
      const username = args[1];
      if (!username) die('用法: node admin-cli.js bootstrap <用户名>');
      const pw = await readNewPassword();
      const r = accounts.ensureBootstrap(username, pw);
      if (!r.ok) die(r.message);
      out('✓ 已引导创建超级管理员', r.account.username);
      break;
    }

    case 'reset-password': {
      const username = args[1];
      if (!username) die('用法: node admin-cli.js reset-password <用户名>');
      if (!accounts.get(username)) die('账户不存在：' + username);
      const pw = await readNewPassword();
      const r = accounts.setPassword(username, pw, 'cli');
      if (!r.ok) die(r.message);
      out('✓ 已重置密码', username);
      break;
    }

    case 'disable': case 'enable': {
      const username = args[1];
      if (!username) die(`用法: node admin-cli.js ${cmd} <用户名>`);
      const r = accounts.update(username, { status: cmd === 'disable' ? 'disabled' : 'active' }, 'cli');
      if (!r.ok) die(r.message);
      out('✓ 已' + (cmd === 'disable' ? '禁用' : '启用'), username);
      break;
    }

    case 'role': {
      const username = args[1]; const role = args[2];
      if (!username || !role) die('用法: node admin-cli.js role <用户名> <super|ops>');
      const r = accounts.update(username, { role }, 'cli');
      if (!r.ok) die(r.message);
      out('✓ 已修改角色', `${username} → ${role}`);
      break;
    }

    case 'remove': {
      const username = args[1];
      if (!username) die('用法: node admin-cli.js remove <用户名>');
      const r = accounts.remove(username, 'cli');
      if (!r.ok) die(r.message);
      out('✓ 已删除', username);
      break;
    }

    default:
      console.log(`管理员救援 CLI

用法: node admin-cli.js <命令> [参数]

  list                        列出所有账户
  create <用户名> [角色]      创建账户（角色默认 ops，密码交互输入）
  bootstrap <用户名>          账户库为空时创建初始超级管理员
  reset-password <用户名>     重置密码
  disable <用户名>            禁用账户
  enable <用户名>             启用账户
  role <用户名> <super|ops>   修改角色
  remove <用户名>             删除账户

说明:
  · 密码默认隐藏交互输入；自动化场景可加 --password=<pw>（会留在进程列表，谨慎）
  · 系统始终保留至少一个启用的超级管理员，相关降级/删除会被拒绝
  · 账户库: ${accounts.ACCOUNTS_FILE}`);
  }
})().catch((e) => die(e.message));
