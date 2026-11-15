// CSS 选择器静态检查 —— 只查「一定会被浏览器整条丢弃」的写法：
// 1. :has() 内嵌套 :has()（Selectors 4 明确禁止，Chromium 会判定选择器无效，
//    整条规则不生效，表现为样式忽然"没写"却没有任何报错）；
// 2. :has() 写在伪元素上（同样无效）。
// 用法：node tests/unit/check-css-selectors.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCAN_DIRS = ['src/renderer/src', 'tools']
const EXTS = new Set(['.css', '.vue'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-tools', 'vendor', 'out', '.git'])

function walk(dir, out = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue
      walk(full, out)
    } else if (EXTS.has(path.extname(ent.name))) {
      out.push(full)
    }
  }
  return out
}

/** 取出 :has() 的嵌套情况：返回 [{ depth, after }]，depth>=2 即非法 */
function hasNesting(text) {
  const stack = []
  const hits = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') {
      // 回溯函数名/伪类名（'.a:has(' 会回溯成 'a:has'，需只保留冒号起始的伪类部分）
      let j = i - 1
      while (j >= 0 && /[-\w:]/.test(text[j])) j--
      const raw = text.slice(j + 1, i).toLowerCase()
      const name = raw.includes(':') ? raw.slice(raw.lastIndexOf(':')) : raw
      stack.push(name)
      if (name === ':has' && stack.filter((n) => n === ':has').length > 1) {
        hits.push({ index: i, line: lineOf(text, i) })
      }
    } else if (ch === ')') {
      stack.pop()
    }
  }
  return hits
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/** 伪元素上出现 :has()（::before 等） */
function hasOnPseudoElement(text) {
  const hits = []
  const re = /::?(before|after|marker|placeholder|selection|first-line|first-letter)\b[^{,]*:has\(/gi
  let m
  while ((m = re.exec(text))) hits.push({ index: m.index, line: lineOf(text, m.index) })
  return hits
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
// 注释里的示例写法不是真代码，先剥掉再分析，避免把说明文字当成反例误报
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
let problems = 0
for (const file of files) {
  const raw = stripComments(fs.readFileSync(file, 'utf8'))
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  for (const hit of hasNesting(raw)) {
    problems++
    console.log(` FAIL  ${rel}:${hit.line}  :has() 内嵌套了 :has()，选择器会被整条丢弃`)
  }
  for (const hit of hasOnPseudoElement(raw)) {
    problems++
    console.log(` FAIL  ${rel}:${hit.line}  伪元素上使用了 :has()，选择器无效`)
  }
}

console.log(`\n[check-css] 共检查 ${files.length} 个样式文件，问题 ${problems} 个`)
if (problems) process.exit(1)
