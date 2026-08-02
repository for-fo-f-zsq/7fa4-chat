import { defineConfig } from 'electron-vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve('src/main/index.js')
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
      outDir: 'out/renderer',
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
        '@': resolve('src/renderer/src')
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
