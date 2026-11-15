// QQ 表情库（QFace _index.v2.json）一致性与资源完整性单元测试
//   node tests/unit/test-qqface.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { QQFACES, QUANCODE, qqfaceShortCode, qqfaceUrl } from '../../src/renderer/src/qqface-data.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC_QQFACE = path.join(ROOT, 'src', 'renderer', 'public', 'qqface')

const results = []
function chk(name, cond, detail = '') {
  results.push([name, !!cond, detail])
}

chk('数量：至少 300 个新版表情', QQFACES.length >= 300, String(QQFACES.length))

const seenIds = new Set()
const seenCodes = new Set()
const seenFiles = new Set()
const seenKeys = new Map()
let emptyFields = 0
let roundTripFail = []
let missingFiles = []
let badPngHeader = []
let animatedCount = 0
const seenHashes = new Map()
let dupHashes = []

for (const f of QQFACES) {
  if (!Number.isInteger(f.id) || !f.code?.startsWith('/') || !f.name || !f.pinyin || !f.file) {
    emptyFields++
  }
  seenIds.add(f.id)
  seenCodes.add(f.code.toLowerCase())
  seenFiles.add(f.file)

  const keys = [f.code.toLowerCase(), ('/' + f.pinyin).toLowerCase(), ...f.alias.map((a) => ('/' + a).toLowerCase())]
  for (const k of keys) {
    if (seenKeys.has(k) && seenKeys.get(k) !== f.id) {
      chk(`无碰撞：${k}`, false, `id ${seenKeys.get(k)} vs ${f.id}`)
    }
    seenKeys.set(k, f.id)
    if (QUANCODE.get(k) !== f) {
      roundTripFail.push(`${f.id}:${k}`)
    }
  }

  const sc = qqfaceShortCode(f)
  if (!sc || QUANCODE.get(sc.toLowerCase()) !== f) {
    roundTripFail.push(`shortCode(${f.id})=${sc}`)
  }

  const fp = path.join(PUBLIC_QQFACE, f.file)
  if (!fs.existsSync(fp)) {
    missingFiles.push(f.file)
  } else {
    const buf = fs.readFileSync(fp)
    const head = buf.subarray(0, 4)
    if (head[0] !== 0x89 || head[1] !== 0x50 || head[2] !== 0x4e || head[3] !== 0x47) {
      badPngHeader.push(f.file)
    }
    const sha = crypto.createHash('sha256').update(buf).digest('hex')
    if (seenHashes.has(sha)) {
      dupHashes.push(`${f.file}==${seenHashes.get(sha)}`)
    } else {
      seenHashes.set(sha, f.file)
    }
    if (buf.includes(Buffer.from('acTL'))) animatedCount++
  }
}

chk('字段完整：无空 id/code/name/pinyin/file', emptyFields === 0, String(emptyFields))
chk('ID 唯一', seenIds.size === QQFACES.length, `${seenIds.size}/${QQFACES.length}`)
chk('code 唯一', seenCodes.size === QQFACES.length, `${seenCodes.size}/${QQFACES.length}`)
chk('file 唯一', seenFiles.size === QQFACES.length, `${seenFiles.size}/${QQFACES.length}`)
chk('快捷码与 shortCode 全部无碰撞往返', roundTripFail.length === 0, roundTripFail.slice(0, 5).join(', '))
chk('PNG/APNG 资源文件全部存在', missingFiles.length === 0, missingFiles.slice(0, 5).join(', '))
chk('PNG/APNG 文件头全部合法', badPngHeader.length === 0, badPngHeader.slice(0, 5).join(', '))
chk('PNG/APNG 内容无重复图片', dupHashes.length === 0, dupHashes.slice(0, 5).join(', '))
chk('APNG 动态表情已到位（含 acTL 帧块）', animatedCount >= 265, `${animatedCount}/${QQFACES.length}`)

const diskFiles = fs.readdirSync(PUBLIC_QQFACE)
const extraFiles = diskFiles.filter((name) => !seenFiles.has(name))
chk('无旧版残留文件（s*.gif 等）', extraFiles.length === 0, extraFiles.slice(0, 5).join(', '))
chk('qqfaceUrl 路径正确', qqfaceUrl('14.png') === '/qqface/14.png')

const failed = results.filter(([, ok]) => !ok)
for (const [name, ok, detail] of results) {
  console.log((ok ? '  ok  ' : 'FAIL  ') + name + (ok || !detail ? '' : ' :: ' + detail))
}
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) process.exit(1)
