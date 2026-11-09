// 静态资源 URL 前缀：网页版挂在子路径（/7fa4-chat/web/）下，根绝对路径会 404。
// 桌面端与安卓端构建基址是 '/'，assetUrl('qqface/s0.gif') 仍是 '/qqface/s0.gif'，行为不变。
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'

export function assetUrl(path) {
  return String(BASE).replace(/\/+$/, '/') + String(path).replace(/^\/+/, '')
}
