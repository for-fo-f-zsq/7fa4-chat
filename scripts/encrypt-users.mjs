// 将 src/renderer/public/users.json 加密为 users.7c（AES-256-GCM）
// 用法：先把明文 users.json 放回 src/renderer/public/，然后运行：
//   node scripts/encrypt-users.mjs
// 注意：密钥与 src/main/index.js 中的 USERS_DB_PASSPHRASE 保持一致。
// 这是"混淆级"加密（客户端必须自带密钥才能离线解密），真正目的是让公开仓库
// 不再直接包含明文姓名映射；更强的保护应改为从服务端按需拉取。
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const input = resolve(root, 'src/renderer/public/users.json');
const output = resolve(root, 'src/renderer/public/users.7c');

const KEY_PASSPHRASE = '7fa4-chat::users-db::v1'; // 与 utils.js 保持一致

if (!existsSync(input)) {
  console.error('未找到明文文件：', input);
  process.exit(1);
}

const data = readFileSync(input, 'utf8');
const key = createHash('sha256').update(KEY_PASSPHRASE).digest();
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const payload = {
  v: 1,
  iv: iv.toString('base64'),
  tag: tag.toString('base64'),
  data: enc.toString('base64')
};

writeFileSync(output, JSON.stringify(payload), 'utf8');
console.log('已加密写入：', output);
console.log('密文大小：', Buffer.byteLength(JSON.stringify(payload)), 'bytes');
