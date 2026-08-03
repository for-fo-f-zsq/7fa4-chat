<template>
  <div class="calc-tool">
    <div class="calc-tool-header">
      <div class="calc-tool-title">
        <button class="calc-back-btn" title="返回工具列表" @click="$emit('back')"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-toolbox"></i> 工具
        <span class="calc-tool-sep">/</span>
        <i class="fas fa-calculator"></i> 计算器
      </div>
    </div>

    <div class="calc-body">
      <div class="calc-main">
        <div class="calc-display">
          <input
            ref="exprInputRef"
            v-model="exprText"
            class="calc-expr-input"
            placeholder="0"
            spellcheck="false"
            @keydown.enter="evaluateExpr"
            @keydown.esc="clearExpr"
          />
          <div class="calc-result" :class="{ error: hasError }">{{ resultText }}</div>
        </div>

        <div class="calc-pad">
          <button v-for="k in padKeys" :key="k" class="calc-key" :class="{ wide: k === '=' }" @click="press(k)">{{ k }}</button>
        </div>

        <div class="calc-bits">
          <button v-for="b in bitKeys" :key="b" class="calc-bit" @click="insertAtCursor(b, '')">{{ b }}</button>
        </div>

        <div class="calc-funcs">
          <button v-for="f in funcKeys" :key="f" class="calc-func" @click="pressFunc(f)">{{ f }}</button>
        </div>

        <div class="calc-modbar">
          <i class="fas fa-percent"></i>
          <span class="calc-modbar-label">模数 m（留空关闭）</span>
          <input v-model="modValue" class="calc-modbar-input" placeholder="998244353" spellcheck="false" />
          <span v-if="modOn" class="calc-modbar-badge">已开启</span>
        </div>
      </div>

      <div class="calc-side">
        <div class="calc-history-title">历史</div>
        <div class="calc-history">
          <div v-if="!history.length" class="calc-history-empty">暂无历史</div>
          <div v-for="(h, i) in history" :key="i" class="calc-history-item" :title="h.expr" @click="exprText = h.expr">
            <span class="calc-history-expr">{{ h.expr }}</span>
            <span class="calc-history-result">= {{ h.result }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import * as ce from './calcEngine.js'
import './calc-tool.css'

defineEmits(['back'])

const exprText = ref('')
const resultText = ref('')
const hasError = ref(false)
const history = ref([])
const exprInputRef = ref(null)
const modValue = ref('')
const modOn = computed(() => /^\d+$/.test(modValue.value.trim()))

const padKeys = ['AC', '⌫', '(', ')', '÷', '7', '8', '9', '×', '**', '4', '5', '6', '−', '!', '1', '2', '3', '+', '%', '0', '.', 'π', 'e', '=']
const bitKeys = ['&', '|', '^', '~', '<<', '>>']
const funcKeys = ['√', 'x²', 'x³', 'log2', 'log10', 'ln', 'abs', 'fact', 'gcd', 'lcm', 'C', 'A', 'inv', 'factor', 'min', 'max']

function press(k) {
  if (k === 'AC') {
    exprText.value = ''
    resultText.value = ''
    hasError.value = false
    return
  }
  if (k === '⌫') {
    exprText.value = exprText.value.slice(0, -1)
    return
  }
  if (k === '=') {
    evaluateExpr()
    return
  }
  const map = { '×': '*', '÷': '/', '−': '-', 'π': 'pi' }
  exprText.value += map[k] || k
}

function pressFunc(f) {
  if (f === 'x²') {
    insertAtCursor('**2', '')
    return
  }
  if (f === 'x³') {
    insertAtCursor('**3', '')
    return
  }
  const map = { '√': 'sqrt' }
  insertAtCursor(`${map[f] || f}(`, ')')
}

function insertAtCursor(prefix, suffix) {
  const el = exprInputRef.value
  const start = el ? (el.selectionStart ?? exprText.value.length) : exprText.value.length
  const end = el ? (el.selectionEnd ?? start) : start
  const before = exprText.value.slice(0, start)
  const after = exprText.value.slice(end)
  exprText.value = before + prefix + suffix + after
  const pos = start + prefix.length
  if (el) {
    nextTick(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }
}

function evaluateExpr() {
  try {
    const v = ce.evaluate(exprText.value, modValue.value.trim() || null)
    const r = ce.fmtNum(v)
    hasError.value = false
    resultText.value = modOn.value ? `${r}（mod ${modValue.value.trim()}）` : r
    history.value.unshift({ expr: exprText.value, result: r })
    if (history.value.length > 30) history.value.pop()
    exprText.value = r
  } catch (e) {
    hasError.value = true
    resultText.value = e.message || '计算错误'
  }
}

function clearExpr() {
  exprText.value = ''
  resultText.value = ''
  hasError.value = false
}
</script>
