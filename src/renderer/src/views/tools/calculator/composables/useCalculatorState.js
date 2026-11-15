import { ref, computed, nextTick } from 'vue'
import * as ce from '../calcEngine.js'
import {
  MOD_PRESETS,
  BARE_FUNCS,
  BARE_TEXT
} from '../calcConstants.js'

export function useCalculatorState({ onHistoryAdd, copyText } = {}) {
  const exprText = ref('')
  const resultText = ref('')
  const rawResult = ref(null)
  const lastExpr = ref('')
  const hasError = ref(false)
  const exprInputRef = ref(null)

  const mode = ref('normal')
  const modPreset = ref(MOD_PRESETS[0].value)
  const modCustom = ref('')
  const angleUnit = ref('deg')

  const memory = ref(null)
  const ans = ref(null)

  const hasMemory = computed(() => {
    return memory.value !== null && memory.value !== undefined
  })

  const modValue = computed(() => {
    return modPreset.value === 'custom' ? modCustom.value.trim() : modPreset.value
  })

  const modLabel = computed(() => {
    if (modPreset.value === 'custom') return modCustom.value.trim() || '自定义'
    return MOD_PRESETS.find((p) => p.value === modPreset.value)?.label || modPreset.value
  })

  function switchMode(m) {
    if (mode.value === m) return
    mode.value = m
    resultText.value = ''
    hasError.value = false
  }

  function clearExpr() {
    exprText.value = ''
    resultText.value = ''
    hasError.value = false
    rawResult.value = null
  }

  function setInputRef(el) {
    exprInputRef.value = el
  }

  function insertAtCursor(prefix, suffix = '') {
    const el = exprInputRef.value
    const curVal = exprText.value || ''
    const start = el ? (el.selectionStart ?? curVal.length) : curVal.length
    const end = el ? (el.selectionEnd ?? start) : start
    exprText.value = curVal.slice(0, start) + prefix + suffix + curVal.slice(end)
    const pos = start + prefix.length
    if (el) {
      nextTick(() => {
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    }
  }

  function backspace() {
    const el = exprInputRef.value
    const curVal = exprText.value || ''
    if (!curVal.length) return
    const start = el ? (el.selectionStart ?? curVal.length) : curVal.length
    const end = el ? (el.selectionEnd ?? start) : start
    if (start !== end) {
      exprText.value = curVal.slice(0, start) + curVal.slice(end)
      if (el) {
        nextTick(() => {
          el.focus()
          el.setSelectionRange(start, start)
        })
      }
    } else if (start > 0) {
      exprText.value = curVal.slice(0, start - 1) + curVal.slice(start)
      if (el) {
        nextTick(() => {
          el.focus()
          el.setSelectionRange(start - 1, start - 1)
        })
      }
    }
  }

  function evaluateExpr() {
    const expr = exprText.value.trim()
    if (!expr) {
      resultText.value = ''
      hasError.value = false
      return
    }

    try {
      const mod = modValue.value
      const v = ce.evaluate(expr, mod || null, mode.value, {
        angleUnit: angleUnit.value,
        ans: ans.value
      })
      rawResult.value = v
      const isFrac = ce.isFrac(v)
      const r = isFrac ? ce.fmtFrac(v) : ce.fmtNum(v)
      hasError.value = false
      lastExpr.value = expr

      let formattedDisplay = r
      if (mode.value === 'mod') {
        formattedDisplay = `${r}（mod ${modLabel.value}）`
      } else if (isFrac) {
        const approx = ce.fracApprox(v)
        formattedDisplay = approx ? `${r} ≈ ${approx}` : r
      } else {
        formattedDisplay = r
      }

      resultText.value = formattedDisplay
      ans.value = v

      // Save to history: DO NOT overwrite user's exprText!
      if (onHistoryAdd) {
        onHistoryAdd({
          expr,
          result: r,
          mode: mode.value,
          modInfo: mode.value === 'mod' ? modLabel.value : ''
        })
      }
    } catch (e) {
      hasError.value = true
      resultText.value = e.message || '计算错误'
    }
  }

  function pressKey(k) {
    if (k === 'AC') {
      clearExpr()
      return
    }
    if (k === '⌫') {
      backspace()
      return
    }
    if (k === '=') {
      evaluateExpr()
      return
    }
    if (k === 'Ans') {
      insertAtCursor('Ans', '')
      return
    }
    const map = { '×': '*', '÷': '/', '−': '-' }
    insertAtCursor(map[k] || k, '')
  }

  function pressFunc(f) {
    if (f === 'x²') return insertAtCursor('**2', '')
    if (f === 'x³') return insertAtCursor('**3', '')
    if (BARE_TEXT[f]) return insertAtCursor(BARE_TEXT[f], '')
    if (BARE_FUNCS.includes(f)) return insertAtCursor(f, '')
    const map = { '√': 'sqrt' }
    insertAtCursor(`${map[f] || f}(`, ')')
  }

  // Memory operations
  function toFrac(x) {
    if (x == null) return null
    if (ce.isFrac(x)) return x
    if (typeof x === 'bigint') return { n: x, d: 1n }
    if (typeof x === 'number' && Number.isInteger(x)) return { n: BigInt(x), d: 1n }
    if (typeof x === 'string' && /^-?\d+\/-?\d+$/.test(x.trim())) {
      const [n, d] = x.trim().split('/')
      return { n: BigInt(n), d: BigInt(d) }
    }
    return null
  }

  function fracAdd(a, b) {
    const n = a.n * b.d + b.n * a.d
    const d = a.d * b.d
    const g = ce.gcd(n, d)
    return { n: n / g, d: d / g }
  }

  function fracSub(a, b) {
    const n = a.n * b.d - b.n * a.d
    const d = a.d * b.d
    const g = ce.gcd(n, d)
    return { n: n / g, d: d / g }
  }

  function numVal(x) {
    if (x == null) return 0
    if (ce.isFrac(x)) return Number(x.n) / Number(x.d)
    return Number(x) || 0
  }

  function getCurrentVal() {
    if (rawResult.value !== null && !hasError.value) {
      return rawResult.value
    }
    if (exprText.value.trim()) {
      try {
        return ce.evaluate(exprText.value.trim(), modValue.value || null, mode.value, {
          angleUnit: angleUnit.value,
          ans: ans.value
        })
      } catch {
        return null
      }
    }
    return 0
  }

  function memoryClear() {
    memory.value = null
  }

  function memoryRecall() {
    if (memory.value === null || memory.value === undefined) return
    if (ce.isFrac(memory.value)) {
      insertAtCursor(ce.fmtFrac(memory.value), '')
    } else {
      insertAtCursor(String(memory.value), '')
    }
  }

  function memoryStore() {
    const v = getCurrentVal()
    if (v === null) return
    if (ce.isFrac(v)) {
      memory.value = { n: v.n, d: v.d }
    } else if (typeof v === 'bigint') {
      memory.value = v
    } else {
      const num = Number(v)
      memory.value = Number.isFinite(num) ? num : 0
    }
  }

  function memoryAdd() {
    const v = getCurrentVal()
    if (v === null) return
    const cur = memory.value != null ? memory.value : (mode.value === 'frac' ? { n: 0n, d: 1n } : 0)
    if (mode.value === 'frac' || ce.isFrac(cur) || ce.isFrac(v)) {
      const curFrac = toFrac(cur) || { n: 0n, d: 1n }
      const vFrac = toFrac(v) || { n: 0n, d: 1n }
      memory.value = fracAdd(curFrac, vFrac)
    } else {
      const curNum = numVal(cur)
      const vNum = numVal(v)
      memory.value = curNum + (Number.isFinite(vNum) ? vNum : 0)
    }
  }

  function memorySubtract() {
    const v = getCurrentVal()
    if (v === null) return
    const cur = memory.value != null ? memory.value : (mode.value === 'frac' ? { n: 0n, d: 1n } : 0)
    if (mode.value === 'frac' || ce.isFrac(cur) || ce.isFrac(v)) {
      const curFrac = toFrac(cur) || { n: 0n, d: 1n }
      const vFrac = toFrac(v) || { n: 0n, d: 1n }
      memory.value = fracSub(curFrac, vFrac)
    } else {
      const curNum = numVal(cur)
      const vNum = numVal(v)
      memory.value = curNum - (Number.isFinite(vNum) ? vNum : 0)
    }
  }

  function pressMemory(action) {
    switch (action) {
      case 'MC': return memoryClear()
      case 'MR': return memoryRecall()
      case 'M+': return memoryAdd()
      case 'M-': return memorySubtract()
      case 'MS': return memoryStore()
    }
  }

  return {
    exprText,
    resultText,
    rawResult,
    lastExpr,
    hasError,
    exprInputRef,
    mode,
    modPreset,
    modCustom,
    modValue,
    modLabel,
    angleUnit,
    memory,
    hasMemory,
    ans,
    setInputRef,
    switchMode,
    clearExpr,
    insertAtCursor,
    backspace,
    evaluateExpr,
    pressKey,
    pressFunc,
    pressMemory,
    memoryClear,
    memoryRecall,
    memoryStore,
    memoryAdd,
    memorySubtract
  }
}
