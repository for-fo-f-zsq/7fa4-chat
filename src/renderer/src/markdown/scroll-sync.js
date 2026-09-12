/**
 * 滚动同步引擎 —— 从上游 wudream813/luogu-markdown-editor 的 editor.js 原样移植
 * （v1.23.1，MIT），是「工具 → Markdown」与聊天输入框共用的同一套实现。
 *
 * 三个核心机制（与上游逐行对应，勿改成比例对齐 / 定时锁 —— 均为被上游注释否决的方案）：
 *   1. rAF 合并：高速滚轮/惯性滚动产生的中间位置不丢，全部合并到下一帧一次更新；
 *   2. 位置回显检测：WeakMap 记录程序化 scrollTop 写入，1.5px 容差识别"自己写的回声"，
 *      替代不可靠的定时锁（scroll 事件是异步派发的，定时锁清零后回声会被当成用户输入）；
 *   3. 行锚点插值：以视口顶部所在源码行（而非高度比例）驱动对侧，[data-src-line]
 *      锚点二分查找 + 分段线性插值；折叠 callout 补终止锚点、非单调 top 钳制。
 *
 * 用法：
 *   const sync = createScrollSync({ getTextarea, getPreview, getGutter })
 *   // 预览 DOM 重新渲染后：sync.invalidate()
 *   // 滚动事件里：sync.sync('editor' | 'preview')
 *   // 卸载时：sync.destroy()
 */
export function createScrollSync(opts) {
  const getTextarea = opts.getTextarea || (() => null)
  const getPreview = opts.getPreview || (() => null)
  const getGutter = opts.getGutter || (() => null)

  let enabled = opts.enabled !== false
  let renderSeq = 0

  // ---- rAF 合并 ----
  let pendingSyncSource = null
  let syncRaf = 0

  // ---- 回声检测 ----
  let echo = null // WeakMap<Element, top>

  // ---- 锚点缓存 / 行高缓存 ----
  let anchors = null
  let anchorsKey = null
  let lineTops = null
  let lineTopsKey = null
  let mirrorEl = null

  // ---- 尾部 padding 状态 ----
  let basePadBottom, basePreviewPadBottom, tailPad, previewTailPad

  // ---- 行号 gutter ----
  let gutterLineHeight = null

  function invalidate() {
    renderSeq++
    anchorsKey = null
  }

  /**
   * 构建预览锚点：每个 [data-src-line] 块的 { line, top }。
   * 缓存键必须包含锚点几何依赖的一切：渲染代数 + 预览自身 scrollHeight/width ——
   * 展开折叠框、KaTeX/图片/iframe 异步加载、字体替换、拖分隔条都会在"没有重渲染"
   * 的情况下改变布局，只按渲染代数做键会让同步瞄准一个已经不存在的位置。
   */
  function buildScrollAnchors() {
    const pv = getPreview()
    if (!pv) return []
    const key = `${renderSeq}\u0000${pv.scrollHeight}\u0000${pv.clientWidth}`
    if (anchorsKey === key && anchors) return anchors

    const nodes = pv.querySelectorAll('[data-src-line]')
    const baseTop = pv.getBoundingClientRect().top - pv.scrollTop
    const list = []
    nodes.forEach((el) => {
      const line = parseInt(el.getAttribute('data-src-line'), 10)
      if (!Number.isFinite(line)) return
      // 折叠 <details> 内部内容没有自己的盒子，跳过；由下方 callout 终止锚点覆盖
      if (el.offsetParent === null && el !== pv) return
      const top = el.getBoundingClientRect().top - baseTop
      const prev = list[list.length - 1]
      if (prev && prev.line === line) return
      list.push({ line, top })
    })

    // 折叠 callout 代表 ::: 之间的所有源码行，但只在起始行贡献一个锚点。
    // 补一个终止行锚点，让隐藏区间的映射刻意"平坦"——预览停在 callout 上，
    // 编辑器穿过它之后同步干净地恢复，避免 ~6px 的蹭动后猛跳。
    pv.querySelectorAll('details.luogu-callout[data-src-end-line]').forEach((d) => {
      if (d.hasAttribute('open')) return
      if (d.offsetParent === null) return
      const endLine = parseInt(d.getAttribute('data-src-end-line'), 10)
      if (!Number.isFinite(endLine)) return
      const r = d.getBoundingClientRect()
      list.push({ line: endLine, top: r.bottom - baseTop })
    })
    list.sort((a, b) => a.line - b.line || a.top - b.top)

    // 两个二分查找都要求 top 随 line 单调不减。嵌套 <details> 内层内容的源码行号
    // 很高但物理位置靠上，会把非单调数组喂给二分 → 基本随机的命中（"弹跳"）。
    // 逐项钳制到前驱即可：几个锚点共享 top 只会让映射局部平坦，而不是错。
    for (let i = 1; i < list.length; i++) {
      if (list[i].top < list[i - 1].top) list[i].top = list[i - 1].top
    }

    anchors = list
    anchorsKey = key
    return list
  }

  // 相邻锚点间的分段线性插值，返回 { lo, hi } 或端点本身
  function interpolate(list, pick, get) {
    if (!list.length) return null
    let lo = 0
    let hi = list.length - 1
    if (pick <= get(list[0])) return list[0]
    if (pick >= get(list[hi])) return list[hi]
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (get(list[mid]) <= pick) lo = mid; else hi = mid
    }
    return { lo: list[lo], hi: list[hi] }
  }

  function setEnabled(v) {
    enabled = !!v
    // 重新打开时必须补上关闭期间落下的差距，否则两侧要等下一次滚动才会对齐
    if (enabled) {
      echo = null
      sync('editor')
    }
    return enabled
  }

  function sync(source) {
    if (!enabled) return
    // 被驱动的一侧也会发 scroll 事件。与其用定时锁丢掉惯性滚动的中间位置
    // （对侧会以 ~280px 的可见台阶前进），不如记住最后一次请求，合并到下一帧。
    pendingSyncSource = source
    if (syncRaf) return
    syncRaf = requestAnimationFrame(() => {
      syncRaf = 0
      const src = pendingSyncSource
      pendingSyncSource = null
      applySyncScroll(src)
    })
  }

  // 记录"我们即将把 el 滚到 top"，它激起的 scroll 事件就能与用户滚动区分开
  function markProgrammaticScroll(el, top) {
    if (!echo) echo = new WeakMap()
    echo.set(el, top)
  }

  function isEchoScroll(el) {
    if (!echo || !echo.has(el)) return false
    const expected = echo.get(el)
    // 浏览器会钳制/取整 scrollTop，用容差比较而非全等
    if (Math.abs(el.scrollTop - expected) <= 1.5) {
      echo.delete(el)
      return true
    }
    // 位置越过了我们的写入：用户真的又在滚
    echo.delete(el)
    return false
  }

  function setScrollTop(el, top) {
    if (Math.abs(el.scrollTop - top) <= 0.5) return
    markProgrammaticScroll(el, top)
    el.scrollTop = top
  }

  function applySyncScroll(source) {
    if (!source) return
    const ta = getTextarea()
    const pv = getPreview()
    if (!ta || !pv) return

    const list = buildScrollAnchors()
    const tops = measureLineTops()

    if (!list.length || tops.length < 2) {
      // 没有锚点可用（如空文档）；退回比例对齐
      syncScrollByRatio(source)
      return
    }

    if (source === 'editor') {
      // 用户看到的是"视口顶部是哪一行源码"，所以由那一行（而非高度百分比）驱动预览
      const y = ta.scrollTop
      // 越过最后一行就进入了尾部 padding，不再有源码行可映射。
      // 把剩余量直接线性映射到预览自己的尾部，让两侧同时到底。
      const natural = maxNaturalScroll(tops)
      if (y > natural) {
        const padSpan = (ta.scrollHeight - ta.clientHeight) - natural
        const pmax = pv.scrollHeight - pv.clientHeight
        const lastTop = previewTopForLine(list, Math.floor(visualOffsetToLine(tops, natural)), 0)
        const from = lastTop === null ? pmax : Math.max(0, Math.min(pmax, lastTop))
        const t = padSpan > 0 ? (y - natural) / padSpan : 1
        const want = from + (pmax - from) * t
        setScrollTop(pv, want)
        return
      }
      const line = visualOffsetToLine(tops, y)
      const docLine = Math.floor(line)
      const frac = line - docLine
      let target = previewTopForLine(list, docLine, frac)
      if (target !== null) {
        // 滚到最顶时预览也必须为 0：行 0 合法映射到正值（首块上方的 padding +
        // margin，这是别处对齐的依据），但在 y===0 时会把文档前导空白滚出视野。
        // 只把"精确的顶"当特例。
        if (y <= 0) target = 0
        const max = pv.scrollHeight - pv.clientHeight
        const want = Math.max(0, Math.min(max, target))
        setScrollTop(pv, want)
      }
    } else if (source === 'preview') {
      const y = pv.scrollTop
      // 编辑器分支的镜像：越过最后一个锚点后预览在自己尾部 padding 里滚，
      // 线性映射到编辑器尾部，这个方向上也两侧同底。
      const lastAnchorTop = list[list.length - 1].top
      if (y > lastAnchorTop) {
        const pmax = pv.scrollHeight - pv.clientHeight
        const padSpan = pmax - lastAnchorTop
        const tmax = ta.scrollHeight - ta.clientHeight
        const lastVis = Math.floor(list[list.length - 1].line)
        const from = lastVis === -1
          ? tmax
          : Math.max(0, Math.min(tmax, tops[lastVis] || 0))
        const t = padSpan > 0 ? (y - lastAnchorTop) / padSpan : 1
        setScrollTop(ta, from + (tmax - from) * t)
        updateGutterScroll()
        return
      }
      const docLine = lineForPreviewTop(list, y)
      if (docLine !== null) {
        const vis = Math.floor(docLine)
        if (vis >= 0) {
          const frac = docLine - vis
          const a = tops[vis] || 0
          const b = tops[vis + 1] !== undefined ? tops[vis + 1] : a
          const target = a + (b - a) * frac
          const max = ta.scrollHeight - ta.clientHeight
          const want = Math.max(0, Math.min(max, target))
          setScrollTop(ta, want)
          updateGutterScroll()
        }
      }
    }
  }

  // 只在没有任何锚点时使用的兜底
  function syncScrollByRatio(source) {
    const ta = getTextarea()
    const pv = getPreview()
    if (!ta || !pv) return
    if (source === 'editor') {
      const max = ta.scrollHeight - ta.clientHeight
      if (max > 0) {
        const r = ta.scrollTop / max
        setScrollTop(pv, r * (pv.scrollHeight - pv.clientHeight))
      }
    } else {
      const max = pv.scrollHeight - pv.clientHeight
      if (max > 0) {
        const r = pv.scrollTop / max
        setScrollTop(ta, r * (ta.scrollHeight - ta.clientHeight))
        updateGutterScroll()
      }
    }
  }

  // textarea 像素偏移 -> 小数行号
  function visualOffsetToLine(tops, y) {
    let lo = 0
    let hi = tops.length - 2
    if (y <= tops[0]) return 0
    if (y >= tops[hi]) return hi
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (tops[mid] <= y) lo = mid; else hi = mid
    }
    const a = tops[lo]
    const b = tops[lo + 1]
    return b > a ? lo + (y - a) / (b - a) : lo
  }

  // 源码行(+小数) -> 预览像素偏移，锚点间插值
  function previewTopForLine(list, line, frac) {
    if (!list.length) return null
    if (line <= list[0].line) return list[0].top
    const last = list[list.length - 1]
    if (line >= last.line) return last.top
    let lo = 0
    let hi = list.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (list[mid].line <= line) lo = mid; else hi = mid
    }
    const A = list[lo]
    const B = list[hi]
    const span = B.line - A.line
    const t = span > 0 ? (line + frac - A.line) / span : 0
    return A.top + (B.top - A.top) * Math.max(0, Math.min(1, t))
  }

  // 预览像素偏移 -> 源码行(+小数)
  function lineForPreviewTop(list, y) {
    if (!list.length) return null
    if (y <= list[0].top) return list[0].line
    const last = list[list.length - 1]
    if (y >= last.top) return last.line
    let lo = 0
    let hi = list.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (list[mid].top <= y) lo = mid; else hi = mid
    }
    const A = list[lo]
    const B = list[hi]
    const span = B.top - A.top
    const t = span > 0 ? (y - A.top) / span : 0
    return A.line + (B.line - A.line) * Math.max(0, Math.min(1, t))
  }

  // 让编辑器能滚过最后一行：预览通常比源码高，否则编辑器先到底、同步再也带不到
  // 预览的尾巴。按预览多出的高度扩展编辑器可滚动区间。两侧都做，避免"一侧先到底"。
  function syncEditorTailPadding() {
    const ta = getTextarea()
    const pv = getPreview()
    if (!ta || !pv) return
    if (basePadBottom === undefined) {
      basePadBottom = parseFloat(window.getComputedStyle(ta).paddingBottom) || 0
    }
    if (basePreviewPadBottom === undefined) {
      basePreviewPadBottom = parseFloat(window.getComputedStyle(pv).paddingBottom) || 0
    }

    // 对照"未加 padding"的高度测量，否则上一帧的 padding 会滚入这一帧的计算，
    // 两边互相顶着一帧涨一点。
    const prevTaPad = tailPad === undefined ? basePadBottom : tailPad
    const prevPvPad = previewTailPad === undefined ? basePreviewPadBottom : previewTailPad

    const tops = measureLineTops()
    const padTop = parseFloat(window.getComputedStyle(ta).paddingTop) || 0
    const lastLineTop = tops.length >= 2 ? tops[tops.length - 2] : 0

    const list = buildScrollAnchors()
    const lastAnchorTop = list.length ? list[list.length - 1].top : 0

    const taNatural = Math.max(0, (ta.scrollHeight - prevTaPad + basePadBottom) - ta.clientHeight)
    const pvNatural = Math.max(0, (pv.scrollHeight - prevPvPad + basePreviewPadBottom) - pv.clientHeight)

    const taNeed = Math.max(0, lastLineTop + padTop - taNatural)
    const pvNeed = Math.max(0, lastAnchorTop - pvNatural)

    const wantTa = Math.round(basePadBottom + taNeed)
    const wantPv = Math.round(basePreviewPadBottom + pvNeed)

    if (tailPad !== wantTa) {
      tailPad = wantTa
      ta.style.paddingBottom = `${wantTa}px`
    }
    if (previewTailPad !== wantPv) {
      previewTailPad = wantPv
      pv.style.paddingBottom = `${wantPv}px`
      // 锚点偏移是相对预览盒测量的，盒子刚变过
      anchorsKey = null
    }
  }

  // 视口顶部仍是"真实源码行"的最大 scrollTop；越过它就是尾部 padding 区。
  // 刻意不是"最后一行到达视口底部"——那早得多，会把一大段本可精确映射的滚动
  // 交给插值路径，导致文档末尾几百像素的对齐偏差。
  function maxNaturalScroll(tops) {
    // tops 每行一项 + 末尾一个总高度哨兵，所以最后一行的起始下标是 length - 2
    if (!tops || tops.length < 2) return 0
    return Math.max(0, tops[tops.length - 2])
  }

  /**
   * 测量 textarea 每个逻辑行的顶部偏移。开启软换行后一行可占多个视觉行，
   * 行号与滚动同步都不能再用 行号×行高 近似——用一个隐藏镜像 div 复制 textarea
   * 的字体排版与宽度来还原换行，读取真实偏移。按文本哈希缓存。
   */
  function measureLineTops() {
    const ta = getTextarea()
    if (!ta) return []
    const text = ta.value
    const width = ta.clientWidth
    // 按文本内容哈希：只按长度做键时"等长编辑"会碰撞，返回过期偏移
    let h = 0
    for (let k = 0; k < text.length; k++) h = ((h << 5) - h + text.charCodeAt(k)) | 0
    const cacheKey = `${text.length}\u0000${width}\u0000${h}`
    if (lineTopsKey === cacheKey && lineTops) return lineTops

    if (!mirrorEl) {
      mirrorEl = document.createElement('div')
      mirrorEl.setAttribute('aria-hidden', 'true')
      mirrorEl.style.cssText =
        'position:absolute;visibility:hidden;pointer-events:none;top:0;left:-99999px;'
      document.body.appendChild(mirrorEl)
    }

    const cs = window.getComputedStyle(ta)
    // 复制所有可能影响断行的属性
    ;[
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
      'lineHeight', 'textTransform', 'wordSpacing', 'whiteSpace',
      'overflowWrap', 'wordBreak', 'tabSize', 'textIndent',
    ].forEach((k) => { mirrorEl.style[k] = cs[k] })
    mirrorEl.style.width = `${width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`
    mirrorEl.style.padding = '0'
    mirrorEl.style.border = '0'

    const lines = text.split('\n')
    mirrorEl.innerHTML = ''
    const frag = document.createDocumentFragment()
    const spans = lines.map((ln) => {
      const el = document.createElement('div')
      // 行尾零宽空格让空行也可测量
      el.textContent = ln.length ? ln : '\u200b'
      frag.appendChild(el)
      return el
    })
    mirrorEl.appendChild(frag)

    const base = mirrorEl.getBoundingClientRect().top
    const tops = spans.map((el) => el.getBoundingClientRect().top - base)
    tops.push(mirrorEl.getBoundingClientRect().height)

    lineTops = tops
    lineTopsKey = cacheKey
    return tops
  }

  // 把 gutter 的行高钉在 textarea 实际计算行高上；CSS 侧近似会有累积偏差
  function syncGutterMetrics() {
    const gutter = getGutter && getGutter()
    const ta = getTextarea()
    if (!gutter || !ta) return
    const lh = window.getComputedStyle(ta).lineHeight
    if (lh && lh !== 'normal' && lh !== gutterLineHeight) {
      gutterLineHeight = lh
      gutter.style.setProperty('--editor-line-height', lh)
    }
  }

  // 软换行意味着一个逻辑行可占多个视觉行，行号按测量偏移定位而非 下标×行高
  function updateGutter() {
    const gutter = getGutter && getGutter()
    const ta = getTextarea()
    if (!gutter || !ta) return
    syncGutterMetrics()
    // 结尾换行 = 开启新的一行（与常规编辑器一致）：空内容显示 1，"\n" 显示 1、2。
    // measureLineTops 的逻辑行本来就按 split('\n') 含结尾空行，直接对齐使用。
    const lines = ta.value.split('\n')
    const count = Math.max(lines.length, 1)

    const tops = measureLineTops()
    // 行号是绝对定位的，会逃出 gutter 自己的 padding-top；textarea 首行在一个
    // padding-top 之下。缺了这个偏移每个数字都会高 ~12px。
    const padTop = parseFloat(window.getComputedStyle(ta).paddingTop) || 0
    const numParts = []
    for (let i = 0; i < count; i++) {
      numParts.push(`<span class="md-gutter-num" style="top:${((tops[i] || 0) + padTop).toFixed(2)}px">${i + 1}</span>`)
    }
    gutter.innerHTML = numParts.join('')
    // gutter 高度由 flex 拉伸撑满面板，不按内容设高——按内容设高会把它压成
    // "一行高"，overflow:hidden 会裁掉（至少）最后一个行号，看着像少一个。
    updateGutterScroll()
  }

  function updateGutterScroll() {
    const gutter = getGutter && getGutter()
    const ta = getTextarea()
    if (!gutter || !ta) return
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`
  }

  function destroy() {
    if (syncRaf) {
      cancelAnimationFrame(syncRaf)
      syncRaf = 0
    }
    if (mirrorEl && mirrorEl.parentNode) mirrorEl.parentNode.removeChild(mirrorEl)
    mirrorEl = null
    echo = null
    anchors = null
    anchorsKey = null
    lineTops = null
    lineTopsKey = null
  }

  return {
    // 状态
    get enabled() { return enabled },
    // 动作
    sync,
    setEnabled,
    invalidate,
    isEchoScroll,
    syncEditorTailPadding,
    updateGutter,
    updateGutterScroll,
    measureLineTops,
    destroy,
  }
}
