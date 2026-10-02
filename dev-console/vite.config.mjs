import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  // 纯静态部署：产物直接丢进 website-api 的 dev 静态目录，由同一个 Node 进程伺服。
  // base 用相对路径，保证挂在 /dev/ 子路径下时资源引用正确。
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 产物里不要 sourcemap，避免暴露源码结构
    sourcemap: false,
    // 目标环境是桌面 Chromium / 现代浏览器，可以放心用新语法
    target: 'chrome110',
    rollupOptions: {
      output: {
        // 带 hash 文件名 → 可以放心长缓存
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
