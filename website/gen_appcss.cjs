const fs = require('fs');
const path = require('path');

const SRC = 'D:/projects/7fa4-chat/src/renderer';
const files = [
  path.join(SRC, 'css/themes/default.css'),   // :root default-theme variables
  path.join(SRC, 'src/css/message-list.css'),
  path.join(SRC, 'src/css/input-footer.css'),
  path.join(SRC, 'src/css/chat-view.css'),
  path.join(SRC, 'src/css/nav-bar.css'),
];

function strip(css) {
  // remove @import lines
  css = css.replace(/@import[^;]+;/g, '');
  // remove @keyframes blocks (inner has no braces)
  css = css.replace(/@keyframes\s+[^{}]+\{[^}]*\}/g, '');
  // remove @property blocks / lines
  css = css.replace(/@property\s+[^{};]+;?/g, '');
  css = css.replace(/@property\s+[^{}]+\{[^}]*\}/g, '');
  // remove comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return css;
}

function scope(css) {
  // prefix every style-rule selector with ".app-ui "
  // :root  -> .app-ui  (so variables live on the preview container)
  return css.replace(/([^{}]+?)\s*\{\s*([^{}]*?)\s*\}/g, (m, sel, body) => {
    const sels = sel.split(',').map(s => {
      s = s.trim();
      if (!s) return '';
      if (s === ':root') return '.app-ui';
      return '.app-ui ' + s;
    }).filter(Boolean).join(', ');
    if (!sels) return '';
    return `${sels} {\n${body}\n}`;
  });
}

let out = `/* ============================================================
 * 7FA4 Chat — 客户端真实 default 主题 CSS（作用域限定 .app-ui）
 * 直接复制自 src/renderer：
 *   css/themes/default.css (:root 默认变量)
 *   src/css/message-list.css
 *   src/css/input-footer.css
 *   src/css/chat-view.css
 *   src/css/nav-bar.css
 * 与客户端 .chat-main / .chat-header / .message-area / .input-footer
 * 组件结构完全一致，仅前缀 .app-ui 防止污染官网布局。
 * ============================================================ */

/* 预览容器基础重置（与客户端 base.css 等价，但作用域限定） */
.app-ui, .app-ui * { box-sizing: border-box; margin: 0; padding: 0; }
.app-ui {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  color: var(--text-primary);
  background: linear-gradient(180deg, var(--bg-app), var(--bg-gradient-end));
  * { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent; }
  *::-webkit-scrollbar { width: 5px !important; height: 5px !important; }
  *::-webkit-scrollbar-track { background: transparent !important; }
  *::-webkit-scrollbar-thumb { background-color: var(--scrollbar-thumb) !important; border-radius: 3px !important; }
  *::-webkit-scrollbar-thumb:hover { background-color: var(--scrollbar-thumb-hover) !important; }
}

`;

for (const f of files) {
  let css = fs.readFileSync(f, 'utf8');
  css = strip(css);
  css = scope(css);
  out += `\n/* ===== source: ${path.basename(path.dirname(f))}/${path.basename(f)} ===== */\n` + css + '\n';
}

const dest = 'D:/projects/7fa4-chat/website/public/assets/app-css/app.css';
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out, 'utf8');
console.log('written', dest, out.length, 'bytes');
