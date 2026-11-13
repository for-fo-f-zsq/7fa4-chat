// 依据 7FA4 OJ 生产库导出（syzoj.user 全量）重建 src/renderer/public/users.7c。
//
// 与 build-users-db.mjs（Asterveil 姓名库导出）的区别：数据源换成 OJ 生产库导出
// （D:\projects\7fa4-server\7fa4-数据导出\user.json，字段名见其 README），
// 姓名取 real_name、毕业年份取 graduate_year —— 都是后台管理员在维护的字段，
// 比姓名库快照更新更及时（新增注册用户、改名、升年级都能一次同步）。
//
// 输出格式不变（graduateYear 模型，与 src/renderer/src/utils.js 的
// graduateYearToColorKey 对应）：
//   { "<uid>": { "name": "张三", "graduateYear": 2027 } }   // 高中毕业年份
//   { "<uid>": { "name": "李四", "status": "教练" } }       // 教练/毕业/其他等身份
// 年级不落库，前端按「当前学年 + 9 - graduateYear」实时推算，每年自动升一级。
//
// 「教练」这类身份 OJ 里没有对应字段（manager_type 只有 teacher/officer，
// teacher 字段也不能区分教练与学生），因此从现有 users.7c 继承：
//   · 旧库标记为教练的人保持「教练」（覆盖毕业年份，否则会被算成学生年级）
//   · 旧库标了身份但 OJ 没有 graduate_year 的人保留原身份
// 其余一律以 OJ 数据为准。
//
// 用法：
//   node scripts/build-users-db-oj.mjs --source "D:\projects\7fa4-server\7fa4-数据导出\user.json"
//   可选：--out <path>   输出路径（默认 src/renderer/public/users.7c）
//         --carry <path> 继承身份用的旧库（默认就是 --out 指向的文件，不存在则跳过）
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const KEY_PASSPHRASE = '7fa4-chat::users-db::v1'; // 与 src/main/index.js、scripts/encrypt-users.mjs 一致

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') out.source = argv[++i];
    else if (argv[i] === '--out') out.out = argv[++i];
    else if (argv[i] === '--carry') out.carry = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(root, args.out || 'src/renderer/public/users.7c');
const carryPath = args.carry ? resolve(root, args.carry) : outputPath;

if (!args.source) {
  console.error('用法：node scripts/build-users-db-oj.mjs --source <oj-user-export.json> [--out <users.7c>] [--carry <users.7c>]');
  process.exit(1);
}
const sourcePath = resolve(args.source);
if (!existsSync(sourcePath)) {
  console.error('未找到导出文件：', sourcePath);
  process.exit(1);
}

const encryptionKey = createHash('sha256').update(KEY_PASSPHRASE).digest();

/** 读取现有 users.7c（AES-256-GCM，{v,iv,tag,data}），失败返回空对象 */
function readExistingDb(path) {
  if (!existsSync(path)) return {};
  try {
    const payload = JSON.parse(readFileSync(path, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch (e) {
    console.warn('旧库读取失败，跳过身份继承：', e.message);
    return {};
  }
}

const exportData = JSON.parse(readFileSync(sourcePath, 'utf8'));
const exportUsers = Array.isArray(exportData) ? exportData : exportData.users;
if (!Array.isArray(exportUsers)) {
  console.error('导出文件格式不正确：缺少 users 数组');
  process.exit(1);
}

const previous = readExistingDb(carryPath);
const db = {};
const stats = { total: exportUsers.length, withYear: 0, skipped: 0, carriedCoach: 0, carriedStatus: 0, added: 0, renamed: 0 };

for (const user of exportUsers) {
  const id = String(user.id ?? '').trim();
  const name = String(user.real_name ?? '').trim() || String(user.nickname ?? '').trim() || String(user.username ?? '').trim();
  if (!id || !name) { stats.skipped++; continue; }

  const entry = { name };
  const year = Number(user.graduate_year);
  if (Number.isSafeInteger(year) && year >= 1900 && year <= 2100) {
    entry.graduateYear = year;
    stats.withYear++;
  }

  // 身份继承：教练是 OJ 无法推导的角色，必须保留；无毕业年份时也保留原身份兜底
  const prev = previous[id];
  if (prev?.status === '教练') {
    entry.status = '教练';
    delete entry.graduateYear;
    stats.carriedCoach++;
  } else if (entry.graduateYear === undefined && prev?.status) {
    entry.status = prev.status;
    stats.carriedStatus++;
  }

  if (prev) {
    if (prev.name !== name) stats.renamed++;
  } else {
    stats.added++;
  }

  db[id] = entry;
}

for (const id of Object.keys(previous)) if (!db[id]) stats.removed = (stats.removed || 0) + 1;
if (stats.removed) console.warn('注意：旧库有', stats.removed, '人在本次导出中不存在（已从新库移除，通常是账号已删除）');

// 数字 id 排序，输出稳定、便于排查
const ordered = {};
for (const id of Object.keys(db).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))) ordered[id] = db[id];

const plaintext = JSON.stringify(ordered);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const payload = { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: enc.toString('base64') };
writeFileSync(outputPath, JSON.stringify(payload), 'utf8');

console.log('已写入：', outputPath);
console.log('用户数：', Object.keys(ordered).length, '（导出 ' + stats.total + '，跳过无名/无 id ' + stats.skipped + '）');
console.log('毕业年份：', stats.withYear, '· 教练身份继承：', stats.carriedCoach, '· 其它身份继承：', stats.carriedStatus);
console.log('相比旧库：新增', stats.added, '人 · 改名', stats.renamed, '人 · 移除', stats.removed || 0, '人');
console.log('密文大小：', Buffer.byteLength(JSON.stringify(payload)), 'bytes');
