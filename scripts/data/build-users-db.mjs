// 依据 Asterveil 姓名库导出重建 src/renderer/public/users.7c。
//
// 新格式（graduateYear 模型）：
//   { "<uid>": { "name": "张三", "graduateYear": 2027 } }    // 高中毕业年份
//   { "<uid>": { "name": "李四", "status": "教练" } }        // 教练/毕业/其他等身份
// 年级不再落库，由前端 utils.js 按“当前学年 + 9 - graduateYear”实时推算（学年 9 月 1 日切换），
// 因此同一份库每年自动升一级，无需重建。
//
// 用法：
//   node scripts/build-users-db.mjs --source <asterveil-user-names.json> [--legacy <users.json>]
//   --legacy 可选：旧版明文库（{uid:{name,colorKey}}），用于补回导出中缺失但本地有名字的用户，
//   colorKey 会按当前学年换算成 graduateYear（毕业/教练/其他换算为 status）。
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const plainPath = resolve(root, 'src/renderer/public/users.json');
const outputPath = resolve(root, 'src/renderer/public/users.7c');
const KEY_PASSPHRASE = '7fa4-chat::users-db::v1'; // 与 src/main/index.js、scripts/encrypt-users.mjs 一致

const PROGRESSION = ['x4', 'x5', 'x6', 'c1', 'c2', 'c3', 'g1', 'g2', 'g3', 'd1', 'd2', 'd3', 'd4', 'by'];
const FIRST_ACADEMIC_YEAR = 2025;
const STATUS_MAP = { 教练: 'jl', 毕业: 'by', 其他: 'uk' };

/** 学年在 9 月 1 日切换（与 Asterveil src/shared/user-grade-year.ts 一致） */
function currentAcademicYear() {
  const now = new Date();
  return Math.max(FIRST_ACADEMIC_YEAR, now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1);
}

function colorKeyToLegacyEntry(colorKey) {
  const index = PROGRESSION.indexOf(colorKey);
  if (index >= 0 && index < PROGRESSION.length - 1) {
    return { graduateYear: currentAcademicYear() + 9 - index };
  }
  if (colorKey === 'by') return { status: '毕业' };
  if (colorKey === 'jl') return { status: '教练' };
  if (colorKey === 'uk') return { status: '其他' };
  return null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') out.source = argv[++i];
    else if (argv[i] === '--legacy') out.legacy = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.source) {
  console.error('用法：node scripts/build-users-db.mjs --source <asterveil-user-names.json> [--legacy <users.json>]');
  process.exit(1);
}
if (!existsSync(args.source)) {
  console.error('未找到导出文件：', args.source);
  process.exit(1);
}

const exportData = JSON.parse(readFileSync(args.source, 'utf8'));
const exportUsers = Array.isArray(exportData) ? exportData : exportData.users;
if (!Array.isArray(exportUsers)) {
  console.error('导出文件格式不正确：缺少 users 数组');
  process.exit(1);
}

const db = {};
const stats = { total: exportUsers.length, withYear: 0, withStatus: 0, legacy: 0 };
for (const user of exportUsers) {
  const id = String(user.id ?? '').trim();
  const name = String(user.name ?? '').trim();
  if (!id || !name) continue;
  const entry = { name };
  const year = Number(user.graduateYear);
  if (Number.isSafeInteger(year) && year >= 1900 && year <= 2100) {
    entry.graduateYear = year;
    stats.withYear++;
  } else if (user.status) {
    entry.status = String(user.status);
    stats.withStatus++;
  }
  db[id] = entry;
}

if (args.legacy) {
  if (!existsSync(args.legacy)) {
    console.error('未找到旧版明文库：', args.legacy);
    process.exit(1);
  }
  const legacy = JSON.parse(readFileSync(args.legacy, 'utf8'));
  for (const [rawId, info] of Object.entries(legacy)) {
    const id = String(rawId).trim();
    const name = String(info?.name ?? '').trim();
    if (!id || !name || db[id]) continue; // 新库优先；旧库里没有名字的条目直接丢弃
    const converted = colorKeyToLegacyEntry(info?.colorKey || '');
    db[id] = converted ? { name, ...converted } : { name, status: '其他' };
    stats.legacy++;
  }
}

// 数字 id 排序，输出稳定、便于 diff 与按需排查
const ordered = {};
for (const id of Object.keys(db).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))) ordered[id] = db[id];

writeFileSync(plainPath, JSON.stringify(ordered), 'utf8');
const key = createHash('sha256').update(KEY_PASSPHRASE).digest();
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([cipher.update(JSON.stringify(ordered), 'utf8'), cipher.final()]);
const payload = { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: enc.toString('base64') };
writeFileSync(outputPath, JSON.stringify(payload), 'utf8');
unlinkSync(plainPath); // 明文含实名，不留在工作区

console.log('已写入：', outputPath);
console.log('用户数：', Object.keys(ordered).length, '（新库 ' + stats.total + '，其中毕业年份 ' + stats.withYear + '、身份 ' + stats.withStatus + '）');
if (args.legacy) console.log('旧库补回：', stats.legacy, '人（新库缺失但本地有名字）');
console.log('密文大小：', Buffer.byteLength(JSON.stringify(payload)), 'bytes');
