/**
 * 节点点权解析、格式化与历史 JSON `label` 兼容迁移工具（纯函数，无 Vue 依赖）。
 */

export function parseNodeWeight(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim()
  if (s === '' || s === '_') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function isValidNodeWeightInput(raw) {
  if (raw === null || raw === undefined) return true
  const s = String(raw).trim()
  if (s === '' || s === '_') return true
  return Number.isFinite(Number(s))
}

/**
 * 兼容读取历史 JSON：优先取 `raw.weight`，若缺失则尝试将非默认 `raw.label` 迁移为数字点权。
 */
export function migrateLegacyNodeWeight(raw, id) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.weight !== undefined && raw.weight !== null && String(raw.weight).trim() !== '') {
    return parseNodeWeight(raw.weight)
  }
  if (raw.label !== undefined && raw.label !== null) {
    const s = String(raw.label).trim()
    if (s === '' || s === String(id)) return null
    return parseNodeWeight(s)
  }
  return null
}

/**
 * 解析按行输入的点权文本（第 i 行对应编号 i+1 的节点）。
 * @returns {Map<number, number|null>}
 */
export function parseNodeWeightsLines(rawText) {
  const map = new Map()
  const lines = String(rawText ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    map.set(i + 1, parseNodeWeight(lines[i]))
  }
  return map
}

/**
 * 将节点列表点权回显为按行文本；若所有节点均无点权，返回空字符串。
 */
export function formatNodeWeightsLines(nodes, byId) {
  let lastWeightedId = 0
  for (const n of nodes) {
    if (n && n.weight != null && Number.isFinite(Number(n.weight))) {
      if (n.id > lastWeightedId) lastWeightedId = n.id
    }
  }
  if (lastWeightedId === 0) return ''
  const lookup = byId || ((id) => nodes.find((n) => n.id === id) || null)
  const lines = []
  for (let i = 1; i <= lastWeightedId; i++) {
    const n = lookup(i)
    lines.push(n && n.weight != null && Number.isFinite(Number(n.weight)) ? String(n.weight) : '_')
  }
  return lines.join('\n')
}
