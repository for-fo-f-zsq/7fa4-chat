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

// 图片/表情 media URL 缓存：把 base64 → Blob objectURL，按 base64 字符串复用，FIFO 限 400 条
const mediaUrlCache = new Map()
const MEDIA_URL_MAX = 400

export function mediaUrlFromData(base64, mime) {
  if (!base64) return ''
  const hit = mediaUrlCache.get(base64)
  if (hit) return hit
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
  if (mediaUrlCache.size >= MEDIA_URL_MAX) {
    const firstKey = mediaUrlCache.keys().next().value
    mediaUrlCache.delete(firstKey)
  }
  mediaUrlCache.set(base64, url)
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
