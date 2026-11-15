import { showToast } from '../composables/useToast.js'

/**
 * 工具类文件保存统一入口：有可用路径就静默写回，否则弹「另存为」。
 * - savedPath 仅桌面端有效（主进程按白名单校验；不受信时返回 unsupported）
 * - 返回 { success, canceled, path, error }
 */
export async function saveToolFile(base64, name, mime, savedPath) {
  const api = window.api || {}
  if (savedPath && typeof api.saveFileTo === 'function') {
    const r = await api.saveFileTo(savedPath, base64)
    if (r && r.success) return { success: true, path: savedPath }
    if (!r || !r.unsupported) return { success: false, error: (r && r.error) || '未知错误' }
  }
  try {
    const r = await api.downloadFile(base64, name, mime)
    if (!r || !r.success) {
      return { success: false, canceled: !!(r && r.canceled), error: (r && r.error) || '未知错误' }
    }
    return { success: true, path: r.path || '' }
  } catch (e) {
    return { success: false, error: (e && e.message) || '未知错误' }
  }
}

/**
 * 工具类保存状态文案：三端同一套措辞与配色类（`.is-clean` / `.is-dirty`）。
 * hasFile=false 表示还没有落盘过任何文件 —— 此时不能说「已保存」。
 */
export function toolSaveState({ hasFile = false, dirty = false } = {}) {
  const saved = !!hasFile && !dirty
  return { text: saved ? '已保存' : '未保存', cls: saved ? 'is-clean' : 'is-dirty' }
}

/**
 * 轻提示：转发至统一 Toast 通道（主窗口走 UiToastHost，独立工具窗走 document.body CSP 安全兜底）。
 */
export function flashTip(text, type = 'info') {
  try {
    showToast(text, type, 1800)
  } catch {}
}
