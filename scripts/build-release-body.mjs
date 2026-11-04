// ========== 从 CHANGELOG 生成 Release 正文（Markdown）==========
// 仓库根目录的 CHANGELOG 是 HTML 片段（客户端「更新日志」直接渲染它），结构固定：
//   <h2>3.6.1</h2>
//   <ul>
//     <li><span class="change-tag new|improve|fix|notice">新功能|优化|修复|通知</span>文案</li>
//     ...
//   </ul>
// 本脚本按版本号取出对应段落，转成 Markdown 供 GitHub / GitLab Release 正文使用：
//   ## 3.6.1
//   - 新功能：文案
// 用法：node scripts/build-release-body.mjs <版本号>
//   - 版本号可写 3.6.1 或 v3.6.1（历史段落里有 <h2>v2.8.0</h2> 这种带 v 的写法）
//   - 成功：Markdown 输出到 stdout，退出码 0
//   - 版本不存在 / 参数错误 / CHANGELOG 读取失败：错误信息输出到 stderr，退出码 1
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const changelogPath = resolve(import.meta.dirname, '..', 'CHANGELOG');

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
let html;
try {
  html = readFileSync(changelogPath, 'utf8');
} catch (e) {
  fail(`读取 ${changelogPath} 失败: ${e.message}`);
}

// ---------- 定位版本段落 ----------
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headingRe = new RegExp(`<h2>\\s*(?:v)?${escapeRegExp(version)}\\s*</h2>`, 'i');
const match = headingRe.exec(html);
if (!match) {
  fail(`CHANGELOG 中未找到版本 ${version}（请确认 CHANGELOG 里有 <h2>${version}</h2> 段落）`);
}
const afterHeading = html.slice(match.index + match[0].length);
const nextHeadingIndex = afterHeading.search(/<h2>/i);
const section = nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex);

// ---------- HTML 片段 → 纯文本 ----------
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, code.toLowerCase())
      ? NAMED_ENTITIES[code.toLowerCase()]
      : whole;
  });
}
function htmlToText(fragment) {
  return decodeEntities(
    fragment
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- <li> 逐条转 Markdown 列表项 ----------
const items = [];
const liRe = /<li>([\s\S]*?)<\/li>/gi;
let liMatch;
while ((liMatch = liRe.exec(section)) !== null) {
  const inner = liMatch[1];
  const tagMatch = inner.match(/<span\s+class="change-tag[^"]*">([\s\S]*?)<\/span>/i);
  const label = tagMatch ? htmlToText(tagMatch[1]) : '';
  const content = htmlToText(tagMatch ? inner.replace(tagMatch[0], '') : inner);
  if (!content) continue;
  items.push(label ? `- ${label}：${content}` : `- ${content}`);
}
if (items.length === 0) fail(`版本 ${version} 段落中没有可用的更新条目（CHANGELOG 结构可能已变化）`);

// ---------- 输出 ----------
console.log([`## ${version}`, '', ...items].join('\n'));
