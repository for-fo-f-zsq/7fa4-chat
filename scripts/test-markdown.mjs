// 洛谷 Markdown 渲染门面单测。
//
// 门面里有 CSS import，Node 直接加载不了，所以先用 esbuild 打成临时 ESM（CSS 置空），
// 再在 happy-dom 提供的浏览器环境里加载，验证解析能力与 7fa4-chat 的三项既有扩展。
//
//   node scripts/test-markdown.mjs
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

// ---------- 2. 打包门面 ----------
const outfile = path.join(os.tmpdir(), `md-facade-${process.pid}-${Date.now()}.mjs`)
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/renderer/src/markdown/index.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile,
  loader: { '.css': 'empty' },
  logLevel: 'silent',
})

const md = await import(pathToFileURL(outfile).href)
try { fs.rmSync(outfile, { force: true }) } catch { /* 临时文件清理失败不影响断言结论 */ }

// ---------- 3. 断言 ----------
const results = []
function chk(name, cond, detail = '') {
  results.push([name, !!cond, detail])
}

const msg = (t) => md.renderMarkdown(t)
const doc = (t) => md.renderDocument(t)

// -- 基础 GFM --
{
  const h = msg('**粗体** *斜体* ~~删除~~ `code`')
  chk('基础：粗体', h.includes('<strong>粗体</strong>'))
  chk('基础：斜体', h.includes('<em>斜体</em>'))
  chk('基础：删除线', h.includes('<del>删除</del>'))
  chk('基础：行内代码', h.includes('<code class="luogu-inline-code">code</code>'))
  chk('基础：输出带 data-src-line 锚点', /data-src-line="0"/.test(h))
}

// -- 标题与层级 --
{
  const h = msg('# 一级\n\n### 三级')
  chk('标题：h1', /<h1[^>]*>一级<\/h1>/.test(h))
  chk('标题：h3', /<h3[^>]*>三级<\/h3>/.test(h))
  chk('标题：带 id 锚点', /id="[^"]*heading-/.test(h))
}

// -- 洛谷扩展语法 --
{
  const h = msg(':::info[提示标题]\n正文\n:::')
  chk('洛谷：折叠框 details', h.includes('<details class="luogu-callout luogu-callout-info"'))
  chk('洛谷：折叠框标题', h.includes('提示标题'))
  chk('洛谷：折叠框可编辑区间', h.includes('data-src-end-line='))

  const warn = msg(':::warning\n注意\n:::')
  chk('洛谷：warning 类型', warn.includes('luogu-callout-warning'))

  const al = msg(':::align{center}\n居中\n:::')
  chk('洛谷：居中容器', al.includes('luogu-align-center'))
}
{
  const h = msg('| a | b |\n| --- | --- |\n| 1 | 2 |\n| ^ | 3 |')
  chk('洛谷：表格向上合并 rowspan', h.includes('rowspan="2"'))
  const c = msg('| a | b |\n| --- | --- |\n| 1 | < |')
  chk('洛谷：表格向左合并 colspan', c.includes('colspan="2"'))
  const t = msg('::cute-table{tuack}\n| a | b |\n| --- | --- |\n| 1 | 2 |')
  chk('洛谷：Tuack 表格', t.includes('luogu-tuack-table') || t.includes('luogu-cute'))
}
{
  const h = msg('脚注引用[^1]\n\n[^1]: 脚注内容')
  chk('洛谷：脚注生成', h.includes('luogu-footnote-ref') && h.includes('luogu-footnotes'))
  chk('洛谷：脚注回跳锚点', h.includes('luogu-footnote-back'))
}
{
  const h = msg('![](bilibili:BV1xx411c7mD)')
  chk('洛谷：B 站点击加载门面', h.includes('luogu-bilibili-facade'))
  chk('洛谷：B 站未点击不发请求', !h.includes('<iframe'))
}
{
  const h = msg('| a |\n| --- |\n| 1 |\n\n- [ ] 待办\n- [x] 完成')
  chk('洛谷：任务列表', h.includes('luogu-task-list'))
}

// -- KaTeX --
{
  const h = msg('行内 $O(n\\log n)$ 结束')
  chk('KaTeX：行内公式', h.includes('class="katex"'))
  chk('KaTeX：行内公式不报错', !h.includes('katex-error'))

  // 上游对齐 remark-math：$$ 独占一行才是行间公式，同一行闭合的属行内
  const b = msg('$$\n\\sum_{i=1}^{n} i\n$$')
  chk('KaTeX：行间公式用 display 容器', b.includes('luogu-math-display') && b.includes('katex-display'))
  const oneLine = msg('$$\\sum_{i=1}^{n} i$$')
  chk('KaTeX：单行 $$ 按行内处理（对齐 remark-math）', oneLine.includes('luogu-math-inline'))
}

// -- Prism 代码高亮 --
{
  const h = msg('```cpp\nint main(){ return 0; }\n```')
  chk('代码块：Prism token', h.includes('token keyword'))
  chk('代码块：复制按钮', h.includes('luogu-code-copy-btn'))
  const ln = msg('```cpp line-numbers\nint main(){}\n```')
  chk('代码块：行号', ln.includes('has-line-numbers') && ln.includes('code-line-number'))
  const hl = msg('```cpp lines=1\nint a;\nint b;\n```')
  chk('代码块：指定行高亮', hl.includes('highlighted-line') || hl.includes('code-line-highlight'))
  const unknown = msg('```zzzlang\nfoo\n```')
  chk('代码块：未知语言不崩', unknown.includes('luogu-code-pre'))
}

// -- 7fa4-chat 既有扩展：QQ 表情 --
{
  const h = msg('/微笑 你好')
  chk('表情：快捷码转图', h.includes('<img class="qqface"'))
  chk('表情：保留 data-code', h.includes('data-code="/微笑"'))
  const mixed = msg('你好/jy世界')
  chk('表情：非后边界不替换', !mixed.includes('qqface'))
  const inCode = msg('```\n/微笑\n```')
  chk('表情：代码块内不替换', !inCode.includes('qqface'))
  const inInline = msg('这是 `/微笑` 代码')
  chk('表情：行内代码内不替换', !inInline.includes('qqface'))
  const inUrl = msg('http://jx.7fa4.cn/api/xx')
  chk('表情：URL 内不替换', !inUrl.includes('qqface'))
  const unknownFace = msg('/不存在的表情码 后续')
  chk('表情：未登记码保持原文', unknownFace.includes('/不存在的表情码'))
}

// -- 7fa4-chat 既有扩展：图片档位 --
{
  const m = msg('![图](https://a.com/b.png)')
  chk('图片：消息档用 chat-image', m.includes('class="chat-image"'))
  chk('图片：消息档不带 luogu-img', !m.includes('class="luogu-img"'))
  const d = doc('![图](https://a.com/b.png)')
  chk('图片：文档档保留 luogu-img', d.includes('class="luogu-img"'))
}

// -- 7fa4-chat 既有扩展：任务勾选框只读/可写 --
{
  const m = msg('- [ ] 甲\n- [x] 乙')
  chk('任务项：消息档置灰', m.includes('disabled'))
  chk('任务项：消息档去掉 onchange', !m.includes('onchange='))
  const d = doc('- [ ] 甲\n- [x] 乙')
  chk('任务项：文档档保持可交互', d.includes('onchange="toggleTaskCheckbox(this)"') && !d.includes('disabled'))
}

// -- 多实例 id 隔离 --
{
  const a = msg('# 同名标题')
  const b = msg('# 同名标题')
  const idA = /id="([^"]+)"/.exec(a)?.[1]
  const idB = /id="([^"]+)"/.exec(b)?.[1]
  chk('隔离：两次渲染 id 不同', idA && idB && idA !== idB, `${idA} / ${idB}`)
  const fn = msg('脚注[^1]\n\n[^1]: 内容')
  const ref = /<a href="#([^"]+)"[^>]*class="luogu-link"/.exec(fn)?.[1]
  const target = /<li id="([^"]+)"/.exec(fn)?.[1]
  chk('隔离：脚注引用指向自身目标', ref && target && ref === target, `${ref} / ${target}`)
}

// -- 安全 --
{
  const h = msg('<script>alert(1)</script>')
  chk('安全：原始 HTML 被转义', !h.includes('<script>'))
  const js = msg('[点我](javascript:alert(1))')
  chk('安全：javascript: 协议被清洗', !/href="javascript:/i.test(js))
  const img = msg('![x](javascript:alert(1))')
  chk('安全：图片 javascript: 被清洗', !/src="javascript:/i.test(img))
}

// -- 全局交互函数 --
{
  chk('全局：copyCodeBlock 已挂载', typeof globalThis.window.copyCodeBlock === 'function')
  chk('全局：loadBilibiliPlayer 已挂载', typeof globalThis.window.loadBilibiliPlayer === 'function')
  chk('全局：toggleTaskCheckbox 已挂载', typeof globalThis.window.toggleTaskCheckbox === 'function')
}

// -- 边界输入 --
{
  chk('边界：空字符串', msg('') === '')
  chk('边界：空白串', msg('   \n  ') === '')
  chk('边界：null', msg(null) === '')
  const long = msg('a'.repeat(200000))
  chk('边界：超长文本不崩', long.length > 100000)
}

// ---------- 4. 汇总 ----------
const failed = results.filter(([, ok]) => !ok)
for (const [name, ok, detail] of results) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? '  → ' + detail : ''}`)
}
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length) process.exit(1)
