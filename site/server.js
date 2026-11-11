'use strict';

/**
 * 7FA4 Chat 官网服务端
 *
 * 职责：
 *   1) 托管静态站点（public/）
 *   2) 服务端代理 GitLab（前端不再直连 :9080）
 *      - GET /api/downloads   聚合最新版本的平台/架构/体积/校验值
 *      - GET /api/changelog   代理仓库里的 CHANGELOG（Markdown 原文）
 *      - GET /api/sponsors    代理仓库里的 assets/sponsors.json
 *      - GET /api/donate-qr   代理仓库里的 assets/donate-qr.jpg
 *      - GET /dl/<filename>   流式转发 GitLab generic package（支持 Range）
 *      - GET /healthz         健康检查
 *
 * 依赖：仅 Node 内置模块（Node >= 18，线上为 v20.5.1）。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const feedback = require('./feedback');

const PORT = Number(process.env.PORT || 5300);
const HOST = process.env.HOST || '127.0.0.1';
const GITLAB = (process.env.GITLAB_BASE || 'http://127.0.0.1:9081').replace(/\/+$/, '');
const PROJECT = process.env.GITLAB_PROJECT || '886';
const PKG_NAME = process.env.PKG_NAME || '7FA4-Chat';
const PKG_VERSION = process.env.PKG_VERSION || 'latest';
const PUBLIC_DIR = path.join(__dirname, 'public');

// 只允许转发形如 7FA4-Chat-3.8.0-x64.exe 的包文件，杜绝任意路径/SSRF。
const DOWNLOAD_RE = /^7FA4-Chat-[0-9A-Za-z._-]+\.(?:exe|zip|dmg|deb|AppImage|apk)$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  // 网页版（/7fa4-chat/web/）带的资料库：加密后的用户名表，浏览器自己解密
  '.7c': 'application/octet-stream'
};

/* ---------------------------------------------------------------- 缓存 */

const cache = new Map(); // key -> { t: number, v: any }

async function cached(key, ttlMs, producer) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < ttlMs) return hit.v;
  const value = await producer();
  cache.set(key, { t: now, v: value });
  return value;
}

/* ------------------------------------------------------------ GitLab 访问 */

function genericUrl(file) {
  return (
    `${GITLAB}/api/v4/projects/${PROJECT}/packages/generic/` +
    `${encodeURIComponent(PKG_NAME)}/${encodeURIComponent(PKG_VERSION)}/${encodeURIComponent(file)}`
  );
}

function rawFileUrl(filePath) {
  return `${GITLAB}/api/v4/projects/${PROJECT}/repository/files/${encodeURIComponent(filePath)}/raw?ref=master`;
}

async function glFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'User-Agent': '7fa4-chat-site/1.0', ...(options.headers || {}) }
  });
  return res;
}

async function glJson(url) {
  const res = await glFetch(url);
  if (!res.ok) throw new Error(`GitLab ${res.status} for ${url}`);
  return res.json();
}

async function glText(url) {
  const res = await glFetch(url);
  if (!res.ok) throw new Error(`GitLab ${res.status} for ${url}`);
  return res.text();
}

/* --------------------------------------------------------- 下载清单聚合 */

const PLATFORM_LABELS = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android'
};

const ARCH_LABELS = {
  x64: 'x64',
  arm64: 'arm64',
  x86_64: 'x86_64',
  amd64: 'amd64',
  universal: '通用'
};

// 面向用户的推荐下载（顺序即展示顺序）
const RECOMMENDED = [
  { file: (v) => `7FA4-Chat-${v}-x64.exe`, platform: 'windows', arch: 'x64', kind: 'installer', primary: true },
  { file: (v) => `7FA4-Chat-${v}-arm64.exe`, platform: 'windows', arch: 'arm64', kind: 'installer' },
  { file: (v) => `7FA4-Chat-${v}-x64.zip`, platform: 'windows', arch: 'x64', kind: 'archive' },
  { file: (v) => `7FA4-Chat-${v}-arm64.zip`, platform: 'windows', arch: 'arm64', kind: 'archive' },
  { file: (v) => `7FA4-Chat-${v}-x64.dmg`, platform: 'macos', arch: 'x64', kind: 'dmg', primary: true },
  { file: (v) => `7FA4-Chat-${v}-arm64.dmg`, platform: 'macos', arch: 'arm64', kind: 'dmg' },
  { file: (v) => `7FA4-Chat-${v}-x86_64.AppImage`, platform: 'linux', arch: 'x86_64', kind: 'appimage', primary: true },
  { file: (v) => `7FA4-Chat-${v}-arm64.AppImage`, platform: 'linux', arch: 'arm64', kind: 'appimage' },
  { file: (v) => `7FA4-Chat-${v}-amd64.deb`, platform: 'linux', arch: 'amd64', kind: 'deb' },
  { file: (v) => `7FA4-Chat-${v}-arm64.deb`, platform: 'linux', arch: 'arm64', kind: 'deb' },
  { file: (v) => `7FA4-Chat-${v}-android.apk`, platform: 'android', arch: 'universal', kind: 'apk', primary: true }
];

const KIND_LABELS = {
  installer: '安装包',
  archive: '压缩包',
  dmg: '磁盘映像',
  appimage: 'AppImage',
  deb: 'deb 包',
  apk: 'APK'
};

function parseManifestVersion(text) {
  const m = /^version:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(text || '');
  return m ? m[1].trim() : null;
}

function parseManifestDate(text) {
  const m = /^releaseDate:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(text || '');
  return m ? m[1].trim() : null;
}

async function resolvePackage() {
  const url =
    `${GITLAB}/api/v4/projects/${PROJECT}/packages?package_name=${encodeURIComponent(PKG_NAME)}` +
    `&per_page=100&order_by=created_at&sort=desc`;
  const list = await glJson(url);
  if (!Array.isArray(list) || list.length === 0) throw new Error('未找到 generic package');
  const pkg = list.find((p) => p.version === PKG_VERSION) || list[0];
  const files = await glJson(
    `${GITLAB}/api/v4/projects/${PROJECT}/packages/${pkg.id}/package_files?per_page=100`
  );
  return { pkg, files };
}

async function buildDownloads() {
  const { pkg, files } = await resolvePackage();
  const byName = new Map(files.map((f) => [f.file_name, f]));

  // 版本号以 electron-updater 的 latest.yml 为准（与客户端自动更新完全一致）
  let version = null;
  let releaseDate = null;
  try {
    const yml = await glText(genericUrl('latest.yml'));
    version = parseManifestVersion(yml);
    releaseDate = parseManifestDate(yml);
  } catch (e) {
    /* 回退：从文件名推断 */
  }
  if (!version) {
    const anyExe = files.map((f) => f.file_name).find((n) => /^7FA4-Chat-.+-x64\.exe$/.test(n));
    version = anyExe ? anyExe.replace(/^7FA4-Chat-/, '').replace(/-x64\.exe$/, '') : PKG_VERSION;
  }

  const items = [];
  for (const rule of RECOMMENDED) {
    const name = rule.file(version);
    const meta = byName.get(name);
    if (!meta) continue;
    items.push({
      file: name,
      platform: rule.platform,
      platformLabel: PLATFORM_LABELS[rule.platform] || rule.platform,
      arch: rule.arch,
      archLabel: ARCH_LABELS[rule.arch] || rule.arch,
      kind: rule.kind,
      kindLabel: KIND_LABELS[rule.kind] || rule.kind,
      primary: !!rule.primary,
      size: meta.size,
      sha256: meta.file_sha256 || null,
      url: `dl/${encodeURIComponent(name)}`
    });
  }

  return {
    name: PKG_NAME,
    version,
    releaseDate,
    packageId: pkg.id,
    generatedAt: new Date().toISOString(),
    items
  };
}

/* -------------------------------------------------------------- 静态文件 */

function safeStaticPath(urlPath, baseDir = PUBLIC_DIR) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (e) {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rel = decoded === '/' ? '/index.html' : decoded;
  const abs = path.normalize(path.join(baseDir, rel));
  if (!abs.startsWith(baseDir + path.sep) && abs !== baseDir) return null;
  return abs;
}

// 网页版（7fa4-chat 的 renderer 单独构建产物）：
// Caddy 那层是 `handle_path /7fa4-chat/*`，到这里的请求路径已经**去掉** /7fa4-chat 前缀，
// 所以对外 /7fa4-chat/web/xxx == 这里 /web/xxx。没有 history 路由，但保留 SPA 兜底：
// 静态文件不存在时回 index.html（避免以后加了路由就 404）。
// 优先读 public/web/；若未同步，则自动兜底回仓库根目录 out/web/。
function getWebDir() {
  const p = path.join(PUBLIC_DIR, 'web');
  if (fs.existsSync(p)) return p;
  const outWeb = path.join(__dirname, '..', 'out', 'web');
  if (fs.existsSync(outWeb)) return outWeb;
  return p;
}

function serveWeb(req, res, pathname) {
  const webDir = getWebDir();
  const rest = pathname.slice('/web'.length) || '/';
  if (rest === '/') {
    serveStatic(req, res, path.join(webDir, 'index.html'));
    return;
  }
  const abs = safeStaticPath(rest, webDir);
  if (!abs) {
    sendText(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    return;
  }
  fs.stat(abs, (err, st) => {
    if (!err && st.isFile()) {
      serveStatic(req, res, abs);
      return;
    }
    // 带扩展名的当成资源，找不到就 404（不能回 index.html，否则浏览器会把 HTML 当 JS/CSS 解析）
    if (path.extname(rest)) {
      sendText(res, 404, 'Not Found', 'text/plain; charset=utf-8');
      return;
    }
    // 其余当 SPA 路由，回 index.html（未部署 history 路由也安全）
    serveStatic(req, res, path.join(webDir, 'index.html'));
  });
}

function sendJson(res, status, payload, extraHeaders) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...(extraHeaders || {})
  });
  res.end(body);
}

function sendText(res, status, text, contentType, extraHeaders) {
  const body = Buffer.from(text);
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    ...(extraHeaders || {})
  });
  res.end(body);
}

function serveStatic(req, res, absPath) {
  fs.stat(absPath, (err, st) => {
    if (err || !st.isFile()) {
      sendText(res, 404, 'Not Found', 'text/plain; charset=utf-8');
      return;
    }
    const ext = path.extname(absPath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=86400'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(absPath).pipe(res);
  });
}

/* --------------------------------------------------------- 下载流式转发 */

async function proxyDownload(req, res, fileName) {
  const headers = {};
  if (req.headers.range) headers.range = req.headers.range;

  let upstream;
  try {
    upstream = await glFetch(genericUrl(fileName), {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers
    });
  } catch (e) {
    sendJson(res, 502, { error: 'upstream_unreachable' });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    sendJson(res, upstream.status === 404 ? 404 : 502, { error: 'upstream_error' });
    return;
  }

  const outHeaders = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600'
  };
  const len = upstream.headers.get('content-length');
  const range = upstream.headers.get('content-range');
  if (len) outHeaders['Content-Length'] = len;
  if (range) outHeaders['Content-Range'] = range;

  res.writeHead(upstream.status === 206 ? 206 : 200, outHeaders);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = Readable.fromWeb(upstream.body);
  stream.on('error', () => res.destroy());
  stream.pipe(res);

  res.on('close', () => {
    if (!res.writableEnded) stream.destroy();
  });
}

/* -------------------------------------------------------------- 路由分发 */

async function handleApi(req, res, pathname) {
  if (pathname === '/api/downloads') {
    try {
      const data = await cached('downloads', 30_000, buildDownloads);
      sendJson(res, 200, data, { 'Cache-Control': 'public, max-age=30' });
    } catch (e) {
      sendJson(res, 502, { error: 'gitlab_unavailable', message: String(e.message || e) });
    }
    return;
  }

  if (pathname === '/api/changelog') {
    try {
      const text = await cached('changelog', 30_000, async () => {
        try {
          const remoteText = await glText(genericUrl('CHANGELOG'));
          // If remote package already contains 3.8.3, return it
          if (remoteText && remoteText.includes('## 3.8.3')) {
            return remoteText;
          }
          // Otherwise fallback to local CHANGELOG if available
          const localChangelog = path.join(__dirname, 'CHANGELOG');
          if (fs.existsSync(localChangelog)) {
            return fs.readFileSync(localChangelog, 'utf8');
          }
          return remoteText;
        } catch (glErr) {
          const localChangelog = path.join(__dirname, 'CHANGELOG');
          if (fs.existsSync(localChangelog)) {
            return fs.readFileSync(localChangelog, 'utf8');
          }
          throw glErr;
        }
      });
      sendText(res, 200, text, 'text/markdown; charset=utf-8', { 'Cache-Control': 'public, max-age=30' });
    } catch (e) {
      sendJson(res, 502, { error: 'gitlab_unavailable' });
    }
    return;
  }

  if (pathname === '/api/sponsors') {
    try {
      const text = await cached('sponsors', 300_000, () => glText(rawFileUrl('assets/sponsors.json')));
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        parsed = { list: [] };
      }
      sendJson(res, 200, parsed);
    } catch (e) {
      sendJson(res, 502, { error: 'gitlab_unavailable' });
    }
    return;
  }

  if (pathname === '/api/donate-qr') {
    let upstream;
    try {
      upstream = await glFetch(rawFileUrl('assets/donate-qr.jpg'));
    } catch (e) {
      sendJson(res, 502, { error: 'upstream_unreachable' });
      return;
    }
    if (!upstream.ok || !upstream.body) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(buf);
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    sendText(res, 400, 'Bad Request', 'text/plain; charset=utf-8');
    return;
  }

  // 反馈系统自带 POST / 表单提交，须在方法白名单之前分流；其余路由仍然只读。
  try {
    if (await feedback.handle(req, res, pathname)) return;
  } catch (e) {
    console.error('[feedback]', req.method, req.url, e && e.stack ? e.stack : e);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
    else res.destroy();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8');
    return;
  }

  try {
    if (pathname === '/healthz') {
      sendText(res, 200, 'ok', 'text/plain; charset=utf-8');
      return;
    }

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }

    if (pathname.startsWith('/dl/')) {
      const name = decodeURIComponent(pathname.slice('/dl/'.length));
      if (!DOWNLOAD_RE.test(name)) {
        sendJson(res, 400, { error: 'invalid_filename' });
        return;
      }
      await proxyDownload(req, res, name);
      return;
    }

    // 网页版聊天：/7fa4-chat/web/（Caddy handle_path 已剥掉 /7fa4-chat 前缀；
    // 用相对重定向 web/ 保证反代子路径下变成 /7fa4-chat/web/ 而非跳回根 /web/）
    if (pathname === '/web') {
      const qIdx = (req.url || '').indexOf('?');
      const qs = qIdx >= 0 ? req.url.slice(qIdx) : '';
      res.writeHead(308, { Location: 'web/' + qs });
      res.end();
      return;
    }
    if (pathname.startsWith('/web/')) {
      serveWeb(req, res, pathname);
      return;
    }

    const abs = safeStaticPath(pathname);
    if (!abs) {
      sendText(res, 404, 'Not Found', 'text/plain; charset=utf-8');
      return;
    }
    serveStatic(req, res, abs);
  } catch (e) {
    console.error('[error]', req.method, req.url, e && e.stack ? e.stack : e);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[7fa4-chat-site] listening on http://${HOST}:${PORT} (gitlab=${GITLAB}, project=${PROJECT})`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
