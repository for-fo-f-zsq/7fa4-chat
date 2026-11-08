#!/usr/bin/env node
/**
 * scripts/build-tools.mjs —— 逐个构建 tools/<id> 并生成 dist-tools/tools.json。
 *
 * 用法：
 *   node scripts/build-tools.mjs                 # 构建全部工具
 *   node scripts/build-tools.mjs --only calculator            # 只构建一个
 *   node scripts/build-tools.mjs --only calculator,timer      # 只构建多个
 *   node scripts/build-tools.mjs --clean         # 先清空 dist-tools/ 再构建
 *
 * 流程：
 *   1. 读 tools/<id>/tool.json（id/name/desc/version/minAppVersion/entry）；
 *   2. 对每个工具调用本地 vite：`node node_modules/vite/bin/vite.js build --config tools.vite.config.mjs`，
 *      通过环境变量传 TOOL_ID / TOOL_VERSION（tools.vite.config.mjs 负责 root/outDir/base 等）；
 *   3. math 工具构建后把 tools/math/geogebra/（GeoGebra 官方 calculator.html + HTML5 运行时）原样复制到
 *      dist-tools/math/<version>/geogebra/ —— 它不经过 Vite 打包，只是静态资源；
 *   4. 扫描 dist-tools/ 生成 dist-tools/tools.json（spec §2 schema，含每个文件的 size 与 sha256）；
 *   5. 打印逐工具体积表与总耗时/总体积。
 *
 * 依赖约束：只用 Node 标准库 + 本地 node_modules 里已有的 vite，不新增任何依赖，也不依赖 bash。
 * Windows / Linux / macOS 均可直接运行（CI 里是 ubuntu + node 22）。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST_SCHEMA = 1
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const TOOL_ID_RE = /^[a-z0-9][a-z0-9_-]*$/

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const toolsDir = resolve(rootDir, 'tools')
const distDir = resolve(rootDir, 'dist-tools')
const manifestPath = join(distDir, 'tools.json')
const viteBin = join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const viteConfig = join(rootDir, 'tools.vite.config.mjs')
// GeoGebra 静态资源属于 math 工具自己，不再随主程序打包（主程序里已没有内置数学页）
const geogebraSrcDir = resolve(rootDir, 'tools', 'math', 'geogebra')

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function log(msg = '') {
  console.log(msg)
}

function fail(msg) {
  throw new Error(msg)
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '?'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`
}

function toPosix(p) {
  return p.split(sep).join('/')
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

/** 递归列出目录下所有文件（返回绝对路径 + 相对目录的 posix 路径） */
function walkFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, base, out)
    } else if (entry.isFile()) {
      out.push({ full, rel: toPosix(relative(base, full)) })
    }
  }
  return out
}

function readViteVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'node_modules', 'vite', 'package.json'), 'utf8'))
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

function printUsage() {
  log(`用法：node scripts/build-tools.mjs [--only <id[,id...]>] [--clean]
  --only <ids>  只构建指定工具（逗号分隔；不传则构建 tools/ 下全部）
  --clean       构建前清空 dist-tools/
  -h, --help    显示本帮助`)
}

function parseArgs(argv) {
  const opts = { only: null, clean: false, help: false }
  const raw = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      opts.help = true
    } else if (arg === '--clean') {
      opts.clean = true
    } else if (arg === '--only') {
      const value = argv[++i]
      if (!value) fail('--only 后需要跟工具 id（逗号分隔），例如 --only calculator')
      raw.push(value)
    } else if (arg.startsWith('--only=')) {
      raw.push(arg.slice('--only='.length))
    } else if (arg.startsWith('-')) {
      fail(`未知参数：${arg}（用 --help 查看用法）`)
    } else {
      raw.push(arg)
    }
  }
  const ids = raw
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean)
  if (ids.length > 0) opts.only = [...new Set(ids)]
  return opts
}

/* ------------------------------------------------------------------ *
 * 工具清单
 * ------------------------------------------------------------------ */

function listTools() {
  if (!existsSync(toolsDir)) fail(`工具源码目录不存在：${toolsDir}`)

  const dirs = readdirSync(toolsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const tools = []
  for (const dirName of dirs) {
    const toolRoot = join(toolsDir, dirName)
    const metaPath = join(toolRoot, 'tool.json')
    if (!existsSync(metaPath)) {
      log(`[warn] 跳过 tools/${dirName}：缺少 tool.json`)
      continue
    }

    let meta
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    } catch (e) {
      fail(`tools/${dirName}/tool.json 不是合法 JSON：${e.message}`)
    }

    if (typeof meta.id !== 'string' || !TOOL_ID_RE.test(meta.id)) {
      fail(`tools/${dirName}/tool.json 的 id 非法：${JSON.stringify(meta.id)}（期望小写字母/数字/-/_）`)
    }
    if (meta.id !== dirName) {
      fail(`tools/${dirName}/tool.json 的 id（${meta.id}）必须与目录名一致`)
    }
    if (typeof meta.name !== 'string' || !meta.name.trim()) {
      fail(`tools/${dirName}/tool.json 缺少 name`)
    }
    if (typeof meta.version !== 'string' || !SEMVER_RE.test(meta.version)) {
      fail(`tools/${dirName}/tool.json 的 version 非法：${JSON.stringify(meta.version)}（期望 x.y.z）`)
    }
    if (typeof meta.minAppVersion !== 'string' || !SEMVER_RE.test(meta.minAppVersion)) {
      fail(
        `tools/${dirName}/tool.json 的 minAppVersion 非法：${JSON.stringify(meta.minAppVersion)}（期望 x.y.z）`
      )
    }

    const entry = typeof meta.entry === 'string' && meta.entry ? meta.entry : 'index.html'
    if (!existsSync(join(toolRoot, entry))) {
      fail(`tools/${dirName}/${entry} 不存在（tool.json 的 entry 指向了不存在的文件）`)
    }
    if (!existsSync(join(toolRoot, 'index.html'))) {
      // Vite 以 root 下的 index.html 作为唯一入口，缺了它构建必然失败，提前报错更清晰
      fail(`tools/${dirName}/index.html 不存在（Vite 构建入口）`)
    }

    tools.push({
      id: meta.id,
      name: meta.name.trim(),
      desc: typeof meta.desc === 'string' ? meta.desc.trim() : '',
      // 图标：Font Awesome class（如 "fas fa-calculator"），客户端直接用于 <i :class>，缺省给拼图占位
      icon: typeof meta.icon === 'string' && meta.icon.trim() ? meta.icon.trim() : 'fas fa-puzzle-piece',
      version: meta.version,
      minAppVersion: meta.minAppVersion,
      entry,
      root: toolRoot
    })
  }

  if (tools.length === 0) fail(`tools/ 下没有找到任何工具（需要 tools/<id>/tool.json）`)
  return tools
}

/* ------------------------------------------------------------------ *
 * 构建
 * ------------------------------------------------------------------ */

function buildTool(tool) {
  const outDir = resolve(distDir, tool.id, tool.version)
  log('')
  log('──────────────────────────────────────────────────────────────')
  log(`[build] ${tool.id}@${tool.version} → ${toPosix(relative(rootDir, outDir))}`)
  log('──────────────────────────────────────────────────────────────')

  const startedAt = Date.now()
  const result = spawnSync(process.execPath, [viteBin, 'build', '--config', viteConfig], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      TOOL_ID: tool.id,
      TOOL_VERSION: tool.version
    }
  })

  if (result.error) {
    fail(`[${tool.id}] 无法启动 vite：${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`[${tool.id}] vite build 失败（退出码 ${result.status}）`)
  }
  if (!existsSync(join(outDir, 'index.html'))) {
    fail(`[${tool.id}] 构建完成但产物缺少 index.html：${outDir}`)
  }

  // GeoGebra 工具：官方 calculator.html 是独立整页应用，不能交给 Vite 处理（体积大、非 ESM），
  // 构建后从 tools/math/geogebra 原样复制。
  let copied = null
  if (tool.id === 'math') {
    copied = copyGeogebra(outDir)
  }

  return {
    durationMs: Date.now() - startedAt,
    geogebra: copied
  }
}

function copyGeogebra(outDir) {
  if (!existsSync(geogebraSrcDir)) {
    fail(`[math] GeoGebra 资源目录不存在：${geogebraSrcDir}`)
  }
  const dest = join(outDir, 'geogebra')
  rmSync(dest, { recursive: true, force: true })
  cpSync(geogebraSrcDir, dest, { recursive: true })
  const files = walkFiles(dest)
  const size = files.reduce((sum, file) => sum + statSync(file.full).size, 0)
  log(`[math] 已复制 GeoGebra 运行时：${files.length} 个文件，${formatBytes(size)} → ${toPosix(relative(rootDir, dest))}/`)
  return { files: files.length, size }
}

/* ------------------------------------------------------------------ *
 * 产物扫描 + 清单
 * ------------------------------------------------------------------ */

function buildManifest(tools) {
  const entries = []
  const missing = []

  for (const tool of tools) {
    const versionDir = resolve(distDir, tool.id, tool.version)
    if (!existsSync(versionDir)) {
      missing.push(tool.id)
      continue
    }

    const files = walkFiles(versionDir)
      .map((file) => {
        const size = statSync(file.full).size
        return { path: file.rel, size, sha256: sha256File(file.full) }
      })
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

    if (files.length === 0) fail(`[${tool.id}] 产物目录为空：${versionDir}`)
    if (!files.some((file) => file.path === tool.entry)) {
      fail(`[${tool.id}] 产物中找不到 entry（${tool.entry}）`)
    }

    const size = files.reduce((sum, file) => sum + file.size, 0)
    entries.push({
      id: tool.id,
      name: tool.name,
      desc: tool.desc,
      icon: tool.icon,
      version: tool.version,
      dir: `${tool.id}/${tool.version}`,
      entry: tool.entry,
      size,
      minAppVersion: tool.minAppVersion,
      files
    })
  }

  if (missing.length > 0) {
    log('')
    log(`[warn] 以下工具尚未构建，未写入 tools.json：${missing.join(', ')}`)
    log('[warn] 如果这是 --only 局部构建可以忽略；要发布到 GitLab 前请执行一次全量构建。')
  }

  const manifest = {
    schema: MANIFEST_SCHEMA,
    updatedAt: new Date().toISOString(),
    tools: entries
  }
  mkdirSync(distDir, { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { manifest, missing }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printUsage()
    return
  }

  if (!existsSync(viteBin)) {
    fail(`找不到本地 vite：${viteBin}。请先在项目根目录执行 npm ci / npm install。`)
  }
  if (!existsSync(viteConfig)) {
    fail(`找不到构建配置：${viteConfig}`)
  }

  const allTools = listTools()
  const selected = opts.only
    ? allTools.filter((tool) => opts.only.includes(tool.id))
    : allTools

  if (opts.only) {
    const unknown = opts.only.filter((id) => !allTools.some((tool) => tool.id === id))
    if (unknown.length > 0) {
      fail(`--only 指定了不存在的工具：${unknown.join(', ')}（可用：${allTools.map((t) => t.id).join(', ')}）`)
    }
  }
  if (selected.length === 0) fail('没有选中任何工具')

  if (opts.clean && existsSync(distDir)) {
    log(`[clean] 删除 ${toPosix(relative(rootDir, distDir))}/`)
    rmSync(distDir, { recursive: true, force: true })
  }
  mkdirSync(distDir, { recursive: true })

  log('==============================================================')
  log(`7FA4-Chat 工具包构建：${selected.length} 个工具  (node ${process.version}, vite ${readViteVersion()})`)
  log(`源码目录：tools/  产物目录：${toPosix(relative(rootDir, distDir))}/`)
  log('==============================================================')

  const startedAt = Date.now()
  const results = []
  for (const tool of selected) {
    const result = buildTool(tool)
    results.push({ tool, ...result })
  }

  const { manifest, missing } = buildManifest(allTools)

  // 体积汇总
  log('')
  log('==============================================================')
  log('产物汇总')
  log('==============================================================')
  const idWidth = Math.max(10, ...manifest.tools.map((item) => item.id.length))
  log(`${'工具'.padEnd(idWidth)}  ${'版本'.padEnd(8)} ${'文件数'.padStart(6)}  ${'体积'.padStart(10)}`)
  for (const item of manifest.tools) {
    log(
      `${item.id.padEnd(idWidth)}  ${item.version.padEnd(8)} ${String(item.files.length).padStart(6)}  ${formatBytes(item.size).padStart(10)}`
    )
  }
  const totalFiles = manifest.tools.reduce((sum, item) => sum + item.files.length, 0)
  const totalSize = manifest.tools.reduce((sum, item) => sum + item.size, 0)
  log('--------------------------------------------------------------')
  log(`${'合计'.padEnd(idWidth)}  ${''.padEnd(8)} ${String(totalFiles).padStart(6)}  ${formatBytes(totalSize).padStart(10)}`)
  if (missing.length > 0) log(`未构建：${missing.join(', ')}（tools.json 未包含）`)
  log('')
  log(`清单：${toPosix(relative(rootDir, manifestPath))}（schema ${manifest.schema}，${manifest.tools.length} 个工具）`)
  log(`总耗时：${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}

try {
  main()
} catch (error) {
  console.error('')
  console.error(`[tools] 构建失败：${error && error.message ? error.message : error}`)
  process.exitCode = 1
}
