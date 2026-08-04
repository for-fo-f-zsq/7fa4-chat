#!/bin/bash
# 服务器端 /info 升级：明文 → AES-256-GCM 加密校验（幂等，可重复执行）
set -e
cd /home/ubuntu/website-api
[ -f server.js.bak-encrypt ] || cp server.js server.js.bak-encrypt

python3 <<'PYEOF'
import re
path = 'server.js'
src = open(path, encoding='utf-8').read()
if 'VISIT_PASSPHRASE' in src:
    print('already encrypted, skip')
    raise SystemExit(0)

func_block = '''
// ===== 访问统计（/info）：AES-256-GCM 加密载荷，按 uid 记录最近访问与公开信息 =====
const crypto = require('crypto');
const fs = require('fs');
const RECORDS_FILE = __dirname + '/visit-records.json';
const VISIT_PASSPHRASE = '7fa4-chat::visit::v1';
const VISIT_MAX_AGE = 5 * 60 * 1000;   // 防重放：载荷时间戳与服务器时间差 > 5 分钟即拒
const VISIT_MIN_INTERVAL = 60 * 1000;  // 限频：同一 uid 60 秒内只接受一次

const lastVisitUid = {}; // uid -> 上次接受时间戳（内存态，服务重启清零）

function loadRecords() {
  try { return JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveRecords(recs) {
  try {
    const tmp = RECORDS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(recs, null, 2));
    fs.renameSync(tmp, RECORDS_FILE);
  } catch (e) { console.error('[info] save records failed:', e.message); }
}

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function decryptVisitPayload(str) {
  const p = JSON.parse(str);
  if (p.v !== 1) throw new Error('bad version');
  const key = crypto.createHash('sha256').update(VISIT_PASSPHRASE).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(p.tag, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(p.data, 'base64')), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}
'''

route_block = '''
    if (path === '/info') {
      if (req.method === 'POST') {
        let body = '';
        try { body = await readBody(req); }
        catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: 'bad body' })); return; }
        let info;
        try { info = decryptVisitPayload(body); }
        catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: 'bad payload' })); return; }
        const uid = Number(info && info.uid);
        if (!uid || !Number.isInteger(uid) || uid <= 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'invalid uid' }));
          return;
        }
        // 防重放：载荷时间戳必须落在 ±5 分钟内
        const ts = Number(info.date);
        if (!ts || Math.abs(Date.now() - ts) > VISIT_MAX_AGE) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'stale' }));
          return;
        }
        // 限频：同一 uid 60 秒内只接受一次
        const now = Date.now();
        const keyUid = String(uid);
        if (lastVisitUid[keyUid] && now - lastVisitUid[keyUid] < VISIT_MIN_INTERVAL) {
          res.statusCode = 429;
          res.end(JSON.stringify({ error: 'rate limited' }));
          return;
        }
        lastVisitUid[keyUid] = now;
        const clean = (v, max) => (v === undefined || v === null ? '' : String(v).slice(0, max));
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
        saveRecords(recs);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      // GET：按最近访问时间倒序返回统计
      const recs = loadRecords();
      const list = Object.values(recs)
        .sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0))
        .map((r) => ({ ...r, last_seen_text: new Date(r.last_seen).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }));
      res.end(JSON.stringify({ total: list.length, records: list }));
      return;
    }
'''

# 替换旧函数区（明文版）→ 新加密区
src, n1 = re.subn(r'// ===== 访问统计[\s\S]*?(?=\nconst server = http\.createServer)', func_block.strip('\n'), src, count=1)
assert n1 == 1, 'func block replace failed'

# 替换旧路由区（明文版）→ 新加密路由
src, n2 = re.subn(r"    if \(path === '/info'\) \{[\s\S]*?(?=\n    if \(path === '/health'\))", route_block.strip('\n'), src, count=1)
assert n2 == 1, 'route block replace failed'

open(path, 'w', encoding='utf-8').write(src)
print('server.js encrypted-patch applied')
PYEOF

pm2 restart website-api
sleep 1
echo '=== deploy done ==='
