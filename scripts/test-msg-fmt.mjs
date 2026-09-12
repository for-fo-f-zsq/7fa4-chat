// 消息格式（fmt: txt / md）渲染测试 —— parseContent 对纯文本消息不做任何 Markdown/表情渲染
// utils.js 带 CSS import，Node 直接加载不了，先用 esbuild 打成临时 ESM（CSS 置空）
import { Window } from 'happy-dom'
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------- 1. 浏览器环境 ----------
const win = new Window({ url: 'https://example.com/' })
globalThis.window = win
globalThis.document = win.document
globalThis.HTMLElement = win.HTMLElement
globalThis.Element = win.Element
globalThis.Node = win.Node
globalThis.requestAnimationFrame = win.requestAnimationFrame?.bind(win) || ((cb) => setTimeout(cb, 0))
if (!globalThis.navigator?.userAgent) {
  try {
    Object.defineProperty(globalThis, 'navigator', { value: win.navigator, writable: true, configurable: true })
  } catch {}
}

// ---------- 2. 打包 utils ----------
const outfile = path.join(os.tmpdir(), `msg-fmt-${process.pid}-${Date.now()}.mjs`)
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/renderer/src/utils.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile,
  loader: { '.css': 'empty' },
  logLevel: 'silent',
})
const u = await import(pathToFileURL(outfile).href)
try { fs.rmSync(outfile, { force: true }) } catch { /* 临时文件清理失败不影响断言结论 */ }

// ---------- 3. 断言 ----------
const results = []
function chk(name, cond, detail = '') {
  results.push([name, !!cond, detail])
}
const j = (o) => JSON.stringify(o).replace(/"/g, '&quot;')

// md（默认，含历史消息）：标题/表情码正常渲染
{
  const html = u.parseContent(j({ type: 'text', content: '# 标题\n/微笑 **粗体**' }), 1)
  chk('md：标题被渲染', html.includes('<h1') || html.includes('h1'), html.slice(0, 120))
  chk('md：QQ 表情码渲染为图片', html.includes('qqface') || html.includes('<img'), '')
  chk('md：粗体被渲染', html.includes('<strong'), '')
}
// 无 fmt 的历史消息一律按 md
{
  const html = u.parseContent(j({ type: 'text', content: '# 标题' }), 1)
  chk('md：无 fmt 字段按 Markdown 渲染', html.includes('h1'), '')
}
// txt：原样转义，不做任何渲染
{
  const raw = '# 标题\n/微笑 **粗体** <b>x</b> & <script>alert(1)</script>'
  const html = u.parseContent(j({ type: 'text', content: raw, fmt: 'txt' }), 1)
  chk('txt：不渲染 Markdown 标题', !html.includes('<h1'), '')
  chk('txt：不渲染表情码', !html.includes('qqface') && html.includes('/微笑'), '')
  chk('txt：不渲染粗体', !html.includes('<strong'), '')
  chk('txt：HTML 被转义', html.includes('&lt;b&gt;') && !html.includes('<b>'), '')
  chk('txt：script 被转义', !html.includes('<script>'), '')
  chk('txt：使用 plain-msg 容器', html.includes('class="plain-msg"'), '')
  chk('txt：换行保留在原文里', html.includes('\n'), '')
}
// txt + 引用：引用条仍在
{
  const html = u.parseContent(j({ type: 'text', content: '正文', fmt: 'txt', reply_to: 9, reply_content: '被引用内容' }), 1)
  chk('txt：引用条正常渲染', html.includes('reply-quote') && html.includes('被引用内容'), '')
  chk('txt：引用后正文仍是纯文本', html.includes('plain-msg'), '')
}
// txt + @提及：提及标签保留（聊天功能，非 markdown）；无用户信息时回退 User_x 仍可渲染
{
  const html = u.parseContent(j({ type: 'text', content: '@2 你好', fmt: 'txt', mentions: [2] }), 1)
  chk('txt：@提及仍渲染为标签', html.includes('mention-tag'), html.slice(0, 150))
}
// 消息类型：仅 ![]() 才是图片消息，图文混排仍是文本消息
{
  const solo = u.parseContent('![图](https://a.com/b.png)', 1)
  chk('类型：仅 ![]() → 图片消息（带标记）', solo.includes('chat-image') && solo.includes('data-image-msg="1"'), solo.slice(0, 150))
  const multi = u.parseContent('![a](https://a.com/1.png)\n![b](https://a.com/2.png)', 1)
  chk('类型：多行纯图片 → 两张图片消息', (multi.match(/class="chat-image"/g) || []).length === 2)
  const mixed = u.parseContent('看这个 ![图](https://a.com/b.png)', 1)
  // 混排属于文本消息（有段落结构），不是「图片消息类型」；其中的图片照常渲染且可点大图
  chk('类型：图文混排 → 文本消息（有段落）', mixed.includes('<p '), mixed.slice(0, 120))
  // 长文里夹带的图片不能带图片消息标记，否则整个气泡会被 CSS 当图片消息去框+隐藏文字
  chk('类型：图文混排的图片无 data-image-msg 标记', !mixed.includes('data-image-msg'), '')
  chk('类型：图文混排 → Markdown 图片照常渲染', /<img[^>]+src="https:\/\/a\.com\/b\.png"/.test(mixed), mixed.slice(0, 200))
  const js = u.parseContent('![x](javascript:alert(1))', 1)
  chk('类型：javascript: 图片不当图片消息', !js.includes('src="javascript:'), js.slice(0, 150))
}

// 收藏重发（InputFooter sendFavorite 口径）：fmt 字段透传
{
  const obj = u.parseMsgContent(j({ type: 'text', content: 'a#b', fmt: 'txt' }))
  chk('收藏：parseMsgContent 保留 fmt', obj.fmt === 'txt', '')
}

// ---------- 4. 汇总 ----------
const failed = results.filter(([, ok]) => !ok)
for (const [name, ok, detail] of results) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? '  → ' + detail : ''}`)
}
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) process.exit(1)
