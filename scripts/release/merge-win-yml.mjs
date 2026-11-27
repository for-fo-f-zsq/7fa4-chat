#!/usr/bin/env node
/**
 * scripts/release/merge-win-yml.mjs —— 合并并行构建的 Windows x64 / arm64 latest.yml 清单。
 *
 * 背景：win-x64 与 win-arm64 拆分并行打包时各自生成 latest.yml，上传阶段会覆盖。
 * 各架构 job 将其重命名为 latest-win-x64.yml / latest-win-arm64.yml 后，
 * 本脚本在发布前合并为单个 dist/latest.yml，并删除临时分片 yml 文件。
 * 仅使用 Node 内置模块，无需在 release job 中执行 npm ci。
 *
 * 用法：
 *   node scripts/release/merge-win-yml.mjs [--dir dist] [--version 4.0.3]
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PART_FILES = ['latest-win-x64.yml', 'latest-win-arm64.yml'];

function stripQuotes(val) {
  const s = String(val || '').trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseWinManifest(text, fileName) {
  const lines = String(text || '').split(/\r?\n/);
  const doc = { version: '', files: [], path: '', sha512: '', releaseDate: '' };
  let inFiles = false;
  let currentFile = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;

    if (/^files:\s*$/.test(rawLine)) {
      inFiles = true;
      currentFile = null;
      continue;
    }

    if (inFiles && /^\s+-\s+/.test(rawLine)) {
      currentFile = {};
      doc.files.push(currentFile);
      const rest = rawLine.replace(/^\s+-\s+/, '');
      const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(rest);
      if (kv) {
        const key = kv[1];
        const val = stripQuotes(kv[2]);
        currentFile[key] = key === 'size' && /^\d+$/.test(val) ? Number(val) : val;
      }
      continue;
    }

    if (inFiles && /^\s{2,}[A-Za-z0-9_]+:\s*/.test(rawLine) && currentFile) {
      const kv = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(rawLine);
      if (kv) {
        const key = kv[1];
        const val = stripQuotes(kv[2]);
        currentFile[key] = key === 'size' && /^\d+$/.test(val) ? Number(val) : val;
      }
      continue;
    }

    inFiles = false;
    currentFile = null;
    const topKv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(rawLine);
    if (topKv && topKv[1] in doc) {
      doc[topKv[1]] = stripQuotes(topKv[2]);
    }
  }

  if (!doc.version) {
    throw new Error(`${fileName} 缺少 version 字段`);
  }
  return doc;
}

function formatScalar(val) {
  const s = String(val);
  if (/[:#'"\s]/.test(s) && !/^[A-Za-z0-9._-]+$/.test(s)) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

function serializeWinManifest(doc) {
  const out = [`version: ${formatScalar(doc.version)}`];
  out.push('files:');
  for (const f of doc.files) {
    const entries = Object.entries(f).filter(([, v]) => v !== undefined && v !== '');
    if (entries.length === 0) continue;
    const [firstKey, firstVal] = entries[0];
    out.push(`  - ${firstKey}: ${typeof firstVal === 'number' ? firstVal : formatScalar(firstVal)}`);
    for (let i = 1; i < entries.length; i++) {
      const [k, v] = entries[i];
      out.push(`    ${k}: ${typeof v === 'number' ? v : formatScalar(v)}`);
    }
  }
  if (doc.path) out.push(`path: ${formatScalar(doc.path)}`);
  if (doc.sha512) out.push(`sha512: ${formatScalar(doc.sha512)}`);
  if (doc.releaseDate) out.push(`releaseDate: ${formatScalar(doc.releaseDate)}`);
  return `${out.join('\n')}\n`;
}

function mergeWinManifests({ dir = 'dist', expectedVersion = '' } = {}) {
  const existing = PART_FILES
    .map((name) => ({ name, path: join(dir, name) }))
    .filter((entry) => existsSync(entry.path));

  if (existing.length === 0) {
    return { merged: false, reason: 'no-part-files' };
  }

  const docs = existing.map((entry) => ({
    ...entry,
    doc: parseWinManifest(readFileSync(entry.path, 'utf8'), entry.name),
  }));

  const versions = [...new Set(docs.map((d) => d.doc.version).filter(Boolean))];
  if (versions.length !== 1) {
    throw new Error(`Windows manifest 版本不一致或缺失: ${versions.join(', ') || '(empty)'}`);
  }
  const version = versions[0];
  const cleanExpected = String(expectedVersion || '').trim().replace(/^v/i, '');
  if (cleanExpected && version !== cleanExpected) {
    throw new Error(`Windows manifest 版本 (${version}) 与期望版本 (${cleanExpected}) 不一致`);
  }

  const seenUrls = new Set();
  const mergedFiles = [];
  for (const { doc } of docs) {
    for (const fileEntry of doc.files) {
      const key = fileEntry?.url || '';
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      mergedFiles.push(fileEntry);
    }
  }

  const primary = docs[0].doc;
  const outputDoc = {
    version,
    files: mergedFiles,
    path: primary.path,
    sha512: primary.sha512,
    releaseDate: primary.releaseDate,
  };

  const outPath = join(dir, 'latest.yml');
  writeFileSync(outPath, serializeWinManifest(outputDoc), 'utf8');

  for (const entry of existing) {
    rmSync(entry.path, { force: true });
  }

  return { merged: true, outPath, version, fileCount: mergedFiles.length };
}

function collectArtifacts({ collectFrom, dir = 'dist' }) {
  if (!existsSync(collectFrom)) {
    throw new Error(`产物分片目录不存在: ${collectFrom}`);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const owners = new Map();
  let count = 0;

  const walk = (srcDir, bucketName) => {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const full = join(srcDir, entry.name);
      if (entry.isDirectory()) {
        walk(full, bucketName || entry.name);
        continue;
      }
      if (!entry.isFile()) continue;
      if (owners.has(entry.name)) {
        throw new Error(
          `发现跨构建作业产物文件名冲突: ${entry.name}（同时存在于 ${owners.get(entry.name)} 与 ${bucketName || srcDir}），已中止以防覆盖损坏`,
        );
      }
      owners.set(entry.name, bucketName || srcDir);
      copyFileSync(full, join(dir, entry.name));
      count++;
    }
  };

  walk(collectFrom, '');
  return { collected: count };
}

function parseArgs(argv) {
  let dir = 'dist';
  let expectedVersion = '';
  let collectFrom = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) dir = argv[++i];
    else if (argv[i] === '--version' && argv[i + 1]) expectedVersion = argv[++i];
    else if (argv[i] === '--collect-from' && argv[i + 1]) collectFrom = argv[++i];
  }
  return { dir, expectedVersion, collectFrom };
}

export { collectArtifacts, mergeWinManifests, parseWinManifest };

const isEntry = process.argv[1]
  && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isEntry) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.collectFrom) {
    const col = collectArtifacts({ collectFrom: opts.collectFrom, dir: opts.dir });
    console.log(`[merge-win-yml] 已收集 ${col.collected} 个构建产物至 ${opts.dir}（零文件名冲突）`);
  }
  const res = mergeWinManifests(opts);
  if (res.merged) {
    console.log(`[merge-win-yml] 已合并生成 ${res.outPath} (version=${res.version}, files=${res.fileCount})`);
  } else {
    console.log(`[merge-win-yml] 跳过合并 (${res.reason})`);
  }
}
