<template>
  <div class="calc-tool" :class="{ narrow: isNarrow }">
    <div class="calc-tool-header">
      <div class="calc-tool-title">
        <button class="calc-back-btn" title="返回" @click="$emit('back')"><i class="fas fa-arrow-left"></i></button>
        <i class="fas fa-toolbox"></i> 工具
        <span class="calc-tool-sep">/</span>
        <i class="fas fa-calculator"></i> 计算器
      </div>
    </div>

    <div class="calc-body">
      <!-- 窄模式：侧边把手（历史抽屉收起时仍可见，点击展开/收起） -->
      <div v-if="isNarrow" class="calc-side-handle" :class="{ open: historyOpen }" @click="historyOpen = !historyOpen" :title="historyOpen ? '收起历史' : '展开历史'">
        <i :class="historyOpen ? 'fas fa-chevron-right' : 'fas fa-chevron-left'"></i>
      </div>

      <div class="calc-main">
        <!-- 计算模式 -->
        <div class="calc-modes" role="tablist" aria-label="计算模式">
          <button
            v-for="m in modes"
            :key="m.value"
            class="calc-mode-btn"
            :class="{ active: mode === m.value }"
            role="tab"
            :aria-selected="mode === m.value"
            :title="m.desc"
            @click="switchMode(m.value)"
          >
            <i :class="m.icon"></i>{{ m.label }}
          </button>
        </div>

        <!-- 显示区：模数选择固定在输入框左边（仅模数模式出现） -->
        <div class="calc-display">
          <div class="calc-display-row">
            <template v-if="mode === 'mod'">
              <select v-model="modPreset" class="calc-mod-select" title="模数 m">
                <option v-for="p in MOD_PRESETS" :key="p.value" :value="p.value">{{ p.label }}</option>
                <option value="custom">自定义…</option>
              </select>
              <input
                v-if="modPreset === 'custom'"
                v-model="modCustom"
                class="calc-mod-custom"
                placeholder="m"
                spellcheck="false"
                title="自定义模数（正整数）"
              />
            </template>
            <input
              ref="exprInputRef"
              v-autofocus
              v-model="exprText"
              class="calc-expr-input"
              placeholder="0"
              spellcheck="false"
              @keydown.enter="evaluateExpr"
              @keydown.esc="clearExpr"
            />
          </div>
          <div class="calc-result" :class="{ error: hasError }">{{ resultText }}</div>
        </div>

        <!-- 函数：一条紧凑网格（原来 5 组各带标题+说明，是页面最长的一块） -->
        <div class="calc-grid calc-grid--funcs">
          <button
            v-for="f in funcKeys"
            :key="f"
            class="calc-func"
            :title="funcTips[f]"
            @click="pressFunc(f)"
          >{{ f }}</button>
        </div>

        <!-- 主键盘：经典 5 列（数字 3 列 + 运算符 2 列），末行 0 . = -->
        <div class="calc-grid calc-grid--keys">
          <button
            v-for="k in padKeys"
            :key="k"
            class="calc-key"
            :class="[keyClass(k), { wide: k === '=' }]"
            :title="keyTips[k] || ''"
            @click="press(k)"
          >{{ k }}</button>
        </div>
      </div>

      <div class="calc-side" :class="{ open: historyOpen }">
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
import { useNarrow } from '../../../composables/useNarrow.js'
import './calc-tool.css'

defineEmits(['back'])

const { isNarrow } = useNarrow()
const historyOpen = ref(false)

const exprText = ref('')
const resultText = ref('')
const hasError = ref(false)
const history = ref([])
const exprInputRef = ref(null)

// 三种计算模式：普通（小数）/ 模数（模 m 意义）/ 分数（精确有理数，不支持无理数）
const mode = ref('normal')
const modes = [
  { value: 'normal', label: '普通模式', desc: '普通小数运算', icon: 'fas fa-calculator' },
  { value: 'mod', label: '模数模式', desc: '一切运算都在模 m 意义下进行', icon: 'fas fa-percent' },
  { value: 'frac', label: '分数模式', desc: '精确分数运算，不支持无理数', icon: 'fas fa-divide' },
]

// 模数：两个常用预设 + 自定义（默认 1e9+7）
const MOD_PRESETS = [
  { label: '1e9+7', value: '1000000007' },
  { label: '998244353', value: '998244353' },
]
const modPreset = ref(MOD_PRESETS[0].value)
const modCustom = ref('')
const modValue = computed(() => (modPreset.value === 'custom' ? modCustom.value.trim() : modPreset.value))
const modLabel = computed(() =>
  modPreset.value === 'custom'
    ? modCustom.value.trim()
    : (MOD_PRESETS.find((p) => p.value === modPreset.value)?.label || modPreset.value))

function switchMode(m) {
  if (mode.value === m) return
  mode.value = m
  // 上次结果是在旧模式下算的，切模式后语义不同，先清掉避免误读
  resultText.value = ''
  hasError.value = false
}

// 主键盘：5 列，共 23 键（末行 0 / . / =，其中 = 占 3 格，正好铺满 5×5）
const padKeys = ['AC', '⌫', '(', ')', '÷', '7', '8', '9', '×', '**', '4', '5', '6', '−', '!', '1', '2', '3', '+', '%', '0', '.', '=']

const KEY_OP = ['÷', '×', '−', '+', '**', '!', '%']
const KEY_ACT = ['AC', '⌫', '(', ')']
const keyTips = {
  AC: '清空表达式与结果',
  '⌫': '删除最后一个字符',
  '(': '左括号',
  ')': '右括号',
  '÷': '除',
  '×': '乘',
  '−': '减',
  '+': '加',
  '**': '幂运算，a**b',
  '!': '阶乘，n!',
  '%': '取模，a%b',
  '=': '计算结果（等同 Enter）',
}
// 主键盘按键的视觉分类（只影响配色，不改任何行为）
function keyClass(k) {
  if (k === '=') return 'calc-key--eq'
  if (KEY_OP.includes(k)) return 'calc-key--op'
  if (KEY_ACT.includes(k)) return 'calc-key--act'
  return ''
}

/* 函数键：一条 6 列紧凑网格，不再分组加标题（原来 5 组标题+说明把页面撑得很长）。
   按用途排布：常数+三角 / 对数+幂根 / 数论 / 组合统计 / 位运算。
   ⚠️ π / e / 三角 / 对数只在普通模式下有意义（模数、分数模式会报错），但普通模式下
   完全可用 —— 它们是可用按钮，必须保留，不能删。 */
const funcKeys = [
  'π', 'e', 'sin', 'cos', 'tan', 'cot',
  'ln', 'log2', 'log10', '√', 'x²', 'x³',
  'abs', 'gcd', 'lcm', 'inv', 'fact', 'factor',
  'mod', 'C', 'A', 'min', 'max', 'mex',
  '&', '|', '^', '~', '<<', '>>',
]
const funcTips = {
  'π': '圆周率 pi',
  e: '自然常数 e',
  sin: '正弦 sin(…)',
  cos: '余弦 cos(…)',
  tan: '正切 tan(…)',
  cot: '余切 cot(…)',
  ln: '自然对数 ln(…)',
  log2: '以 2 为底 log2(…)',
  log10: '以 10 为底 log10(…)',
  '√': '开平方 sqrt(…)',
  'x²': '平方 **2',
  'x³': '立方 **3',
  abs: '绝对值 abs(…)',
  fact: '阶乘 fact(n)',
  gcd: '最大公约数 gcd(a, b)',
  lcm: '最小公倍数 lcm(a, b)',
  inv: '模逆元 inv(a) / inv(a, b)',
  factor: '质因数分解 factor(n)',
  mod: '取模 mod(a, b)',
  mex: '最小未出现的非负整数 mex(a, b, …)',
  C: '组合数 C(n, k)',
  A: '排列数 A(n, k)',
  min: '最小值 min(a, b, …)，参数可多于两个',
  max: '最大值 max(a, b, …)，参数可多于两个',
  '&': '按位与 a & b',
  '|': '按位或 a | b',
  '^': '按位异或 a ^ b',
  '~': '按位取反 ~a',
  '<<': '左移 a << n',
  '>>': '右移 a >> n',
}
// 这些是运算符，直接插字符、不套函数括号
const BARE_FUNCS = ['&', '|', '^', '~', '<<', '>>']
// 常量键：插入引擎认的标识符（π → pi），同样不套括号
const BARE_TEXT = { 'π': 'pi', e: 'e' }

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
  const map = { '×': '*', '÷': '/', '−': '-' }
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
  if (BARE_TEXT[f]) {
    insertAtCursor(BARE_TEXT[f], '')
    return
  }
  if (BARE_FUNCS.includes(f)) {
    insertAtCursor(f, '')
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
    const mod = modValue.value
    const v = ce.evaluate(exprText.value, mod || null, mode.value)
    // 分数模式返回 { n, d } 精确分数；其余返回 Number / BigInt
    const isFrac = ce.isFrac(v)
    const r = isFrac ? ce.fmtFrac(v) : ce.fmtNum(v)
    hasError.value = false
    if (mode.value === 'mod') {
      resultText.value = `${r}（mod ${modLabel.value}）`
    } else if (isFrac) {
      // 精确值 + 十进制近似（仅展示，不参与后续计算）
      const approx = ce.fracApprox(v)
      resultText.value = approx ? `${r} ≈ ${approx}` : r
    } else {
      resultText.value = r
    }
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
