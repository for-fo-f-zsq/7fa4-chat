#!/bin/bash
# 海报功能服务端补丁（幂等）
# 目标：/home/ubuntu/website-api/server.js
#   1) 常量：POSTER_*（投稿目录 / 元数据文件 / AES 密钥 / 防重放 / 限频 / 大小 / mime 映射）
#   2) loadPosters / savePosters（原子写，与 loadRecords/saveRecords 同构）
#   3) 5 个 handler：公开列表(?random=1) / 取图 / 投稿 / 管理员列表 / 管理员审核
#   4) 路由表追加 5 条
#   5) mkdir posters/ + node --check + pm2 restart website-api
# 用法：bash apply_posters.sh
set -e

cd /home/ubuntu/website-api
[ -f server.js.bak-posters ] || cp server.js server.js.bak-posters

python3 <<'PYEOF'
path = 'server.js'
src = open(path, encoding='utf-8').read()

if 'POSTER_PASSPHRASE' in src:
    print('already patched, skip')
    raise SystemExit(0)

# ---------- 1) 常量：挂在 lastPhotoUid 之后 ----------
anchor_const = "const lastPhotoUid = {};"
assert anchor_const in src, 'anchor_const missing'
consts = r"""

// ===== 海报（客户端投稿 → /dev 审核 → 公开）=====
// POST /api/posters          ：AES 载荷投稿（与照片同构，独立密钥）→ posters/<id>.<ext> + posters.json(status=pending)
// GET  /api/posters          ：仅返回 status=approved 的元数据（?random=1 取单条随机）
// GET  /api/posters/<id>.<ext>：图片字节；approved 公开可缓存，其余仅管理员可见
// GET  /api/admin/posters    ：管理员按 status 查看（含投稿人 uid）
// POST /api/admin/posters/review：管理员 通过 / 拒绝
// 隐私：公开接口不下发 uid / ip / 投稿时间明细；投稿人信息仅管理员可见。
const POSTER_DIR = __dirname + '/posters';
const POSTERS_FILE = __dirname + '/posters.json';
const POSTER_PASSPHRASE = '7fa4-chat::poster::v1';
const POSTER_MAX_AGE = 5 * 60 * 1000;                    // 防重放窗口
const POSTER_MIN_INTERVAL = 60 * 1000;                   // 同 uid 限频（仅防刷兜底，不是配额）
const POSTER_MAX_SIZE = 2 * 1024 * 1024;                 // 解码后图片字节上限
// 载荷是「图片 base64 → 整体 AES 加密后再 base64」两层，体积放大 ≈1.78 倍，
// 故请求体上限必须显著高于图片上限，才能让下面 POSTER_MAX_SIZE 的校验成为真正的闸门
// （否则会先被 nginx 拦成 HTML 413，客户端拿不到结构化的错误信息）。
const POSTER_BODY_MAX = 4 * 1024 * 1024;                 // 请求体上限（与 nginx client_max_body_size 4m 对齐）
const POSTER_LIST_MAX = 200;                             // 公开列表最多返回条数
const POSTER_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const POSTER_EXT_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const lastPosterUid = {};
"""
src = src.replace(anchor_const, anchor_const + consts, 1)

# ---------- 2) loadPosters / savePosters：插在 readBody 之前 ----------
anchor_readbody = "function readBody(req, limit = 8192) {"
assert anchor_readbody in src, 'anchor_readbody missing'
loaders = r"""function loadPosters() {
  try {
    const d = JSON.parse(fs.readFileSync(POSTERS_FILE, 'utf8'));
    return { seq: Number(d.seq) || 0, items: (d.items && typeof d.items === 'object') ? d.items : {} };
  } catch { return { seq: 0, items: {} }; }
}
function savePosters(data) {
  try {
    const tmp = POSTERS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, POSTERS_FILE);
  } catch (e) { console.error('[poster] save failed:', e.message); }
}
"""
src = src.replace(anchor_readbody, loaders + anchor_readbody, 1)

# ---------- 3) handlers：插在「管理员凭据判断」注释之前 ----------
anchor_handlers = "// 管理员凭据判断：由会话 Cookie（HMAC 签名）决定"
assert anchor_handlers in src, 'anchor_handlers missing'
handlers = r"""// ===== 海报（投稿 / 公开列表 / 取图 / 审核）=====
function decryptPosterPayload(str) {
  const p = JSON.parse(str);
  if (p.v !== 1) throw new Error('bad version');
  const key = crypto.createHash('sha256').update(POSTER_PASSPHRASE).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(p.tag, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(p.data, 'base64')), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// 投稿人 IP：仅落盘供管理员追责，绝不出现在公开接口
function clientIP(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || String((req.socket && req.socket.remoteAddress) || '');
}

// 公开可见的海报元数据：只有 id / 图片地址 / 尺寸 / 时间；不含 uid、不含 IP
function posterPublicItem(rec) {
  return {
    id: rec.id,
    url: '/api/posters/' + rec.id + '.' + rec.ext,
    w: rec.w || 0,
    h: rec.h || 0,
    ctime: rec.created_at || 0,
  };
}

function posterApproved() {
  return Object.values(loadPosters().items).filter(
    (r) => r && r.status === 'approved' && POSTER_EXT_MIME[r.ext]
  );
}

function posterCounts() {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const r of Object.values(loadPosters().items)) {
    if (r && c[r.status] !== undefined) c[r.status]++;
  }
  return c;
}

// GET /api/posters[?random=1]：只列已通过审核的
function handlePosters(req, res) {
  const q = parseQuery(req);
  const all = posterApproved();
  if (q.random === '1') {
    if (!all.length) return sendJSON(res, 200, { success: true, item: null });
    return sendJSON(res, 200, { success: true, item: posterPublicItem(all[Math.floor(Math.random() * all.length)]) });
  }
  const items = all
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, POSTER_LIST_MAX)
    .map(posterPublicItem);
  sendJSON(res, 200, { success: true, items });
}

// GET /api/posters/<id>.<ext>：已通过的公开且可缓存；未通过仅管理员可见、不缓存
function handlePosterFile(req, res, id, ext) {
  const mime = POSTER_EXT_MIME[ext];
  if (!mime) return sendJSON(res, 404, { error: 'not found' });
  const rec = loadPosters().items[String(id)];
  if (!rec || rec.ext !== ext) return sendJSON(res, 404, { error: 'not found' });
  const isPublic = rec.status === 'approved';
  if (!isPublic && !adminInfo(req).admin) return sendJSON(res, 404, { error: 'not found' });
  let buf;
  try { buf = fs.readFileSync(POSTER_DIR + '/' + id + '.' + ext); }
  catch { return sendJSON(res, 404, { error: 'not found' }); }
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': buf.length,
    'Cache-Control': isPublic ? 'public, max-age=86400' : 'no-store',
  });
  res.end(buf);
}

// POST /api/posters：客户端加密投稿，落盘为 pending，待 /dev 审核
async function handlePosterUpload(req, res) {
  let body = '';
  try { body = await readBody(req, POSTER_BODY_MAX); }
  catch { return sendJSON(res, 413, { error: 'too large' }); }
  let info;
  try { info = decryptPosterPayload(body); }
  catch { return sendJSON(res, 400, { error: 'bad payload' }); }
  const uid = Number(info.uid);
  if (!uid || !Number.isInteger(uid) || uid <= 0) return sendJSON(res, 400, { error: 'invalid uid' });
  const ts = Number(info.date);
  if (!ts || Math.abs(Date.now() - ts) > POSTER_MAX_AGE) return sendJSON(res, 401, { error: 'stale' });
  const now = Date.now();
  if (lastPosterUid[uid] && now - lastPosterUid[uid] < POSTER_MIN_INTERVAL) {
    return sendJSON(res, 429, { error: 'rate limited' });
  }
  const buf = Buffer.from(String(info.data || ''), 'base64');
  if (!buf.length || buf.length > POSTER_MAX_SIZE) return sendJSON(res, 400, { error: 'bad image' });
  const ext = POSTER_MIME_EXT[String(info.mime || '').toLowerCase()];
  if (!ext) return sendJSON(res, 400, { error: 'unsupported mime' });

  const store = loadPosters();
  const id = (Number(store.seq) || 0) + 1;
  try {
    fs.mkdirSync(POSTER_DIR, { recursive: true });
    const tmp = POSTER_DIR + '/' + id + '.' + ext + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, POSTER_DIR + '/' + id + '.' + ext);
  } catch (e) {
    console.error('[poster] save failed:', e.message);
    return sendJSON(res, 500, { error: 'save failed' });
  }
  store.seq = id;
  store.items[String(id)] = {
    id,
    uid,
    ext,
    mime: String(info.mime || '').toLowerCase(),
    size: buf.length,
    w: Number(info.w) > 0 ? Math.round(Number(info.w)) : 0,
    h: Number(info.h) > 0 ? Math.round(Number(info.h)) : 0,
    status: 'pending',
    created_at: now,
    reviewed_at: 0,
    ip: clientIP(req),
  };
  savePosters(store);
  lastPosterUid[uid] = now;
  sendJSON(res, 200, { ok: true, id });
}

// GET /api/admin/posters?status=pending|approved|rejected|all
function handleAdminPosterList(req, res) {
  if (!adminInfo(req).admin) return sendJSON(res, 401, { error: 'admin only' });
  const q = parseQuery(req);
  const want = String(q.status || 'pending');
  const items = Object.values(loadPosters().items)
    .filter((r) => r && (want === 'all' || r.status === want))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .map((r) => ({
      id: r.id,
      uid: r.uid,
      ext: r.ext,
      size: r.size || 0,
      w: r.w || 0,
      h: r.h || 0,
      status: r.status,
      created_at: r.created_at || 0,
      reviewed_at: r.reviewed_at || 0,
      ip: r.ip || '',
      url: '/api/posters/' + r.id + '.' + r.ext,
    }));
  sendJSON(res, 200, { success: true, status: want, items, counts: posterCounts() });
}

// POST /api/admin/posters/review { id, action: 'approve' | 'reject' }
async function handleAdminPosterReview(req, res) {
  if (!adminInfo(req).admin) return sendJSON(res, 401, { error: 'admin only' });
  let body = '';
  try { body = await readBody(req, 8192); } catch { return sendJSON(res, 400, { error: 'bad body' }); }
  let data;
  try { data = JSON.parse(body || '{}'); } catch { return sendJSON(res, 400, { error: 'bad json' }); }
  const id = Number(data.id);
  const action = String(data.action || '');
  if (!id || (action !== 'approve' && action !== 'reject')) return sendJSON(res, 400, { error: 'bad params' });
  const store = loadPosters();
  const rec = store.items[String(id)];
  if (!rec) return sendJSON(res, 404, { error: 'not found' });
  rec.status = action === 'approve' ? 'approved' : 'rejected';
  rec.reviewed_at = Date.now();
  savePosters(store);
  sendJSON(res, 200, { ok: true, id, status: rec.status });
}

"""
src = src.replace(anchor_handlers, handlers + anchor_handlers, 1)

# ---------- 4) 路由表：追加在赞助路由之后 ----------
anchor_route = "  { method: 'GET', test: (p) => p === '/api/sponsors', handler: handleSponsors },"
assert anchor_route in src, 'anchor_route missing'
routes = anchor_route + r"""
  // 海报：公开列表（?random=1 取单条）/ 图片字节 / 客户端投稿 / 管理员审核
  { method: 'GET', test: (p) => p === '/api/posters', handler: handlePosters },
  {
    method: 'GET',
    test: (p) => /^\/api\/posters\/\d+\.(jpg|png|webp)$/.test(p),
    handler: (req, res) => {
      const m = /^\/api\/posters\/(\d+)\.(jpg|png|webp)$/.exec((req.url || '').split('?')[0]);
      return handlePosterFile(req, res, Number(m[1]), m[2]);
    },
  },
  { method: 'POST', test: (p) => p === '/api/posters', handler: handlePosterUpload },
  { method: 'GET', test: (p) => p === '/api/admin/posters', handler: handleAdminPosterList },
  { method: 'POST', test: (p) => p === '/api/admin/posters/review', handler: handleAdminPosterReview },"""
src = src.replace(anchor_route, routes, 1)

open(path, 'w', encoding='utf-8').write(src)
print('patched server.js ok')
PYEOF

# 建目录 + 语法校验（失败自动回滚，避免 pm2 起不来）
mkdir -p posters
if ! node --check server.js; then
  echo 'ERROR: node --check failed, rolling back'
  cp server.js.bak-posters server.js
  exit 1
fi
echo 'node --check ok'

pm2 restart website-api >/dev/null 2>&1 || pm2 restart website-api
sleep 1
echo "--- health ---"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/api/health
echo "--- public list (should be success:true, items:[]) ---"
curl -s http://127.0.0.1:8090/api/posters
echo
echo "--- admin list anonymous (should be 401 admin only) ---"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/api/admin/posters
