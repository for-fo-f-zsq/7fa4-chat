/**
 * 网页版构建：vite build（vite.config.web.mjs）→ out/web/
 * 用法：node scripts/build-web-app.mjs
 *
 * 直接 node 起 vite 的 bin（不走 npx/.cmd）：Windows 下更稳，也不依赖 PATH。
 * 部署时把 out/web/ 整目录放到站点服务的 public/web/ 即可。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'out/web')
const viteBin = resolve(root, 'node_modules/vite/bin/vite.js')

if (!existsSync(viteBin)) {
  console.error('[build-web] 找不到 vite：' + viteBin + '（先 npm install）')
  process.exit(1)
}

const r = spawnSync(process.execPath, [viteBin, 'build', '--config', 'vite.config.web.mjs'], {
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

// 可选：直接把产物同步进官网静态目录（本地预览/部署前准备用，不涉及任何远端操作）
//   node scripts/build-web-app.mjs --copy-to-site
//   或设 SITE_PUBLIC_WEB 指定目标目录（默认 D:/projects/7fa4-chat-site/public/web）
if (process.argv.includes('--copy-to-site')) {
  const target = resolve(process.env.SITE_PUBLIC_WEB || 'D:/projects/7fa4-chat-site/public/web')
  if (!existsSync(resolve(target, '..'))) {
    console.warn('[build-web] 跳过复制：目标父目录不存在 -> ' + target)
  } else {
    rmSync(target, { recursive: true, force: true })
    cpSync(outDir, target, { recursive: true })
    let files = 0
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else files++
      }
    }
    walk(target)
    console.log('[build-web] 已复制到 ' + target + '（' + files + ' 个文件）')
  }
}
