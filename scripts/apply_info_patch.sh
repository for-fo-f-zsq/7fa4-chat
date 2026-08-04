#!/bin/bash
# 服务器端 /info 统计端点部署脚本（幂等，可重复执行）
set -e
cd /home/ubuntu/website-api
[ -f server.js.bak-info ] || cp server.js server.js.bak-info

python3 <<'PYEOF'
src = open('server.js', encoding='utf-8').read()
if 'RECORDS_FILE' in src and "path === '/info'" in src:
    print('already patched, skip')
    raise SystemExit(0)

block = '''
// ===== 访问统计（/info）：按 uid 记录最近访问时间与公开信息 =====
const fs = require('fs');
const RECORDS_FILE = __dirname + '/visit-records.json';

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

function readFormBody(req, limit = 4096) {
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
'''

anchor1 = "const server = http.createServer(async (req, res) => {"
assert anchor1 in src, 'anchor1 missing'
src = src.replace(anchor1, block + "\n" + anchor1, 1)

route = '''
    if (path === '/info') {
      if (req.method === 'POST') {
        let body = '';
        try { body = await readFormBody(req); }
        catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: 'bad body' })); return; }
        const p = new URLSearchParams(body);
        const uid = Number(p.get('uid'));
        if (!uid || !Number.isInteger(uid) || uid <= 0) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'invalid uid' }));
          return;
        }
        const clean = (v, max) => (v === undefined || v === null ? '' : String(v).slice(0, max));
        const recs = loadRecords();
        const key = String(uid);
        recs[key] = {
          uid,
          username: clean(p.get('username'), 64),
          nickname: clean(p.get('nickname'), 64),
          realname: clean(p.get('realname'), 64),
          school: clean(p.get('school'), 64),
          seat: clean(p.get('seat'), 64),
          last_seen: Date.now(),
          first_seen: recs[key]?.first_seen || Date.now(),
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

anchor2 = "    if (path === '/health') {"
assert anchor2 in src, 'anchor2 missing'
src = src.replace(anchor2, route + "\n" + anchor2, 1)

open('server.js', 'w', encoding='utf-8').write(src)
print('server.js patched')
PYEOF

sudo python3 <<'PYEOF'
NGINX_CONF = '/etc/nginx/sites-enabled/website'
src = open(NGINX_CONF, encoding='utf-8').read()
if 'location ^~ /info' in src:
    print('nginx already patched, skip')
    raise SystemExit(0)
anchor = '''    location ^~ /download {
        proxy_pass http://127.0.0.1:8090/download;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }'''
block = '''
    # 访问统计上报
    location ^~ /info {
        proxy_pass http://127.0.0.1:8090/info;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }'''
assert anchor in src, 'nginx anchor missing'
src = src.replace(anchor, anchor + block, 1)
open(NGINX_CONF, 'w', encoding='utf-8').write(src)
print('nginx patched')
PYEOF

sudo nginx -t
sudo systemctl reload nginx
pm2 restart website-api
sleep 1
echo '=== test POST /info (form) ==='
curl -s -X POST http://127.0.0.1:8080/info --data 'uid=123&username=testu&nickname=%E6%B5%8B%E8%AF%95&realname=%E5%BC%A0%E4%B8%89&school=%E6%B5%8B%E8%AF%95%E5%AD%A6%E6%A0%A1&seat=1&date=1754390000000'
echo
echo '=== test GET /info ==='
curl -s http://127.0.0.1:8080/info | head -c 800
echo
echo '=== records file ==='
head -c 500 /home/ubuntu/website-api/visit-records.json
echo
