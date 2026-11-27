// 发布与 CI 工作流脚本单元测试（纯本地，不触网）
//   node tests/unit/test-release-scripts.mjs
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { isLinkableAsset, sortAssetNames } from '../../scripts/release/release-assets.mjs';
import {
  collectReleaseUploads,
  isMetadataFile,
  orderUploads,
  parseManifestVersion,
} from '../../scripts/release/publish-gitlab.mjs';
import { partitionToolUploads } from '../../scripts/tools/publish-tools.mjs';
import { collectArtifacts, mergeWinManifests } from '../../scripts/release/merge-win-yml.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const chk = (name, cond, detail = '') => results.push([name, Boolean(cond), detail]);

// 1. YAML 工作流结构校验
for (const wfName of ['release.yml', 'tools.yml']) {
  const doc = yaml.load(readFileSync(join(ROOT, '.github/workflows', wfName), 'utf8'));
  const jobs = Object.entries(doc?.jobs || {});
  chk(`${wfName}: 解析且包含 jobs`, jobs.length > 0, `${jobs.length} jobs`);
  const missingTimeout = jobs.filter(([, j]) => !Number.isFinite(j.timeout_minutes) && !Number.isFinite(j['timeout-minutes'])).map(([id]) => id);
  chk(`${wfName}: 所有 job 均设 timeout-minutes`, missingTimeout.length === 0, missingTimeout.join(','));
}

const releaseDoc = yaml.load(readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8'));
chk('release.yml: 包含 preflight 门禁并约束 build/build-android',
  Boolean(releaseDoc.jobs?.preflight)
    && releaseDoc.jobs?.build?.needs?.includes('preflight')
    && releaseDoc.jobs?.['build-android']?.needs?.includes('preflight'),
);
chk('release.yml: build-tools 不再阻塞 release',
  !releaseDoc.jobs?.release?.needs?.includes('build-tools'),
);
const buildInclude = releaseDoc.jobs?.build?.strategy?.matrix?.include || [];
const winEntries = buildInclude.filter((item) => item.platform === 'win');
chk('release.yml: Windows 并行 job 显式锁定单架构 target:arch（避免互建相同文件）',
  winEntries.length === 2
    && winEntries.every((item) => item.eb_args.includes(`:${item.win_arch}`)),
);
const ghDlStep = (releaseDoc.jobs?.['release-github']?.steps || []).find((s) => String(s.uses || '').includes('download-artifact'));
const glDlStep = (releaseDoc.jobs?.['release-gitlab']?.steps || []).find((s) => String(s.uses || '').includes('download-artifact'));
chk('release.yml: 发布阶段禁用 merge-multiple 静默覆盖，改走碰撞校验收集',
  ghDlStep?.with?.['merge-multiple'] === false && glDlStep?.with?.['merge-multiple'] === false,
);

// 2. release-assets 筛选与排序
chk('isLinkableAsset 正确排除元数据、保留安装包',
  !isLinkableAsset('latest.yml')
    && !isLinkableAsset('CHANGELOG')
    && !isLinkableAsset('builder-debug.yml')
    && isLinkableAsset('7FA4-Chat-4.0.0-x64.exe')
    && isLinkableAsset('7FA4-Chat-4.0.0-android.apk'),
);
const sorted = sortAssetNames([
  '7FA4-Chat-4.0.0-x64.zip',
  '7FA4-Chat-4.0.0-android.apk',
  '7FA4-Chat-4.0.0-arm64.deb',
  '7FA4-Chat-4.0.0-x86_64.AppImage',
  '7FA4-Chat-4.0.0-arm64.dmg',
  '7FA4-Chat-4.0.0-x64.exe',
]);
chk('sortAssetNames 按 win → mac → linux(AppImage>deb) → android → zip 排序',
  sorted[0].endsWith('.exe')
    && sorted[1].endsWith('.dmg')
    && sorted[2].endsWith('.AppImage')
    && sorted[3].endsWith('.deb')
    && sorted[4].endsWith('.apk')
    && sorted[5].endsWith('.zip'),
  sorted.join(' < '),
);

// 3. publish-gitlab 上传顺序与版本校验
const { ordered } = orderUploads([
  { name: 'CHANGELOG', path: 'a', size: 1 },
  { name: 'latest.yml', path: 'b', size: 1 },
  { name: 'latest-mac.yml', path: 'c', size: 1 },
  { name: '7FA4-Chat-4.0.0-x64.exe', path: 'd', size: 1 },
  { name: 'z-extra.AppImage', path: 'e', size: 1 },
]);
chk('orderUploads 严格保证全部安装包在元数据之前、latest.yml 与 CHANGELOG 压轴',
  ordered[0].name === '7FA4-Chat-4.0.0-x64.exe'
    && ordered[1].name === 'z-extra.AppImage'
    && ordered[2].name === 'latest-mac.yml'
    && ordered[3].name === 'latest.yml'
    && ordered[4].name === 'CHANGELOG',
  ordered.map((x) => x.name).join(' -> '),
);
chk('isMetadataFile 识别 yml/CHANGELOG',
  isMetadataFile('latest.yml') && isMetadataFile('CHANGELOG') && !isMetadataFile('7FA4-Chat-4.0.0-x64.exe'),
);
chk('parseManifestVersion 解析 yml 版本',
  parseManifestVersion("version: '4.0.0'\npath: x\n") === '4.0.0'
    && parseManifestVersion('version: 4.1.2\n') === '4.1.2',
);

// 4. collectReleaseUploads 版本一致校验与 dry-run CLI 测试
const tmp = mkdtempSync(join(tmpdir(), 'rel-test-'));
try {
  const distDir = join(tmp, 'dist');
  mkdirSync(distDir);
  writeFileSync(join(distDir, '7FA4-Chat-4.0.0-x64.exe'), 'dummy-exe');
  writeFileSync(join(distDir, 'latest.yml'), 'version: 4.0.0\n');
  const bodyFile = join(tmp, 'body.md');
  writeFileSync(bodyFile, '## 4.0.0\n- 新功能：测试\n');
  const clFile = join(ROOT, 'CHANGELOG');

  const okCollected = collectReleaseUploads({
    version: '4.0.0',
    distDir,
    changelogFile: clFile,
    releaseBodyFile: bodyFile,
  });
  chk('collectReleaseUploads 正常收集 1 安装包 + 2 元数据',
    okCollected.installers.length === 1 && okCollected.metadata.length === 2,
  );

  let mismatchCaught = false;
  try {
    collectReleaseUploads({
      version: '4.0.1',
      distDir,
      changelogFile: clFile,
      releaseBodyFile: bodyFile,
    });
  } catch (e) {
    mismatchCaught = String(e.message).includes('不一致');
  }
  chk('collectReleaseUploads 拦截 latest.yml 版本与发布版本不一致', mismatchCaught);

  const dry = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts/release/publish-gitlab.mjs'),
      '--version', '4.0.0',
      '--dist', distDir,
      '--changelog', clFile,
      '--body', bodyFile,
    ],
    { encoding: 'utf8' },
  );
  chk('publish-gitlab.mjs --dry-run CLI 正常退出',
    dry.status === 0 && dry.stdout.includes('DRY-RUN 完成'),
    dry.stderr || dry.stdout,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 5. package.json 版本能从 CHANGELOG 正确提取正文
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const bodyRes = spawnSync(
  process.execPath,
  [join(ROOT, 'scripts/release/build-release-body.mjs'), pkg.version],
  { encoding: 'utf8' },
);
chk(`build-release-body.mjs 可提取当前版本 (${pkg.version}) 正文`,
  bodyRes.status === 0 && bodyRes.stdout.includes(`## ${pkg.version}`),
  bodyRes.stderr,
);

// 6. 所有 tools/*/tool.json 结构合法（供 verify-release / build-tools 使用；忽略 shared 等无 tool.json 的公共目录）
const toolMetaFiles = readdirSync(join(ROOT, 'tools'))
  .filter((d) => !d.startsWith('.'))
  .map((d) => ({ dir: d, file: join(ROOT, 'tools', d, 'tool.json') }))
  .filter((x) => existsSync(x.file));
const badTools = toolMetaFiles.filter((x) => {
  const m = JSON.parse(readFileSync(x.file, 'utf8'));
  return !m?.id || !m?.version;
});
chk('tools/*/tool.json 均包含 id 与 version（且至少 5 个工具）',
  toolMetaFiles.length >= 5 && badTools.length === 0,
  `count=${toolMetaFiles.length} bad=${badTools.map((x) => x.dir).join(',')}`,
);

// 7. publish-tools.mjs 增量上传过滤：未改动文件按 sha256/size 跳过，tools.json 始终在最后上传
const part = partitionToolUploads(
  [
    { flatName: 'tools.json', size: 50, sha256: 'abc', isManifest: true },
    { flatName: 'math__1.0.2__a.js', size: 100, sha256: 'aaa' },
    { flatName: 'timer__1.0.8__index.html', size: 200, sha256: 'bbb' },
  ],
  [
    { id: 10, fileName: 'math__1.0.2__a.js', size: 100, fileSha256: 'old' },
    { id: 20, fileName: 'math__1.0.2__a.js', size: 100, fileSha256: 'aaa' },
    { id: 21, fileName: 'tools.json', size: 50, fileSha256: 'abc' },
  ],
);
chk('partitionToolUploads 跳过 sha256 一致文件并保留 tools.json 压轴',
  part.skipped.length === 1
    && part.skipped[0].flatName === 'math__1.0.2__a.js'
    && part.toUpload.length === 2
    && part.toUpload[0].flatName === 'timer__1.0.8__index.html'
    && part.toUpload[1].flatName === 'tools.json',
  part.toUpload.map((x) => x.flatName).join(' -> '),
);

// 8. mergeWinManifests 合并 x64 / arm64 latest.yml 并删除临时分片文件
const mergeTmp = mkdtempSync(join(tmpdir(), 'merge-yml-'));
try {
  writeFileSync(
    join(mergeTmp, 'latest-win-x64.yml'),
    [
      'version: 4.0.3',
      'files:',
      '  - url: 7FA4-Chat-4.0.3-x64.exe',
      '    sha512: aaa==',
      '    size: 1001',
      'path: 7FA4-Chat-4.0.3-x64.exe',
      'sha512: aaa==',
      "releaseDate: '2026-11-26T12:00:00.000Z'",
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(mergeTmp, 'latest-win-arm64.yml'),
    [
      'version: 4.0.3',
      'files:',
      '  - url: 7FA4-Chat-4.0.3-arm64.exe',
      '    sha512: bbb==',
      '    size: 1002',
      'path: 7FA4-Chat-4.0.3-arm64.exe',
      'sha512: bbb==',
      "releaseDate: '2026-11-26T12:01:00.000Z'",
      '',
    ].join('\n'),
  );
  const mergedRes = mergeWinManifests({ dir: mergeTmp, expectedVersion: '4.0.3' });
  const mergedDoc = yaml.load(readFileSync(join(mergeTmp, 'latest.yml'), 'utf8'));
  chk('mergeWinManifests 正确合并 x64/arm64 并清理分片文件',
    mergedRes.merged
      && mergedDoc?.version === '4.0.3'
      && Array.isArray(mergedDoc?.files)
      && mergedDoc.files.length === 2
      && mergedDoc.files[0].url === '7FA4-Chat-4.0.3-x64.exe'
      && mergedDoc.files[1].url === '7FA4-Chat-4.0.3-arm64.exe'
      && !existsSync(join(mergeTmp, 'latest-win-x64.yml'))
      && !existsSync(join(mergeTmp, 'latest-win-arm64.yml')),
    `files=${mergedDoc?.files?.length}`,
  );
} finally {
  rmSync(mergeTmp, { recursive: true, force: true });
}

// 9. collectArtifacts 碰撞拦截 + publish-gitlab sha512/size 强校验
const guardTmp = mkdtempSync(join(tmpdir(), 'rel-guard-'));
try {
  const parts = join(guardTmp, 'parts');
  const distOk = join(guardTmp, 'dist');
  mkdirSync(join(parts, 'dist-win-x64'), { recursive: true });
  mkdirSync(join(parts, 'dist-mac'), { recursive: true });
  writeFileSync(join(parts, 'dist-win-x64', '7FA4-Chat-4.0.4-x64.exe'), 'win-binary-content');
  writeFileSync(join(parts, 'dist-mac', '7FA4-Chat-4.0.4-x64-mac.zip'), 'mac-zip-content');
  const colOk = collectArtifacts({ collectFrom: parts, dir: distOk });
  chk('collectArtifacts 正常汇集无冲突产物', colOk.collected === 2 && existsSync(join(distOk, '7FA4-Chat-4.0.4-x64.exe')));

  // 注入同名冲突文件
  writeFileSync(join(parts, 'dist-mac', '7FA4-Chat-4.0.4-x64.exe'), 'oops-collision');
  let collisionCaught = false;
  try {
    collectArtifacts({ collectFrom: parts, dir: distOk });
  } catch (e) {
    collisionCaught = String(e.message).includes('冲突');
  }
  chk('collectArtifacts 拦截跨 job 同名产物覆盖冲突', collisionCaught);

  // manifest sha512 & size 校验
  const exeBuf = readFileSync(join(distOk, '7FA4-Chat-4.0.4-x64.exe'));
  const realSha = createHash('sha512').update(exeBuf).digest('base64');
  const bodyFile = join(guardTmp, 'body.md');
  writeFileSync(bodyFile, '## 4.0.4\n- fix\n');
  const clFile = join(ROOT, 'CHANGELOG');

  writeFileSync(
    join(distOk, 'latest.yml'),
    [
      'version: 4.0.4',
      'files:',
      '  - url: 7FA4-Chat-4.0.4-x64.exe',
      `    sha512: ${realSha}`,
      `    size: ${exeBuf.length}`,
      'path: 7FA4-Chat-4.0.4-x64.exe',
      `sha512: ${realSha}`,
      '',
    ].join('\n'),
  );
  const verified = collectReleaseUploads({
    version: '4.0.4',
    distDir: distOk,
    changelogFile: clFile,
    releaseBodyFile: bodyFile,
  });
  chk('collectReleaseUploads 放行 size 与 sha512 完全一致的清单', verified.installers.length === 2);

  writeFileSync(
    join(distOk, 'latest.yml'),
    [
      'version: 4.0.4',
      'files:',
      '  - url: 7FA4-Chat-4.0.4-x64.exe',
      '    sha512: wronghash==',
      `    size: ${exeBuf.length}`,
      '',
    ].join('\n'),
  );
  let shaCaught = false;
  try {
    collectReleaseUploads({ version: '4.0.4', distDir: distOk, changelogFile: clFile, releaseBodyFile: bodyFile });
  } catch (e) {
    shaCaught = String(e.message).includes('sha512');
  }
  chk('collectReleaseUploads 拦截 sha512 不一致', shaCaught);

  writeFileSync(
    join(distOk, 'latest.yml'),
    [
      'version: 4.0.4',
      'files:',
      '  - url: 7FA4-Chat-4.0.4-x64.exe',
      `    sha512: ${realSha}`,
      '    size: 999999',
      '',
    ].join('\n'),
  );
  let sizeCaught = false;
  try {
    collectReleaseUploads({ version: '4.0.4', distDir: distOk, changelogFile: clFile, releaseBodyFile: bodyFile });
  } catch (e) {
    sizeCaught = String(e.message).includes('大小');
  }
  chk('collectReleaseUploads 拦截文件大小不一致', sizeCaught);
} finally {
  rmSync(guardTmp, { recursive: true, force: true });
}

let failed = 0;
for (const [name, ok, detail] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
}
console.log(`\n共 ${results.length} 项，通过 ${results.length - failed}，失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
