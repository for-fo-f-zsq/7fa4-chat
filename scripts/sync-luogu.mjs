#!/usr/bin/env node
/**
 * 从上游 luogu-markdown-editor 同步 vendor 模块与样式表。
 *
 *   node scripts/sync-luogu.mjs [upstreamDir]
 *
 * upstreamDir 默认取 <repo>/../_ref/luogu-markdown-editor（参考检出目录，不在版本库内）。
 *
 * 做两件事：
 *   1. vendor/*.js —— 逐字节复制上游 5 个模块，本地不做任何改写；
 *   2. luogu-theme.css —— 从上游 styles.css 抽取 .luogu-* / .typora-* 规则，
 *      把上游主题变量（--bg-secondary、--text-primary 等）重命名为 --lg-*，
 *      并重新映射到 7fa4-chat 的主题变量，避免跟项目自己的 :root 变量撞名。
 *
 * 重跑本脚本即可整体升级上游；生成物不要手工编辑。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamArg = process.argv[2]
const UPSTREAM = path.resolve(upstreamArg || path.join(ROOT, '..', '_ref', 'luogu-markdown-editor'))
const VENDOR_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'markdown', 'vendor')
const OUT_CSS = path.join(ROOT, 'src', 'renderer', 'src', 'markdown', 'luogu-theme.css')
const THEMES_DIR = path.join(ROOT, 'src', 'renderer', 'css', 'themes')

const VENDOR_FILES = [
  'luogu-parser.js',
  'luogu-linter.js',
  'luogu-typora.js',
  'luogu-math-cheatsheet.js',
  'luogu-templates.js',
]

// 上游变量 → 本地 --lg-* 取值。项目主题变量在 html 元素上按主题切换，
// 自定义属性在计算值阶段替换，所以这里直接用 var() 引用即可自动跟随主题。
const VAR_MAP = {
  '--bg-primary': 'transparent',
  '--bg-secondary': 'var(--bg-code-block)',
  '--bg-tertiary': 'var(--bg-table-header)',
  '--border-color': 'var(--border-light)',
  // 代码框跟随主题：浅色主题必须是浅底深字，不能固定 One Dark 深底
  '--code-bg': 'var(--bg-code-block)',
  '--code-fg': 'var(--text-primary)',
  '--font-mono': '"Cascadia Code","Fira Code",Consolas,"Courier New",monospace',
  // 品牌色一律落到应用主题变量：21 套主题（含暗色）自动生效，不再固定洛谷蓝
  '--luogu-blue': 'var(--accent)',
  '--luogu-blue-dark': 'var(--accent-hover)',
  '--luogu-blue-light': 'var(--accent-light)',
  '--luogu-green': 'var(--success)',
  '--luogu-green-light': 'color-mix(in srgb, var(--success) 14%, transparent)',
  '--luogu-orange': 'var(--warning)',
  '--luogu-orange-light': 'color-mix(in srgb, var(--warning) 14%, transparent)',
  '--luogu-red': 'var(--danger)',
  '--luogu-red-light': 'color-mix(in srgb, var(--danger) 14%, transparent)',
  '--luogu-purple': 'var(--notice)',
  '--radius-sm': '4px',
  '--radius-md': '6px',
  '--shadow-sm': '0 1px 3px rgba(0,0,0,0.05)',
  '--shadow-md': '0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06)',
  '--text-primary': 'var(--text-primary)',
  '--text-secondary': 'var(--text-secondary)',
  '--text-muted': 'var(--text-placeholder)',
}

const KEEP_SELECTOR = /(^|[\s,>+~(])\.(luogu-|typora|preview-content)/

// 上游把 markdown 内容根节点叫 .preview-content，同时把编辑器外壳的布局也挂在它上面。
// 7fa4-chat 里内容会落在消息气泡、输入框预览、工具分屏三种容器里，所以：
//   - 统一改名为自己的根类 .luogu-md；
//   - 丢弃 .mode-typora 前缀的规则（那是上游外壳的居中/45vh 底部留白，不属于内容本身）。
const ROOT_CLASS_FROM = '.preview-content'
const ROOT_CLASS_TO = '.luogu-md'

// ---- 工具 -----------------------------------------------------------------

function fail(msg) {
  console.error('[sync-luogu] ' + msg)
  process.exit(1)
}

/** 把 CSS 切成顶层块；正确跳过注释与字符串，避免注释里的花括号破坏配平。 */
function splitTopLevel(css) {
  const blocks = []
  let depth = 0
  let start = 0
  let i = 0
  const n = css.length
  while (i < n) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      i++
      while (i < n && css[i] !== quote) {
        if (css[i] === '\\') i++
        i++
      }
      i++
      continue
    }
    if (c === '{') {
      depth++
      i++
      continue
    }
    if (c === '}') {
      depth--
      i++
      if (depth === 0) {
        blocks.push(css.slice(start, i))
        start = i
      }
      continue
    }
    i++
  }
  return blocks.map((b) => b.trim()).filter(Boolean)
}

function selectorOf(block) {
  const idx = block.indexOf('{')
  return idx === -1 ? '' : block.slice(0, idx).trim()
}

/** 规则块里引用的上游变量，按 --lg-* 改名。 */
function renameVars(text) {
  return text.replace(/var\(\s*(--[a-zA-Z0-9_-]+)/g, (m, name) =>
    VAR_MAP[name] !== undefined || name.startsWith('--lg-') ? `var(--lg-${name.slice(2)}` : m
  )
}

/** 规则块里硬编码的洛谷品牌色，替换成对应 --lg-* 变量（跟随应用主题）。 */
const BRAND_COLORS = {
  '#3498db': 'var(--lg-luogu-blue)',
  '#2980b9': 'var(--lg-luogu-blue-dark)',
  '#2ecc71': 'var(--lg-luogu-green)',
  '#27ae60': 'var(--lg-luogu-green-dark)',
  '#e67e22': 'var(--lg-luogu-orange)',
  '#e74c3c': 'var(--lg-luogu-red)',
  '#9b59b6': 'var(--lg-luogu-purple)',
}
function replaceBrandColors(text) {
  return text.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => BRAND_COLORS[hex.toLowerCase()] || hex)
}

/** 读取每个主题的 --bg-app 并判断明暗，用于生成暗色覆盖。 */
function detectDarkThemes() {
  const dark = []
  const light = []
  for (const file of fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8')
    const m = css.match(/--bg-app:\s*(#[0-9a-fA-F]{3,8})/)
    if (!m) continue
    let hex = m[1].slice(1)
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const cls = '.theme-' + file.replace(/\.css$/, '')
    if (lum < 0.5) dark.push(cls)
    else light.push(cls)
  }
  return { dark, light }
}

// ---- 主体 -----------------------------------------------------------------

if (!fs.existsSync(UPSTREAM)) {
  fail(`找不到上游检出目录：${UPSTREAM}\n  先 clone：git clone https://github.com/wudream813/luogu-markdown-editor.git "${UPSTREAM}"`)
}
const upstreamPkg = JSON.parse(fs.readFileSync(path.join(UPSTREAM, 'package.json'), 'utf8'))
const upstreamCss = fs.readFileSync(path.join(UPSTREAM, 'src', 'styles.css'), 'utf8')

// 1) vendor 复制
fs.mkdirSync(VENDOR_DIR, { recursive: true })
const copied = []
for (const name of VENDOR_FILES) {
  const src = path.join(UPSTREAM, 'src', name)
  if (!fs.existsSync(src)) fail(`上游缺少 ${name}`)
  fs.copyFileSync(src, path.join(VENDOR_DIR, name))
  copied.push({
    name,
    sha: createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 12),
  })
}

// 2) CSS 抽取
const blocks = splitTopLevel(upstreamCss)
const picked = []
const darkOverrides = []
for (const block of blocks) {
  const sel = selectorOf(block)
  if (!sel || sel.startsWith('@')) continue
  if (sel.includes('[data-theme=')) {
    // 上游自带的暗色覆盖单独搬运（项目主题类由下面的检测结果替代）
    if (/luogu-tuack-table/.test(sel)) darkOverrides.push(block)
    continue
  }
  const body = block.slice(block.indexOf('{'))
  // 外壳布局：上游用它把预览列居中并留出 45vh 底部点击区，对消息气泡与输入框都不适用。
  if (sel.startsWith('.mode-typora ')) continue
  // 内容规则：以 .preview-content 为根，或直接是 .luogu-* / .typora-* 组件类。
  const isContentRoot = sel.includes(ROOT_CLASS_FROM)
  if (!KEEP_SELECTOR.test(sel) && !isContentRoot) continue
  const renamedSel = sel.split(ROOT_CLASS_FROM).join(ROOT_CLASS_TO)
  picked.push(replaceBrandColors(renameVars(renamedSel + ' ' + body)))
}

// 上游 :root 里的品牌色取值，供映射层引用
const rootBlock = blocks.find((b) => selectorOf(b) === ':root') || ''
const rootVars = new Map()
for (const m of rootBlock.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
  rootVars.set(m[1], m[2].trim())
}

const { dark } = detectDarkThemes()
const darkSel = dark.length ? dark.join(',\n') : '.theme-dark'

// ---- 代码高亮配色：浅色主题用 One Light，暗色主题用 One Dark ----
// 代码底色已经跟随 --bg-code-block，token 颜色必须跟着换，否则浅底上出现浅色字看不清。
const TOKEN_GROUPS = {
  comment: '.token.comment, .token.prolog, .token.cdata, .token.doctype',
  punctuation: '.token.punctuation',
  keyword: '.token.keyword, .token.selector, .token.important, .token.atrule, .token.rule',
  string: '.token.string, .token.char, .token.attr-value, .token.regex',
  number: '.token.number, .token.boolean, .token.constant, .token.symbol',
  function: '.token.function, .token.class-name, .token.title',
  property: '.token.property, .token.tag, .token.attr-name, .token.variable',
  operator: '.token.operator, .token.entity, .token.url',
  deleted: '.token.deleted',
  inserted: '.token.inserted',
}
const TOKEN_LIGHT = {
  comment: '#a0a1a7',
  punctuation: '#383a42',
  keyword: '#a626a4',
  string: '#50a14f',
  number: '#986801',
  function: '#4078f2',
  property: '#e45649',
  operator: '#0184bc',
  deleted: '#e45649',
  inserted: '#50a14f',
}
const TOKEN_DARK = {
  comment: '#7f848e',
  punctuation: '#abb2bf',
  keyword: '#c678dd',
  string: '#98c379',
  number: '#d19a66',
  function: '#61afef',
  property: '#e06c75',
  operator: '#56b6c2',
  deleted: '#e06c75',
  inserted: '#98c379',
}
const tokenVars = (palette, indent) =>
  Object.keys(TOKEN_GROUPS)
    .map((k) => `${indent}--lg-token-${k}: ${palette[k]};`)
    .join('\n')
const tokenRules = Object.entries(TOKEN_GROUPS)
  .map(
    ([k, sel]) =>
      `${sel
        .split(', ')
        .map((s) => `.luogu-md ${s}`)
        .join(',\n')} {\n  color: var(--lg-token-${k});\n}`
  )
  .join('\n')
const tokenCss = `/* ---- 代码高亮 token 配色：随主题在 One Light / One Dark 之间切换 ----
   底色已跟随 --bg-code-block（浅色主题是浅底），token 必须一起换，否则浅底浅字看不见。
   暗色主题清单由 --bg-app 亮度自动判定。 ---- */
:root {
${tokenVars(TOKEN_LIGHT, '  ')}
}

${darkSel} {
${tokenVars(TOKEN_DARK, '  ')}
}

${tokenRules}

.luogu-md .token.bold { font-weight: 700; }
.luogu-md .token.italic { font-style: italic; }`

// 上游把 [] 里 [data-theme="dark"] 的 tuack 覆盖单独拆出来，需要去掉前缀重挂到项目主题类
const tuackDark = darkOverrides
  .map((b) => {
    const sel = selectorOf(b)
    const rest = sel.replace(/^\[data-theme="dark"\]\s*/, '')
    const body = b.slice(b.indexOf('{'))
    return `${darkSel.split(',\n').map((d) => `${d} ${rest}`).join(',\n')} ${body}`
  })
  .join('\n\n')

const mappingLines = Object.entries(VAR_MAP)
  .map(([k, v]) => `  --lg-${k.slice(2)}: ${v};`)
  .join('\n')

const header = `/*
 * 洛谷 Markdown 渲染样式 —— 由 scripts/sync-luogu.mjs 从上游自动生成，请勿手工编辑。
 *
 * 上游：wudream813/luogu-markdown-editor v${upstreamPkg.version}（MIT License）
 * https://github.com/wudream813/luogu-markdown-editor
 *
 * 本文件只含上游 styles.css 中 .luogu-* / .typora-* / .preview-content 相关规则
 * （共 ${picked.length} 条）。上游的 :root 主题变量不在此处引入，改为下面的 --lg-* 映射层，
 * 取值全部落到 7fa4-chat 自己的主题变量上，因此自动跟随 21 套主题（含暗色）切换。
 */

/* ---- 变量映射层：上游变量名 → --lg-* → 7fa4-chat 主题变量 ---- */
:root {
${mappingLines}
  --lg-surface: var(--bg-app);
}

/* ---- 上游规则 ---- */
`

const footer = `

/* ---- 根类契约：.luogu-md 只借用上游的排版，不借用外壳布局 ----
   上游 .preview-content 同时承担了滚动容器职责（flex:1 / padding:24px 32px /
   overflow-y:auto）。7fa4-chat 里滚动与内边距由各自容器（消息气泡、输入框预览、
   工具分屏）决定，所以这里把外壳属性清零，只保留排版与定位。 */
.luogu-md {
  flex: initial;
  padding: 0;
  overflow: visible;
  min-height: 0;
  margin: 0;
  position: relative;
  line-height: 1.75;
  color: var(--lg-text-primary);
  word-break: break-word;
}

/* 气泡内不额外撑高；段落首尾不留多余外边距 */
.luogu-md > :first-child { margin-top: 0; }
.luogu-md > :last-child { margin-bottom: 0; }

/* ---- 补丁：上游用字面量写死的少量颜色在项目主题下需要跟随 ---- */
.typora-host-editing .typora-block-input {
  background: var(--lg-surface);
  color: var(--text-primary);
}
/* ---- 补丁：上游代码块外壳把 One Dark 底色写死了，浅色主题下会顶着一块深底 ---- */
.luogu-code-block-wrapper {
  background: var(--lg-code-bg);
  color: var(--lg-code-fg);
}
.luogu-code-header {
  background: color-mix(in srgb, var(--lg-code-bg) 88%, var(--text-primary));
  border-bottom-color: var(--lg-border-color);
}
.luogu-code-lang {
  color: var(--lg-token-function);
}
.luogu-code-copy-btn {
  background: var(--bg-conversation-hover);
  border-color: var(--lg-border-color);
  color: var(--lg-code-fg);
}
.luogu-code-copy-btn:hover {
  background: var(--bg-conversation-hover);
  color: var(--text-primary);
}

.typora-block-input {
  background: var(--lg-surface);
  color: var(--text-primary);
  border-color: var(--border-light);
}

/* ---- 暗色主题覆盖（主题清单由 --bg-app 亮度自动判定）---- */
${tuackDark || '/* 上游未提供暗色覆盖 */'}

${darkSel
  .split(',\n')
  .map(
    (d) => `${d} .luogu-callout-info > .luogu-callout-summary { color: #79b8f3; }
${d} .luogu-callout-success > .luogu-callout-summary { color: #58d68d; }
${d} .luogu-callout-warning > .luogu-callout-summary { color: #f0b27a; }
${d} .luogu-callout-error > .luogu-callout-summary { color: #ec7063; }
${d} .luogu-cute-centered-table th { color: #79b8f3; }
${d} .luogu-unclosed-warning { color: #f0b27a; }
${d} .luogu-unclosed-warning code { background: rgba(255, 255, 255, 0.08); }
${d} .luogu-footnotes-title { color: var(--text-secondary); }`
  )
  .join('\n')}

${tokenCss}
`

const output = header + picked.join('\n\n') + '\n' + footer

// 3) 自检：抽取结果里每个 var(--x) 都必须能解析到——要么在映射层，要么在本文件内定义，
//    要么是 7fa4-chat 自己的主题变量。上游变量搬家或改名时这里会直接报错，而不是静默退化。
const projectVars = new Set(
  [...fs.readFileSync(path.join(THEMES_DIR, 'default.css'), 'utf8').matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1])
)
const definedInFile = new Set([...output.matchAll(/(?:^|[;{\s>])(--[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1]))
const unresolved = new Set()
for (const m of output.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
  const name = m[1]
  if (!definedInFile.has(name) && !projectVars.has(name)) unresolved.add(name)
}
if (unresolved.size) {
  fail(
    `以下变量无法解析，需补进 VAR_MAP 或定义在生成文件内：\n  ${[...unresolved].join('\n  ')}\n` +
      '（通常意味着上游新增/改名了主题变量，请检查上游 styles.css 的 :root）'
  )
}

let depth = 0
for (const ch of output) {
  if (ch === '{') depth++
  else if (ch === '}') depth--
}
if (depth !== 0) fail(`生成结果花括号不配平（depth=${depth}）`)

fs.writeFileSync(OUT_CSS, output, 'utf8')

console.log(`[sync-luogu] 上游版本 v${upstreamPkg.version}`)
for (const c of copied) console.log(`  vendor/${c.name}  sha256:${c.sha}`)
console.log(`  抽取规则 ${picked.length} 条 → ${path.relative(ROOT, OUT_CSS)}`)
console.log(`  判定暗色主题 ${dark.length} 套`)
