'use strict';

/**
 * 本地联调检查：起一个假的 GitLab（19081）+ 官网服务（15300），逐项断言。
 * 用法：node test/local-check.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MOCK_PORT = 19081;
const SITE_PORT = 15300;

const REPO_ROOT = fs.existsSync(path.join(ROOT, '..', 'CHANGELOG'))
  ? path.join(ROOT, '..')
  : path.join(ROOT, '..', '7fa4-chat');

const CHANGELOG = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG'), 'utf8');
const SPONSORS = '{"list":[{"name":"@President","amount":"￥50.42"},{"name":"@mulab","amount":"￥20"}]}';
const QR = fs.readFileSync(path.join(REPO_ROOT, 'assets', 'donate-qr.jpg'));
const PACKAGE_BYTES = Buffer.alloc(64 * 1024, 7); // 64 KB 假包，便于测 Range

const FILES = [
  '7FA4-Chat-3.8.0-amd64.deb',
  '7FA4-Chat-3.8.0-android.apk',
  '7FA4-Chat-3.8.0-arm64.AppImage',
  '7FA4-Chat-3.8.0-arm64.deb',
  '7FA4-Chat-3.8.0-arm64.dmg',
  '7FA4-Chat-3.8.0-arm64.exe',
  '7FA4-Chat-3.8.0-arm64.zip',
  '7FA4-Chat-3.8.0-x64.dmg',
  '7FA4-Chat-3.8.0-x64.exe',
  '7FA4-Chat-3.8.0-x64.zip',
  '7FA4-Chat-3.8.0-x86_64.AppImage',
  'CHANGELOG',
  'latest-linux-arm64.yml',
  'latest-linux.yml',
  'latest-mac.yml',
  'latest.yml'
];

const LATEST_YML = [
  'version: 3.8.0',
  'files:',
  '  - url: 7FA4-Chat-3.8.0-x64.exe',
  '    sha512: abc',
  '    size: 130266840',
  "releaseDate: '2026-11-06T23:40:13.730Z'",
  ''
].join('\n');

const MOCK = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://mock');
  const p = url.pathname;

  if (p === '/api/v4/projects/886/packages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ id: 183, name: '7FA4-Chat', version: 'latest' }]));
    return;
  }
  if (p === '/api/v4/projects/886/packages/183/package_files') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        FILES.map((f, i) => ({
          id: 100 + i,
          file_name: f,
          size: f === 'CHANGELOG' ? Buffer.byteLength(CHANGELOG) : 130266840,
          file_sha256: ('deadbeef' + i).padEnd(64, '0')
        }))
      )
    );
    return;
  }
  if (p === '/api/v4/projects/886/packages/generic/7FA4-Chat/latest/latest.yml') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(LATEST_YML);
    return;
  }
  if (p === '/api/v4/projects/886/packages/generic/7FA4-Chat/latest/CHANGELOG') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(CHANGELOG);
    return;
  }
  if (p === '/api/v4/projects/886/repository/files/assets%2Fsponsors.json/raw') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(SPONSORS);
    return;
  }
  if (p === '/api/v4/projects/886/repository/files/assets%2Fdonate-qr.jpg/raw') {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(QR);
    return;
  }
  if (p.startsWith('/api/v4/projects/886/packages/generic/7FA4-Chat/latest/')) {
    const name = decodeURIComponent(p.split('/').pop());
    if (!FILES.includes(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : PACKAGE_BYTES.length - 1;
      const chunk = PACKAGE_BYTES.subarray(start, end + 1);
      res.writeHead(206, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': chunk.length,
        'Content-Range': `bytes ${start}-${end}/${PACKAGE_BYTES.length}`
      });
      res.end(chunk);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': PACKAGE_BYTES.length });
    res.end(PACKAGE_BYTES);
    return;
  }

  res.writeHead(404);
  res.end();
});

function get(port, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET', headers: headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
      );
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(port, pathname, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      await get(port, pathname);
      return;
    } catch (e) {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error('service did not start: ' + port + pathname);
}

const checks = [];
function check(name, ok, extra) {
  checks.push({ name, ok, extra });
}

(async () => {
  await new Promise((r) => MOCK.listen(MOCK_PORT, '127.0.0.1', r));

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(SITE_PORT), HOST: '127.0.0.1', GITLAB_BASE: `http://127.0.0.1:${MOCK_PORT}` },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', (d) => (serverLog += d.toString()));
  child.stderr.on('data', (d) => (serverLog += d.toString()));

  try {
    await waitFor(SITE_PORT, '/healthz');

    const home = await get(SITE_PORT, '/');
    check('首页 200 + HTML', home.status === 200 && /7FA4 Chat/.test(home.body.toString()));

    const css = await get(SITE_PORT, '/style.css');
    check('/style.css 200', css.status === 200 && /text\/css/.test(css.headers['content-type'] || ''));

    const js = await get(SITE_PORT, '/app.js');
    check('/app.js 200', js.status === 200 && /javascript/.test(js.headers['content-type'] || ''));

    const health = await get(SITE_PORT, '/healthz');
    check('/healthz ok', health.status === 200 && health.body.toString() === 'ok');

    const dl = await get(SITE_PORT, '/api/downloads');
    const dlJson = JSON.parse(dl.body.toString());
    check('下载清单版本 3.8.0', dlJson.version === '3.8.0', dlJson.version);
    check('下载清单有 11 项推荐', dlJson.items.length === 11, String(dlJson.items.length));
    check(
      '平台聚合正确',
      ['windows', 'macos', 'linux', 'android'].every((pf) => dlJson.items.some((i) => i.platform === pf))
    );
    check('每项都有大小与 sha256', dlJson.items.every((i) => i.size > 0 && /^[0-9a-f]{64}$/.test(i.sha256 || '')));

    const cl = await get(SITE_PORT, '/api/changelog');
    const clText = cl.body.toString();
    check('/api/changelog 是 Markdown 且首条为 3.8.0', cl.status === 200 && /^## 3\.8\.0/m.test(clText));

    const sp = await get(SITE_PORT, '/api/sponsors');
    const spJson = JSON.parse(sp.body.toString());
    check('/api/sponsors 名单 2 条', Array.isArray(spJson.list) && spJson.list.length === 2);

    const qr = await get(SITE_PORT, '/api/donate-qr');
    check('/api/donate-qr 是 JPEG', qr.status === 200 && qr.body.length > 1000 && qr.body[0] === 0xff && qr.body[1] === 0xd8);

    const full = await get(SITE_PORT, '/dl/7FA4-Chat-3.8.0-x64.exe');
    check('/dl 全量下载 200', full.status === 200 && full.body.length === PACKAGE_BYTES.length, String(full.headers['content-length']));
    check('/dl 带 Content-Disposition', /attachment; filename="7FA4-Chat-3\.8\.0-x64\.exe"/.test(full.headers['content-disposition'] || ''));

    const ranged = await get(SITE_PORT, '/dl/7FA4-Chat-3.8.0-x64.exe', { Range: 'bytes=100-199' });
    check('/dl Range 返回 206 与 100 字节', ranged.status === 206 && ranged.body.length === 100, String(ranged.status));

    const bad = await get(SITE_PORT, '/dl/..%2F..%2Fconfig.json');
    check('/dl 拒绝非白名单文件名', bad.status === 400, String(bad.status));

    const traversal = await get(SITE_PORT, '/../server.js');
    check('静态目录拒绝穿越', traversal.status === 404, String(traversal.status));

    const webRedirect = await get(SITE_PORT, '/web?foo=1');
    check('/web 相对重定向到 web/ 并保留查询串', webRedirect.status === 308 && webRedirect.headers['location'] === 'web/?foo=1', String(webRedirect.headers['location']));

    const fbPage = await get(SITE_PORT, '/feedback/');
    check('/feedback/ 反馈页 200', fbPage.status === 200 && /意见反馈/.test(fbPage.body.toString()));

    const missing = await get(SITE_PORT, '/no-such-page');
    check('未知页面 404', missing.status === 404, String(missing.status));
  } catch (e) {
    check('执行异常', false, e.message);
  } finally {
    child.kill();
    MOCK.close();
  }

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.extra ? '  [' + c.extra + ']' : ''}`);
  }
  if (serverLog.trim()) console.log('\n--- server log ---\n' + serverLog.trim());
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
})();
