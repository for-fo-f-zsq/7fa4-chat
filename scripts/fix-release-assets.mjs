// ========== 修正已发布 Release 的资源链接（排序 + 去无效项）==========
// 用途：GitLab Release 已有历史链接顺序混乱、混入 CHANGELOG/latest*.yml 等非安装包，
//       用 API 就地重排：只保留安装包，按 平台 → 架构 → 文件名 排序。
// 用法：
//   node scripts/fix-release-assets.mjs                 # 预览（默认 dry-run，只打印将要做什么）
//   node scripts/fix-release-assets.mjs --apply         # 实际修改
//   node scripts/fix-release-assets.mjs --tag v3.7.1 --apply
// 凭据：GITLAB_TOKEN（环境变量，或仓库根 .env 里的 GITLAB_TOKEN=...）
// 注意：只改资源链接（assets/links），Release 正文/名称/时间都不动；链接 URL 沿用原链接，不改下载地址。

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const API = (process.env.GITLAB_API || 'https://jx.7fa4.cn:9080/api/v4').replace(/\/+$/, '');
const PROJECT = process.env.GITLAB_PROJECT || '886';
const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const tagIndex = process.argv.indexOf('--tag');
const TARGET_TAG = tagIndex !== -1 ? process.argv[tagIndex + 1] : '';

// 与 scripts/release-assets.mjs 同口径（此处内联，避免脚本被单文件拷贝后失效）
const TYPE_ORDER = ['windows', 'macos', 'linux', 'android', 'archive'];
const TYPE_BY_EXT = {
  '.exe': 'windows', '.msi': 'windows',
  '.dmg': 'macos', '.pkg': 'macos',
  '.appimage': 'linux', '.deb': 'linux', '.rpm': 'linux',
  '.apk': 'android',
  '.zip': 'archive',
};
const ARCH_ORDER = ['x64', 'arm64', 'universal'];
// 架构别名：x86_64 / amd64 视同 x64；aarch64 视同 arm64（Linux 产物命名不一致）
const ARCH_ALIASES = {
  x64: ['x64', 'x86_64', 'amd64'],
  arm64: ['arm64', 'aarch64'],
  universal: ['universal'],
};
// 平台内格式顺序：AppImage 优先于 deb/rpm，dmg 优先于 pkg，exe 优先于 msi
const FORMAT_ORDER = {
  '.appimage': 0, '.deb': 1, '.rpm': 2,
  '.dmg': 0, '.pkg': 1,
  '.exe': 0, '.msi': 1,
};
const SKIP_NAMES = new Set(['changelog', 'changelog.md', 'builder-debug.yml', 'builder-effective-config.yaml']);
const extOf = (name) => { const i = name.lastIndexOf('.'); return i === -1 ? '' : name.slice(i).toLowerCase(); };
const isLinkableAsset = (name) => {
  const lower = String(name).toLowerCase();
  if (SKIP_NAMES.has(lower)) return false;
  const ext = extOf(lower);
  if (ext === '.yml' || ext === '.yaml' || ext === '.blockmap' || ext === '.json') return false;
  return Boolean(TYPE_BY_EXT[ext]);
};
const assetType = (name) => TYPE_BY_EXT[extOf(String(name))] || 'archive';
const archRank = (name) => {
  const lower = String(name).toLowerCase();
  for (let i = 0; i < ARCH_ORDER.length; i++) {
    const aliases = ARCH_ALIASES[ARCH_ORDER[i]];
    if (aliases.some((alias) => lower.includes(`-${alias}`) || lower.includes(`_${alias}`))) return i;
  }
  return ARCH_ORDER.length;
};
const sortAssetNames = (names) => [...names].sort((a, b) => {
  const ta = TYPE_ORDER.indexOf(assetType(a));
  const tb = TYPE_ORDER.indexOf(assetType(b));
  if (ta !== tb) return ta - tb;
  const fa = FORMAT_ORDER[extOf(a)] ?? 9;
  const fb = FORMAT_ORDER[extOf(b)] ?? 9;
  if (fa !== fb) return fa - fb;
  const ra = archRank(a);
  const rb = archRank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, 'en');
});

function readToken() {
  if (process.env.GITLAB_TOKEN) return process.env.GITLAB_TOKEN.trim();
  const envFile = join(ROOT, '.env');
  if (!existsSync(envFile)) return '';
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('GITLAB_TOKEN='));
  return line ? line.slice('GITLAB_TOKEN='.length).trim() : '';
}

const TOKEN = readToken();
const request = async (method, path, body) => {
  const res = await fetch(API + path, {
    method,
    body,
    headers: {
      'PRIVATE-TOKEN': TOKEN,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status: res.status, data };
};

const brief = (data) => {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

const main = async () => {
  if (!TOKEN) throw new Error('缺少 GITLAB_TOKEN（环境变量或仓库根 .env）');
  // 1) 找目标 Release（默认取最新发布的那个）
  const list = await request('GET', `/projects/${PROJECT}/releases?per_page=20`);
  if (list.status !== 200) throw new Error(`获取 Release 列表失败：HTTP ${list.status} ${brief(list.data)}`);
  const releases = Array.isArray(list.data) ? list.data : [];
  if (!releases.length) throw new Error('项目下没有任何 Release');
  const target = TARGET_TAG
    ? releases.find((r) => r.tag_name === TARGET_TAG)
    : releases[0];
  if (!target) throw new Error(`找不到 tag=${TARGET_TAG} 的 Release`);
  const tag = target.tag_name;
  const links = target.assets?.links || [];
  console.log(`[fix] Release：${tag}（${target.name}），现有资源链接 ${links.length} 个`);

  // 2) 计算期望：只留安装包，按平台/架构排序
  const toKeep = links.filter((link) => isLinkableAsset(link.name));
  const toDrop = links.filter((link) => !isLinkableAsset(link.name));
  const sorted = sortAssetNames(toKeep.map((link) => link.name));
  const byName = new Map(toKeep.map((link) => [link.name, link]));
  console.log(`[fix] 保留安装包 ${toKeep.length} 个，移除无效链接 ${toDrop.length} 个${toDrop.length ? `（${toDrop.map((l) => l.name).join(', ')}）` : ''}`);
  console.log('[fix] 目标顺序：');
  sorted.forEach((name, i) => console.log(`  ${String(i + 1).padStart(2)}. ${name}  ← ${byName.get(name)?.url || ''}`));

  const currentOrder = links.map((link) => link.name);
  const alreadySorted = toDrop.length === 0 && currentOrder.length === sorted.length && currentOrder.every((name, i) => name === sorted[i]);
  if (alreadySorted) {
    console.log('[fix] 链接已符合预期，无需修改');
    return;
  }
  if (!APPLY) {
    console.log('[fix] dry-run：未做修改。加 --apply 实际执行。');
    return;
  }

  // 3) 先删全部链接（GitLab 资源链接顺序 = 创建顺序，无法原地重排）
  for (const link of links) {
    const del = await request('DELETE', `/projects/${PROJECT}/releases/${encodeURIComponent(tag)}/assets/links/${link.id}`);
    if (del.status !== 200 && del.status !== 204) throw new Error(`删除链接 ${link.name} 失败：HTTP ${del.status} ${brief(del.data)}`);
    console.log(`[fix] 已删除链接 ${link.name}`);
  }
  // 4) 按排序重建（GitLab 列表按创建时间倒序展示，所以创建顺序取目标顺序的逆序）
  for (const name of [...sorted].reverse()) {
    const source = byName.get(name);
    const payload = { name, url: source.url, link_type: source.link_type || 'package' };
    const created = await request('POST', `/projects/${PROJECT}/releases/${encodeURIComponent(tag)}/assets/links`, JSON.stringify(payload));
    if (created.status !== 201) throw new Error(`创建链接 ${name} 失败：HTTP ${created.status} ${brief(created.data)}`);
    console.log(`[fix] 已创建链接 ${name}`);
  }
  // 5) 复核（列表顺序应等于目标顺序）
  const verify = await request('GET', `/projects/${PROJECT}/releases/${encodeURIComponent(tag)}`);
  const names = (verify.data?.assets?.links || []).map((link) => link.name);
  const ok = names.length === sorted.length && names.every((name, i) => name === sorted[i]);
  console.log(`[fix] 复核：${ok ? '顺序与数量一致' : '不一致'}（${names.join(', ')}）`);
  if (!ok) throw new Error('复核失败：链接顺序与预期不一致');
};

main().catch((error) => {
  console.error(`[fix] 失败：${error.message}`);
  process.exit(1);
});
