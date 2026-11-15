/**
 * 图片文字工具：内联 Markdown 解析、测量、命中检测与 Canvas2D 绘制
 */

export function parseInlineMd(line) {
  const l = line.replace(/^#{1,6}\s*/, '')
  const segs = []
  const re = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g
  let last = 0
  let m
  while ((m = re.exec(l))) {
    if (m.index > last) segs.push({ text: l.slice(last, m.index), bold: false, italic: false, code: false })
    if (m[1]) segs.push({ text: m[1].slice(2, -2), bold: true, italic: false, code: false })
    else if (m[2]) segs.push({ text: m[2].slice(1, -1), bold: false, italic: true, code: false })
    else if (m[3]) segs.push({ text: m[3].slice(1, -1), bold: false, italic: false, code: true })
    last = re.lastIndex
  }
  if (last < l.length) segs.push({ text: l.slice(last), bold: false, italic: false, code: false })
  return segs.length ? segs : [{ text: l, bold: false, italic: false, code: false }]
}

const TEXT_FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif'

export function measureTextObject(obj, ctx) {
  const fs = obj.fontSize || 24
  const lines = (obj.md || '').split('\n')
  let w = 0
  // measureText 用的是 ctx 当前的 font，不显式设一次就会拿到上一次绘制残留的字号，
  // 命中检测与旋转后的定位会整体偏移。
  if (ctx?.font !== undefined) ctx.font = `${fs}px ${TEXT_FONT_FAMILY}`
  lines.forEach((l) => {
    const plain = l.replace(/\*\*/g, '').replace(/^#{1,6}\s*/, '').replace(/[*_~`]/g, '')
    const m = ctx?.measureText ? ctx.measureText(plain).width : plain.length * fs
    if (m > w) w = m
  })
  return { w: Math.max(w, 10), h: lines.length * fs * 1.25 }
}

export function hitTextObject(textObjects, pos, ctx) {
  for (let i = textObjects.length - 1; i >= 0; i--) {
    const obj = textObjects[i]
    const { w, h } = measureTextObject(obj, ctx)
    if (pos.x >= obj.x && pos.x <= obj.x + w && pos.y >= obj.y && pos.y <= obj.y + h) {
      return obj
    }
  }
  return null
}

export function readEditorText(el) {
  if (!el) return ''
  let html = el.innerHTML
  html = html.replace(/<br\s*\/?>/gi, '\n')
  html = html.replace(/<\/div>/gi, '\n').replace(/<\/p>/gi, '\n')
  html = html.replace(/<[^>]+>/g, '')
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function renderTextObjects(ctx, textObjects) {
  if (!ctx || !textObjects.length) return
  const fontFamily = '"Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.save()
  textObjects.forEach((obj) => {
    const fs = obj.fontSize || 24
    const x = obj.x
    let y = obj.y
    const lines = (obj.md || '').split('\n')
    lines.forEach((line) => {
      const segments = parseInlineMd(line)
      let cursor = x
      segments.forEach((seg) => {
        ctx.save()
        ctx.fillStyle = obj.color || '#ff0000'
        if (seg.bold) ctx.font = `bold ${fs}px ${fontFamily}`
        else if (seg.italic) ctx.font = `italic ${fs}px ${fontFamily}`
        else if (seg.code) ctx.font = `${fs * 0.9}px "Consolas", monospace`
        else ctx.font = `${fs}px ${fontFamily}`
        ctx.textBaseline = 'top'
        if (seg.code) {
          const bg = ctx.measureText(seg.text).width
          ctx.fillStyle = obj.color || '#ff0000'
          ctx.globalAlpha = 0.12
          ctx.fillRect(cursor, y, bg + 8, fs * 1.2)
          ctx.globalAlpha = 1
          ctx.fillStyle = obj.color || '#ff0000'
          ctx.fillText(seg.text, cursor + 4, y + 2)
        } else {
          ctx.fillText(seg.text, cursor, y)
        }
        cursor += ctx.measureText(seg.text).width
        ctx.restore()
      })
      y += fs * 1.25
    })
  })
  ctx.restore()
}
