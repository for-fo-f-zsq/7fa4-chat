#!/bin/bash
# website-api /info days 迁移修复：POST 首报保留历史活跃 + GET 兜底增强（幂等）
set -e
cd /home/ubuntu/website-api

python3 <<'PYEOF'
path = 'server.js'
src = open(path, encoding='utf-8').read()
if 'lsKey' in src:
    print('already fixed, skip')
    raise SystemExit(0)

# 1) POST 分支：老数据（无 days 但有 last_seen）首报时先补 last_seen 日期，再标今天
old_post = '''        const today = new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10); // 北京时间日期
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
new_post = '''        const today = new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10); // 北京时间日期
        const recs = loadRecords();
        const prev = recs[keyUid] || {};
        let days = (prev.days && typeof prev.days === 'object') ? prev.days : {};
        // 老数据迁移：首报时若无 days 但有 last_seen，先补 last_seen 所在日期，避免历史活跃丢失
        if (!Object.keys(days).length && prev.last_seen) {
          days = { [new Date(prev.last_seen + 8 * 3600 * 1000).toISOString().slice(0, 10)]: 1 };
        }
        days[today] = 1;
        recs[keyUid] = {
          uid,
          username: clean(info.username, 64),
          nickname: clean(info.nickname, 64),
          realname: clean(info.realname, 64),
          school: clean(info.school, 64),
          seat: clean(info.seat, 64),
          last_seen: now,
          first_seen: prev.first_seen || now,
          days,
        };
        saveRecords(recs);'''
assert old_post in src, 'old_post missing'
src = src.replace(old_post, new_post, 1)

# 2) GET buildStats：兜底增强——last_seen 当天必然活跃，days 缺失则补
old_get = '''    let days = r.days && typeof r.days === 'object' ? r.days : {};
    // 老数据（无 days）：用 last_seen 所在日期兜底补 1 天
    if (!Object.keys(days).length && r.last_seen) {
      days = { [new Date(r.last_seen + 8 * 3600 * 1000).toISOString().slice(0, 10)]: 1 };
    }
    for (const d of Object.keys(days)) daily[d] = (daily[d] || 0) + 1;'''
new_get = '''    let days = r.days && typeof r.days === 'object' ? r.days : {};
    const lsKey = r.last_seen ? new Date(r.last_seen + 8 * 3600 * 1000).toISOString().slice(0, 10) : null;
    if (lsKey && !days[lsKey]) days = Object.assign({}, days, { [lsKey]: 1 }); // last_seen 当天必然活跃，缺失兜底
    for (const d of Object.keys(days)) daily[d] = (daily[d] || 0) + 1;'''
assert old_get in src, 'old_get missing'
src = src.replace(old_get, new_get, 1)

open(path, 'w', encoding='utf-8').write(src)
print('days migration fix applied')
PYEOF

pm2 restart website-api
sleep 1
echo '=== fix deployed ==='
