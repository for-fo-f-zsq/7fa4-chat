// Typora 输入区集成测试。
//
// 覆盖的是 InputFooter 改造后最容易出错的那条链路：
//   useTyporaEditor（Vue 组合式）→ LuoguTypora（上游就地编辑）→ 门面渲染
// 用 happy-dom 造一个真实 DOM，模拟"点块 → 就地改 → 失焦折回"的完整往返。
//
//   node scripts/test-typora-input.mjs
import { Window } from 'happy-dom'
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------- 1. 浏览器环境（必须在 import 之前就位） ----------
const win = new Window({ url: 'https://example.com/' })
globalThis.window = win
globalThis.document = win.document
globalThis.HTMLElement = win.HTMLElement
globalThis.Element = win.Element
globalThis.Node = win.Node
globalThis.Event = win.Event
globalThis.KeyboardEvent = win.KeyboardEvent
globalThis.MouseEvent = win.MouseEvent
globalThis.MutationObserver = win.MutationObserver
globalThis.getComputedStyle = win.getComputedStyle.bind(win)
globalThis.requestAnimationFrame = win.requestAnimationFrame?.bind(win) || ((cb) => setTimeout(cb, 0))
if (!globalThis.navigator?.userAgent) {
  try { Object.defineProperty(globalThis, 'navigator', { value: win.navigator, writable: true, configurable: true }) } catch {}
}

// ---------- 2. 打包被测模块 ----------
const outfile = path.join(os.tmpdir(), `typora-input-${process.pid}-${Date.now()}.mjs`)
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/renderer/src/markdown/typora-editor.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile,
  loader: { '.css': 'empty' },
  logLevel: 'silent',
})
const { useTyporaEditor } = await import(pathToFileURL(outfile).href)
try { fs.rmSync(outfile, { force: true }) } catch { /* 临时文件清理失败不影响断言结论 */ }

// ---------- 3. 断言 ----------
const results = []
function chk(name, cond, detail = '') { results.push([name, !!cond, detail]) }

const tick = () => new Promise((r) => setTimeout(r, 0))

/** 造一个已挂载的表面 */
async function mount(initial = '') {
  const host = win.document.createElement('div')
  win.document.body.appendChild(host)
  const editor = useTyporaEditor({ initial, placeholder: () => '占位符X' })
  editor.surfaceEl.value = host // 触发 attach（等价于模板 ref 就位）
  await tick()
  return { host, editor }
}

const blocks = (host) => Array.from(host.querySelectorAll('[data-src-line]'))
const blockByTag = (host, tag) => Array.from(host.querySelectorAll(tag))
  .find((el) => el.hasAttribute && el.hasAttribute('data-src-line'))
const openTA = (host) => host.querySelector('textarea.typora-block-input')
const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, button: 0 }))
const blur = (el) => el.dispatchEvent(new win.Event('blur'))

// -- 挂载与渲染 --
{
  const { host, editor } = await mount('# 标题\n\n正文**粗**')
  chk('挂载：表面拿到渲染结果', host.innerHTML.includes('<h1'))
  chk('挂载：Typora 已启用（typora-mode）', host.classList.contains('typora-mode'))
  chk('挂载：段落也渲染了', host.querySelectorAll('p').length === 1)
  chk('挂载：块带 data-src-line 锚点', blocks(host).length >= 2)
  chk('挂载：初始无就地编辑器', editor.editing.value === false && !openTA(host))
  chk('挂载：enabled 默认 true', editor.enabled.value === true)
}

// -- 点击块 → 就地编辑 → 失焦折回 --
{
  const { host, editor } = await mount('第一段\n\n第二段')
  const p2 = blockByTag(host, 'p')
  chk('取块：找到带锚点的段落', !!p2)
  click(p2)

  const ta = openTA(host)
  chk('点块：就地编辑器出现', !!ta)
  chk('点块：拿到该块的源码', ta && ta.value === '第一段')
  chk('点块：原块被隐藏', p2.style.display === 'none')
  await tick() // editing 由 MutationObserver 在微任务里同步
  chk('点块：editing 标志同步', editor.editing.value === true)

  ta.value = '第一段改过了'
  ta.dispatchEvent(new win.Event('input', { bubbles: true }))
  blur(ta)
  await tick()

  chk('折回：源码已更新', editor.source.value.includes('第一段改过了'))
  chk('折回：editing 复位', editor.editing.value === false)
  chk('折回：DOM 里没有残留编辑器', !openTA(host))
  chk('折回：表面上重新渲染出新内容', host.textContent.includes('第一段改过了'))
  chk('折回：旧内容已消失', !host.textContent.includes('第一段\n'))
}

// -- 空态敲可见字符 → 自动开段落并接手该字符 --
{
  const { host, editor } = await mount('')
  chk('空态：surface 无内容', host.innerHTML === '')
  host.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', bubbles: true }))
  const ta = openTA(host)
  chk('空态：自动开出段落', !!ta)
  chk('空态：首字符已落入', ta && ta.value === 'a')
  chk('空态：光标在字符之后', ta && ta.selectionStart === 1)
  ta.value = 'abc'
  ta.dispatchEvent(new win.Event('input', { bubbles: true }))
  blur(ta)
  await tick()
  chk('空态：折回后源码为 abc', editor.source.value.trim() === 'abc')
}

// -- 组合键 / 修饰键不触发空态开段落 --
{
  const { host } = await mount('')
  host.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }))
  chk('空态：Ctrl+A 不开段落', !openTA(host))
  host.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Process', isComposing: true, bubbles: true }))
  chk('空态：输入法合成键不开段落', !openTA(host))
}

// -- setKeydownHook 抢在 Typora 之前消费事件 --
{
  const { host, editor } = await mount('x')
  let seen = 0
  editor.setKeydownHook((e) => {
    seen++
    // 只截走 Ctrl+Shift+Enter（当作"发送"），Ctrl+Enter 留给换行
    if (e.key === 'Enter' && e.ctrlKey && e.shiftKey) { e.preventDefault(); return true }
    return false
  })
  const e1 = new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
  host.dispatchEvent(e1)
  chk('钩子：先于 Typora 被调用', seen === 1)
  chk('钩子：返回 true 即被消费（defaultPrevented）', e1.defaultPrevented)

  // 返回 false 的 Ctrl+Enter：Typora 不该折叠编辑器，而应换行
  click(blockByTag(host, 'p'))
  const ta = openTA(host)
  ta.value = 'abc'
  ta.dispatchEvent(new win.Event('input', { bubbles: true }))
  const e2 = new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
  ta.dispatchEvent(e2)
  chk('钩子：返回 false 时被 Typora 接手并换行', ta.value === 'abc\n', JSON.stringify(ta.value))
  chk('钩子：换行事件被 preventDefault（不冒泡去触发发送）', e2.defaultPrevented)
  chk('钩子：编辑器未被折叠关闭', editor.hasOpenBlock() === true)
}

// -- insert / caretContext / replaceRange（表情、@提及 走的路径）--
{
  const { host, editor } = await mount('')
  chk('插入：文末开段落并写入', editor.insert('/wx '))
  const ta = openTA(host)
  chk('插入：内容正确', ta.value === '/wx ')
  const ctx = editor.caretContext()
  chk('光标上下文：before 正确', ctx.before === '/wx ' && ctx.offset === 4)
  chk('插入：再次插入落在光标处', editor.insert('/jy ') && ta.value === '/wx /jy ')
  chk('replaceRange：替换选区', editor.replaceRange(4, 8, '/cy ') && ta.value === '/wx /cy ')
  // 空文档在 Typora 眼里是"一个空行"，新段落插在第 0 行后必然留下一个空行，
  // 于是源码末尾多一个 \n。这是模型的正常产物，发送前统一去掉（见 InputFooter.sendMessage）。
  const got = editor.readSource()
  chk('readSource：返回最新源码（末尾可能带空行）', got.replace(/\n+$/, '') === '/wx /cy ', JSON.stringify(got))
  chk('readSource：读取后编辑器关闭', !openTA(host) && editor.editing.value === false)
}

// -- 空态 insert 不应把新段落粘到上一段 --
{
  const { host, editor } = await mount('已有段落')
  editor.insert('/wx ')
  const ta = openTA(host)
  chk('插入：已有内容时先隔空行', ta.value.startsWith('\n\n'))
  ta.value = '\n\n表情段'
  ta.dispatchEvent(new win.Event('input', { bubbles: true }))
  blur(ta)
  await tick()
  chk('插入：折回后两段都在', editor.source.value.includes('已有段落') && editor.source.value.includes('表情段'))
  chk('插入：两段之间有空行', /\n\s*\n/.test(editor.source.value.split('表情段')[0]))
}

// -- resetSource（草稿恢复）--
{
  const { host, editor } = await mount('')
  editor.resetSource('# 草稿\n\n内容')
  await tick()
  chk('草稿：源码替换', editor.source.value === '# 草稿\n\n内容')
  chk('草稿：渲染跟随', host.innerHTML.includes('<h1'))
  // 有就地编辑器打开时改源码：先收口，再替换，且不能在编辑器上覆盖重写 DOM
  click(blockByTag(host, 'h1'))
  chk('草稿：块已打开', !!openTA(host))
  editor.resetSource('# 换了一份\n\n新内容')
  await tick()
  chk('草稿：收口后替换，编辑器已关闭', !openTA(host))
  chk('草稿：新内容已渲染', host.textContent.includes('换了一份'))
}

// -- 表情 / 图片档位 / 任务项：7fa4-chat 既有渲染扩展必须在输入区保留 --
{
  const { host } = await mount('/微笑 和 https://jx.7fa4.cn/api/xx 和 `/jy`')
  chk('扩展：QQ 表情渲染为图片', !!host.querySelector('img.qqface'))
  chk('扩展：表情带 data-code', host.querySelector('img.qqface')?.dataset.code === '/微笑')
  chk('扩展：URL 里的 /xx 未被当表情', host.querySelectorAll('img.qqface').length === 1)
  chk('扩展：行内代码里的 /jy 未被当表情', host.innerHTML.includes('luogu-inline-code') || host.innerHTML.includes('<code'))
}
{
  const { host } = await mount('![图](https://x/a.png)')
  chk('扩展：输入区图片用消息档 .chat-image', !!host.querySelector('img.chat-image'))
}
{
  const { host } = await mount('- [x] 完成项\n- [ ] 未完成项')
  const boxes = host.querySelectorAll('input.luogu-task-checkbox')
  chk('扩展：任务勾选框渲染', boxes.length === 2)
  chk('扩展：输入区任务框只读（disabled）', Array.from(boxes).every((b) => b.hasAttribute('disabled')))
}

// -- 多实例 id 隔离（输入区与消息列表可能同屏）--
{
  const a = await mount('# 标题')
  const b = await mount('# 标题')
  const ida = a.host.querySelector('h1')?.id
  const idb = b.host.querySelector('h1')?.id
  chk('隔离：两次渲染标题 id 不同', ida && idb && ida !== idb, `${ida} / ${idb}`)
}

// -- detach：解绑后不再响应点击 --
{
  const { host, editor } = await mount('段落')
  editor.surfaceEl.value = null
  await tick()
  click(blockByTag(host, 'p'))
  chk('卸载：表面已停用（无就地编辑器）', !openTA(host))
}

// ---------- 4. 汇总 ----------
const failed = results.filter(([, ok]) => !ok)
for (const [name, ok, detail] of results) {
  if (!ok) console.log(`  FAIL  ${name}${detail ? '  ← ' + detail : ''}`)
}
console.log(`\nTypora 输入区：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) process.exit(1)
