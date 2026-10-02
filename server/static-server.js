'use strict';
// ============================================================
// 静态资源伺服（官网 / + 管理后台 /dev）
//
// 目标：把原先交给 nginx 的静态文件读取收进 Node 进程，实现「一个进程管全站」。
//
// 安全要点（自己实现静态服务必须防的几件事）：
//  - **路径穿越**：`..%2f..%2fetc%2fpasswd` 之类必须挡住。做法是 decode 后规范化，
//    再确认最终路径仍在根目录内（用 path.resolve + 前缀比较，而非字符串 replace）。
//  - **符号链接逃逸**：realpath 后再校验一次前缀。
//  - 只允许白名单扩展名，避免误放 .env / .json 等敏感文件（config.json 在 api 目录外，天然隔离）。
// ============================================================
const fs = require('fs');
const path = require('path');

// 扩展名 → MIME。未列出的一律拒绝（而非猜测），避免意外暴露。
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function mimeOf(ext) {
  return MIME[String(ext || '').toLowerCase()] || '';
}

/**
 * 把请求路径安全地解析为磁盘上的绝对路径。
 * @returns {{ok:true, file:string, ext:string} | {ok:false, reason:string}}
 */
function resolveSafe(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(urlPath || '/').split('?')[0].split('#')[0]);
  } catch {
    return { ok: false, reason: 'bad_encoding' };
  }
  // 去掉开头斜杠，交给 path.resolve 处理（它能正确处理 .. 与 .）
  const rel = decoded.replace(/^\/+/, '');
  const rootAbs = path.resolve(root);
  const target = path.resolve(rootAbs, rel);

  // 关键校验：解析后的路径必须仍在 root 之内（含 root 自身）
  if (target !== rootAbs && !target.startsWith(rootAbs + path.sep)) {
    return { ok: false, reason: 'traversal' };
  }

  let stat;
  try { stat = fs.statSync(target); } catch { return { ok: false, reason: 'not_found' }; }

  let finalPath = target;
  if (stat.isDirectory()) {
    finalPath = path.join(target, 'index.html');
    try { stat = fs.statSync(finalPath); } catch { return { ok: false, reason: 'no_index' }; }
  }
  if (!stat.isFile()) return { ok: false, reason: 'not_file' };

  // 防符号链接逃逸：realpath 后复核前缀
  try {
    const real = fs.realpathSync(finalPath);
    if (real !== rootAbs && !real.startsWith(rootAbs + path.sep)) {
      return { ok: false, reason: 'symlink_escape' };
    }
    finalPath = real;
  } catch { return { ok: false, reason: 'not_found' }; }

  const ext = path.extname(finalPath).toLowerCase();
  return { ok: true, file: finalPath, ext };
}

/**
 * 伺服一个文件。返回 true 表示已处理。
 */
function serve(req, res, root, urlPath, opts = {}) {
  const r = resolveSafe(root, urlPath);
  if (!r.ok) return false;

  const mime = mimeOf(r.ext);
  if (!mime) return false; // 扩展名不在白名单 → 交给上层继续匹配（最终 404）

  let stat;
  try { stat = fs.statSync(r.file); } catch { return false; }

  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  const headers = {
    'Content-Type': mime,
    'ETag': etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  };

  // 缓存策略（判定顺序很重要）：
  //   ① 带内容 hash 的产物（main-a1b2c3d4.js）内容不可变 → 长缓存，命中率最高；
  //   ② 其余 HTML/JS 逻辑常变 → no-cache，避免浏览器/CDN 拿到旧版导致 Mixed Content 等问题；
  //   ③ 其他静态资源 → 短缓存。
  // ⚠️ 必须先判 hash——否则 .js 会先落进 ② 的 no-cache 分支，hash 资源永远拿不到长缓存。
  const isHashedAsset = /[.-][0-9a-f]{8,}\.(js|css|woff2?|ttf|png|jpe?g|svg|webp)$/i.test(r.file);
  if (isHashedAsset) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else if (r.ext === '.html' || r.ext === '.js' || r.ext === '.mjs') {
    headers['Cache-Control'] = 'no-cache';
  } else {
    headers['Cache-Control'] = opts.cacheControl || 'public, max-age=3600';
  }

  // 条件请求：命中则 304，省带宽
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  const method = req.method;
  if (method === 'HEAD') {
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    res.end();
    return true;
  }
  if (method !== 'GET') return false;

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  fs.createReadStream(r.file).pipe(res);
  return true;
}

/** SPA 回退：任意未命中的路径返回 index.html（供前端路由接管） */
function serveIndex(res, root, indexRel = 'index.html') {
  const file = path.join(root, indexRel);
  if (!fs.existsSync(file)) return false;
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

module.exports = { MIME, mimeOf, resolveSafe, serve, serveIndex };
