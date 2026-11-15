#!/usr/bin/env node
/**
 * scripts/release/verify-release.mjs —— 发布后只读收尾校验与 GitHub Actions Step Summary 输出。
 *
 * 校验项（只读告警，不破坏已完成发布）：
 *   1. GitLab TOOLS/latest/tools.json 与本地 tools/*\/tool.json 版本核对；
 *   2. 官网 /api/downloads（带 30s 缓存等待窗口）、/api/changelog、/api/status 在线检查；
 *   3. 写入 $GITHUB_STEP_SUMMARY（安装包大小汇总 + 校验状态）。
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TOOLS_MANIFEST_URL = process.env.GITLAB_TOOLS_MANIFEST
  || 'https://jx.7fa4.cn:9080/api/v4/projects/886/packages/generic/TOOLS/latest/tools.json';
const SITE_BASE = (process.env.SITE_BASE || 'https://jx.7fa4.cn:8888/7fa4-chat').replace(/\/+$/, '');
const VERSION = String(process.env.VERSION || '').replace(/^v/i, '');
const DIST_DIR = process.env.DIST_DIR || 'dist';
const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY || '';

const warn = (msg) => console.log(`::warning::[verify] ${String(msg).replace(/\r?\n/g, ' ')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, timeoutMs = 20_000) {
  const res = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, text, json };
}

async function checkToolsManifest() {
  const local = {};
  if (existsSync('tools')) {
    for (const id of readdirSync('tools')) {
      const file = join('tools', id, 'tool.json');
      if (!existsSync(file)) continue;
      const meta = JSON.parse(readFileSync(file, 'utf8'));
      if (meta?.id) local[meta.id] = String(meta.version || '');
    }
  }
  const rows = [];
  try {
    const res = await fetchJson(TOOLS_MANIFEST_URL);
    if (!res.ok || !res.json) {
      warn(`线上工具清单不可达（HTTP ${res.status}）`);
      return { status: `HTTP ${res.status}`, rows };
    }
    const remote = {};
    for (const item of Array.isArray(res.json) ? res.json : res.json.tools || []) {
      if (item?.id) remote[item.id] = String(item.version || '');
    }
    let mismatch = 0;
    for (const [id, ver] of Object.entries(local).sort((a, b) => a[0].localeCompare(b[0]))) {
      const ok = remote[id] === ver;
      if (!ok) {
        mismatch++;
        warn(`工具 ${id} 线上版本 ${remote[id] || '(缺失)'} != 本地 ${ver}`);
      }
      rows.push({ id, local: ver, remote: remote[id] || '(缺失)', ok });
    }
    return { status: mismatch ? `${mismatch} 项待同步` : '全部一致', rows };
  } catch (e) {
    warn(`检查线上工具清单异常：${e.message}`);
    return { status: `异常: ${e.message}`, rows };
  }
}

async function checkSiteDownloads() {
  if (!VERSION) return { downloads: '未指定 VERSION', changelog: '跳过', status: '跳过' };
  // 官网 /api/downloads 有 30s 内存缓存，若刚发完包最多等 36s 再复检一次
  let dlText = '不可达';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchJson(`${SITE_BASE}/api/downloads`);
      if (res.ok && res.json) {
        const remoteVer = String(res.json.version || '');
        const count = Array.isArray(res.json.items) ? res.json.items.length : 0;
        dlText = `version=${remoteVer || '?'}, items=${count}`;
        if (remoteVer === VERSION && count > 0) break;
        if (attempt === 1) {
          console.log(`[verify] 官网下载区缓存中（${dlText}），等待 35s 缓存过期后复检…`);
          await sleep(35_000);
          continue;
        }
        warn(`官网 /api/downloads 仍显示 ${dlText}（期望 ${VERSION}）`);
      } else {
        dlText = `HTTP ${res.status}`;
        warn(`官网 /api/downloads 返回 ${dlText}`);
        break;
      }
    } catch (e) {
      dlText = `异常: ${e.message}`;
      warn(`访问官网 /api/downloads 失败：${e.message}`);
      break;
    }
  }

  let clText = '不可达';
  try {
    const res = await fetchJson(`${SITE_BASE}/api/changelog`);
    if (res.ok) {
      const hasVer = res.text.includes(`## ${VERSION}`) || res.text.includes(`## v${VERSION}`);
      clText = hasVer ? `含 ## ${VERSION}` : `暂未包含 ## ${VERSION}（等待部署拉取）`;
      if (!hasVer) warn(`官网 /api/changelog ${clText}`);
    } else {
      clText = `HTTP ${res.status}`;
    }
  } catch (e) {
    clText = `异常: ${e.message}`;
  }

  let stText = '不可达';
  try {
    const res = await fetchJson(`${SITE_BASE}/api/status`);
    if (res.ok && res.json) {
      stText = `version=${res.json.version || '?'}, commit=${res.json.commit || '?'}, webReady=${res.json.webReady}`;
    } else {
      stText = `HTTP ${res.status}`;
    }
  } catch (e) {
    stText = `异常: ${e.message}`;
  }

  return { downloads: dlText, changelog: clText, status: stText };
}

function collectDistList() {
  if (!existsSync(DIST_DIR)) return [];
  return readdirSync(DIST_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith('.'))
    .map((d) => ({
      name: d.name,
      sizeMb: (statSync(join(DIST_DIR, d.name)).size / 1024 / 1024).toFixed(2),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

async function main() {
  const [tools, site] = await Promise.all([checkToolsManifest(), checkSiteDownloads()]);
  const files = collectDistList();

  console.log(`[verify] 工具清单：${tools.status}`);
  for (const r of tools.rows) {
    console.log(`[verify]   ${r.ok ? 'ok' : '!!'} ${r.id} local=${r.local} remote=${r.remote}`);
  }
  console.log(`[verify] 官网 /api/downloads: ${site.downloads}`);
  console.log(`[verify] 官网 /api/changelog: ${site.changelog}`);
  console.log(`[verify] 官网 /api/status: ${site.status}`);

  if (SUMMARY_FILE) {
    const lines = [
      `## 7FA4 Chat ${VERSION ? `v${VERSION}` : ''} 发布摘要`,
      '',
      `- **GitHub Release**: 已创建（${files.length} 个构建文件）`,
      `- **GitLab Generic Package (latest)** & **GitLab Release**: 已发布并通过匿名下载抽检`,
      `- **工具清单 (\`TOOLS/latest\`)**: ${tools.status}`,
      `- **官网 \`/api/downloads\`**: ${site.downloads}`,
      `- **官网 \`/api/changelog\`**: ${site.changelog}`,
      `- **官网 \`/api/status\`**: ${site.status}`,
      '',
      '<details><summary>构建产物列表</summary>',
      '',
      '| 文件名 | 大小 (MB) |',
      '|---|---:|',
      ...files.map((f) => `| \`${f.name}\` | ${f.sizeMb} |`),
      '',
      '</details>',
      '',
    ];
    appendFileSync(SUMMARY_FILE, `${lines.join('\n')}\n`, 'utf8');
  }
}

main().catch((e) => {
  warn(`收尾校验脚本异常：${e.message}`);
});
