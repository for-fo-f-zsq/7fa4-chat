// MarkdownTool 自有外壳测试：在 happy-dom 里挂起真实 SFC，验证重写后的
// 「工具 → Markdown」Vue 组件（工具栏插入 / 撤销重做 / 预览渲染 / 未保存标记 /
// 保存 / Ctrl+S / 视图模式 / 表格与公式弹窗）。
//
//   node scripts/test-markdown-tool.mjs
import { Window } from 'happy-dom'
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
const chk = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(` FAIL  ${name}${extra ? '  → ' + extra : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 1. 浏览器环境 ----------
const win = new Window({ url: 'https://example.com/' })
const doc = win.document
try { Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true }) } catch {}

const NEEDED = [
  'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
  'HTMLButtonElement', 'HTMLDivElement', 'HTMLAnchorElement', 'HTMLImageElement',
  'HTMLCanvasElement', 'SVGElement', 'Node', 'NodeList', 'Document', 'DocumentFragment',
  'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'FocusEvent',
  'InputEvent', 'DragEvent', 'ClipboardEvent', 'MutationObserver', 'DOMParser', 'XMLSerializer',
  'File', 'FileReader', 'Blob', 'Image', 'Text', 'Comment', 'Range', 'Selection',
  'CSSStyleSheet', 'StyleSheet', 'localStorage', 'sessionStorage', 'location', 'history',
]
globalThis.window = win
globalThis.document = doc
for (const g of NEEDED) {
  if (globalThis[g] !== undefined) continue
  const v = win[g]
  if (v === undefined) continue
  try { globalThis[g] = v } catch { /* 只读跳过 */ }
}
globalThis.getComputedStyle = win.getComputedStyle?.bind(win) || (() => ({ getPropertyValue: () => '' }))
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0))
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout
for (const g of ['ResizeObserver', 'IntersectionObserver']) {
  if (!globalThis[g]) globalThis[g] = class { observe() {} unobserve() {} disconnect() {} }
}
if (!win.matchMedia) {
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeEventListener() {} })
}

globalThis.alert = (m) => { console.log('  [alert]', m) }
globalThis.confirm = () => true

// ---------- 2. window.api 打桩 ----------
const savedFiles = {}
const apiCalls = []
win.api = globalThis.api = {
  async saveDataFile(name, content) { apiCalls.push(['save', name]); savedFiles[name] = content; return { success: true } },
  async loadDataFile(name) { return savedFiles[name] !== undefined ? { success: true, data: savedFiles[name] } : { success: false } },
  async deleteDataFile(name) { delete savedFiles[name]; return { success: true } },
  async selectFile() { return { success: false } },
  async exportMarkdownPng() { return { success: true } },
}

// ---------- 3. esbuild + SFC ----------
const vueSfc = {
  name: 'vue-sfc',
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, (args) => {
      const source = fs.readFileSync(args.path, 'utf8')
      const { descriptor, errors } = parse(source, { filename: args.path })
      if (errors.length) return { errors: errors.map((e) => ({ text: String(e.message || e) })) }
      const id = 's' + Math.abs(args.path.split('').reduce((a, c) => a + c.charCodeAt(0), 0)).toString(36)
      const compiled = compileScript(descriptor, { id, inlineTemplate: true })
      return { contents: compiled.content, loader: 'js', resolveDir: path.dirname(args.path) }
    })
  },
}

const outfile = path.join(os.tmpdir(), `md-tool-${process.pid}-${Date.now()}.mjs`)
await esbuild.build({
  stdin: {
    contents: `
      export { default as MarkdownTool } from './src/renderer/src/tools/MarkdownTool.vue'
      export { createApp, nextTick } from 'vue'
    `,
    resolveDir: ROOT,
    sourcefile: 'test-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile,
  plugins: [vueSfc],
  loader: { '.css': 'empty' },
  define: {
    'process.env.NODE_ENV': '"development"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  logLevel: 'error',
})
const { MarkdownTool, createApp, nextTick } = await import(pathToFileURL(outfile).href)
try { fs.rmSync(outfile, { force: true }) } catch { /* 临时文件清理失败不影响断言结论 */ }

// ---------- 4. 挂载 ----------
const host = doc.createElement('div')
doc.body.appendChild(host)

const app = createApp(MarkdownTool)
app.config.errorHandler = (e) => { console.log('  [vue error]', e && e.message, e && e.stack) }
const vm = app.mount(host)
await sleep(120)
await nextTick()

chk('挂载：不抛错', !!vm)
const rootEl = host.querySelector('.md-editor')
chk('挂载：存在 .md-editor 自有外壳', !!rootEl)
chk('挂载：不再使用上游 shell（无 #editorTextarea / .lg-editor-root）',
  !host.querySelector('#editorTextarea') && !host.querySelector('.lg-editor-root'))
const ta = host.querySelector('.md-source')
const pv = host.querySelector('.md-preview')
chk('挂载：textarea 与预览容器就绪', !!ta && !!pv)
chk('挂载：预览带 luogu-md 渲染类（主题变量可达）', pv?.classList.contains('luogu-md'))
chk('挂载：行号 gutter 就绪', !!host.querySelector('.md-gutter'))
chk('挂载：工具栏存在且含滚动同步按钮', !!host.querySelector('.md-toolbar .md-tb-btn[title^="滚动同步"]'))

// ---------- 5. 输入 → 预览渲染 ----------
ta.value = '# 你好\n\n正文段落'
ta.dispatchEvent(new win.Event('input', { bubbles: true }))
await sleep(260) // 打字路径走 120ms 渲染防抖
await nextTick()
chk('输入：预览渲染出标题', !!pv.querySelector('h1') && /你好/.test(pv.querySelector('h1').textContent))
chk('输入：预览块带 data-src-line 锚点（滚动同步依据）', !!pv.querySelector('[data-src-line]'))
chk('输入：状态栏为未保存', host.querySelector('.md-status-right')?.textContent.includes('未保存'))

// ---------- 6. 工具栏插入 / 撤销 ----------
const boldBtn = host.querySelector('.md-tb-btn[title^="加粗"]')
chk('工具栏：加粗按钮存在', !!boldBtn)
boldBtn.click()
await nextTick()
chk('工具栏：加粗插入成功', ta.value.includes('**加粗文本**'), ta.value)
const undoBtn = host.querySelector('.md-tb-btn[title^="撤销"]')
undoBtn.click()
await nextTick()
chk('工具栏：撤销还原', !ta.value.includes('**加粗文本**'), ta.value)
const redoBtn = host.querySelector('.md-tb-btn[title^="重做"]')
chk('工具栏：重做可用', !!redoBtn && !redoBtn.disabled)
redoBtn.click()
await nextTick()
chk('工具栏：重做恢复插入', ta.value.includes('**加粗文本**'))

// ---------- 7. 表格生成器弹窗 ----------
host.querySelector('.md-tb-btn[title^="表格生成器"]').click()
await nextTick()
const tableDialog = host.querySelector('.mdm-dialog')
chk('表格：弹窗打开', !!tableDialog)
const insertTableBtn = [...host.querySelectorAll('.mdm-btn-primary')].find((b) => b.textContent.includes('生成并插入'))
insertTableBtn.click()
await sleep(60)
await nextTick()
chk('表格：生成的 Markdown 已插入', /\| 标题 1 \| 标题 2 \|/.test(ta.value), ta.value.slice(-120))
chk('表格：弹窗已关闭', !host.querySelector('.mdm-dialog'))

// ---------- 8. 数学公式面板 ----------
host.querySelector('.md-tb-btn[title^="数学公式面板"]').click()
await nextTick()
chk('公式：弹窗打开且分类页签渲染', host.querySelectorAll('.mdm-math-tab').length > 0)
chk('公式：KaTeX 预览已渲染', host.querySelectorAll('.mdm-math-card .katex').length > 0)
const closeMath = [...host.querySelectorAll('.mdm-btn')].find((b) => b.textContent.trim() === '关闭')
closeMath.click()
await nextTick()

// ---------- 9. 保存 / Ctrl+S ----------
apiCalls.length = 0
host.querySelector('.md-ws-btn[title^="保存"]').click()
await sleep(80)
await nextTick()
chk('保存：写入了工作区文件', apiCalls.some(([k, n]) => k === 'save' && n === '未命名.md'), JSON.stringify(apiCalls))
chk('保存：落盘内容包含正文', /你好/.test(savedFiles['未命名.md'] || ''))
chk('保存：状态栏回到已保存', host.querySelector('.md-status-right')?.textContent.includes('已保存'))

apiCalls.length = 0
const ev = new win.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
ta.dispatchEvent(ev)
await sleep(80)
await nextTick()
chk('Ctrl+S：触发保存', apiCalls.some(([k]) => k === 'save'), JSON.stringify(apiCalls))
chk('Ctrl+S：阻止了默认行为', ev.defaultPrevented)

// ---------- 10. 视图模式 ----------
const previewOnlyBtn = host.querySelector('.md-tb-btn[title="纯预览"]')
previewOnlyBtn.click()
await nextTick()
chk('视图：切到纯预览', host.querySelector('.md-workspace')?.classList.contains('mode-preview-only'))
const typoraBtn = host.querySelector('.md-tb-btn[title^="所见即所得"]')
typoraBtn.click()
await nextTick()
chk('视图：切到 Typora 模式', host.querySelector('.md-workspace')?.classList.contains('mode-typora'))
chk('视图：预览容器获得 typora-mode 类', pv.classList.contains('typora-mode'))
host.querySelector('.md-tb-btn[title="双栏对比"]').click()
await nextTick()
chk('视图：切回双栏', host.querySelector('.md-workspace')?.classList.contains('mode-split'))

// ---------- 11. 卸载 ----------
app.unmount()
await nextTick()
chk('卸载：预览与工具栏已随组件移除', !host.querySelector('.md-editor'))
chk('卸载：镜像测量元素已回收', !doc.body.querySelector('[aria-hidden="true"][style*="-99999px"]'))

console.log(`\nMarkdownTool 自有外壳：${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
