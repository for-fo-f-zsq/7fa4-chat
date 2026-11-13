/**
 * 网页版构建：vite build（config/vite.web.config.mjs）→ out/web/
 * 用法：
 *   node scripts/web/build-web-app.mjs                 # 构建到 out/web/
 *   node scripts/web/build-web-app.mjs --copy-to-site  # 构建并原子同步到 site/public/web/
 *
 * 直接 node 起 vite 的 bin（不走 npx/.cmd）：Windows/Linux 下更稳，也不依赖 PATH。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, rmSync, cpSync, renameSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, 'out/web')
const viteBin = resolve(root, 'node_modules/vite/bin/vite.js')

if (!existsSync(viteBin)) {
  console.error('[build-web] 找不到 vite：' + viteBin + '（先 npm install）')
  process.exit(1)
}

const r = spawnSync(process.execPath, [viteBin, 'build', '--config', 'config/vite.web.config.mjs'], {
  cwd: root,
  stdio: 'inherit'
})
if (r.error) {
  console.error('[build-web] 启动 vite 失败：' + r.error.message)
  process.exit(1)
}
if (r.status !== 0) process.exit(r.status ?? 1)

const index = join(outDir, 'index.html')
if (!existsSync(index)) {
  console.error('[build-web] 产物缺失：' + index)
  process.exit(1)
}
console.log('[build-web] 完成：' + outDir)
console.log('[build-web] index.html ' + statSync(index).size + ' B')

// 可选：同步产物进官网静态目录（使用 staging 目录切换，避免部署期间服务读到半成品）
if (process.argv.includes('--copy-to-site')) {
  const target = resolve(process.env.SITE_PUBLIC_WEB || resolve(root, 'site/public/web'))
  const parent = resolve(target, '..')
  if (!existsSync(parent)) {
    console.warn('[build-web] 跳过复制：目标父目录不存在 -> ' + target)
  } else {
    const staging = target + '.staging-' + process.pid
    const backup = target + '.bak-' + process.pid
    rmSync(staging, { recursive: true, force: true })
    rmSync(backup, { recursive: true, force: true })
    cpSync(outDir, staging, { recursive: true })
    if (existsSync(target)) renameSync(target, backup)
    try {
      renameSync(staging, target)
      rmSync(backup, { recursive: true, force: true })
    } catch (err) {
      if (!existsSync(target) && existsSync(backup)) renameSync(backup, target)
      rmSync(staging, { recursive: true, force: true })
      throw err
    }

    let files = 0
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else files++
      }
    }
    walk(target)
    console.log('[build-web] 已同步到 ' + target + '（' + files + ' 个文件）')
  }
}
