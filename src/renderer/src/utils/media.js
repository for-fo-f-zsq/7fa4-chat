// 媒体缓存与 Canvas 图片压缩（与服务端 syzoj.config.chat.length_limit 一致）

export const MAX_MSG_LENGTH = 102400
const MEDIA_ENVELOPE_MARGIN = 1024
const DEFAULT_MAX_B64 = MAX_MSG_LENGTH - MEDIA_ENVELOPE_MARGIN

/**
 * 把画布编码成 base64，保证字符数不超过 maxB64：
 * 起始 quality 0.82，先降质量到 0.45，再把最长边按 0.8 缩到 520px 以下，最后仍超则返回最低档结果。
 */
function encodeCanvasToFit(canvas, maxB64) {
  let current = canvas
  let width = canvas.width
  let height = canvas.height
  let quality = 0.82
  let data = current.toDataURL('image/jpeg', quality).split(',')[1]
  for (let guard = 0; data.length > maxB64 && (quality > 0.45 || Math.max(width, height) > 520) && guard < 60; guard++) {
    if (quality > 0.45) {
      quality = Math.max(0.45, quality - 0.1)
    } else {
      width = Math.max(1, Math.round(width * 0.8))
      height = Math.max(1, Math.round(height * 0.8))
      const next = document.createElement('canvas')
      next.width = width
      next.height = height
      next.getContext('2d').drawImage(current, 0, 0, width, height)
      current = next
    }
    data = current.toDataURL('image/jpeg', quality).split(',')[1]
  }
  return { data, width, height }
}

function drawImageToFit(img, maxDim, maxB64) {
  const canvas = document.createElement('canvas')
  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(img, 0, 0, width, height)
  const fit = encodeCanvasToFit(canvas, maxB64)
  return {
    data: fit.data,
    size: Math.round((fit.data.length * 3) / 4),
    width: fit.width,
    height: fit.height,
  }
}

// 图片/表情 media URL 缓存：把 base64 → Blob objectURL 复用，FIFO 限 400 条。
//
// 键的选择很重要：base64 本身经常是几十 ~ 上百 KB。以前直接拿整串 base64 当 Map 键，
// 等于让缓存额外长期持有 400 份大字符串（内存尖峰 + 每次 set/get 都要对巨型键做哈希）。
// 现在：调用方能给 msg.id 时用 id 作键（渲染层 parseContent 已把 msg.id 传下来），
// 只有拿不到 id 的场景（输入预览等）才退回 base64 键。
// 条目统一存 { src, url }：src 是原始 base64，命中时必须比对，同 id 内容改写才不会串图。
//
// 淘汰时的 revokeObjectURL 必须带安全阀：被淘汰的 URL 可能仍被 DOM 里的 <img> 引用
// （消息没有虚拟化，滚过去的历史图片一直在文档里）。此时 revoke 会让图片变成裂图，
// 所以只在「文档里已经没有元素引用它」时才回收；仍被引用的情况交给浏览器随节点销毁回收。
const mediaUrlCache = new Map()
const MEDIA_URL_MAX = 400

function isUrlStillInDocument(url) {
  if (typeof document === 'undefined' || !document.images) return false
  const imgs = document.images
  for (let i = 0; i < imgs.length; i++) {
    if (imgs[i] && imgs[i].src === url) return true
  }
  return false
}

export function mediaUrlFromData(base64, mime, cacheKey) {
  if (!base64) return ''
  const key = cacheKey != null && cacheKey !== '' ? 'k:' + cacheKey : base64
  const hit = mediaUrlCache.get(key)
  // 同 id 的消息内容会被整条重写（chatSync 补同步、投票合并、图片压缩重传），
  // 所以「命中 id」不等于「命中内容」：必须比对 base64 才能复用 blob URL，
  // 否则气泡里会一直显示旧图（HTML 是新的，只是 src 没变，最难查的一类 bug）。
  if (hit && hit.src === base64) return hit.url
  const mimeStr = mime && /^image\//.test(mime) ? mime : 'image/png'
  let url
  try {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    url = URL.createObjectURL(new Blob([bytes], { type: mimeStr }))
  } catch {
    url = `data:${mimeStr};base64,${base64}`
  }
  if (hit) {
    // 覆盖同 key：旧 URL 若已无元素引用就立刻回收，仍被引用的交给节点销毁时回收
    mediaUrlCache.delete(key)
    if (hit.url.startsWith('blob:') && !isUrlStillInDocument(hit.url)) {
      try { URL.revokeObjectURL(hit.url) } catch {}
    }
  }
  if (mediaUrlCache.size >= MEDIA_URL_MAX) {
    const firstKey = mediaUrlCache.keys().next().value
    const evicted = mediaUrlCache.get(firstKey)
    mediaUrlCache.delete(firstKey)
    if (evicted && evicted.url.startsWith('blob:') && !isUrlStillInDocument(evicted.url)) {
      try { URL.revokeObjectURL(evicted.url) } catch {}
    }
  }
  mediaUrlCache.set(key, { src: base64, url })
  return url
}

function readRawFileBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result.split(',')[1]
      resolve({ data, size: file.size })
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export function compressImage(file, opts = {}) {
  const maxDim = Number(opts.maxDim) > 0 ? Number(opts.maxDim) : 1280
  const maxB64 = Number(opts.maxB64) > 0 ? Number(opts.maxB64) : DEFAULT_MAX_B64
  if (!file || !file.type?.startsWith('image/')) {
    return readRawFileBase64(file)
  }
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(drawImageToFit(img, maxDim, maxB64))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      readRawFileBase64(file).then(resolve)
    }
    img.src = url
  })
}

export function compressBase64Image(base64Data, mime, opts = {}) {
  const maxDim = Number(opts.maxDim) > 0 ? Number(opts.maxDim) : 1280
  const maxB64 = Number(opts.maxB64) > 0 ? Number(opts.maxB64) : DEFAULT_MAX_B64
  return new Promise((resolve) => {
    if (!mime?.startsWith('image/')) {
      resolve({ data: base64Data, size: Math.round((base64Data.length * 3) / 4) })
      return
    }
    const img = new Image()
    img.onload = () => resolve(drawImageToFit(img, maxDim, maxB64))
    img.onerror = () => resolve(base64Data)
    img.src = `data:${mime};base64,${base64Data}`
  })
}
