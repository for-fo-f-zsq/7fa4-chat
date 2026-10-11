import { defineConfig } from 'electron-vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { createProxyMiddleware } from 'http-proxy-middleware';
import vue from '@vitejs/plugin-vue';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

const DEV_PORT_FILE = resolve(tmpdir(), '7fa4-chat-dev-port');
const API_PREFIXES = ['/api', '/chat', '/image-proxy', '/user', '/ranklist'];
// 主进程端口不固定（1145 可能被别人的进程长期占用），只能每次请求读它写的握手文件
function readDevPort() {
  try {
    const port = Number(readFileSync(DEV_PORT_FILE, 'utf8').trim());
    if (Number.isInteger(port) && port > 0) return port;
  } catch { /* 主进程还没写入（启动竞态） */ }
  return 0;
}

// dev 下渲染层 API 都是相对路径，要转给主进程 express；目标端口运行时才定，故不能用静态 server.proxy
const devApiProxyPlugin = () => ({
  name: 'dev-api-proxy',
  apply: 'serve',
  configureServer(server) {
    let proxy = null;
    let proxyPort = 0;
    server.middlewares.use((req, res, next) => {
      const url = req.url || '';
      if (!API_PREFIXES.some((p) => url.startsWith(p))) return next();
      const port = readDevPort();
      if (!port) {
        res.statusCode = 503;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        return res.end('本地服务尚未就绪（主进程还没写入端口），请稍后重试');
      }
      if (port !== proxyPort) {
        proxy = createProxyMiddleware({ target: `http://127.0.0.1:${port}`, changeOrigin: true });
        proxyPort = port;
      }
      return proxy(req, res, next);
    });
  }
});

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
          notification: resolve('src/preload/notification.js'),
          screenshot: resolve('src/preload/screenshot.js'),
          'timer-float': resolve('src/preload/timer-float.js')
        }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    publicDir: resolve('src/renderer/public'),
    plugins: [vue(), devApiProxyPlugin()],
    // Web/Android 适配层 getVersion 使用（Electron 端走 app.getVersion，不依赖此 define）
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
      outDir: resolve('out/renderer'), // 绝对路径：避免相对 root 解析产生 src/renderer/out 垃圾目录
      minify: true,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          notification: resolve('src/renderer/notification.html'),
          screenshot: resolve('src/renderer/screenshot.html'),
          'timer-float': resolve('src/renderer/timer-float.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    server: {
      // host 默认 'localhost' 时 Vite 只绑一个地址族（本机为 ::1），Electron 解析到 127.0.0.1 就白屏；固定 IPv4 回环
      host: '127.0.0.1',
      port: 5173
      // API 转发见上面的 devApiProxyPlugin（端口运行时可变，不能用静态 target）
    }
  }
});
