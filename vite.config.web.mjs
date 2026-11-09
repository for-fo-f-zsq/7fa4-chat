/**
 * 网页版构建配置（纯浏览器，不带 Electron 主进程/preload）。
 *
 * 产物目录：out/web/
 * 部署位置：https://jx.7fa4.cn:8888/7fa4-chat/web/
 *   - 站点 node 服务（7fa4-chat-site）把 /web/* 映射到 out/web，
 *     Caddy 的 handle_path /7fa4-chat/* 已经把前缀剥掉，所以这里 base 必须写全
 *     对外路径 /7fa4-chat/web/（生成的资源 URL 才能指对）。
 *   - 换路径/本地预览时用 WEB_BASE 覆盖，例如 WEB_BASE=/ npx vite build --config vite.config.web.mjs
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const rootDir = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(rootDir, 'src/renderer')
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))

export default defineConfig({
  root: rendererRoot,
  // 子路径部署：所有 JS/CSS/图片/字体 URL 都会带这个前缀（源码里用 assetUrl() 拼静态资源）
  base: process.env.WEB_BASE || '/7fa4-chat/web/',
  publicDir: resolve(rendererRoot, 'public'),
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    alias: { '@': resolve(rendererRoot, 'src') }
  },
  build: {
    outDir: resolve(rootDir, 'out/web'),
    emptyOutDir: true,
    minify: true,
    // main.js 用顶层 await 动态装 platform/web-api.js（桌面端同款写法），需要 es2022+
    target: 'esnext',
    rollupOptions: {
      // 网页版只要主界面；notification.html / timer-float.html 是 Electron 专属窗口
      input: { index: resolve(rendererRoot, 'index.html') }
    }
  }
})
