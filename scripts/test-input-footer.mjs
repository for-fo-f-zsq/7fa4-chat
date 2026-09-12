// InputFooter 挂载测试：在 happy-dom 里把真实的 SFC 挂起来，走一遍「左源码 → 右预览 → 发送」。
//
// 改版重点（左输入 + 右预览的分栏版式，与「工具 → Markdown」一致）：
//   - 结构：.input-split / 左 textarea.input-editor / .input-split-divider / 右 .input-split-right
//   - 预览走 renderMarkdownPreview（与消息气泡同一渲染器），表情/图片/标题都在右侧落地
//   - 两栏滚动按比例双向跟随；分隔条可拖拽改宽
//
// .vue 用 @vue/compiler-sfc 现场编译（esbuild 不认 SFC），CSS 置空。
//
//   node scripts/test-input-footer.mjs
import { Window } from 'happy-dom'
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------- 1. 浏览器环境 ----------
// v-model 在 textarea 上会走 vModelText 指令，其 beforeUpdate 钩子会做
// `rootNode instanceof Document` 判断，所以 Document / ShadowRoot 等也必须补齐，
// 否则组件一更新就抛 ReferenceError。小写开关的成员（getComputedStyle 等）需要 bind。
const win = new Window({ url: 'https://example.com/' })
const NEEDED = [
  'document', 'window', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'screen',
  'getComputedStyle', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame',
  'HTMLElement', 'Element', 'Node', 'NodeFilter', 'EventTarget', 'Event', 'CustomEvent',
  'KeyboardEvent', 'MouseEvent', 'ClipboardEvent', 'DragEvent', 'InputEvent', 'CompositionEvent',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'Document', 'ShadowRoot', 'DocumentFragment', 'Text', 'Comment', 'Range', 'Selection',
  'DOMParser', 'XMLSerializer', 'AbortController', 'DataTransfer', 'File', 'FileReader', 'Blob', 'Image',
  'SVGElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLDivElement', 'HTMLImageElement',
  'HTMLSelectElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLCanvasElement',
]
for (const k of NEEDED) {
  if (!(k in win)) continue
  const v = win[k]
  const isMethod = typeof v === 'function' && /^[a-z]/.test(k)
  const target = isMethod ? v.bind(win) : v
  try {
    globalThis[k] = target
  } catch {
    try { Object.defineProperty(globalThis, k, { value: target, writable: true, configurable: true }) } catch {}
  }
}

// ---------- 2. esbuild + SFC ----------
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

const outfile = path.join(os.tmpdir(), `input-footer-${process.pid}-${Date.now()}.mjs`)
await esbuild.build({
  stdin: {
    contents: `
      export { default as InputFooter } from './src/renderer/src/components/InputFooter.vue'
      export { createApp, nextTick, reactive, h, defineComponent } from 'vue'
      export { store } from './src/renderer/src/store.js'
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
  logLevel: 'silent',
})
const { InputFooter, createApp, nextTick, store, reactive, h, defineComponent } = await import(pathToFileURL(outfile).href)
try { fs.rmSync(outfile, { force: true }) } catch { /* 临时文件清理失败不影响断言结论 */ }

// 让 applyChatToStore 有会话可挂消息（真实运行时由会话列表填好）
store.groups[1] = { message_ids: [] }
store.groups[2] = { message_ids: [] }
store.drafts = store.drafts || {}

// ---------- 3. 断言 ----------
const results = []
function chk(name, cond, detail = '') { results.push([name, !!cond, detail]) }
const tick = () => new Promise((r) => setTimeout(r, 0))
const flush = async (n = 3) => { for (let i = 0; i < n; i++) { await nextTick(); await tick() } }

/** fetch 打桩：默认成功，可切换成失败 */
let fetchMode = 'ok'
globalThis.fetch = async () => {
  if (fetchMode === 'fail') throw new Error('offline-stub')
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({
      success: true,
      chat: { id: 900 + Math.floor(Math.random() * 100), sender_id: 1, send_time: Date.now() / 1000, content: 'x' },
      remain_token_count: 5,
      used_token_count: 1,
    }),
  }
}

/**
 * 挂载并返回各部件。
 * 外面套一层宿主组件 —— 真实场景（ChatView）就是这么用的：只有父组件重新渲染，
 * pageId 这个 prop 才会真正更新，watch(convoKey) 也才会触发。
 * 直接把 reactive 对象当 root props 传给 createApp 是不行的（根组件不会因此重渲染）。
 */
async function mountFooter({ pageId = 1, props = {} } = {}) {
  const root = win.document.createElement('div')
  win.document.body.appendChild(root)
  const state = reactive({ pageId })
  const Host = defineComponent({
    setup: () => () => h(InputFooter, {
      pageType: 'group',
      pageId: state.pageId,
      targetGroup: { users: [] },
      ...props,
    }),
  })
  const app = createApp(Host)
  app.mount(root)
  await flush()
  return {
    root, app, state,
    footer: root.querySelector('.input-footer'),
    split: root.querySelector('.input-split'),
    left: root.querySelector('.input-split-left'),
    editor: root.querySelector('textarea.input-editor'),
    divider: root.querySelector('.input-split-divider'),
    right: root.querySelector('.input-split-right'),
    preview: root.querySelector('.input-preview-content'),
    empty: root.querySelector('.input-preview-empty'),
  }
}

const key = (el, k, mods = {}) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }))
const mouse = (el, type, opts = {}) => el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts }))
/** 模拟用户输入：直接改 textarea 的值并把光标放到末尾，再派发 input */
function type(ta, v, caret) {
  ta.value = v
  const c = caret === undefined ? v.length : caret
  ta.selectionStart = ta.selectionEnd = c
  ta.dispatchEvent(new win.Event('input', { bubbles: true }))
}
/** 给元素伪造布局尺寸（happy-dom 不做排版，滚动同步需要真实数值才能验证） */
function fakeSize(el, scrollHeight, clientHeight) {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
}

// -- 1. 挂载与结构（左源码 / 分隔条 / 右预览）--
const m = await mountFooter()
chk('挂载：输入区存在', !!m.footer)
chk('结构：分栏容器存在', !!m.split)
chk('结构：左栏是原生 textarea（不是 contenteditable）', !!m.editor && !m.footer.querySelector('[contenteditable]'))
chk('结构：左栏 textarea 未被禁用', m.editor && !m.editor.disabled)
chk('结构：可拖拽分隔条存在', !!m.divider)
chk('结构：右栏预览容器存在', !!m.right)
chk('结构：发送按钮存在', !!m.root.querySelector('#send'))
chk('结构：计数器行存在', !!m.root.querySelector('.counter-line'))
chk('结构：分栏内不再有 Typora 表面', !m.footer.querySelector('.input-surface'))

// -- 2. 空态：右侧给的是空态提示，不是空白 --
chk('空态：显示"输入内容后在此预览"', !!m.empty && m.empty.textContent.includes('在此预览'))
chk('空态：未渲染预览内容', !m.preview)

// -- 3. 提示语跟随发送快捷键设置 --
store.setting.shortcuts = { sendMessage: 'enter' }
await flush()
chk('提示：Enter 发送文案', m.editor.getAttribute('placeholder').includes('Enter发送'))
store.setting.shortcuts.sendMessage = 'ctrl+enter'
await flush()
chk('提示：切换为 Ctrl+Enter 后文案随之变化',
  m.editor.getAttribute('placeholder') === '输入消息... (Ctrl+Enter发送)',
  m.editor.getAttribute('placeholder'))
store.setting.shortcuts.sendMessage = 'enter'
await flush()

// -- 4. 输入 → 右侧实时渲染 --
type(m.editor, '# 标题\n\n**粗体** 正文')
await flush()
const pv = m.root.querySelector('.input-preview-content')
chk('渲染：输入后出现预览内容区', !!pv)
chk('渲染：标题渲染成 h1', !!pv?.querySelector('h1'))
chk('渲染：粗体渲染成 strong', !!pv?.querySelector('strong'))
chk('渲染：源码不再以原文出现在预览里', !pv?.textContent.includes('**粗体**'), pv?.textContent)
chk('渲染：有内容时空态提示消失', !m.root.querySelector('.input-preview-empty'))

// -- 5. 渲染保留表情与图片档位（"渲染需要保留表情等等"）--
type(m.editor, '/wx 你好')
await flush()
chk('表情：预览里渲染出表情图', !!m.root.querySelector('.input-preview-content img.qqface'))
chk('表情：保留原始快捷码', m.root.querySelector('.input-preview-content img.qqface')?.dataset.code === '/wx')

type(m.editor, '![图](https://x/a.png)')
await flush()
chk('图片：预览用消息档 chat-image', !!m.root.querySelector('.input-preview-content img.chat-image'))

// -- 6. 双向跟随滚动（与「工具 → Markdown」共享 scroll-sync 引擎）--
type(m.editor, Array.from({ length: 40 }, (_, i) => `第 ${i} 行`).join('\n'))
await flush()
const ta = m.editor
const pvEl = m.root.querySelector('.input-preview-content')
fakeSize(ta, 200, 100)   // 可滚动 100
fakeSize(pvEl, 400, 100) // 可滚动 300
ta.scrollTop = 50        // 无行锚点可用（镜像测量在 happy-dom 无布局），走尾部插值：t=0.5 → 预览 150
ta.dispatchEvent(new win.Event('scroll'))
await new Promise((r) => setTimeout(r, 10)) // 引擎把滚动合并到下一帧（rAF）
chk('跟随滚动：拖左侧 → 右侧按锚定算法对齐', pvEl.scrollTop === 150, String(pvEl.scrollTop))
pvEl.scrollTop = 75      // 反向：t=0.25 → 左侧 25
pvEl.dispatchEvent(new win.Event('scroll'))
await new Promise((r) => setTimeout(r, 10))
chk('跟随滚动：拖右侧 → 左侧按锚定算法对齐', ta.scrollTop === 25, String(ta.scrollTop))
// 回声检测：程序化写入不把对侧再拽回去，双方稳定在最终位置
await new Promise((r) => setTimeout(r, 30))
chk('跟随滚动：写入后无回灌抖动（位置稳定）', pvEl.scrollTop === 75 && ta.scrollTop === 25,
  `pv=${pvEl.scrollTop} ta=${ta.scrollTop}`)

// -- 7. @提及（光标前查询串 → 候选 → 补全为 @uid ）--
{
  const g = await mountFooter()
  type(g.editor, '@', 1)
  await flush()
  chk('提及：输入 @ 后弹出候选层', !!g.root.querySelector('.mention-popup'))
  key(g.editor, 'Escape')
  await flush()
  chk('提及：Esc 关闭候选层', !g.root.querySelector('.mention-popup'))
}

// -- 8. 分隔条拖拽改宽 + 边缘吸附隐藏 --
{
  const g = await mountFooter()
  // happy-dom 无布局（splitRect 宽 0），走纯 clamp 分支
  mouse(g.divider, 'mousedown', { clientX: 100 })
  win.document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, clientX: 160 }))
  await flush()
  chk('拖拽：左栏被写入固定宽度', g.left.style.width === '120px', g.left.style.width)
  win.document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }))
  chk('拖拽：结束时不残留 col-resize 光标', win.document.body.style.cursor === '')
}
{
  const g = await mountFooter()
  // 伪造分栏容器布局尺寸，验证边缘吸附隐藏/回拖恢复
  const splitEl = g.divider.parentElement
  splitEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 0, width: 400, height: 0, x: 0, y: 0, toJSON() {} })
  mouse(g.divider, 'mousedown', { clientX: 200 })
  // 越过右缘继续拖 → 隐藏预览
  win.document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, clientX: 390 }))
  await flush()
  chk('吸附：拖过右缘 → 预览收起', g.right.style.display === 'none' && g.editor.style.display !== 'none')
  // 回拖到正常区间 → 恢复
  win.document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, clientX: 200 }))
  await flush()
  chk('吸附：回拖 → 预览恢复且宽度正常', g.right.style.display !== 'none' && g.left.style.width === '200px', g.left.style.width)
  // 越过左缘继续拖 → 隐藏输入栏
  win.document.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, clientX: 10 }))
  await flush()
  chk('吸附：拖过左缘 → 输入栏收起（textarea 仍在 DOM，草稿不丢）', g.left.style.display === 'none' && !!g.root.querySelector('textarea.input-editor'))
  win.document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }))
}

// -- 9. Enter 发送：入 store、清空输入、预览回到空态 --
{
  const g = await mountFooter()
  type(g.editor, '发给群里的第一段')
  await flush()
  const before = Object.keys(store.messages).length
  key(g.editor, 'Enter')
  await flush(6)
  chk('发送：消息进入 store', Object.keys(store.messages).length === before + 1)
  chk('发送：输入框已清空', g.editor.value === '', JSON.stringify(g.editor.value))
  chk('发送：预览回到空态', !!g.root.querySelector('.input-preview-empty'))
  chk('发送：无错误提示', g.root.querySelector('.error') === null)
}

// -- 10. Ctrl+Enter 在 Enter 发送模式下是换行，不发送 --
{
  const g = await mountFooter()
  type(g.editor, '第一段', 3)
  await flush()
  const before = Object.keys(store.messages).length
  key(g.editor, 'Enter', { ctrlKey: true })
  await flush(4)
  chk('键位：Ctrl+Enter 换行', g.editor.value === '第一段\n', JSON.stringify(g.editor.value))
  chk('键位：Ctrl+Enter 不发送', Object.keys(store.messages).length === before)
}

// -- 11. 发送失败时保留内容并提示 --
{
  const g = await mountFooter()
  fetchMode = 'fail'
  type(g.editor, '会失败的消息')
  await flush()
  key(g.editor, 'Enter')
  await flush(6)
  chk('失败：显示错误提示', !!g.root.querySelector('.error'), g.root.querySelector('.error')?.textContent)
  chk('失败：内容保留在输入框', g.editor.value.includes('会失败的消息'))
  fetchMode = 'ok'
}

// -- 12. 草稿：切会话存、切回来恢复 --
{
  const g = await mountFooter()
  type(g.editor, '草稿内容')
  await flush()
  g.state.pageId = 2
  await flush()
  chk('草稿：切会话后输入框被清空', g.editor.value === '', JSON.stringify(g.editor.value))
  g.state.pageId = 1
  await flush()
  chk('草稿：切回原会话草稿恢复', g.editor.value === '草稿内容', g.editor.value)
}

// -- 13. 草稿：打开会话时（immediate）就恢复，不必先切走再切回来 --
{
  store.drafts['group_9'] = '上次没发完的话'
  const g = await mountFooter({ pageId: 9 })
  chk('草稿：首次挂载即恢复该会话草稿', g.editor.value === '上次没发完的话', g.editor.value)
  delete store.drafts['group_9']
}

// -- 14. 卸载不报错 --
{
  const g = await mountFooter()
  g.app.unmount()
  await flush()
  chk('卸载：正常完成', !g.root.querySelector('.input-split'))
}

// ---------- 4. 汇总 ----------
const failed = results.filter(([, ok]) => !ok)
for (const [name, ok, detail] of results) {
  if (!ok) console.log(`  FAIL  ${name}${detail ? '  ← ' + detail : ''}`)
}
console.log(`\nInputFooter 挂载：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) process.exit(1)
