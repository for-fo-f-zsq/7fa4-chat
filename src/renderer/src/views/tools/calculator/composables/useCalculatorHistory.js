import { ref, watch } from 'vue'

const STORAGE_KEY = '7fa4-tool-calculator-history-v1'
const MAX_HISTORY = 50

function loadStoredHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && typeof item === 'object' && item.id)
  } catch {
    return []
  }
}

export function useCalculatorHistory() {
  const history = ref(loadStoredHistory())

  function persist() {
    try {
      const valid = (history.value || []).filter((item) => item && typeof item === 'object' && item.id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid.slice(0, MAX_HISTORY)))
    } catch {
      // ignore storage write errors
    }
  }

  watch(history, persist, { deep: true })

  function addHistory({ expr, result, mode = 'normal', modInfo = '' }) {
    if (!expr || !result) return
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      expr: String(expr).trim(),
      result: String(result).trim(),
      mode,
      modInfo,
      time: Date.now()
    }
    history.value.unshift(item)
    if (history.value.length > MAX_HISTORY) {
      history.value.splice(MAX_HISTORY)
    }
  }

  function removeHistory(id) {
    if (!id || !Array.isArray(history.value)) return
    const idx = history.value.findIndex((item) => item && item.id === id)
    if (idx !== -1) {
      history.value.splice(idx, 1)
    }
  }

  function clearHistory() {
    history.value = []
  }

  async function copyText(text) {
    if (!text) return false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }

  return {
    history,
    addHistory,
    removeHistory,
    clearHistory,
    copyText
  }
}
