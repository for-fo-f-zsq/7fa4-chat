export const MODES = [
  { value: 'normal', label: '普通模式', title: '普通小数与大整数运算', icon: 'fas fa-calculator' },
  { value: 'mod', label: '模数模式', title: '一切运算都在模 m 意义下进行', icon: 'fas fa-percent' },
  { value: 'frac', label: '分数模式', title: '精确分数运算，不支持无理数', icon: 'fas fa-divide' }
]

export const MOD_PRESETS = [
  { label: '1e9+7', value: '1000000007' },
  { label: '998244353', value: '998244353' }
]

export const MOD_OPTIONS = [
  ...MOD_PRESETS,
  { label: '自定义…', value: 'custom' }
]

export const ANGLE_ITEMS = [
  { value: 'deg', label: 'Deg', title: '角度制 (Degrees)' },
  { value: 'rad', label: 'Rad', title: '弧度制 (Radians)' }
]

export const MEMORY_KEYS = [
  { key: 'MC', label: 'MC', title: '清空记忆 (Memory Clear)' },
  { key: 'MR', label: 'MR', title: '调出记忆 (Memory Recall)' },
  { key: 'M+', label: 'M+', title: '记忆累加 (Memory Add)' },
  { key: 'M-', label: 'M-', title: '记忆累减 (Memory Subtract)' },
  { key: 'MS', label: 'MS', title: '存入记忆 (Memory Store)' }
]

// 函数分类标签页
export const FUNC_CATEGORIES = [
  { key: 'basic', label: '常用', icon: 'fas fa-square-root-variable' },
  { key: 'trig', label: '三角', icon: 'fas fa-wave-square' },
  { key: 'nt', label: '对数/数论', icon: 'fas fa-superscript' },
  { key: 'bit', label: '位运算', icon: 'fas fa-microchip' }
]

export const CATEGORY_FUNCS = {
  basic: ['√', 'x²', 'x³', 'abs', 'min', 'max', 'π', 'e'],
  trig: ['sin', 'cos', 'tan', 'cot', 'asin', 'acos', 'atan'],
  nt: ['ln', 'log2', 'log10', 'fact', 'factor', 'gcd', 'lcm', 'inv', 'mod', 'mex', 'C', 'A'],
  bit: ['&', '|', '^', '~', '<<', '>>']
}

// 主键盘：5 列，共 24 键（末行 0, ., Ans, =，其中 = 占 2 格，正好铺满 5×5）
export const PAD_KEYS = [
  'AC', '⌫', '(', ')', '÷',
  '7', '8', '9', '×', '**',
  '4', '5', '6', '−', '!',
  '1', '2', '3', '+', '%',
  '0', '.', 'Ans', '='
]

export const KEY_OP = ['÷', '×', '−', '+', '**', '!', '%']
export const KEY_ACT = ['AC', '⌫', '(', ')']

export const KEY_TIPS = {
  AC: '清空表达式与结果 (Esc)',
  '⌫': '删除末尾字符 (Backspace)',
  '(': '左括号 (',
  ')': '右括号 )',
  '÷': '除法 /',
  '×': '乘法 *',
  '−': '减法 -',
  '+': '加法 +',
  '**': '幂运算 a**b',
  '!': '阶乘 n!',
  '%': '取模 a%b',
  Ans: '引用上一次计算结果',
  '=': '计算结果 (Enter)'
}

export const FUNC_KEYS = [
  'π', 'e', 'sin', 'cos', 'tan', 'cot', 'asin', 'acos', 'atan',
  'ln', 'log2', 'log10', '√', 'x²', 'x³',
  'abs', 'gcd', 'lcm', 'inv', 'fact', 'factor',
  'mod', 'C', 'A', 'min', 'max', 'mex',
  '&', '|', '^', '~', '<<', '>>'
]

export const FUNC_TIPS = {
  'π': '圆周率 pi (3.14159…)',
  e: '自然常数 e (2.71828…)',
  sin: '正弦 sin(…)',
  cos: '余弦 cos(…)',
  tan: '正切 tan(…)',
  cot: '余切 cot(…)',
  asin: '反正弦 asin(…)',
  acos: '反余弦 acos(…)',
  atan: '反正切 atan(…)',
  ln: '自然对数 ln(…)',
  log2: '以 2 为底对数 log2(…)',
  log10: '常用对数 log10(…)',
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
  min: '最小值 min(a, b, …)',
  max: '最大值 max(a, b, …)',
  '&': '按位与 a & b',
  '|': '按位或 a | b',
  '^': '按位异或 a ^ b',
  '~': '按位取反 ~a',
  '<<': '左移 a << n',
  '>>': '右移 a >> n'
}

export const BARE_FUNCS = ['&', '|', '^', '~', '<<', '>>']
export const BARE_TEXT = { 'π': 'pi', e: 'e', Ans: 'ans' }
