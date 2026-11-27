#!/usr/bin/env node
/**
 * scripts/release/publish-gitlab.mjs —— 把 dist/ 构建产物与 CHANGELOG 发布到 GitLab Generic Package（latest/）并创建 Release。
 *
 * 发布策略（先传后清 + 清单最后切换）：
 *   1. 前置校验：检查 VERSION、release-body.md、CHANGELOG、安装包列表与 latest.yml 版本号一致；
 *   2. 上传优先：先上传全部安装包，再上传 latest*.yml 与 CHANGELOG（作为元数据切换开关）；
 *      使用 curl + 长超时与低速断开保护，规避 Node undici 对 >100MB PUT 触发 UND_ERR_HEADERS_TIMEOUT；
 *   3. 分页校验：确认 latest 包内全部上传文件可见且大小一致；
 *   4. 清理旧文件与旧版本包：按 file id 倒序仅保留最新一条，删除过期文件与非 latest 包；
 *   5. 匿名下载抽检：无 token 校验 latest.yml / CHANGELOG / 安装包 Range 下载可用；
 *   6. 清理旧 Release 链接并幂等重建当前 tag Release（链接按 release-assets.mjs 排序）。
 *
 * 用法：
 *   node scripts/release/publish-gitlab.mjs                  # dry-run（默认）：校验本地目录并打印计划，不写远端
 *   node scripts/release/publish-gitlab.mjs --apply          # 真正发布（需要 GITLAB_TOKEN）
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLinkableAsset, sortAssetNames } from './release-assets.mjs';
import { parseWinManifest } from './merge-win-yml.mjs';

const DEFAULT_API = 'https://jx.7fa4.cn:9080/api/v4/projects/886';
const DEFAULT_REF = 'master';
const DEFAULT_PACKAGE = '7FA4-Chat';
const FILE_EXTS = ['.exe', '.zip', '.appimage', '.deb', '.dmg', '.yml', '.apk'];
const REQUEST_TIMEOUT_MS = 60_000;
const REQUEST_ATTEMPTS = 4;
const UPLOAD_MAX_TIME_SEC = 1800;
const UPLOAD_ATTEMPTS = 4;
const UPLOAD_CONCURRENCY = Math.max(1, Number(process.env.GITLAB_UPLOAD_CONCURRENCY || 3) || 3);

const log = (msg) => console.log(`[gitlab] ${msg}`);
const warn = (msg) => console.log(`::warning::[gitlab] ${String(msg).replace(/\r?\n/g, ' ')}`);
const die = (msg) => { throw new Error(msg); };
const isOk = (status) => status >= 200 && status < 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function brief(data) {
  if (data === null || data === undefined) return '';
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function parseManifestVersion(text) {
  const m = /^version:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(text || '');
  return m ? m[1].trim() : '';
}

function isMetadataFile(name) {
  const lower = String(name).toLowerCase();
  return lower === 'changelog' || lower === 'changelog.md' || lower.endsWith('.yml') || lower.endsWith('.yaml');
}

function orderUploads(items) {
  const installers = items.filter((item) => !isMetadataFile(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const metadata = items.filter((item) => isMetadataFile(item.name))
    .sort((a, b) => {
      // latest.yml 与 CHANGELOG 放最末，作为网站与自动更新的切换开关
      const rank = (n) => {
        const l = n.toLowerCase();
        if (l === 'changelog' || l === 'changelog.md') return 3;
        if (l === 'latest.yml') return 2;
        return 1;
      };
      const ra = rank(a.name);
      const rb = rank(b.name);
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name, 'en');
    });
  return { installers, metadata, ordered: [...installers, ...metadata] };
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    api: String(process.env.GITLAB_API || DEFAULT_API),
    ref: String(process.env.GITLAB_REF || DEFAULT_REF),
    packageName: String(process.env.PACKAGE_NAME || DEFAULT_PACKAGE),
    version: String(process.env.VERSION || ''),
    distDir: String(process.env.DIST_DIR || 'dist'),
    changelogFile: String(process.env.CHANGELOG_FILE || 'CHANGELOG'),
    releaseBodyFile: String(process.env.RELEASE_BODY_FILE || 'release-body.md'),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v) die(`${arg} 后缺少参数值`);
      return v;
    };
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--api') opts.api = next();
    else if (arg === '--ref') opts.ref = next();
    else if (arg === '--package') opts.packageName = next();
    else if (arg === '--version') opts.version = next();
    else if (arg === '--dist') opts.distDir = next();
    else if (arg === '--changelog') opts.changelogFile = next();
    else if (arg === '--body') opts.releaseBodyFile = next();
    else if (arg === '-h' || arg === '--help') {
      console.log('用法: node scripts/release/publish-gitlab.mjs [--apply] [--dry-run] [--version <ver>] [--dist <dir>] [--changelog <file>] [--body <file>]');
      process.exit(0);
    } else {
      die(`未知参数: ${arg}`);
    }
  }
  opts.api = opts.api.trim().replace(/\/+$/, '');
  opts.version = opts.version.trim().replace(/^v/i, '');
  return opts;
}

function sha512FileSync(filePath) {
  const hash = createHash('sha512');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(filePath, 'r');
  try {
    let bytesRead = 0;
    while ((bytesRead = readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('base64');
}

function verifyManifestChecksums(distDir, metadata, installers) {
  const installerByName = new Map(installers.map((it) => [it.name, it]));
  const hashCache = new Map();
  const getSha512 = (fileName, fullPath) => {
    if (!hashCache.has(fileName)) {
      hashCache.set(fileName, sha512FileSync(fullPath));
    }
    return hashCache.get(fileName);
  };

  for (const meta of metadata) {
    if (!meta.name.toLowerCase().endsWith('.yml')) continue;
    const raw = readFileSync(meta.path, 'utf8');
    let parsed;
    try {
      parsed = parseWinManifest(raw, meta.name);
    } catch {
      continue;
    }

    const targets = [...(parsed.files || [])];
    if (parsed.path && parsed.sha512) {
      targets.push({ url: parsed.path, sha512: parsed.sha512 });
    }

    for (const entry of targets) {
      const targetName = entry?.url;
      if (!targetName) continue;
      const diskItem = installerByName.get(targetName);
      const fullPath = diskItem ? diskItem.path : join(distDir, targetName);
      if (!existsSync(fullPath)) {
        die(`${meta.name} 引用的安装包 ${targetName} 在 ${distDir} 中缺失`);
      }
      const actualSize = statSync(fullPath).size;
      if (typeof entry.size === 'number' && entry.size !== actualSize) {
        die(`${meta.name} 记录的 ${targetName} 大小 (${entry.size}) 与磁盘文件 (${actualSize}) 不一致，拒绝发布`);
      }
      if (entry.sha512) {
        const actualSha512 = getSha512(targetName, fullPath);
        if (actualSha512 !== entry.sha512) {
          die(`${meta.name} 记录的 ${targetName} sha512 与磁盘文件不一致，拒绝发布`);
        }
      }
    }
  }
}

function collectReleaseUploads({ version, distDir, changelogFile, releaseBodyFile }) {
  if (!version) die('缺少 VERSION（应由 tag 去掉 v 或 --version 传入）');
  if (!existsSync(releaseBodyFile)) die(`Release 正文文件不存在: ${releaseBodyFile}`);
  const releaseBody = readFileSync(releaseBodyFile, 'utf8').trim();
  if (!releaseBody) die(`Release 正文为空: ${releaseBodyFile}`);
  if (!existsSync(changelogFile)) die(`更新日志文件不存在: ${changelogFile}（客户端「更新日志」依赖 latest/CHANGELOG）`);
  if (!existsSync(distDir)) die(`构建产物目录不存在: ${distDir}`);

  const artifactFiles = readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => name !== 'builder-debug.yml')
    .filter((name) => FILE_EXTS.some((ext) => name.toLowerCase().endsWith(ext)));

  const items = artifactFiles.map((name) => ({
    name,
    path: join(distDir, name),
    size: statSync(join(distDir, name)).size,
  }));
  const changelogName = basename(changelogFile);
  if (!items.some((item) => item.name === changelogName)) {
    items.push({
      name: changelogName,
      path: changelogFile,
      size: statSync(changelogFile).size,
    });
  }

  const { installers, metadata, ordered } = orderUploads(items);
  if (installers.length === 0) die(`${distDir} 下没有可上传的安装包文件`);

  for (const meta of metadata) {
    if (!meta.name.toLowerCase().endsWith('.yml')) continue;
    const ymlVersion = parseManifestVersion(readFileSync(meta.path, 'utf8'));
    if (ymlVersion && ymlVersion !== version) {
      die(`${meta.name} 版本 (${ymlVersion}) 与发布版本 (${version}) 不一致，拒绝上传`);
    }
  }

  verifyManifestChecksums(distDir, metadata, installers);

  return { releaseBody, installers, metadata, ordered };
}

async function request(apiBase, token, method, path, { body, headers, auth = true, skipBody = false } = {}) {
  const url = path.startsWith('http') ? path : `${apiBase}${path}`;
  const reqHeaders = { Connection: 'close', ...(headers || {}) };
  if (auth && token) reqHeaders['PRIVATE-TOKEN'] = token;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        body,
        headers: reqHeaders,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < REQUEST_ATTEMPTS) {
        await res.body?.cancel().catch(() => {});
        await sleep(1500 * (2 ** (attempt - 1)));
        continue;
      }
      if (skipBody) {
        await res.body?.cancel().catch(() => {});
        return { status: res.status, headers: res.headers, text: '', data: null };
      }
      const text = await res.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      return { status: res.status, headers: res.headers, text, data };
    } catch (e) {
      const code = e.cause?.code || e.code || e.name || e.message;
      if (attempt < REQUEST_ATTEMPTS) {
        warn(`${method} ${url} 第 ${attempt}/${REQUEST_ATTEMPTS} 次异常 (${code})，重试中…`);
        await sleep(1500 * (2 ** (attempt - 1)));
        continue;
      }
      throw new Error(`${method} ${url} 请求异常: ${code}`);
    }
  }
}

async function paginate(apiBase, token, pathPrefix) {
  const results = [];
  const sep = pathPrefix.includes('?') ? '&' : '?';
  let page = 1;
  for (let guard = 0; guard < 1000; guard++) {
    const res = await request(apiBase, token, 'GET', `${pathPrefix}${sep}per_page=100&page=${page}`);
    if (res.status !== 200) {
      throw new Error(`GET ${pathPrefix} 第 ${page} 页失败: HTTP ${res.status} ${brief(res.data)}`);
    }
    if (!Array.isArray(res.data)) {
      throw new Error(`GET ${pathPrefix} 响应不是数组: ${brief(res.data)}`);
    }
    results.push(...res.data);
    const next = Number(res.headers.get('x-next-page') || 0);
    if (!next || next <= page) break;
    page = next;
  }
  return results;
}

function runCurlPut(args) {
  return new Promise((resolvePromise) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < 4096) stderr += chunk; });
    child.on('error', (error) => resolvePromise({ error, stdout, stderr }));
    child.on('close', (status) => resolvePromise({ error: null, status, stdout, stderr }));
  });
}

async function uploadWithCurl(targetUrl, token, item) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'gl-put-'));
  const respFile = join(tmpDir, 'resp.txt');
  const sizeMb = (item.size / 1024 / 1024).toFixed(1);
  try {
    let lastErr = '';
    for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
      log(`  开始上传 ${item.name}（${sizeMb} MB，尝试 ${attempt}/${UPLOAD_ATTEMPTS}）…`);
      const startedAt = Date.now();
      const heartbeat = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        log(`  …仍在上传 ${item.name}（已耗时 ${elapsed}s）`);
      }, 60_000);
      heartbeat.unref?.();

      let res;
      try {
        res = await runCurlPut([
          '-sS', '-L', '--http1.1', '-X', 'PUT', targetUrl,
          '-H', `PRIVATE-TOKEN: ${token}`,
          '-H', 'content-type: application/octet-stream',
          '-H', 'Expect:',
          '-T', item.path,
          '--connect-timeout', '30',
          '--speed-limit', '10240',
          '--speed-time', '120',
          '--max-time', String(UPLOAD_MAX_TIME_SEC),
          '-o', respFile,
          '-w', '%{http_code} %{speed_upload} %{time_total}',
        ]);
      } finally {
        clearInterval(heartbeat);
      }

      const [codeStr = '0', speedStr = '0', timeStr = '0'] = String(res.stdout || '').trim().split(/\s+/);
      const code = Number(codeStr || 0);
      if (!res.error && code >= 200 && code < 300) {
        const mbps = (Number(speedStr) / 1024 / 1024).toFixed(2);
        return { code, detail: `${mbps} MB/s, ${Number(timeStr).toFixed(1)}s` };
      }
      const bodySnippet = existsSync(respFile) ? readFileSync(respFile, 'utf8').trim().slice(0, 200) : '';
      lastErr = res.error
        ? res.error.message
        : `HTTP ${code || '?'} ${bodySnippet} ${String(res.stderr || '').trim().slice(0, 200)}`.trim();
      log(`  上传 ${item.name} 第 ${attempt}/${UPLOAD_ATTEMPTS} 次失败：${lastErr}`);
      if (attempt < UPLOAD_ATTEMPTS) {
        const waitSec = 5 * (2 ** (attempt - 1));
        await sleep(waitSec * 1000);
      }
    }
    die(`上传 ${item.name} 失败（${lastErr}）——线上旧包未被删除，仍可正常下载`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runWithConcurrency(items, concurrency, fn) {
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await fn(items[idx]);
      }
    }),
  );
}

async function verifyAnonymousDownloads(latestUrl, version, installers, metadata) {
  // 重试几轮等待 GitLab 包索引短暂传播
  const check = async (name, headers, validate, { skipBody = false } = {}) => {
    const url = `${latestUrl}/${encodeURIComponent(name)}`;
    let lastErr = '';
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await request('', '', 'GET', url, { headers, auth: false, skipBody });
      if (res.status === 200 || res.status === 206) {
        const err = validate(res);
        if (!err) return;
        lastErr = err;
      } else {
        lastErr = `HTTP ${res.status}`;
      }
      if (attempt < 5) await sleep(1500);
    }
    die(`匿名校验 ${name} 失败：${lastErr}`);
  };

  if (metadata.some((m) => m.name === 'latest.yml')) {
    await check('latest.yml', { 'Cache-Control': 'no-cache' }, (res) => {
      const remoteVer = parseManifestVersion(res.text);
      return remoteVer === version ? '' : `版本不符（线上 ${remoteVer || '?'}，期望 ${version}）`;
    });
    log(`  匿名校验 latest.yml OK（version=${version}）`);
  }

  if (metadata.some((m) => m.name === 'CHANGELOG')) {
    await check('CHANGELOG', { 'Cache-Control': 'no-cache' }, (res) => {
      const ok = res.text.includes(`## ${version}`) || res.text.includes(`## v${version}`);
      return ok ? '' : `未包含 ## ${version} 段落`;
    });
    log(`  匿名校验 CHANGELOG OK（含 ## ${version}）`);
  }

  const sample = installers[0];
  await check(sample.name, { Range: 'bytes=0-1023' }, () => '', { skipBody: true });
  log(`  匿名校验 Range GET ${sample.name} OK`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const TOKEN = process.env.GITLAB_TOKEN || '';
  const TAG = `v${opts.version}`;
  const PACKAGE_URL = `${opts.api}/packages/generic/${encodeURIComponent(opts.packageName)}`;
  const LATEST_URL = `${PACKAGE_URL}/latest`;

  const { releaseBody, installers, metadata, ordered } = collectReleaseUploads(opts);
  const linkableNames = sortAssetNames(ordered.map((x) => x.name).filter(isLinkableAsset));

  log(`版本 ${opts.version}（${opts.apply ? 'APPLY' : 'DRY-RUN'}）→ ${LATEST_URL}/`);
  log(`计划上传 ${ordered.length} 个文件（安装包 ${installers.length} 个优先，元数据 ${metadata.length} 个压轴）：`);
  for (const item of ordered) {
    const role = isMetadataFile(item.name) ? 'meta' : 'inst';
    log(`  [${role}] ${(item.size / 1024 / 1024).toFixed(2).padStart(6)} MB  ${item.name}`);
  }
  log(`Release 资源链接顺序（${linkableNames.length} 个）：${linkableNames.join(' | ')}`);

  if (!opts.apply) {
    log('DRY-RUN 完成，未改动 GitLab');
    return;
  }
  if (!TOKEN) die('缺少 GITLAB_TOKEN');

  // 0. 校验 token 有效（避免传到一半才发现无权限）
  const apiRoot = opts.api.replace(/\/projects\/.*$/, '');
  const who = await request(apiRoot, TOKEN, 'GET', '/user');
  if (who.status !== 200) die(`GITLAB_TOKEN 校验失败: HTTP ${who.status} ${brief(who.data)}`);
  log(`Token 有效（用户：${who.data?.username || 'unknown'}）`);

  // 1. 先并发上传全部安装包（concurrency=3），再顺序上传元数据（latest*.yml / CHANGELOG 最后切换）
  await runWithConcurrency(installers, UPLOAD_CONCURRENCY, async (item) => {
    const target = `${LATEST_URL}/${encodeURIComponent(item.name)}`;
    const { code, detail } = await uploadWithCurl(target, TOKEN, item);
    log(`  上传 ${item.name}（${(item.size / 1024 / 1024).toFixed(1)} MB）-> HTTP ${code}（${detail}）`);
  });
  for (const item of metadata) {
    const target = `${LATEST_URL}/${encodeURIComponent(item.name)}`;
    const { code, detail } = await uploadWithCurl(target, TOKEN, item);
    log(`  上传 ${item.name}（${(item.size / 1024 / 1024).toFixed(1)} MB）-> HTTP ${code}（${detail}）`);
  }

  // 2. 分页校验 latest 包内全部上传文件可见且大小一致
  const pkgs = await paginate(opts.api, TOKEN, `/packages?package_name=${encodeURIComponent(opts.packageName)}&package_type=generic`);
  const latestPkg = pkgs.find((p) => p.version === 'latest');
  if (!latestPkg) die('上传后仍未找到 version=latest 的包，中止清理');

  const onlineFiles = await paginate(opts.api, TOKEN, `/packages/${latestPkg.id}/package_files`);
  const newestByName = new Map();
  for (const file of onlineFiles) {
    const prev = newestByName.get(file.file_name);
    if (!prev || (file.id || 0) > (prev.id || 0)) newestByName.set(file.file_name, file);
  }

  const missing = [];
  const sizeMismatch = [];
  for (const item of ordered) {
    const remote = newestByName.get(item.name);
    if (!remote) missing.push(item.name);
    else if (typeof remote.size === 'number' && remote.size !== item.size) {
      sizeMismatch.push(`${item.name}(远端${remote.size}/本地${item.size})`);
    }
  }
  if (missing.length) die(`上传校验失败，缺少文件：${missing.join(', ')}（旧文件未清理）`);
  if (sizeMismatch.length) die(`上传校验失败，文件大小不一致：${sizeMismatch.join(', ')}（旧文件未清理）`);
  log(`上传校验通过：latest 包（id=${latestPkg.id}）内 ${ordered.length} 个文件全部可见且大小一致`);

  // 3. 清理旧文件与同名历史条目（id 倒序保留最新）+ 删除旧版本包
  const keepNames = new Set(ordered.map((x) => x.name));
  const sortedOnline = [...onlineFiles].sort((a, b) => (b.id || 0) - (a.id || 0));
  const seen = new Set();
  for (const file of sortedOnline) {
    const isStale = !keepNames.has(file.file_name);
    const isDup = keepNames.has(file.file_name) && seen.has(file.file_name);
    if (keepNames.has(file.file_name)) seen.add(file.file_name);
    if (!isStale && !isDup) continue;
    const removed = await request(opts.api, TOKEN, 'DELETE', `/packages/${latestPkg.id}/package_files/${file.id}`);
    if (isOk(removed.status) || removed.status === 404) {
      log(`  已清理${isStale ? '旧文件' : '重复条目'} ${file.file_name}（id=${file.id}）`);
    } else {
      warn(`清理 ${file.file_name}（id=${file.id}）失败 HTTP ${removed.status}`);
    }
  }

  for (const pkg of pkgs) {
    if (pkg.version === 'latest' || pkg.id === latestPkg.id) continue;
    const removed = await request(opts.api, TOKEN, 'DELETE', `/packages/${pkg.id}`);
    if (isOk(removed.status) || removed.status === 404) {
      log(`  已删除旧版本包 id=${pkg.id} version=${pkg.version}`);
    } else {
      warn(`删除旧版本包 id=${pkg.id} 失败 HTTP ${removed.status}`);
    }
  }

  // 4. 匿名下载抽检
  await verifyAnonymousDownloads(LATEST_URL, opts.version, installers, metadata);

  // 5. 清除所有已有 Release 资源链接，再幂等重建本版本 Release
  const releases = await paginate(opts.api, TOKEN, '/releases');
  let deletedLinks = 0;
  for (const release of releases) {
    for (const link of release.assets?.links || []) {
      const deleted = await request(
        opts.api,
        TOKEN,
        'DELETE',
        `/releases/${encodeURIComponent(release.tag_name)}/assets/links/${link.id}`,
      );
      if (isOk(deleted.status) || deleted.status === 404) deletedLinks++;
      else warn(`删除 ${release.tag_name} 资源链接 id=${link.id} 失败 HTTP ${deleted.status}`);
    }
  }
  log(`旧 Release 资源链接清理完成：扫描 ${releases.length} 个 Release，清理 ${deletedLinks} 个链接`);

  const encodedTag = encodeURIComponent(TAG);
  const existing = await request(opts.api, TOKEN, 'GET', `/releases/${encodedTag}`);
  if (existing.status === 200) {
    const deleted = await request(opts.api, TOKEN, 'DELETE', `/releases/${encodedTag}`);
    if (!isOk(deleted.status) && deleted.status !== 404) {
      die(`删除已有 Release ${TAG} 失败: HTTP ${deleted.status} ${brief(deleted.data)}`);
    }
    log(`已删除已有 Release ${TAG}，将重新创建`);
  } else if (existing.status !== 404) {
    die(`查询 Release ${TAG} 失败: HTTP ${existing.status} ${brief(existing.data)}`);
  }

  const links = linkableNames.map((name) => ({
    name,
    url: `${LATEST_URL}/${encodeURIComponent(name)}`,
    link_type: 'package',
  }));
  const created = await request(opts.api, TOKEN, 'POST', '/releases', {
    body: JSON.stringify({
      tag_name: TAG,
      name: `${opts.packageName} v${opts.version}`,
      description: releaseBody,
      ref: opts.ref,
      // GitLab 按创建时间倒序展示链接，逆序提交让页面显示为正序
      assets: { links: [...links].reverse() },
    }),
    headers: { 'content-type': 'application/json' },
  });
  if (created.status !== 201) die(`创建 Release ${TAG} 失败: HTTP ${created.status} ${brief(created.data)}`);
  log(`GitLab 发布完成：${created.data?.web_url || TAG}（资源链接 ${created.data?.assets?.links?.length || 0} 个）`);
}

export { isMetadataFile, orderUploads, parseManifestVersion, collectReleaseUploads, verifyManifestChecksums };

const isEntry = process.argv[1]
  && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (isEntry) {
  main().catch((error) => {
    console.log(`::error::[gitlab] 发布失败：${String(error?.message || error).replace(/\r?\n/g, ' ')}`);
    process.exit(1);
  });
}
