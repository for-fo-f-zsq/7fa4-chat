import { createApp, nextTick } from 'vue';
import App from './App.vue';

// 非 Electron 环境（Capacitor Android / 浏览器）：先安装 window.api 适配层再挂载。
// 动态 import 保证桌面端（已有 preload 注入的 window.api）不会打包该 chunk。
if (!window.api) {
  await import('./platform/web-api.js');
  document.body.classList.add('web');
}

const app = createApp(App);

// 全局自动聚焦指令：任何 v-if 打开（挂载）的输入框自动捕捉光标，与画图工具文本框一致。
// 用于解决 Linux Electron 下打开输入框后无法直接选中/输入的问题。
app.directive('autofocus', {
  mounted(el) {
    // 确保元素已真正插入 DOM 后再聚焦；Linux 下窗口未聚焦时用 rAF 重试一次
    nextTick(() => {
      try { el.focus?.(); } catch {}
      requestAnimationFrame(() => {
        try { if (document.activeElement !== el) el.focus?.(); } catch {}
      });
    });
  }
});

app.mount('#app');
