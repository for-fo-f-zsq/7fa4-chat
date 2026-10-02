#!/usr/bin/env node
/* 服务端补丁：海报「署名」+「已通过」排序（默认按通过时间正序 + 拖拽调序）
 *
 * 幂等：重复执行不会二次插入（以 PATCH_MARK 标记探测）。
 * server.js 改动前后都会备份为 server.js.bak-sign，node --check 失败自动回滚。
 *
 * 变更点：
 *  1. posterAuthor(uid)：从 visit-records.json 解析「昵称（真实姓名）」，只下发名字，不下发 uid/IP。
 *  2. posterPublicItem()：加 author 字段（署名）。
 *  3. 新增 sort_at 字段：手动调序用；posterSort 改为
 *       置顶优先 → sort_at 升序（有手动序）→ reviewed_at 升序（通过时间，旧的在前）→ id 升序
 *  4. handleAdminPosterList：下发 author 与 sort_at。
 *  5. review 动作集加 'reorder'：把 {id, before} 重新落到 sort_at（服务端统一编号，稳、幂等）。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET = process.argv[2] || '/home/ubuntu/website-api/server.js';
const MARK = '// [patch:poster-author-sort]';

let src = fs.readFileSync(TARGET, 'utf8');

if (src.includes(MARK)) {
  console.log('已打过补丁，跳过（幂等）。');
  process.exit(0);
}

const backup = TARGET + '.bak-sign';
fs.copyFileSync(TARGET, backup);
console.log('已备份 →', backup);

function must(oldStr, name) {
  if (!src.includes(oldStr)) {
    console.error('\n[失败] 找不到锚点：' + name);
    console.error('---- 期望片段 ----\n' + oldStr.slice(0, 400));
    process.exit(1);
  }
}
function rep(oldStr, newStr, name) {
  must(oldStr, name);
  src = src.replace(oldStr, newStr);
  console.log('  ✓ ' + name);
}

// ---------- 1. 署名解析 + 排序键 ----------
const ANCHOR_PUBLIC = `// 投稿人 IP：仅落盘供管理员追责，绝不出现在公开接口
function clientIP(req) {`;

const NEW_AUTHOR = `${MARK}
// 投稿人署名（公开接口只下发名字字符串，不下发 uid / IP）。
// 取自 visit-records.json（客户端上报的白名单字段）：优先「昵称（真实姓名）」，
// 缺昵称则只用真实姓名；两者皆无回落到 "UID <id>"，保证署名位永远有内容。
let _authorCache = null;
let _authorCacheAt = 0;
function posterAuthorName(uid) {
  const id = Number(uid);
  if (!id) return '';
  const now = Date.now();
  // 30s 缓存：调序/审核期间会高频调用，避免反复读盘
  if (!_authorCache || now - _authorCacheAt > 30000) {
    _authorCache = loadRecords() || {};
    _authorCacheAt = now;
  }
  const recs = _authorCache;
  // 记录库既可能是 { "<uid>": {...} } 也可能是数组
  let rec = null;
  if (Array.isArray(recs)) rec = recs.find((r) => Number(r && r.uid) === id);
  else if (recs && typeof recs === 'object') rec = recs[String(id)] || null;
  if (!rec) {
    // 兼容：有些落盘是按 uid 为键的对象，值里未必再带 uid
    rec = (recs && typeof recs === 'object' && !Array.isArray(recs)) ? recs[String(id)] : null;
  }
  if (!rec) return 'UID ' + id;
  const nick = String(rec.nickname || '').trim();
  const real = String(rec.realname || '').trim();
  if (nick && real) return nick + '（' + real + '）';
  if (real) return real;
  if (nick) return nick;
  return 'UID ' + id;
}

// 投稿人 IP：仅落盘供管理员追责，绝不出现在公开接口
function clientIP(req) {`;

rep(ANCHOR_PUBLIC, NEW_AUTHOR, 'posterAuthorName() + 署名缓存');

// ---------- 2. posterPublicItem 加 author ----------
rep(
  `function posterPublicItem(rec) {
  return {
    id: rec.id,
    url: '/api/posters/' + rec.id + '.' + rec.ext,
    w: rec.w || 0,
    h: rec.h || 0,
    ctime: rec.created_at || 0,
    pinned: !!rec.pinned,
  };
}`,
  `function posterPublicItem(rec) {
  return {
    id: rec.id,
    url: '/api/posters/' + rec.id + '.' + rec.ext,
    w: rec.w || 0,
    h: rec.h || 0,
    ctime: rec.created_at || 0,
    pinned: !!rec.pinned,
    author: posterAuthorName(rec.uid),
  };
}`,
  'posterPublicItem() 增加 author'
);

// ---------- 3. posterSort 改为「通过时间正序 + 手动序」 ----------
rep(
  `// 置顶优先，其次按投稿时间倒序
function posterSort(a, b) {
  const pa = a.pinned ? 1 : 0;
  const pb = b.pinned ? 1 : 0;
  if (pa !== pb) return pb - pa;
  return (b.created_at || 0) - (a.created_at || 0);
}`,
  `// 海报展示排序：
//   ① 置顶优先
//   ② 有手动序（sort_at）的按 sort_at 升序 —— /dev 拖拽调序写入
//   ③ 否则按「通过时间」升序（旧的在前），未审核的回落投稿时间
//   ④ 最后按 id 升序兜底，保证排序稳定（同样输入永远同样输出）
function posterSort(a, b) {
  const pa = a.pinned ? 1 : 0;
  const pb = b.pinned ? 1 : 0;
  if (pa !== pb) return pb - pa;
  const sa = Number(a.sort_at) || 0;
  const sb = Number(b.sort_at) || 0;
  const ha = sa > 0, hb = sb > 0;
  if (ha && hb) return sa - sb;
  if (ha !== hb) return ha ? -1 : 1;   // 手动排过序的排在未排过的前面
  const ta = a.reviewed_at || a.created_at || 0;
  const tb = b.reviewed_at || b.created_at || 0;
  if (ta !== tb) return ta - tb;
  return (a.id || 0) - (b.id || 0);
}`,
  'posterSort() 改为通过时间正序 + 手动序'
);

// ---------- 4. 管理员列表下发 author / sort_at ----------
rep(
  `      pinned: !!r.pinned,
      ip: r.ip || '',
      url: '/api/posters/' + r.id + '.' + r.ext,
    }));`,
  `      pinned: !!r.pinned,
      sort_at: Number(r.sort_at) || 0,
      author: posterAuthorName(r.uid),
      ip: r.ip || '',
      url: '/api/posters/' + r.id + '.' + r.ext,
    }));`,
  'handleAdminPosterList() 下发 author / sort_at'
);

// ---------- 5. 管理员列表：已通过按展示顺序返回 ----------
rep(
  `  const items = Object.values(loadPosters().items)
    .filter((r) => r && (want === 'all' || r.status === want))
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))`,
  `  const items = Object.values(loadPosters().items)
    .filter((r) => r && (want === 'all' || r.status === want))
    // 「已发布」页签必须与真实展示顺序一致（manual sort_at → 通过时间正序），
    // 否则拖拽调序时所见非所得。其余页签仍按投稿时间倒序（最新投稿在最上）。
    .sort(want === 'approved' || want === 'all' ? posterSort : (a, b) => (b.created_at || 0) - (a.created_at || 0))`,
  'handleAdminPosterList() 已发布页签按展示顺序'
);

// ---------- 6. review 动作集加 reorder ----------
rep(
  `const POSTER_ACTIONS = ['approve', 'reject', 'pin', 'unpin', 'delete'];`,
  `const POSTER_ACTIONS = ['approve', 'reject', 'pin', 'unpin', 'delete', 'reorder'];
// 无需指向具体某条记录的动作（reset 整表重排）——这些动作允许 id=0
const POSTER_ACTIONS_NO_ID = ['reorder'];`,
  'POSTER_ACTIONS 增加 reorder'
);

// ---------- 6b. id 校验：reorder 作用于整表，允许 id=0 ----------
rep(
  `  const id = Number(data.id);
  const action = String(data.action || '');
  if (!id || POSTER_ACTIONS.indexOf(action) < 0) return sendJSON(res, 400, { error: 'bad params' });
  const store = loadPosters();`,
  `  const id = Number(data.id);
  const action = String(data.action || '');
  if (POSTER_ACTIONS.indexOf(action) < 0) return sendJSON(res, 400, { error: 'bad params' });
  // reorder 作用于整表（支持 reset 全部），不要求指向具体记录；其余动作必须带合法 id
  if (POSTER_ACTIONS_NO_ID.indexOf(action) < 0 && !id) return sendJSON(res, 400, { error: 'bad params' });
  const store = loadPosters();`,
  'handleAdminPosterReview() id 校验放宽（reorder 允许 id=0）'
);

// ---------- 7. reorder 处理（放在 rec 查找之前 —— reorder 作用于整表，不针对某条记录） ----------
rep(
  `  const store = loadPosters();
  const rec = store.items[String(id)];
  if (!rec) return sendJSON(res, 404, { error: 'not found' });`,
  `  const store = loadPosters();
  // 拖拽调序：客户端传「完整顺序的 id 列表」（order 数组），服务端统一按序编号写 sort_at。
  // 传整表而非「把 A 移到 B 前」：避免并发/丢包造成顺序错乱，天然幂等。
  // reset=true 时清空全部 sort_at，回到「置顶优先 + 通过时间正序」的默认顺序。
  if (action === 'reorder') {
    if (data.reset) {
      let cleared = 0;
      for (const r3 of Object.values(store.items)) {
        if (r3 && r3.sort_at) { r3.sort_at = 0; cleared++; }
      }
      savePosters(store);
      return sendJSON(res, 200, { ok: true, reset: true, cleared });
    }
    const order = Array.isArray(data.order) ? data.order.map(Number).filter((n) => n > 0) : [];
    if (!order.length) return sendJSON(res, 400, { error: 'bad order' });
    if (order.length > 1000) return sendJSON(res, 400, { error: 'too many' });
    let n = 0;
    for (const oid of order) {
      const r2 = store.items[String(oid)];
      if (r2) r2.sort_at = ++n;
    }
    savePosters(store);
    return sendJSON(res, 200, { ok: true, reordered: n });
  }
  const rec = store.items[String(id)];
  if (!rec) return sendJSON(res, 404, { error: 'not found' });`,
  'handleAdminPosterReview() reorder 移至 rec 查找前'
);

// ---------- 8. 投稿落盘时初始化 sort_at ----------
rep(
  `    status: 'pending',
    created_at: now,
    reviewed_at: 0,
    ip: clientIP(req),
  };`,
  `    status: 'pending',
    created_at: now,
    reviewed_at: 0,
    sort_at: 0,
    ip: clientIP(req),
  };`,
  'handlePosterUpload() 初始化 sort_at'
);

fs.writeFileSync(TARGET, src);

try {
  execSync(`node --check ${JSON.stringify(TARGET)}`, { stdio: 'pipe' });
  console.log('\n✅ node --check 通过，server.js 已更新');
} catch (e) {
  fs.copyFileSync(backup, TARGET);
  console.error('\n❌ node --check 失败，已回滚！\n', e.stderr ? e.stderr.toString() : e.message);
  process.exit(1);
}
