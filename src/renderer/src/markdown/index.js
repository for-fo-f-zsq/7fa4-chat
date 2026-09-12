/**
 * 洛谷 Markdown 渲染门面（7fa4-chat 侧的唯一入口）。
 *
 * 渲染引擎来自上游 wudream813/luogu-markdown-editor v1.23.1（MIT），源码在 ./vendor 下
 * 逐字节保留，本文件负责把它接进 7fa4-chat：
 *
 *   1. 依赖注入 —— KaTeX 与 Prism 都以实例方式传给解析器，不依赖全局变量；
 *   2. 既有扩展 —— QQ 表情快捷码（/微笑）、.chat-image 点击大图、卡片消息全部保留；
 *   3. 交互接管 —— 解析器输出里带内联 onclick/onchange（复制代码、任务勾选、B 站加载），
 *      这里提供对应全局函数，行为与上游一致；
 *   4. 多实例隔离 —— 消息列表里同页会有几百个渲染结果，标题 id 与脚注 id 必须按次加前缀，
 *      否则 <a href="#luogu-fn-1"> 会跳到别人的消息上。
 */
import Prism from './prism.js'
import 'prismjs/components/prism-clike.js'
import 'prismjs/components/prism-c.js'
import 'prismjs/components/prism-cpp.js'
import 'prismjs/components/prism-java.js'
import 'prismjs/components/prism-python.js'
import 'prismjs/components/prism-javascript.js'
import 'prismjs/components/prism-typescript.js'
import 'prismjs/components/prism-json.js'
import 'prismjs/components/prism-bash.js'
import 'prismjs/components/prism-go.js'
import 'prismjs/components/prism-rust.js'
import 'prismjs/components/prism-pascal.js'
import 'prismjs/components/prism-latex.js'
import 'prismjs/components/prism-markup.js'
import 'prismjs/components/prism-markdown.js'
import 'prismjs/components/prism-sql.js'
import 'prismjs/components/prism-yaml.js'
import 'prismjs/components/prism-ini.js'
import 'prismjs/components/prism-diff.js'
import 'prismjs/components/prism-css.js'
import 'prismjs/components/prism-csharp.js'
import 'prismjs/components/prism-lua.js'
import './luogu-theme.css'

import katex from 'katex'
import { QUANCODE, qqfaceUrl } from '../qqface-data.js'
import {
  LuoguParser,
  LuoguLinter,
  LuoguTypora,
  LuoguMathLibrary,
  LuoguTemplates,
} from './vendor/index.js'

export { LuoguLinter, LuoguTypora, LuoguMathLibrary, LuoguTemplates, katex, Prism }

// ========== 基础工具 ==========

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// QQ 表情快捷码：/微笑 /wx /jy …（后边界必须是空白或行尾）
const QQ_FACE_RE = /\/[\p{L}\p{N}_]{1,16}(?=\s|$)/gu
const QQ_FACE_PLACEHOLDER = /\uE000QF(\d+)QF\uE000/g
// URL 判定：与既有实现一致，http(s)/ftp 协议头与 www. 开头
const URL_RE = /\b(?:https?|ftp):\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi

// ========== 解析器实例 ==========

// 消息档与文档档共用同一个实例：render() 是同步的，且每次开头都会重置内部计数器。
const parser = new LuoguParser({ katex, prism: Prism, headingPrefix: 'md-heading-' })

let renderSeq = 0

// ========== QQ 表情：只替换真正的表情码 ==========

/**
 * 收集不应被表情码替换的区间：URL、围栏代码块、行内代码。
 * 不这么做的话，`http://jx.7fa4.cn/api/xx` 的行尾 `/xx`、以及代码块里的 `/微笑`
 * 都会被替换成表情图片。
 */
function buildProtectedRanges(text) {
  const ranges = []

  for (const m of text.matchAll(URL_RE)) ranges.push([m.index, m.index + m[0].length])

  // 围栏代码块：按行扫描，``` 与 ~~~ 各自配对
  const lines = text.split('\n')
  let pos = 0
  let fenceChar = null
  let fenceStart = -1
  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (m) {
      if (!fenceChar) {
        fenceChar = m[1][0]
        fenceStart = pos
      } else if (m[1][0] === fenceChar) {
        ranges.push([fenceStart, pos + line.length])
        fenceChar = null
      }
    }
    pos += line.length + 1
  }
  if (fenceChar) ranges.push([fenceStart, text.length])

  // 行内代码：反引号对
  for (const m of text.matchAll(/(`+)(?:[^`]|[\s\S]*?[^`])\1(?!`)/g)) {
    ranges.push([m.index, m.index + m[0].length])
  }

  // 排序并合并重叠区间，保证下面的游标可以单调推进
  ranges.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push(r.slice())
  }
  return merged
}

/**
 * 把表情码替换成私有区占位符，渲染完成后再还原成 <img>。
 * 用 \uE000 包裹是因为 markdown-it / 洛谷解析器都会原样保留它，不会被转义或吞掉。
 */
function maskQqFaces(text) {
  const ranges = buildProtectedRanges(text)
  const faces = []
  let out = ''
  let cursor = 0
  let ri = 0

  for (const m of text.matchAll(QQ_FACE_RE)) {
    const at = m.index
    while (ri < ranges.length && ranges[ri][1] <= at) ri++
    if (ri < ranges.length && ranges[ri][0] <= at) continue // 落在保护区内
    const face = QUANCODE.get(m[0].toLowerCase())
    if (!face) continue
    const ph = '\uE000QF' + faces.length + 'QF\uE000'
    faces.push(`<img class="qqface" data-code="${esc(m[0])}" src="${esc(qqfaceUrl(face.file))}" alt="${esc(m[0])}">`)
    out += text.slice(cursor, at) + ph
    cursor = at + m[0].length
  }
  out += text.slice(cursor)
  return { text: out, faces }
}

// ========== 渲染结果后处理 ==========

/**
 * @param {string} html  解析器原始输出
 * @param {'message'|'document'} profile
 *    message  —— 消息气泡：图片缩成 .chat-image 以便点击看大图；任务勾选框置灰（消息没有可回写的源码）
 *    document —— 编辑器/文档：图片按文档尺寸，任务勾选框可交互
 */
function postProcess(html, profile) {
  let out = html
  const uid = 'r' + ++renderSeq

  if (profile === 'message') {
    out = out.replace(/class="luogu-img"/g, 'class="chat-image"')
    out = out.replace(/<input type="checkbox" class="luogu-task-checkbox"([^>]*?)\s*\/?>/g, (m, attrs) => {
      const cleaned = attrs.replace(/\s*onchange="toggleTaskCheckbox\(this\)"/, '')
      return `<input type="checkbox" class="luogu-task-checkbox"${cleaned} disabled>`
    })
  }

  // 同页多实例：标题与脚注的 id 必须唯一，页内锚点同步改写。
  // 代码块里的引号已被解析器转义成 &quot;，不会误命中。
  out = out.replace(/\sid="([^"]+)"/g, (m, id) => ` id="${uid}-${id}"`)
  out = out.replace(/\shref="#([^"]+)"/g, (m, id) => ` href="#${uid}-${id}"`)

  return out
}

function render(text, profile) {
  if (!text) return ''
  const raw = String(text)
  if (!raw.trim()) return ''

  const { text: masked, faces } = maskQqFaces(raw)

  let html
  try {
    html = parser.render(masked)
  } catch (e) {
    console.error('[markdown] 渲染失败，退回纯文本', e)
    return '<p>' + esc(raw) + '</p>'
  }

  if (faces.length) {
    html = html.replace(QQ_FACE_PLACEHOLDER, (m, i) => faces[Number(i)] ?? '')
  }
  return postProcess(html, profile)
}

// ========== 对外 API ==========

/** 消息气泡渲染（表情、点击看大图、只读任务项） */
export function renderMarkdown(text) {
  return render(text, 'message')
}

/** 输入框预览：与消息显示完全一致，所见即所发 */
export function renderMarkdownPreview(text) {
  return render(text, 'message')
}

/** 编辑器/文档渲染（Markdown 工具、导出）：图片按文档尺寸 */
export function renderDocument(text) {
  return render(text, 'document')
}

// ========== 解析器输出依赖的全局函数 ==========

let taskToggleHandler = null

/** 注册任务勾选回写回调；不注册时勾选框按只读处理 */
export function setTaskToggleHandler(fn) {
  taskToggleHandler = fn
}

let installed = false

export function installMarkdownGlobals() {
  if (installed || typeof window === 'undefined') return
  installed = true

  // 复制代码块。上游把反馈做成按钮内文字变化，这里保持一致。
  window.copyCodeBlock = function (btn) {
    const wrapper = btn.closest('.luogu-code-block-wrapper')
    if (!wrapper) return
    const lines = Array.from(wrapper.querySelectorAll('.code-line-text')).map((el) => el.innerText)
    const text = lines.length
      ? lines.join('\n')
      : (wrapper.querySelector('pre code')?.innerText || '')
    navigator.clipboard.writeText(text).then(() => {
      const span = btn.querySelector('.copy-text') || btn
      const old = span.innerText
      span.innerText = '已复制'
      btn.classList.add('copied')
      setTimeout(() => {
        span.innerText = old
        btn.classList.remove('copied')
      }, 1800)
    }).catch(() => {})
  }

  // B 站点播：未点击时不发任何请求，点击后才换成 iframe（与上游一致）
  window.loadBilibiliPlayer = function (btn) {
    const src = btn.getAttribute('data-src')
    if (!src) return
    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', src)
    iframe.setAttribute('scrolling', 'no')
    iframe.setAttribute('frameborder', 'no')
    iframe.setAttribute('allowfullscreen', 'true')
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    // allow-same-origin 是播放器读取自身存储所必需；iframe 与本页永远不同源，
    // 因此这里不会打开"同源即逃逸"的口子。
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation')
    iframe.setAttribute('data-src', src)
    btn.replaceWith(iframe)
  }

  window.toggleTaskCheckbox = function (cb) {
    if (taskToggleHandler) {
      taskToggleHandler(cb)
      return
    }
    // 只读场景没有可回写的源码，把视觉还原成渲染时的状态
    const want = cb.hasAttribute('checked')
    if (cb.checked !== want) cb.checked = want
  }
}

installMarkdownGlobals()

// ========== Typora 就地编辑宿主 ==========

/**
 * 把 LuoguTypora 接到任意容器上。
 *
 * LuoguTypora 只依赖宿主的三样东西（见上游 luogu-typora.js 注释）：
 *   previewEl       —— 承载渲染结果的元素
 *   textarea.value  —— 读源码；这里用访问器代理，读写都落到组件的响应式文本上
 *   setContent(v)   —— 写回源码
 * 因此不需要照搬上游那套 3236 行的编辑器外壳。
 *
 * @param {HTMLElement} previewEl
 * @param {() => string} getText
 * @param {(v: string) => void} setText
 */
export function createTyporaHost(previewEl, getText, setText) {
  const source = {
    get value() { return getText() },
    set value(v) { setText(v) },
  }
  const host = {
    previewEl,
    textarea: source,
    setContent(v) { setText(v) },
  }
  return new LuoguTypora(host)
}
