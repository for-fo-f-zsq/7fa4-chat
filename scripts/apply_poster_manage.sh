#!/bin/bash
# 海报「已通过」管理：下架 / 彻底删除 / 置顶（幂等）
#   1) server.js：posterPublicItem 与管理员列表下发 pinned
#   2) server.js：handlePosters 改为「置顶优先」排序；?random=1 优先在置顶中抽取
#   3) server.js：/api/admin/posters/review 动作集扩展为 approve|reject|pin|unpin|delete
# 用法：bash apply_poster_manage.sh
set -e

cd /home/ubuntu/website-api

python3 <<'PYEOF'
import io, os, shutil

F = 'server.js'
src = io.open(F, encoding='utf-8').read()

if "'unpin'" in src:
    print('server.js already patched, skip')
    raise SystemExit(0)

edits = []

# ---------- 1) 头部注释：补充管理动作 ----------
edits.append(('header',
"""// GET  /api/admin/posters    ：管理员按 status 查看（含投稿人 uid）
// POST /api/admin/posters/review：管理员 通过 / 拒绝""",
"""// GET  /api/admin/posters    ：管理员按 status 查看（含投稿人 uid / 置顶标记）
// POST /api/admin/posters/review：管理员 通过 / 拒绝(下架) / 置顶(pin|unpin) / 彻底删除(delete)
// pinned：置顶海报在公开列表排最前，且开屏随机时优先从置顶中抽取。"""))

# ---------- 2) posterPublicItem 下发 pinned ----------
edits.append(('posterPublicItem',
"""    ctime: rec.created_at || 0,
  };
}""",
"""    ctime: rec.created_at || 0,
    pinned: !!rec.pinned,
  };
}"""))

# ---------- 3) handlePosters：置顶优先 ----------
edits.append(('handlePosters',
"""// GET /api/posters[?random=1]：只列已通过审核的
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
}""",
"""// 置顶优先，其次按投稿时间倒序
function posterSort(a, b) {
  const pa = a.pinned ? 1 : 0;
  const pb = b.pinned ? 1 : 0;
  if (pa !== pb) return pb - pa;
  return (b.created_at || 0) - (a.created_at || 0);
}

// GET /api/posters[?random=1]：只列已通过审核的
function handlePosters(req, res) {
  const q = parseQuery(req);
  const all = posterApproved();
  if (q.random === '1') {
    if (!all.length) return sendJSON(res, 200, { success: true, item: null });
    // 开屏：存在置顶海报时只在置顶中随机，否则在全部已通过中随机
    const pinned = all.filter((r) => r.pinned);
    const pool = pinned.length ? pinned : all;
    return sendJSON(res, 200, { success: true, item: posterPublicItem(pool[Math.floor(Math.random() * pool.length)]) });
  }
  const items = all.sort(posterSort).slice(0, POSTER_LIST_MAX).map(posterPublicItem);
  sendJSON(res, 200, { success: true, items });
}"""))

# ---------- 4) 管理员列表下发 pinned ----------
edits.append(('admin list',
"""      reviewed_at: r.reviewed_at || 0,
      ip: r.ip || '',
      url: '/api/posters/' + r.id + '.' + r.ext,""",
"""      reviewed_at: r.reviewed_at || 0,
      pinned: !!r.pinned,
      ip: r.ip || '',
      url: '/api/posters/' + r.id + '.' + r.ext,"""))

# ---------- 5) review 动作集扩展 ----------
edits.append(('review',
"""// POST /api/admin/posters/review { id, action: 'approve' | 'reject' }
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
}""",
"""// POST /api/admin/posters/review { id, action }
//   action ∈ approve | reject(下架) | pin | unpin | delete
//   reject 只改 status（图片保留，可在「已拒绝」页签重新通过）；只有 delete 才真正移除文件与记录。
const POSTER_ACTIONS = ['approve', 'reject', 'pin', 'unpin', 'delete'];

async function handleAdminPosterReview(req, res) {
  if (!adminInfo(req).admin) return sendJSON(res, 401, { error: 'admin only' });
  let body = '';
  try { body = await readBody(req, 8192); } catch { return sendJSON(res, 400, { error: 'bad body' }); }
  let data;
  try { data = JSON.parse(body || '{}'); } catch { return sendJSON(res, 400, { error: 'bad json' }); }
  const id = Number(data.id);
  const action = String(data.action || '');
  if (!id || POSTER_ACTIONS.indexOf(action) < 0) return sendJSON(res, 400, { error: 'bad params' });
  const store = loadPosters();
  const rec = store.items[String(id)];
  if (!rec) return sendJSON(res, 404, { error: 'not found' });
  // 彻底删除：先删记录再删文件（文件缺失不报错）；seq 不回退，保证 id 永不复用
  if (action === 'delete') {
    const ext = rec.ext;
    delete store.items[String(id)];
    savePosters(store);
    try { fs.unlinkSync(POSTER_DIR + '/' + id + '.' + ext); } catch {}
    return sendJSON(res, 200, { ok: true, id, deleted: true });
  }
  if (action === 'pin' || action === 'unpin') {
    rec.pinned = action === 'pin';
    savePosters(store);
    return sendJSON(res, 200, { ok: true, id, pinned: rec.pinned });
  }
  rec.status = action === 'approve' ? 'approved' : 'rejected';
  rec.reviewed_at = Date.now();
  savePosters(store);
  sendJSON(res, 200, { ok: true, id, status: rec.status });
}"""))

for name, old, new in edits:
    if new in src:
        print('skip (already applied):', name)
        continue
    assert old in src, 'anchor missing: ' + name
    assert src.count(old) == 1, 'anchor not unique: ' + name
    src = src.replace(old, new, 1)
    print('patched:', name)

bak = F + '.bak-manage'
if not os.path.exists(bak):
    shutil.copy2(F, bak)
io.open(F, 'w', encoding='utf-8').write(src)
print('server.js written')
PYEOF

# 语法校验失败自动回滚（set -e 下用 if 包裹，避免直接退出）
if node --check server.js; then
  echo 'server.js syntax ok'
else
  echo 'SYNTAX ERROR -> rollback'
  cp -f server.js.bak-manage server.js
  exit 1
fi

pm2 restart website-api >/dev/null 2>&1
sleep 1

echo '--- health: 公开列表 ---'
curl -s -o /dev/null -w 'status=%{http_code}\n' -H 'Host: chat.forfof.cloud' http://127.0.0.1:8090/api/posters
curl -s -H 'Host: chat.forfof.cloud' http://127.0.0.1:8090/api/posters
echo
echo '--- health: 随机（pinned 字段应存在）---'
curl -s -H 'Host: chat.forfof.cloud' 'http://127.0.0.1:8090/api/posters?random=1'
echo
echo '--- 管理员接口未授权应 401 ---'
curl -s -o /dev/null -w 'admin list=%{http_code}\n' -H 'Host: chat.forfof.cloud' 'http://127.0.0.1:8090/api/admin/posters?status=approved'
echo '--- 非法 action 应 400（未授权时先 401）---'
curl -s -o /dev/null -w 'bad action=%{http_code}\n' -X POST -H 'Host: chat.forfof.cloud' -H 'Content-Type: application/json' -d '{"id":1,"action":"nope"}' http://127.0.0.1:8090/api/admin/posters/review
