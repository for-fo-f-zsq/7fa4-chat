import { defineConfig } from 'electron-vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import vue from '@vitejs/plugin-vue';

// 主进程使用 CJS require('./storage')，vite 不会打包相对 CJS 依赖，
// 该插件在构建产物中输出 storage.js 原文件，保证运行时 require 可解析。
const copyStoragePlugin = () => ({
  name: 'copy-storage-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'storage.js', source: readFileSync(resolve('src/main/storage.js'), 'utf8') });
  }
});

export default defineConfig({
  main: {
    plugins: [copyStoragePlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve('src/main/index.js')
        },
        output: {
          entryFileNames: 'index.js' // build-jsc.mjs 依赖 out/main/index.js
        }
      }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.js'),
          notification: resolve('src/preload/notification.js')
        }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    publicDir: resolve('src/renderer/public'),
    plugins: [vue()],
    build: {
      outDir: resolve('out/renderer'), // 绝对路径：避免相对 root 解析产生 src/renderer/out 垃圾目录
      minify: true,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          notification: resolve('src/renderer/notification.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        // monaco-editor 的 exports 只暴露 .js 子路径，CSS 需 alias 直指实际文件
        'monaco-editor/min/vs/editor/editor.main.css': resolve('node_modules/monaco-editor/min/vs/editor/editor.main.css')
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:1145',
          changeOrigin: true
        },
        '/chat': {
          target: 'http://localhost:1145',
          changeOrigin: true
        },
        '/image-proxy': {
          target: 'http://localhost:1145',
          changeOrigin: true
        },
        '/user': {
          target: 'http://localhost:1145',
          changeOrigin: true
        },
        '/ranklist': {
          target: 'http://localhost:1145',
          changeOrigin: true
        }
      }
    }
  }
});
