'use strict';

/**
 * 本地联调检查：起一个假的 GitLab（19081）+ 官网服务（15300），逐项断言。
 * 用法：node tests/site/local-check.js
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const ROOT = path.join(REPO_ROOT, 'site');
const MOCK_PORT = 19081;
const SITE_PORT = 15300;

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

function request(port, method, pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { ...(headers || {}) };
    let payload = null;
    if (body !== undefined && body !== null) {
      payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
      if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers: reqHeaders }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
      );
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function get(port, pathname, headers) {
  return request(port, 'GET', pathname, headers);
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

  const feedbackDir = fs.mkdtempSync(path.join(os.tmpdir(), '7fa4-site-fb-'));
  const adminPassword = 'test-admin-secret-123';
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: {
      ...process.env,
      PORT: String(SITE_PORT),
      HOST: '127.0.0.1',
      GITLAB_BASE: `http://127.0.0.1:${MOCK_PORT}`,
      FEEDBACK_DIR: feedbackDir,
      FEEDBACK_ADMIN_PASSWORD: adminPassword
    },
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

    const statusRes = await get(SITE_PORT, '/api/status');
    const statusJson = JSON.parse(statusRes.body.toString());
    check('/api/status 返回版本与运行状态', statusRes.status === 200 && statusJson.ok === true && typeof statusJson.version === 'string');

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
    const expectedTopVer = (/^#{1,6}\s+v?(\d+\.\d+\.\d+)/m.exec(CHANGELOG) || [])[1] || '3.8.0';
    check(
      `/api/changelog 是 Markdown 且包含最新版本 ${expectedTopVer}`,
      cl.status === 200 && new RegExp(`^##\\s+v?${expectedTopVer.replace(/\./g, '\\.')}`, 'm').test(clText)
    );

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

    const fbAdminPage = await get(SITE_PORT, '/feedback/admin');
    const fbAdminHtml = fbAdminPage.body.toString();
    check(
      '/feedback/admin 管理页包含删除与个人备忘录',
      fbAdminPage.status === 200 && /个人备忘录/.test(fbAdminHtml) && /data-delete/.test(fbAdminHtml)
    );

    // 反馈提交 + 管理员登录 + 删除(#17) + 独立备忘录(#28)
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const sub1 = await request(SITE_PORT, 'POST', '/api/feedback', {}, {
      platform: 'windows',
      version: '4.0.0',
      content: '测试反馈条目一（含附件）',
      screenshots: [{ type: 'image/png', name: 'shot.png', data: tinyPng }]
    });
    const sub1Json = JSON.parse(sub1.body.toString());
    const sub2 = await request(SITE_PORT, 'POST', '/api/feedback', {}, {
      platform: 'web',
      version: '4.0.0',
      content: '测试反馈条目二（REST 删除）'
    });
    const sub2Json = JSON.parse(sub2.body.toString());
    check('提交两条本地反馈成功', sub1.status === 200 && sub1Json.ok && sub2.status === 200 && sub2Json.ok);

    // 未鉴权拒绝
    const unauthDel = await request(SITE_PORT, 'POST', '/api/feedback/admin/delete', {}, { id: sub1Json.id });
    const unauthRestDel = await request(SITE_PORT, 'DELETE', `/api/feedback/admin/item/${sub1Json.id}`);
    const unauthMemoGet = await request(SITE_PORT, 'GET', '/api/feedback/admin/memo');
    const unauthMemoPost = await request(SITE_PORT, 'POST', '/api/feedback/admin/memo', {}, { content: 'hack' });
    check(
      '管理端删除与备忘录接口未鉴权返回 401',
      unauthDel.status === 401 && unauthRestDel.status === 401 && unauthMemoGet.status === 401 && unauthMemoPost.status === 401
    );

    // 登录拿 cookie
    const loginRes = await request(SITE_PORT, 'POST', '/api/feedback/admin/login', {}, { password: adminPassword });
    const setCookie = [].concat(loginRes.headers['set-cookie'] || [])[0] || '';
    const adminCookie = setCookie.split(';')[0];
    check('管理端登录下发 fb_admin cookie', loginRes.status === 200 && /^fb_admin=/.test(adminCookie));

    const authHeaders = { Cookie: adminCookie };
    const listBefore = JSON.parse((await get(SITE_PORT, '/api/feedback/admin/list', authHeaders)).body.toString());
    check('管理端列表初始为 2 条且附件存在', listBefore.total === 2 && listBefore.newCount === 2 && fs.existsSync(path.join(feedbackDir, 'attachments', sub1Json.id)));

    // 备忘录：初始为空 -> 保存 -> 再读取
    const memoInit = JSON.parse((await get(SITE_PORT, '/api/feedback/admin/memo', authHeaders)).body.toString());
    check('备忘录初始为空字符串', memoInit.ok === true && memoInit.content === '' && memoInit.updatedAt === null);

    const memoText = '跨设备同步测试备忘\n- 跟进 #17 删除\n- 跟进 #28 备忘录';
    const memoSaveRes = await request(SITE_PORT, 'POST', '/api/feedback/admin/memo', authHeaders, { content: memoText });
    const memoSaveJson = JSON.parse(memoSaveRes.body.toString());
    check(
      '保存备忘录成功且返回 updatedAt',
      memoSaveRes.status === 200 && memoSaveJson.ok && memoSaveJson.content === memoText && typeof memoSaveJson.updatedAt === 'string'
    );

    const memoTooLong = await request(SITE_PORT, 'POST', '/api/feedback/admin/memo', authHeaders, { content: 'a'.repeat(50001) });
    check('备忘录超过 50000 字返回 400', memoTooLong.status === 400);

    // 标记第一条已处理，然后用 POST /delete 删除；再用 DELETE /item/:id 删除第二条
    await request(SITE_PORT, 'POST', '/api/feedback/admin/status', authHeaders, { id: sub1Json.id, status: 'handled' });
    const delBad = await request(SITE_PORT, 'POST', '/api/feedback/admin/delete', authHeaders, { id: '../evil' });
    check('删除非法 ID 返回 400', delBad.status === 400);

    const del1 = await request(SITE_PORT, 'POST', '/api/feedback/admin/delete', authHeaders, { id: sub1Json.id });
    const del1Json = JSON.parse(del1.body.toString());
    check(
      'POST /api/feedback/admin/delete 删除条目并清理附件目录',
      del1.status === 200 && del1Json.ok && del1Json.total === 1 && !fs.existsSync(path.join(feedbackDir, 'attachments', sub1Json.id))
    );

    const del1Again = await request(SITE_PORT, 'POST', '/api/feedback/admin/delete', authHeaders, { id: sub1Json.id });
    check('重复删除不存在条目返回 404', del1Again.status === 404);

    const del2 = await request(SITE_PORT, 'DELETE', `/api/feedback/admin/item/${encodeURIComponent(sub2Json.id)}`, authHeaders);
    const del2Json = JSON.parse(del2.body.toString());
    check(
      'DELETE /api/feedback/admin/item/:id 删除成功且计数清零',
      del2.status === 200 && del2Json.ok && del2Json.total === 0 && del2Json.newCount === 0
    );

    // 清空所有反馈后，备忘录与独立文件 admin-memo.json 必须保持不变
    const listAfter = JSON.parse((await get(SITE_PORT, '/api/feedback/admin/list', authHeaders)).body.toString());
    const memoAfter = JSON.parse((await get(SITE_PORT, '/api/feedback/admin/memo', authHeaders)).body.toString());
    const memoFileOnDisk = JSON.parse(fs.readFileSync(path.join(feedbackDir, 'admin-memo.json'), 'utf8'));
    const itemsFileOnDisk = JSON.parse(fs.readFileSync(path.join(feedbackDir, 'items.json'), 'utf8'));
    check(
      '清空反馈后独立 admin-memo.json 完好且不混入 items.json',
      listAfter.total === 0 &&
        Array.isArray(itemsFileOnDisk) &&
        itemsFileOnDisk.length === 0 &&
        memoAfter.content === memoText &&
        memoFileOnDisk.content === memoText
    );

    const missing = await get(SITE_PORT, '/no-such-page');
    check('未知页面 404', missing.status === 404, String(missing.status));
  } catch (e) {
    check('执行异常', false, e.message);
  } finally {
    child.kill();
    MOCK.close();
    fs.rmSync(feedbackDir, { recursive: true, force: true });
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
