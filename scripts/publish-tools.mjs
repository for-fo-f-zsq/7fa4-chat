#!/usr/bin/env node
/**
 * scripts/publish-tools.mjs —— 把 dist-tools/ 产物发布到 GitLab Generic Package（项目 886）。
 *
 * 目标（Lead 2026-11 确认）：
 *   - 包地址：${GITLAB_API}/projects/886/packages/generic/TOOLS/latest
 *   - 清单：包根 tools.json（不编码，直接 GET …/TOOLS/latest/tools.json）
 *   - 工具文件：同包内单层文件名（见下方「扁平映射」）
 *   - 发布策略：整包替换 —— 先本地校验全部文件（size + sha256），再分页 DELETE 所有旧 TOOLS 包，
 *     然后逐文件 PUT 上传，最后匿名校验（tools.json 200 + size/sha256 一致 + 抽查工具文件）。
 *
 * 扁平映射（发布端与客户端必须完全一致；客户端见 src/main/index.js、src/renderer/src/platform/web-api.js）：
 *   flatName(relPath) = relPath.split('/').join('__')
 *   relPath 对工具文件 = `${tool.dir}/${file.path}`，清单 = 'tools.json'
 *   例：calculator/1.0.0/index.html        -> calculator__1.0.0__index.html
 *       math/1.0.0/geogebra/HTML5/a.js     -> math__1.0.0__geogebra__HTML5__a.js
 *   为什么必须扁平：实测该 GitLab 实例拒绝含 `/` 的 file_name
 *     （GET …/generic/<pkg>/latest/a/b   -> 400 {"error":"package_version is invalid"}
 *      GET …/generic/<pkg>/latest/a%2Fb -> 400 {"error":"file_name is invalid"}）
 *   因此包内不能保留目录结构；清单 schema 不变，映射由两端各自按同一规则计算。
 *
 * 用法：
 *   node scripts/publish-tools.mjs                  # dry-run（默认）：只打印计划，不做任何写操作
 *   node scripts/publish-tools.mjs --apply          # 真正发布（CI 用；需要 GITLAB_TOKEN）
 *   node scripts/publish-tools.mjs --offline        # dry-run 且完全跳过远端查询
 *   node scripts/publish-tools.mjs --probe          # 用临时包 TOOLS-PROBE 实测上传/下载/清理（需要 GITLAB_TOKEN）
 *
 * 环境变量：
 *   GITLAB_TOKEN          仅 --apply / --probe 需要；只从进程环境读取，绝不打印、不写入任何文件
 *   GITLAB_API            默认 https://jx.7fa4.cn:9080/api/v4
 *   GITLAB_PROJECT        默认 886
 *   GITLAB_TOOLS_PACKAGE  默认 TOOLS
 *   GITLAB_TOOLS_VERSION  默认 latest
 *
 * 安全约束：
 *   - 默认 dry-run；没有 --apply 不会删除、上传任何远端内容。
 *   - 删除只针对 package_name=TOOLS（--probe 时是 TOOLS-PROBE）的包，绝不触碰其他包（如 7FA4-Chat）。
 *   - 本地文件读取与 sha256 自检在删除旧包之前完成；任一校验失败直接退出，远端保持原样。
 *   - 删除旧包后、上传完成前，线上会短暂没有工具包（与 release.yml 的整包替换策略一致，可接受）。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(rootDir, 'dist-tools')
const manifestPath = join(distDir, 'tools.json')

const MANIFEST_SCHEMA = 1
const DEFAULT_API = 'https://jx.7fa4.cn:9080/api/v4'
const DEFAULT_PROJECT = '886'
const DEFAULT_PACKAGE = 'TOOLS'
const DEFAULT_VERSION = 'latest'
const FLAT_SEP = '__'
const PROBE_PACKAGE_SUFFIX = '-PROBE'

const LIST_TIMEOUT_MS = 20000
const UPLOAD_TIMEOUT_MS = 180000
const VERIFY_TIMEOUT_MS = 60000
const DELETE_ROUND_LIMIT = 50
const VERIFY_ATTEMPTS = 8
const VERIFY_DELAY_MS = 1200

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function fail(message) {
  throw new Error(message)
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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function shortSha(value) {
  return typeof value === 'string' ? value.slice(0, 12) : '?'
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

/** 响应体摘要（用于错误信息；不含请求头 / token） */
function brief(data) {
  if (data === null || data === undefined) return ''
  const text = typeof data === 'string' ? data : JSON.stringify(data)
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

async function withRetry(label, fn, { attempts = 3, delayMs = 800 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        console.log(`[retry] ${label} 第 ${attempt} 次失败，${delayMs}ms 后重试：${error.message}`)
        await sleep(delayMs)
      }
    }
  }
  throw lastError
}

/* ------------------------------------------------------------------ *
 * 扁平映射
 * ------------------------------------------------------------------ */

/**
 * 相对路径 → Generic Package 单层文件名。
 * 规则：所有 '/' 替换为 '__'，不做其他转义；上传时再对整段做 encodeURIComponent。
 */
function flatName(relPath) {
  if (typeof relPath !== 'string' || !relPath) fail('flatName() 需要非空相对路径')
  if (relPath.startsWith('/') || relPath.endsWith('/')) {
    fail(`相对路径不能以 '/' 开头或结尾：${relPath}`)
  }
  const name = relPath.split('/').join(FLAT_SEP)
  assertFlatName(name)
  return name
}

/** 校验单层文件名满足上传要求（不含路径分隔符；长度留给后续明显异常判断） */
function assertFlatName(name) {
  if (typeof name !== 'string' || !name) fail('包内文件名为空')
  if (name.includes('/') || name.includes('\\')) fail(`包内文件名不能包含路径分隔符：${name}`)
  if (name === '.' || name === '..') fail(`非法包内文件名：${name}`)
  if (name.length > 200) fail(`包内文件名过长（${name.length} 字符）：${name.slice(0, 60)}…`)
  return name
}

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

function printUsage() {
  console.log(`用法：node scripts/publish-tools.mjs [--apply] [--offline] [--probe]
       [--api <url>] [--project <id>] [--package <name>] [--version <ver>]
       [--message <msg>] [--branch <name>]

  默认            dry-run：校验 dist-tools/ 并打印发布计划（删除哪些旧包、上传哪些文件），不做任何写操作
  --apply         真正发布：先校验本地文件 → 删除旧包 → 逐文件上传 → 匿名校验（需要 GITLAB_TOKEN）
  --offline       跳过远端查询（仅 dry-run；远端状态未知时按待上传估算）
  --probe         用临时包 TOOLS-PROBE 实测：扁平上传 / 嵌套上传对照 / 匿名下载 / 清理（需要 GITLAB_TOKEN）
  --api <url>     GitLab API 基址，默认 $GITLAB_API 或 ${DEFAULT_API}
  --project <id>  项目 id，默认 $GITLAB_PROJECT 或 ${DEFAULT_PROJECT}
  --package <n>   包名，默认 $GITLAB_TOOLS_PACKAGE 或 ${DEFAULT_PACKAGE}
  --version <v>   包版本段，默认 $GITLAB_TOOLS_VERSION 或 ${DEFAULT_VERSION}
  --message <m>   兼容旧参数：Generic Package 无 commit message，仅提示后忽略
  --branch <b>    兼容旧参数：不再使用仓库分支，仅提示后忽略

发布布局（Generic Package ${DEFAULT_PACKAGE}/${DEFAULT_VERSION}）：
  tools.json                                  <- 清单（包根，URL 不编码）
  calculator__1.0.0__index.html               <- 工具文件扁平名：相对路径中 '/' → '__'
  math__1.0.0__geogebra__calculator.html      <- 例：math/1.0.0/geogebra/calculator.html

安全说明：只有 --apply 会改动远端；删除仅限 --package 指定的包里列出的包 id，不会动其他包。`)
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    offline: false,
    probe: false,
    message: '',
    branch: '',
    api: String(process.env.GITLAB_API || DEFAULT_API),
    project: String(process.env.GITLAB_PROJECT || DEFAULT_PROJECT),
    packageName: String(process.env.GITLAB_TOOLS_PACKAGE || DEFAULT_PACKAGE),
    packageVersion: String(process.env.GITLAB_TOOLS_VERSION || DEFAULT_VERSION)
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const nextValue = () => {
      const value = argv[++i]
      if (!value) fail(`${arg} 后需要跟一个值`)
      return value
    }
    if (arg === '--apply') opts.apply = true
    else if (arg === '--dry-run') opts.apply = false
    else if (arg === '--offline') opts.offline = true
    else if (arg === '--probe') opts.probe = true
    else if (arg === '--message') opts.message = nextValue()
    else if (arg === '--branch') opts.branch = nextValue()
    else if (arg === '--api') opts.api = nextValue()
    else if (arg === '--project') opts.project = nextValue()
    else if (arg === '--package') opts.packageName = nextValue()
    else if (arg === '--version') opts.packageVersion = nextValue()
    else if (arg === '-h' || arg === '--help') {
      printUsage()
      process.exit(0)
    } else fail(`未知参数：${arg}（用 --help 查看用法）`)
  }
  opts.api = opts.api.trim().replace(/\/+$/, '')
  opts.project = opts.project.trim()
  opts.packageName = opts.packageName.trim()
  opts.packageVersion = opts.packageVersion.trim()
  if (!opts.api) fail('GitLab API 基址为空（--api / GITLAB_API）')
  if (!opts.project) fail('项目 id 为空（--project / GITLAB_PROJECT）')
  if (!opts.packageName) fail('包名为空（--package / GITLAB_TOOLS_PACKAGE）')
  if (!opts.packageVersion) fail('包版本段为空（--version / GITLAB_TOOLS_VERSION）')
  if (opts.apply && opts.offline) fail('--apply 与 --offline 不能同时使用')
  if (opts.apply && opts.probe) fail('--apply 与 --probe 不能同时使用（probe 用临时包，不会发布真实工具包）')
  return opts
}

/* ------------------------------------------------------------------ *
 * 读取 dist-tools/tools.json → 本地发布清单（删除旧包前完成全部读取与校验）
 * ------------------------------------------------------------------ */

function loadPublishedFiles() {
  if (!existsSync(manifestPath)) {
    fail(`找不到 ${manifestPath}。请先执行：node scripts/build-tools.mjs`)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`dist-tools/tools.json 不是合法 JSON：${error.message}`)
  }
  if (manifest.schema !== MANIFEST_SCHEMA) {
    fail(`不支持的 tools.json schema：${manifest.schema}（期望 ${MANIFEST_SCHEMA}）`)
  }
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    fail('tools.json 中没有任何工具，拒绝发布（先执行全量构建）')
  }

  const files = []
  const flatNames = new Map()
  for (const tool of manifest.tools) {
    if (!tool || typeof tool.id !== 'string' || !tool.id) fail('tools.json 中存在缺少 id 的工具条目')
    if (typeof tool.version !== 'string' || !tool.version) fail(`工具 ${tool.id} 缺少 version`)
    if (typeof tool.dir !== 'string' || !tool.dir) fail(`工具 ${tool.id} 缺少 dir`)
    const expectedDir = `${tool.id}/${tool.version}`
    if (tool.dir !== expectedDir) {
      fail(`工具 ${tool.id} 的 dir 格式不符：期望 ${expectedDir}，实际 ${tool.dir}`)
    }
    if (!Array.isArray(tool.files) || tool.files.length === 0) fail(`工具 ${tool.id} 的 files 为空`)

    for (const file of tool.files) {
      if (!file || typeof file.path !== 'string' || !file.path) fail(`工具 ${tool.id} 的文件条目缺少 path`)
      if (file.path.startsWith('/') || file.path.includes('..')) {
        fail(`工具 ${tool.id} 的文件路径不安全：${file.path}`)
      }
      const relPath = `${tool.dir}/${file.path}`
      const fullPath = resolve(distDir, tool.dir, file.path)
      const distPrefix = distDir.endsWith(sep) ? distDir : `${distDir}${sep}`
      if (!fullPath.startsWith(distPrefix)) fail(`文件路径越界：${relPath}`)
      if (!existsSync(fullPath)) fail(`产物文件缺失：${fullPath}（先重新构建）`)

      const buffer = readFileSync(fullPath)
      const actualSize = buffer.length
      if (Number.isFinite(file.size) && actualSize !== file.size) {
        fail(`文件大小与清单不一致：${relPath}（实际 ${actualSize}，清单 ${file.size}）`)
      }
      const actualSha256 = sha256(buffer)
      if (file.sha256 && actualSha256 !== file.sha256) {
        fail(`文件 sha256 与 tools.json 不一致：${relPath}（先重新构建再发布）`)
      }

      const name = flatName(relPath)
      const previous = flatNames.get(name)
      if (previous) fail(`扁平文件名冲突：${previous} 与 ${relPath} 都映射为 ${name}`)
      flatNames.set(name, relPath)
      files.push({ relPath, flatName: name, size: actualSize, sha256: actualSha256, buffer })
    }
  }

  // 清单本身：包根 tools.json（URL 不编码）
  const manifestBuffer = readFileSync(manifestPath)
  const manifestRecord = {
    relPath: 'tools.json',
    flatName: 'tools.json',
    size: manifestBuffer.length,
    sha256: sha256(manifestBuffer),
    buffer: manifestBuffer,
    isManifest: true
  }
  if (flatNames.has('tools.json')) fail('扁平文件名冲突：tools.json 与工具文件重名')
  files.push(manifestRecord)

  return { manifest, files }
}

function printLocalPlan(manifest, files) {
  const toolFiles = files.filter((file) => !file.isManifest)
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  console.log(
    `[plan] 清单：${manifest.tools.length} 个工具，${files.length} 个文件（含 tools.json），合计 ${formatBytes(totalBytes)}`
  )
  for (const tool of manifest.tools) {
    const bytes = tool.files.reduce((sum, file) => sum + (file.size || 0), 0)
    console.log(`[plan]   ${tool.id}@${tool.version}  ${tool.files.length} 个文件  ${formatBytes(bytes)}`)
  }
  console.log(
    `[plan] 包内文件名映射：相对路径中的 '/' → '${FLAT_SEP}'（实例不支持嵌套路径）；已校验 ${toolFiles.length} 个工具文件名两两唯一`
  )
  const examples = toolFiles.slice(0, 3)
  for (const file of examples) {
    console.log(`[plan]   ${file.relPath}  ->  ${file.flatName}`)
  }
  return totalBytes
}

/* ------------------------------------------------------------------ *
 * GitLab API
 * ------------------------------------------------------------------ */

function createClient(opts) {
  const token = String(process.env.GITLAB_TOKEN || '').trim()
  const apiBase = opts.api
  const projectUrl = `${apiBase}/projects/${encodeURIComponent(opts.project)}`

  function packageBaseUrl(packageName, packageVersion) {
    return `${projectUrl}/packages/generic/${encodeURIComponent(packageName)}/${encodeURIComponent(packageVersion)}`
  }

  async function request(method, url, { body, headers, timeoutMs = LIST_TIMEOUT_MS, auth = true } = {}) {
    const requestHeaders = { ...(headers || {}) }
    if (auth && token) requestHeaders['PRIVATE-TOKEN'] = token
    let response
    try {
      response = await fetch(url, {
        method,
        body,
        headers: requestHeaders,
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      throw new Error(`${method} ${url} 请求失败：${error.cause?.code || error.message}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const text = buffer.toString('utf8')
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }
    return { status: response.status, ok: response.ok, headers: response.headers, buffer, text, json }
  }

  /** 分页列出指定包名的包（匿名可用；返回全部页） */
  async function listPackages(packageName) {
    const packages = []
    const seen = new Set()
    let page = 1
    for (let guard = 0; guard < 1000; guard++) {
      const url =
        `${projectUrl}/packages?package_name=${encodeURIComponent(packageName)}` +
        `&per_page=100&page=${page}`
      const response = await request('GET', url, { auth: Boolean(token) })
      if (!response.ok) {
        throw new Error(`列出包失败：HTTP ${response.status} ${brief(response.json ?? response.text)}`)
      }
      if (!Array.isArray(response.json)) {
        throw new Error(`列出包响应不是数组：${brief(response.text)}`)
      }
      for (const item of response.json) {
        if (!item || typeof item.id !== 'number') continue
        if (seen.has(item.id)) continue
        seen.add(item.id)
        packages.push({
          id: item.id,
          name: item.name,
          version: item.version,
          packageType: item.package_type,
          createdAt: item.created_at
        })
      }
      const next = Number(response.headers.get('x-next-page') || 0)
      if (!next || next <= page) break
      page = next
    }
    return packages
  }

  async function deletePackage(packageId) {
    const response = await request('DELETE', `${projectUrl}/packages/${packageId}`, {
      timeoutMs: LIST_TIMEOUT_MS
    })
    if (response.status === 404) return { alreadyGone: true, status: 404 }
    if (!response.ok) {
      throw new Error(`删除包 ${packageId} 失败：HTTP ${response.status} ${brief(response.json ?? response.text)}`)
    }
    return { alreadyGone: false, status: response.status }
  }

  async function uploadFile(baseUrl, name, buffer) {
    assertFlatName(name)
    const url = `${baseUrl}/${encodeURIComponent(name)}`
    const response = await request('PUT', url, {
      body: buffer,
      headers: { 'content-type': 'application/octet-stream' },
      timeoutMs: UPLOAD_TIMEOUT_MS
    })
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(
        `上传 ${name} 失败：HTTP ${response.status} ${brief(response.json ?? response.text)}`,
      )
    }
    return response.status
  }

  /** 下载包内文件（默认匿名；--probe/verify 用） */
  async function downloadFile(baseUrl, name, { auth = false, timeoutMs = VERIFY_TIMEOUT_MS } = {}) {
    const url = `${baseUrl}/${encodeURIComponent(name)}`
    const response = await request('GET', url, { auth, timeoutMs })
    return response
  }

  async function verifyToken() {
    const response = await request('GET', `${apiBase}/user`, { timeoutMs: LIST_TIMEOUT_MS })
    if (response.status === 401 || response.status === 403) {
      throw new Error('GITLAB_TOKEN 无效或没有权限（GET /user 返回 401/403）')
    }
    if (!response.ok) {
      throw new Error(`校验 token 失败：HTTP ${response.status} ${brief(response.json ?? response.text)}`)
    }
    const username = response.json?.username || response.json?.name || 'unknown'
    console.log(`[auth] token 有效（用户：${username}）；不回显 token`)
  }

  return {
    apiBase,
    projectUrl,
    token,
    hasToken: Boolean(token),
    packageBaseUrl,
    request,
    listPackages,
    deletePackage,
    uploadFile,
    downloadFile,
    verifyToken
  }
}

/* ------------------------------------------------------------------ *
 * dry-run / apply
 * ------------------------------------------------------------------ */

function printRemotePackages(packages, packageName) {
  if (packages.length === 0) {
    console.log(`[remote] 远端还没有名为 ${packageName} 的包（首次发布）`)
    return
  }
  console.log(`[remote] 远端已有 ${packages.length} 个名为 ${packageName} 的包，--apply 时将全部删除：`)
  for (const item of packages) {
    console.log(
      `[remote]   id=${item.id}  ${item.name}/${item.version}  type=${item.packageType || '?'}  created=${item.createdAt || '?'}`
    )
  }
}

async function applyPublish(client, opts, files) {
  if (!client.hasToken) {
    fail('--apply 需要环境变量 GITLAB_TOKEN（api scope + 项目 886 的 Maintainer/Owner 权限）')
  }
  await client.verifyToken()

  // 1) 删除所有旧包（每轮都重新取 page=1，避免分页偏移）
  let deleted = 0
  for (let round = 1; round <= DELETE_ROUND_LIMIT; round++) {
    const packages = await client.listPackages(opts.packageName)
    if (packages.length === 0) break
    for (const item of packages) {
      console.log(`[delete] 删除旧包 id=${item.id} ${item.name}/${item.version} …`)
      await client.deletePackage(item.id)
      deleted++
    }
    if (round === DELETE_ROUND_LIMIT) {
      fail(`删除旧包达到 ${DELETE_ROUND_LIMIT} 轮仍未清空，已中止`)
    }
  }
  console.log(`[delete] 完成：共删除 ${deleted} 个旧包`)

  // 2) 逐文件上传（清单最后上传，避免"清单已存在但文件还没传完"的更早时间窗）
  const packageBase = client.packageBaseUrl(opts.packageName, opts.packageVersion)
  const ordered = [...files.filter((file) => !file.isManifest), ...files.filter((file) => file.isManifest)]
  let uploadedBytes = 0
  for (let i = 0; i < ordered.length; i++) {
    const file = ordered[i]
    const status = await client.uploadFile(packageBase, file.flatName, file.buffer)
    uploadedBytes += file.size
    console.log(
      `[upload] ${String(i + 1).padStart(3)}/${ordered.length}  ${formatBytes(file.size).padStart(9)}  ${file.flatName}  (HTTP ${status})`
    )
  }
  console.log(`[upload] 完成：${ordered.length} 个文件，${formatBytes(uploadedBytes)}`)

  // 3) 校验
  await verifyPublished(client, opts, files)
}

async function verifyPublished(client, opts, files) {
  console.log('')
  console.log('[verify] 开始校验线上包 …')

  // 3.1 包列表：应只剩一个 TOOLS/latest
  const packages = await withRetry(
    `列出 ${opts.packageName}`,
    async () => {
      const list = await client.listPackages(opts.packageName)
      if (list.length === 0) throw new Error('包列表为空（可能还没刷新，重试中）')
      return list
    },
    { attempts: VERIFY_ATTEMPTS, delayMs: VERIFY_DELAY_MS }
  )
  const wrong = packages.filter(
    (item) => item.name !== opts.packageName || item.version !== opts.packageVersion
  )
  if (wrong.length > 0) {
    fail(`线上存在非预期的旧包：${wrong.map((item) => `${item.name}/${item.version}`).join(', ')}`)
  }
  if (packages.length !== 1) {
    fail(`线上 ${opts.packageName} 包数量为 ${packages.length}（期望 1）`)
  }
  console.log(`[verify] 包列表：${packages[0].name}/${packages[0].version}（id=${packages[0].id}）`)

  const packageBase = client.packageBaseUrl(opts.packageName, opts.packageVersion)

  // 3.2 匿名校验清单 tools.json（重试等待 package registry 可见）
  const manifestRecord = files.find((file) => file.isManifest)
  const manifestResponse = await withRetry(
    '匿名下载 tools.json',
    async () => {
      const response = await client.downloadFile(packageBase, 'tools.json')
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status} ${brief(response.json ?? response.text)}`)
      }
      return response
    },
    { attempts: VERIFY_ATTEMPTS, delayMs: VERIFY_DELAY_MS }
  )
  verifyBuffer('匿名 GET tools.json', manifestResponse.buffer, manifestRecord)

  // 3.3 抽查工具文件：每个工具的入口 index.html（没有则取该工具第一个文件）+ 最大的文件
  const toolFiles = files.filter((file) => !file.isManifest)
  const samples = []
  const seen = new Set()
  const byTool = new Map()
  for (const file of toolFiles) {
    const parts = file.relPath.split('/')
    const prefix = `${parts[0]}/${parts[1]}`
    if (!byTool.has(prefix)) byTool.set(prefix, [])
    byTool.get(prefix).push(file)
  }
  for (const [prefix, list] of byTool) {
    const entry = list.find((file) => file.relPath === `${prefix}/index.html`) || list[0]
    if (!seen.has(entry.relPath)) {
      seen.add(entry.relPath)
      samples.push(entry)
    }
  }
  const largest = toolFiles.reduce(
    (max, file) => (!max || file.size > max.size ? file : max),
    null
  )
  if (largest && !seen.has(largest.relPath)) {
    seen.add(largest.relPath)
    samples.push(largest)
  }

  for (const file of samples) {
    const response = await withRetry(
      `匿名下载 ${file.flatName}`,
      async () => {
        const result = await client.downloadFile(packageBase, file.flatName)
        if (result.status !== 200) {
          throw new Error(`HTTP ${result.status} ${brief(result.json ?? result.text)}`)
        }
        return result
      },
      { attempts: VERIFY_ATTEMPTS, delayMs: VERIFY_DELAY_MS }
    )
    verifyBuffer(`匿名 GET ${file.flatName}`, response.buffer, file)
  }

  console.log('[verify] 通过：包列表、tools.json、工具文件抽查的 size/sha256 均与本地一致')
}

function verifyBuffer(label, actualBuffer, expectedFile) {
  if (actualBuffer.length !== expectedFile.size) {
    fail(`${label} 大小不一致：线上 ${actualBuffer.length}，本地 ${expectedFile.size}`)
  }
  const actualSha256 = sha256(actualBuffer)
  if (actualSha256 !== expectedFile.sha256) {
    fail(`${label} sha256 不一致：线上 ${actualSha256}，本地 ${expectedFile.sha256}`)
  }
  console.log(
    `[verify] ${label} OK  ${formatBytes(expectedFile.size)}  sha256=${shortSha(expectedFile.sha256)}…`
  )
}

/* ------------------------------------------------------------------ *
 * --probe：用临时包实测上传/下载/嵌套路径/清理（绝不触碰 TOOLS 与其他包）
 * ------------------------------------------------------------------ */

async function runProbe(client, opts) {
  if (!client.hasToken) {
    console.log('[probe] 未设置 GITLAB_TOKEN，跳过实测（dry-run 逻辑已单独验证；--apply / --probe 需要 token）')
    return
  }
  const probeName = `${opts.packageName}${PROBE_PACKAGE_SUFFIX}`
  const probeVersion = `probe-${Date.now()}`
  const probeBase = client.packageBaseUrl(probeName, probeVersion)
  const flatBody = Buffer.from('probe flat file\n', 'utf8')
  const flatNameRealistic = 'calculator__1.0.0__index.html'
  const realisticBody = Buffer.from('<html>probe</html>\n', 'utf8')

  console.log('')
  console.log('==============================================================')
  console.log(`[probe] 临时包：${probeName}/${probeVersion}`)
  console.log(`[probe] 包地址：${probeBase}`)
  console.log('[probe] 只操作该临时包；结束后会删除。不会触碰 TOOLS 或 7FA4-Chat 包。')
  console.log('==============================================================')

  let flatUploadStatus = 0
  let flatDownloadOk = false
  try {
    // 1) 扁平文件名上传
    try {
      flatUploadStatus = await client.uploadFile(probeBase, 'probe-flat.txt', flatBody)
      console.log(`[probe] 1. 扁平上传 probe-flat.txt -> HTTP ${flatUploadStatus}`)
    } catch (error) {
      console.log(`[probe] 1. 扁平上传 probe-flat.txt -> 失败：${error.message}`)
    }

    // 2) 真实扁平名（含 '__'）上传
    try {
      const status = await client.uploadFile(probeBase, flatNameRealistic, realisticBody)
      console.log(`[probe] 2. 真实扁平名上传 ${flatNameRealistic} -> HTTP ${status}`)
    } catch (error) {
      console.log(`[probe] 2. 真实扁平名上传 ${flatNameRealistic} -> 失败：${error.message}`)
    }

    // 3) 匿名下载扁平文件
    if (flatUploadStatus) {
      const response = await withRetry(
        'probe 匿名下载',
        async () => {
          const result = await client.downloadFile(probeBase, 'probe-flat.txt')
          if (result.status !== 200) throw new Error(`HTTP ${result.status}`)
          return result
        },
        { attempts: 5, delayMs: 1000 }
      )
      flatDownloadOk =
        response.buffer.length === flatBody.length && sha256(response.buffer) === sha256(flatBody)
      console.log(
        `[probe] 3. 匿名下载 probe-flat.txt -> HTTP ${response.status}，${response.buffer.length} B，内容${flatDownloadOk ? '一致' : '不一致'}`
      )
    } else {
      console.log('[probe] 3. 跳过匿名下载（扁平上传未成功）')
    }

    // 4) 嵌套路径对照：字面量与 %2F
    const nestedLiteralUrl = `${probeBase}/nested/probe.txt`
    const nestedLiteral = await client.request('PUT', nestedLiteralUrl, {
      body: Buffer.from('nested literal\n', 'utf8'),
      headers: { 'content-type': 'application/octet-stream' },
      timeoutMs: LIST_TIMEOUT_MS
    })
    console.log(
      `[probe] 4. 嵌套字面量上传 nested/probe.txt -> HTTP ${nestedLiteral.status} ${brief(nestedLiteral.json ?? nestedLiteral.text)}`
    )

    const nestedEncodedUrl = `${probeBase}/nested%2Fprobe.txt`
    const nestedEncoded = await client.request('PUT', nestedEncodedUrl, {
      body: Buffer.from('nested encoded\n', 'utf8'),
      headers: { 'content-type': 'application/octet-stream' },
      timeoutMs: LIST_TIMEOUT_MS
    })
    console.log(
      `[probe] 5. 嵌套 %2F 上传 nested%2Fprobe.txt -> HTTP ${nestedEncoded.status} ${brief(nestedEncoded.json ?? nestedEncoded.text)}`
    )

    // 6) 匿名 GET 嵌套路径（对照：预期 4xx）
    //    a. 原始 URL 多段（字面量路径，不加编码）
    const nestedGetLiteralRaw = await client
      .request('GET', nestedLiteralUrl, { timeoutMs: LIST_TIMEOUT_MS })
      .catch((error) => ({ status: 0, text: error.message }))
    console.log(
      `[probe] 6. 匿名 GET 嵌套字面量（原始 URL） -> HTTP ${nestedGetLiteralRaw.status} ${brief(nestedGetLiteralRaw.json ?? nestedGetLiteralRaw.text)}`
    )
    //    b. 编码斜杠（%2F 作为单段文件名）
    const nestedGetEncoded = await client
      .request('GET', nestedEncodedUrl, { timeoutMs: LIST_TIMEOUT_MS })
      .catch((error) => ({ status: 0, text: error.message }))
    console.log(
      `[probe] 7. 匿名 GET 嵌套 %2F -> HTTP ${nestedGetEncoded.status} ${brief(nestedGetEncoded.json ?? nestedGetEncoded.text)}`
    )
  } finally {
    // 清理：只删除 package_name === probeName 的包（按列表逐一删除并复核）
    console.log('[probe] 清理临时包 …')
    let removed = 0
    for (let round = 1; round <= DELETE_ROUND_LIMIT; round++) {
      const packages = await client.listPackages(probeName)
      if (packages.length === 0) break
      for (const item of packages) {
        if (item.name !== probeName) {
          fail(`清理时发现非临时包 ${item.name}，已中止（不会删除）`)
        }
        await client.deletePackage(item.id)
        removed++
      }
    }
    const left = await client.listPackages(probeName)
    console.log(
      `[probe] 清理完成：删除 ${removed} 个临时包；剩余 ${left.length} 个${left.length ? '（需要手工检查）' : ''}`
    )
    if (left.length > 0) fail('临时包未清理干净，请手工检查')
  }

  console.log('')
  const verdict = flatUploadStatus === 200 || flatUploadStatus === 201
  console.log(
    `[probe] 结论：扁平文件名上传${verdict ? '可用' : '不可用'}；匿名下载${flatDownloadOk ? '一致' : '异常'}；` +
      '嵌套路径上传/下载结果见上（该实例预期拒绝嵌套文件名）'
  )
  if (!verdict || !flatDownloadOk) {
    fail('probe 失败：扁平上传或匿名下载不符合预期，请检查实例行为')
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const client = createClient(opts)

  if (opts.probe) {
    console.log('==============================================================')
    console.log('7FA4-Chat 工具包发布能力实测（PROBE，临时包）')
    console.log(`API：${client.apiBase}/projects/${encodeURIComponent(opts.project)}`)
    console.log(`临时包：${opts.packageName}${PROBE_PACKAGE_SUFFIX}（版本 probe-<timestamp>）`)
    console.log(`Token：${client.hasToken ? '已从环境变量读取（不回显）' : '未设置'}`)
    console.log('==============================================================')
    await runProbe(client, opts)
    return
  }

  const mode = opts.apply ? 'APPLY' : 'DRY-RUN'
  console.log('==============================================================')
  console.log(`7FA4-Chat 工具包发布到 Generic Package（${mode}）`)
  console.log(`API：${client.apiBase}/projects/${encodeURIComponent(opts.project)}`)
  console.log(`包：${opts.packageName}/${opts.packageVersion}  ->  ${client.packageBaseUrl(opts.packageName, opts.packageVersion)}`)
  console.log(`Token：${client.hasToken ? '已从环境变量读取（不回显）' : '未设置'}`)
  console.log('==============================================================')

  if (opts.apply && !client.hasToken) {
    // 快速失败：--apply 没有 token 时不做任何远端请求，避免出现"半途才发现权限不足"
    fail('--apply 需要环境变量 GITLAB_TOKEN（api scope + 项目 886 的 Maintainer/Owner 权限）')
  }

  if (opts.message) {
    console.log('[info] --message 对 Generic Package 发布无效（没有 commit），已忽略')
  }
  if (opts.branch) {
    console.log('[info] --branch 已不再使用（发布目标是包仓库而非仓库分支），已忽略')
  }

  const { manifest, files } = loadPublishedFiles()
  const totalBytes = printLocalPlan(manifest, files)

  // 远端现状（dry-run 也读取；失败则降级为「远端状态未知」）
  let remotePackages = null
  if (opts.offline) {
    console.log('[remote] --offline：跳过远端查询，计划按「远端状态未知」估算')
  } else {
    try {
      remotePackages = await client.listPackages(opts.packageName)
      printRemotePackages(remotePackages, opts.packageName)
    } catch (error) {
      remotePackages = null
      if (opts.apply) fail(`无法读取远端包状态，已中止（不允许盲删/盲传）：${error.message}`)
      console.log(`[remote] [warn] 读取远端包状态失败，按「未知」继续 dry-run：${error.message}`)
    }
  }

  console.log('')
  console.log('--------------------------------------------------------------')
  console.log(`[plan] 将上传 ${files.length} 个文件，合计 ${formatBytes(totalBytes)}（清单最后上传）`)
  const preview = files.slice(0, 20)
  for (const file of preview) {
    console.log(`[plan]   ${formatBytes(file.size).padStart(9)}  ${file.flatName}`)
  }
  if (files.length > preview.length) {
    console.log(`[plan]   … 其余 ${files.length - preview.length} 个文件省略`)
  }
  console.log('--------------------------------------------------------------')

  if (!opts.apply) {
    console.log('')
    console.log('[publish] DRY-RUN：未删除、未上传任何内容。确认无误后加 --apply 执行真正发布。')
    if (!client.hasToken) {
      console.log('[publish] 提示：真发布/实测需要环境变量 GITLAB_TOKEN。')
    }
    if (!opts.offline) {
      console.log('[publish] 注意：--apply 会先删除上方列出的全部旧包，再逐个上传；删除后到上传完成前线上会短暂不可用。')
    }
    return
  }

  await applyPublish(client, opts, files)
  console.log('')
  console.log(
    `[publish] 完成：${opts.packageName}/${opts.packageVersion} 已发布 ${files.length} 个文件（${formatBytes(totalBytes)}），并通过匿名下载校验。`
  )
}

main().catch((error) => {
  console.error('')
  console.error(`[publish] 失败：${error && error.message ? error.message : error}`)
  process.exitCode = 1
})
