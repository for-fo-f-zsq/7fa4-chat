/**
 * scripts/install-tools-local.mjs —— 把本地构建出来的工具包装进本机 App 的 userData。
 *
 * 为什么需要它：
 *   客户端不再内置工具页（见 src/renderer/src/views/tools/README.md），线上工具来自
 *   GitLab 的 generic 包；改完 tools/ 源码后，只跑 build:tools 只会生成 dist-tools/，
 *   真正被 App 加载的是 %APPDATA%/<app>/tools/<id>/<version>/ + installed.json。
 *   想「立刻看到效果」就必须像在线安装那样把包落进 userData —— 本脚本照 main 进程
 *   installTool() 的落盘形状实现（版本目录 + installed.json{version,installedAt,size,files}），
 *   只是数据源从 HTTP 换成 dist-tools/。
 *
 * 用法：
 *   node scripts/install-tools-local.mjs                 # 安装 dist-tools/tools.json 里的全部工具
 *   node scripts/install-tools-local.mjs --only timer    # 只装指定工具（逗号分隔）
 *   node scripts/install-tools-local.mjs --dry-run       # 只打印会做什么
 *   node scripts/install-tools-local.mjs --root <dir>    # 指定 tools 根目录（默认 userData）
 *
 * 平时不用直接调：`npm run tools:local` = build:tools + 本脚本。
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const DIST_TOOLS = path.join(ROOT_DIR, 'dist-tools')
const MANIFEST = path.join(DIST_TOOLS, 'tools.json')

/** Electron 的 userData 目录：Windows = %APPDATA%/<name>（用 package.json 的 name，不是 productName）。 */
function defaultToolsRoot() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'))
  // 注意：Electron 的 app.getPath('userData') 用的是 package.json 的 name（7fa4-chat），
  // 不是 build.productName（"7FA4 Chat"）——用错会装到另一个目录，App 永远读不到。
  const name = pkg.name
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), name)
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name)
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), name)
}

function parseArgs(argv) {
  const out = { only: [], dryRun: false, root: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--only') out.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (a.startsWith('--only=')) out.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--root') out.root = String(argv[++i] || '')
    else if (a.startsWith('--root=')) out.root = a.slice(7)
    else if (a === '--help' || a === '-h') {
      console.log('用法: node scripts/install-tools-local.mjs [--only id1,id2] [--root <tools目录>] [--dry-run]')
      process.exit(0)
    }
  }
  return out
}

async function sha256File(file) {
  const buf = await fs.readFile(file)
  return { size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }
}

async function installOne(tool, toolsRoot, dryRun) {
  const { id, version, dir } = tool
  const srcDir = path.join(DIST_TOOLS, dir)
  const idDir = path.join(toolsRoot, id)
  const versionDir = path.join(idDir, version)
  const installedFile = path.join(idDir, 'installed.json')
  const stagingDir = path.join(idDir, `.staging-local-${process.pid}-${Date.now()}`)

  // 以磁盘真实内容为准重算 files（不要信 tools.json 里的清单：手工改过 CSS 后没重新构建时能立刻发现）
  const files = []
  for (const rel of tool.files.map((f) => f.path)) {
    const abs = path.join(srcDir, ...rel.split('/'))
    const { size, sha256 } = await sha256File(abs)
    files.push({ path: rel, size, sha256 })
  }
  const size = files.reduce((s, f) => s + f.size, 0)

  if (dryRun) {
    console.log(`  ${id} ${version} → ${versionDir}（${files.length} 文件 / ${(size / 1024).toFixed(0)} KB）`)
    return { id, version, dryRun: true }
  }

  // 清掉上次异常退出留下的临时目录
  await fs.readdir(idDir).then((names) => Promise.all(
    names.filter((n) => n.startsWith('.staging-')).map((n) => fs.rm(path.join(idDir, n), { recursive: true, force: true }))
  )).catch(() => {})
  await fs.mkdir(stagingDir, { recursive: true })
  for (const f of files) {
    const dest = path.join(stagingDir, ...f.path.split('/'))
    if (!dest.startsWith(stagingDir + path.sep)) throw new Error(`文件路径非法：${f.path}`)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.copyFile(path.join(srcDir, ...f.path.split('/')), dest)
  }
  // 版本目录不可变：同名版本要先删再重建（导出模板/缓存都可能握着旧文件句柄）
  await fs.rm(versionDir, { recursive: true, force: true })
  await fs.rename(stagingDir, versionDir)

  const installed = {
    version,
    installedAt: new Date().toISOString(),
    size,
    files
  }
  const tmp = `${installedFile}.tmp-${process.pid}`
  await fs.writeFile(tmp, JSON.stringify(installed, null, 2))
  await fs.rename(tmp, installedFile)

  // 与 main 进程一致：只留当前版本，避免 userData 里堆积旧包
  const entries = await fs.readdir(idDir, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name !== version && !e.name.startsWith('.'))
      .map((e) => fs.rm(path.join(idDir, e.name), { recursive: true, force: true }))
  )
  return { id, version, files: files.length, size }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const toolsRoot = path.resolve(args.root || defaultToolsRoot(), 'tools')
  if (!existsSync(MANIFEST)) {
    console.error(`✗ 找不到 ${path.relative(ROOT_DIR, MANIFEST)}，先跑 npm run build:tools`)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const all = Array.isArray(manifest.tools) ? manifest.tools : []
  const targets = args.only.length ? all.filter((t) => args.only.includes(t.id)) : all
  if (!targets.length) {
    console.error(`✗ 没有可安装的工具（--only=${args.only.join(',') || '空'}）`)
    process.exit(1)
  }
  console.log(`安装 ${targets.length} 个工具 → ${toolsRoot}${args.dryRun ? '（dry-run）' : ''}`)
  const done = []
  for (const tool of targets) done.push(await installOne(tool, toolsRoot, args.dryRun))
  for (const d of done) {
    console.log(`  ✓ ${d.id} ${d.version}${d.dryRun ? '' : `（${d.files} 文件 / ${(d.size / 1024).toFixed(0)} KB）`}`)
  }
  console.log('提示：App 里重新打开该工具（或重启）即可看到新包；installed.json 已指向新版本。')
}

main().catch((e) => {
  console.error(`✗ 安装失败：${e && e.message ? e.message : e}`)
  process.exit(1)
})
