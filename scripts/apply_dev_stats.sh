#!/bin/bash
# website-api /info 升级：按天活跃统计（days 字段 + GET stats 聚合）（幂等）
set -e
cd /home/ubuntu/website-api
[ -f server.js.bak-stats ] || cp server.js server.js.bak-stats

python3 <<'PYEOF'
import re
path = 'server.js'
src = open(path, encoding='utf-8').read()
if 'buildStats' in src and 'days' in src:
    print('already has stats, skip')
    raise SystemExit(0)

# 1) 函数区：在 lastVisitUid 行后插入 buildStats
fn = '''
function buildStats(recs) {
  const list = Object.values(recs);
  const daily = {};
  for (const r of list) {
    let days = r.days && typeof r.days === 'object' ? r.days : {};
    // 老数据（无 days）：用 last_seen 所在日期兜底补 1 天
    if (!Object.keys(days).length && r.last_seen) {
      days = { [new Date(r.last_seen + 8 * 3600 * 1000).toISOString().slice(0, 10)]: 1 };
    }
    for (const d of Object.keys(days)) daily[d] = (daily[d] || 0) + 1;
  }
  const seq = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
    seq.push({ date: d, active: daily[d] || 0 });
  }
  return { total_users: list.length, daily_active: daily, last_30_days: seq };
}
'''
anchor_fn = "const lastVisitUid = {}; // uid -> 上次接受时间戳（内存态，服务重启清零）"
assert anchor_fn in src, 'anchor_fn missing'
src = src.replace(anchor_fn, anchor_fn + "\n" + fn, 1)

# 2) POST 分支：写入 days[今天]=1
old_post = '''        const clean = (v, max) => (v === undefined || v === null ? '' : String(v).slice(0, max));
        const recs = loadRecords();
        recs[keyUid] = {
          uid,
          username: clean(info.username, 64),
          nickname: clean(info.nickname, 64),
          realname: clean(info.realname, 64),
          school: clean(info.school, 64),
          seat: clean(info.seat, 64),
          last_seen: now,
          first_seen: recs[keyUid]?.first_seen || now,
        };
        saveRecords(recs);'''
new_post = '''        const clean = (v, max) => (v === undefined || v === null ? '' : String(v).slice(0, max));
        const today = new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10); // 北京时间日期
        const recs = loadRecords();
        const prev = recs[keyUid] || {};
        recs[keyUid] = {
          uid,
          username: clean(info.username, 64),
          nickname: clean(info.nickname, 64),
          realname: clean(info.realname, 64),
          school: clean(info.school, 64),
          seat: clean(info.seat, 64),
          last_seen: now,
          first_seen: prev.first_seen || now,
          days: (prev.days && typeof prev.days === 'object') ? prev.days : {},
        };
        recs[keyUid].days[today] = 1; // 当天活跃标记
        saveRecords(recs);'''
assert old_post in src, 'old_post missing'
src = src.replace(old_post, new_post, 1)

# 3) GET 分支：返回 stats 聚合
old_get = '''      res.end(JSON.stringify({ total: list.length, records: list }));'''
new_get = '''      res.end(JSON.stringify({ total: list.length, stats: buildStats(recs), records: list }));'''
assert old_get in src, 'old_get missing'
src = src.replace(old_get, new_get, 1)

open(path, 'w', encoding='utf-8').write(src)
print('server.js stats patch applied')
PYEOF

# nginx：/dev 目录 no-cache（分析页数据实时，避免 html 被缓存 7 天）
sudo python3 <<'PYEOF'
NGINX_CONF = '/etc/nginx/sites-enabled/website'
src = open(NGINX_CONF, encoding='utf-8').read()
if "location ^~ /dev" in src:
    print('nginx /dev already patched, skip')
    raise SystemExit(0)
anchor = '''    location / {
        try_files $uri $uri/ /index.html;
    }'''
block = '''
    # 分析页 /dev：数据实时，禁止缓存
    location ^~ /dev/ {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }'''
assert anchor in src, 'nginx anchor missing'
src = src.replace(anchor, block, 1)
open(NGINX_CONF, 'w', encoding='utf-8').write(src)
print('nginx /dev patched')
PYEOF

sudo nginx -t
sudo systemctl reload nginx
pm2 restart website-api
sleep 1
echo '=== server & nginx deployed ==='
