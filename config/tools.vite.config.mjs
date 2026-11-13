/**
 * config/tools.vite.config.mjs —— 工具包（tools/<id>）独立构建配置。
 *
 * 与主窗口的 config/electron.vite.config.js 完全解耦：不引入 electron-vite / electron 插件，
 * 产物是纯静态页面，由 scripts/tools/build-tools.mjs 在 Node 里逐个工具调用。
 *
 * 用法（一般由 scripts/tools/build-tools.mjs 代劳）：
 *   TOOL_ID=calculator TOOL_VERSION=1.0.0 npx vite build --config config/tools.vite.config.mjs
 *
 * 目录约定：
 *   root       => tools/<id>
 *   index.html => tools/<id>/index.html（唯一入口，必须存在）
 *   outDir     => dist-tools/<id>/<version>（屋外绝对路径，避免嵌套到 tools/<id>/dist）
 *   base       => './'（产物会被放到任意本地目录，并通过 tool:// 或 Capacitor 的 file:// 访问，
 *                 绝对路径 /assets/... 会失效）
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))

const toolId = String(process.env.TOOL_ID || '').trim()
const toolVersion = String(process.env.TOOL_VERSION || '').trim()

if (!/^[a-z0-9][a-z0-9_-]*$/i.test(toolId)) {
  throw new Error(
    `[tools] 缺少或非法的 TOOL_ID：${JSON.stringify(toolId)}。` +
      `请通过 scripts/build-tools.mjs 构建，或手动指定 TOOL_ID=<tools/ 下的目录名>。`
  )
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(toolVersion)) {
  throw new Error(
    `[tools] 缺少或非法的 TOOL_VERSION：${JSON.stringify(toolVersion)}（期望 x.y.z）。` +
      `请通过 scripts/build-tools.mjs 构建，或手动指定 TOOL_VERSION=1.0.0。`
  )
}

const outDir = resolve(rootDir, 'dist-tools', toolId, toolVersion)

export default defineConfig({
  root: resolve(rootDir, 'tools', toolId),
  // 产物通过 tool://<id>/index.html 或 file:// 打开，只能使用相对路径
  base: './',
  // 工具没有 public/ 目录；关闭它避免误把 tools/<id>/public 复制进产物
  publicDir: false,
  plugins: [vue()],
  // 与渲染层一致的版本号常量（工具里如需展示版本可用 __APP_VERSION__；运行时优先用桥接 getVersion）
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      // 与 electron.vite.config.js 的 renderer 段保持一致，便于后续把工具代码抽到共享目录
      '@': resolve(rootDir, 'src/renderer/src')
    }
  },
  build: {
    outDir,
    // 产物在 root 之外，必须显式开启清空，否则旧版本文件会残留（同一版本目录要求幂等覆盖）
    emptyOutDir: true,
    // 工具包要在离线（本地目录 / Android assets）下运行，字体、图片、worker 等一律产出独立文件，
    // 避免 data: URL 撑大 HTML 且无法被缓存
    assetsInlineLimit: 0,
    minify: 'esbuild',
    sourcemap: false,
    // 单入口，输出固定文件名形态，便于 dist-tools/tools.json 的 files 清单保持稳定
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  // build-tools.mjs 会对每个工具打印自己的汇总，Vite 自身的行也保留（失败时定位问题需要）
  logLevel: 'info',
  clearScreen: false
})
