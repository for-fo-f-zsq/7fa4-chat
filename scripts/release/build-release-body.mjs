// ========== 从 CHANGELOG 生成 Release 正文（Markdown）==========
// 仓库根目录的 CHANGELOG 是 Markdown，结构固定：
//   ## 3.7.0
//   - 新功能：文案
//   - 优化：文案
// 本脚本按版本号取出对应段落，原样输出给 GitHub / GitLab Release 正文使用。
// 用法：node scripts/release/build-release-body.mjs <版本号>
//   - 版本号可写 3.6.1 或 v3.6.1（历史段落里有 "## v2.8.0" 这种带 v 的写法）
//   - 成功：Markdown 输出到 stdout，退出码 0
//   - 版本不存在 / 参数错误 / CHANGELOG 读取失败：错误信息输出到 stderr，退出码 1
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const changelogPath = resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'CHANGELOG');

function fail(message) {
  console.error(`[build-release-body] ${message}`);
  process.exit(1);
}

// ---------- 参数与版本号归一化 ----------
const rawVersion = process.argv[2];
if (!rawVersion) fail('用法: node scripts/build-release-body.mjs <版本号>（例如 3.6.1）');
const version = rawVersion.trim().replace(/^v/i, '');
if (!version) fail(`版本号为空: ${JSON.stringify(rawVersion)}`);
if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(version)) fail(`版本号格式异常: ${JSON.stringify(rawVersion)}`);

// ---------- 读取 CHANGELOG ----------
let markdown;
try {
  markdown = readFileSync(changelogPath, 'utf8');
} catch (e) {
  fail(`读取 ${changelogPath} 失败: ${e.message}`);
}

// ---------- 定位版本段落（下一个标题即结束） ----------
const lines = markdown.split(/\r?\n/);
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headingRe = new RegExp(`^#{1,6}\\s+v?${escapeRegExp(version)}\\s*$`, 'i');
const start = lines.findIndex((line) => headingRe.test(line.trim()));
if (start === -1) fail(`CHANGELOG 中未找到版本 ${version}（请确认 CHANGELOG 里有 "## ${version}" 段落）`);

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^#{1,6}\s+/.test(lines[i].trim())) {
    end = i;
    break;
  }
}

const section = lines.slice(start, end).join('\n').trim();
if (!section || section === lines[start].trim()) fail(`版本 ${version} 段落中没有可用的更新条目`);

// ---------- 输出 ----------
console.log(section);
