/**
 * 7FA4 Chat 官网主页构建配置（React 19 + Tailwind CSS v4 + Motion + Lenis + KaTeX）
 *
 * 源码目录：site/web-src/
 * 输出目录：site/public/（保留 web/、assets/icon.png、favicon.ico 等同目录资源）
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteSrcRoot = resolve(rootDir, 'site/web-src');
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));

export default defineConfig({
  root: siteSrcRoot,
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    __SITE_APP_VERSION__: JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      '@site': resolve(siteSrcRoot, 'src')
    }
  },
  build: {
    outDir: resolve(rootDir, 'site/public'),
    emptyOutDir: false,
    minify: true,
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        index: resolve(siteSrcRoot, 'index.html'),
        feedback: resolve(siteSrcRoot, 'feedback/index.html'),
        admin: resolve(siteSrcRoot, 'feedback/admin.html'),
        notfound: resolve(siteSrcRoot, '404.html')
      },
      output: {
        entryFileNames: (chunkInfo) => (chunkInfo.name === 'index' ? 'app.js' : 'assets/site-[name]-[hash].js'),
        chunkFileNames: 'assets/site-[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names || (assetInfo.name ? [assetInfo.name] : []);
          if (names.some((n) => n.endsWith('.css'))) return 'style.css';
          return 'assets/site-[name]-[hash][extname]';
        }
      }
    }
  }
});
