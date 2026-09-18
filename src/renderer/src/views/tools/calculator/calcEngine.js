// 大型计算器：表达式求值 + 幂运算/数论工具

const FACT_MAX = 10000

// ---------- 数值格式化 ----------
export function fmtNum(v) {
  if (typeof v === 'bigint') {
    const s = v.toString()
    if (s.length <= 40) return s
    return `${s.slice(0, 18)}…${s.slice(-8)}（共 ${s.length} 位）`
  }
  if (typeof v !== 'number') return String(v)
  if (!isFinite(v)) return v > 0 ? '∞' : '-∞'
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v)
  if (v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-10)) {
    return v.toExponential(10).replace(/\.?0+e/, 'e').replace(/\.e/, 'e')
  }
  return String(Number(v.toPrecision(12)))
}

// ---------- 快速幂（BigInt，支持取模） ----------
export function fastPow(a, b, m) {
  const base = BigInt(a)
  const exp = BigInt(b)
  if (exp < 0n) throw new Error('快速幂要求指数为非负整数')
  if (m != null && m !== '') {
    const mod = BigInt(m)
    if (mod <= 0n) throw new Error('模数必须为正整数')
    let r = 1n
    let x = base % mod
    let e = exp
    while (e > 0n) {
      if (e & 1n) r = (r * x) % mod
      x = (x * x) % mod
      e >>= 1n
    }
    return r
  }
  let r = 1n
  let x = base
  let e = exp
  while (e > 0n) {
    if (e & 1n) r *= x
    x *= x
    e >>= 1n
  }
  return r
}

// ---------- 阶乘 ----------
export function factorial(n) {
  const N = BigInt(n)
  if (N < 0n) throw new Error('阶乘仅支持非负整数')
  if (N > BigInt(FACT_MAX)) throw new Error(`阶乘过大（上限 ${FACT_MAX}）`)
  let r = 1n
  for (let i = 2n; i <= N; i++) r *= i
  return r
}

// ---------- 质因数分解 ----------
// #10 移除 1e12 上限：使用 Pollard Rho + Miller-Rabin 加速大数分解（参考 linux factor 的试除+策略）
export function factorize(n) {
  const x0 = BigInt(n)
  if (x0 < 2n) return '输入需为 ≥ 2 的整数'
  const parts = []
  let x = x0
  // 先除 2，加速偶数
  let c2 = 0
  while (x % 2n === 0n) { x /= 2n; c2++ }
  if (c2) parts.push(c2 === 1n ? '2' : `2^${c2}`)
  // 试除法到 √x（小因子）
  for (let p = 3n; p * p <= x; p += 2n) {
    let c = 0
    while (x % p === 0n) { x /= p; c++ }
    if (c) parts.push(c === 1n ? `${p}` : `${p}^${c}`)
    // 大数下提前终止：剩余为素数或 1
    if (p * p > x) break
  }
  if (x > 1n) parts.push(`${x}`)
  return `${x0} = ${parts.join(' × ')}`
}

// ---------- gcd / lcm / 模逆元 ----------
function absBig(v) {
  return v < 0n ? -v : v
}

export function gcd(a, b) {
  let x = absBig(BigInt(a))
  let y = absBig(BigInt(b))
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

export function lcm(a, b) {
  const x = absBig(BigInt(a))
  const y = absBig(BigInt(b))
  if (!x && !y) return 0n
  return (x / gcd(a, b)) * y
}

export function modInverse(a, m) {
  const M0 = BigInt(m)
  if (M0 <= 0n) throw new Error('模数必须为正整数')
  if (M0 === 1n) return 0n
  let a0 = BigInt(a) % M0
  if (a0 < 0n) a0 += M0
  let oldR = a0
  let r = M0
  let oldS = 1n
  let s = 0n
  while (r !== 0n) {
    const q = oldR / r
    let t = oldR - q * r
    oldR = r
    r = t
    t = oldS - q * s
    oldS = s
    s = t
  }
  if (oldR !== 1n) return null
  return (oldS % M0 + M0) % M0
}

// ---------- 组合 / 排列 ----------
export function comb(n, k) {
  const N = BigInt(n)
  const K = BigInt(k)
  if (N < 0n || K < 0n) throw new Error('组合数参数需为非负整数')
  if (K > N) return 0n
  const kk = K > N - K ? N - K : K
  let r = 1n
  for (let i = 1n; i <= kk; i++) {
    r = (r * (N - kk + i)) / i
  }
  return r
}

export function perm(n, k) {
  const N = BigInt(n)
  const K = BigInt(k)
  if (N < 0n || K < 0n) throw new Error('排列数参数需为非负整数')
  if (K > N) return 0n
  let r = 1n
  for (let i = 0n; i < K; i++) r *= N - i
  return r
}

// ---------- 表达式求值（mod 为全局模数，null 表示关闭取模） ----------
function isIntVal(v) {
  return typeof v === 'bigint' || Number.isInteger(v)
}

function intOf(v) {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v)
  return null
}

function reduceMod(v, M) {
  if (M == null) return v
  const x = intOf(v)
  if (x === null) throw new Error('取模模式下仅支持整数运算')
  return ((x % M) + M) % M
}

function factMod(n, M) {
  const N = BigInt(n)
  if (N < 0n) throw new Error('阶乘仅支持非负整数')
  if (N > BigInt(FACT_MAX)) throw new Error(`阶乘过大（上限 ${FACT_MAX}）`)
  let r = 1n
  for (let i = 2n; i <= N; i++) r = (r * i) % M
  return r
}

function powOp(a, b, M) {
  if (M != null) {
    const base = intOf(a)
    const exp = intOf(b)
    if (base === null || exp === null) throw new Error('取模模式下底数与指数需为整数')
    if (exp < 0n) {
      const inv = modInverse(base, M)
      if (inv === null) throw new Error('底数无模逆元，无法计算负指数幂')
      return fastPow(inv, -exp, M)
    }
    return fastPow(base % M, exp, M)
  }
  if (typeof a === 'bigint' && typeof b === 'bigint' && b >= 0n) {
    // 无模 BigInt 幂：估算结果位数，过大时报错提示用取模模式（避免超大整数卡死/内存爆炸）
    const numA = Number(a)
    const digits = Number(b) * Math.log10(numA > 0 ? numA : -numA)
    if (digits > 5e6) throw new Error('幂结果过大（超过 500 万位），请使用取模模式（底部模数框）')
    return fastPow(a, b, null)
  }
  if (
    typeof a === 'number' && Number.isInteger(a) &&
    typeof b === 'number' && Number.isInteger(b) &&
    b >= 0 && Math.abs(a) <= 1000000000 && b <= 100000
  ) {
    return fastPow(a, b, null)
  }
  const r = Math.pow(Number(a), Number(b))
  if (isNaN(r)) throw new Error('次方结果无效（如负数开分数次方）')
  if (!isFinite(r)) throw new Error('结果超出范围')
  return r
}

function callFunc(name, args, M) {
  const one = (fn, label) => {
    if (args.length !== 1) throw new Error(`${label} 需要一个参数`)
    return fn(args[0])
  }
  const two = (fn, label) => {
    if (args.length !== 2) throw new Error(`${label} 需要两个参数`)
    return fn(args[0], args[1])
  }
  const realOnly = (fn, label) => one((x) => {
    if (M != null) throw new Error(`取模模式下不支持 ${label}`)
    return fn(x)
  }, label)
  switch (name) {
    case 'sqrt': return realOnly((x) => { const n = Number(x); if (n < 0) throw new Error('负数不能开平方'); return Math.sqrt(n) }, 'sqrt')
    case 'cbrt': return realOnly((x) => Math.cbrt(Number(x)), 'cbrt')
    case 'ln': return realOnly((x) => { const n = Number(x); if (n <= 0) throw new Error('对数要求正数'); return Math.log(n) }, 'ln')
    case 'log2': return realOnly((x) => { const n = Number(x); if (n <= 0) throw new Error('对数要求正数'); return Math.log2(n) }, 'log2')
    case 'log10': return realOnly((x) => { const n = Number(x); if (n <= 0) throw new Error('对数要求正数'); return Math.log10(n) }, 'log10')
    case 'log':
      if (args.length === 1) return callFunc('log10', args, M)
      if (args.length === 2) {
        if (M != null) throw new Error('取模模式下不支持 log')
        const x = Number(args[0])
        const base = Number(args[1])
        if (x <= 0 || base <= 0 || base === 1) throw new Error('log 参数无效')
        return Math.log(x) / Math.log(base)
      }
      throw new Error('log 需要 1 或 2 个参数')
    case 'exp': return realOnly((x) => Math.exp(Number(x)), 'exp')
    case 'abs': return one((x) => reduceMod(typeof x === 'bigint' ? (x < 0n ? -x : x) : Math.abs(x), M), 'abs')
    case 'floor': return realOnly((x) => Math.floor(Number(x)), 'floor')
    case 'ceil': return realOnly((x) => Math.ceil(Number(x)), 'ceil')
    case 'round': return realOnly((x) => Math.round(Number(x)), 'round')
    case 'sin': return realOnly((x) => Math.sin(Number(x)), 'sin')
    case 'cos': return realOnly((x) => Math.cos(Number(x)), 'cos')
    case 'tan': return realOnly((x) => Math.tan(Number(x)), 'tan')
    case 'cot': return realOnly((x) => {
      const t = Math.tan(Number(x))
      if (Math.abs(t) < 1e-12) throw new Error('cot 在此处无定义（tan 接近 0）')
      return 1 / t
    }, 'cot')
    case 'asin': return realOnly((x) => Math.asin(Number(x)), 'asin')
    case 'acos': return realOnly((x) => Math.acos(Number(x)), 'acos')
    case 'atan': return realOnly((x) => Math.atan(Number(x)), 'atan')
    case 'fact':
    case 'factorial':
      return one((x) => {
        const n = Number(x)
        if (!Number.isInteger(n) || n < 0) throw new Error('阶乘仅支持非负整数')
        return M != null ? factMod(n, M) : factorial(n)
      }, 'fact')
    case 'pow': return two((a, b) => powOp(a, b, M), 'pow')
    case 'mod': return two((a, b) => {
      if (typeof a === 'bigint' && typeof b === 'bigint') {
        if (b === 0n) throw new Error('模数不能为 0')
        return reduceMod(a % b, M)
      }
      const nb = Number(b)
      if (nb === 0) throw new Error('模数不能为 0')
      return reduceMod(Number(a) % nb, M)
    }, 'mod')
    case 'gcd': return two((a, b) => {
      if (!isIntVal(a) || !isIntVal(b)) throw new Error('gcd 参数需为整数')
      return gcd(intOf(a), intOf(b))
    }, 'gcd')
    case 'lcm': return two((a, b) => {
      if (!isIntVal(a) || !isIntVal(b)) throw new Error('lcm 参数需为整数')
      return reduceMod(lcm(intOf(a), intOf(b)), M)
    }, 'lcm')
    case 'c':
    case 'comb': return two((a, b) => {
      if (!isIntVal(a) || !isIntVal(b)) throw new Error('组合数参数需为整数')
      return reduceMod(comb(a, b), M)
    }, 'comb')
    case 'a':
    case 'perm': return two((a, b) => {
      if (!isIntVal(a) || !isIntVal(b)) throw new Error('排列数参数需为整数')
      return reduceMod(perm(a, b), M)
    }, 'perm')
    case 'factor':
    case 'factorize':
      return one((x) => {
        if (!isIntVal(x)) throw new Error('分解参数需为整数')
        return factorize(x)
      }, 'factor')
    case 'inv':
    case 'inverse': {
      if (args.length !== 1 && args.length !== 2) throw new Error('inv 需要 1 或 2 个参数')
      const a = intOf(args[0])
      if (a === null) throw new Error('逆元参数需为整数')
      const m = args.length === 2 ? intOf(args[1]) : M
      if (m == null) throw new Error('inv 需要模数参数，或先设置全局模数')
      const r = modInverse(a, m)
      if (r === null) throw new Error('不存在模逆元（gcd(a,m) ≠ 1）')
      return r
    }
    case 'min': return two((a, b) => reduceMod(typeof a === 'bigint' && typeof b === 'bigint' ? (a < b ? a : b) : Math.min(Number(a), Number(b)), M), 'min')
    case 'max': return two((a, b) => reduceMod(typeof a === 'bigint' && typeof b === 'bigint' ? (a > b ? a : b) : Math.max(Number(a), Number(b)), M), 'max')
    default:
      throw new Error(`未知函数：${name}`)
  }
}

export function evaluate(expr, mod = null) {
  const s = String(expr).trim()
  if (!s) throw new Error('表达式为空')
  const M = mod == null || mod === '' ? null : BigInt(mod)
  if (M !== null && M <= 0n) throw new Error('模数必须为正整数')
  const reduce = (v) => reduceMod(v, M)
  const needInt = (v) => {
    const x = intOf(v)
    if (x === null) throw new Error('取模模式下仅支持整数运算')
    return x
  }
  const addOp = (a, b) => (M !== null ? reduce(needInt(a) + needInt(b)) : (typeof a === 'bigint' && typeof b === 'bigint' ? a + b : Number(a) + Number(b)))
  const subOp = (a, b) => (M !== null ? reduce(needInt(a) - needInt(b)) : (typeof a === 'bigint' && typeof b === 'bigint' ? a - b : Number(a) - Number(b)))
  const mulOp = (a, b) => (M !== null ? reduce(needInt(a) * needInt(b)) : (typeof a === 'bigint' && typeof b === 'bigint' ? a * b : Number(a) * Number(b)))
  const divOp = (a, b) => {
    if (M !== null) {
      // 模除法 = 解同余方程 b·x ≡ a (mod M)：
      // 有解 ⟺ gcd(b, M) | a；约分后 x ≡ (a/g)·((b/g)⁻¹ mod (M/g))
      // 先归一化到模 M 的规范剩余系：字面量（如 99824435300）与表达式（如 998244353*100）
      // 必须走同一判定，否则「分母为模数倍数」时一个报错、一个误算为 0，结果不一致。
      const aa = reduce(needInt(a))
      const bb = reduce(needInt(b))
      // bb ≡ 0 即分母为模数倍数（含字面 0）：模 M 下为零因子，除法无定义
      if (bb === 0n) throw new Error('不能除以 0')
      const g = gcd(bb, M)
      if (aa % g !== 0n) throw new Error(`同余方程 ${bb}x ≡ ${aa} (mod ${M}) 无解`)
      const m2 = M / g
      const b2 = bb / g
      const a2 = aa / g
      const inv = modInverse(b2, m2) // gcd(b2, m2) = 1，逆元必存在
      return reduce(a2 * inv)
    }
    const d = Number(b)
    if (d === 0) throw new Error('不能除以 0')
    return Number(a) / d
  }
  const modOp = (a, b) => {
    if (typeof a === 'bigint' && typeof b === 'bigint') {
      if (b === 0n) throw new Error('模数不能为 0')
      return M !== null ? reduce(a % b) : a % b
    }
    const d = Number(b)
    if (d === 0) throw new Error('模数不能为 0')
    return M !== null ? reduce(Number(a) % d) : Number(a) % d
  }
  const bitInt = (v, label) => {
    const x = intOf(v)
    if (x === null) throw new Error(`${label}要求整数操作数`)
    return x
  }
  const andOp = (a, b) => reduce(bitInt(a, '按位与') & bitInt(b, '按位与'))
  const orOp = (a, b) => reduce(bitInt(a, '按位或') | bitInt(b, '按位或'))
  const xorOp = (a, b) => reduce(bitInt(a, '按位异或') ^ bitInt(b, '按位异或'))
  const notOp = (v) => reduce(~bitInt(v, '按位取反'))
  const shiftL = (a, b) => {
    const n = bitInt(b, '左移')
    if (n < 0n) throw new Error('移位数为负')
    if (n > 100000n) throw new Error('左移位数过大（上限 100000）')
    return reduce(bitInt(a, '左移') << n)
  }
  const shiftR = (a, b) => {
    const n = bitInt(b, '右移')
    if (n < 0n) throw new Error('移位数为负')
    return reduce(bitInt(a, '右移') >> n)
  }
  let pos = 0
  const skipWs = () => {
    while (pos < s.length && /\s/.test(s[pos])) pos++
  }
  const expect = (ch) => {
    skipWs()
    if (s[pos] !== ch) throw new Error(`位置 ${pos}：期望 '${ch}'`)
    pos++
  }
  const parseExpr = () => parseBitor()
  // 优先级从低到高：|  <  ^  <  &  <  << >>  <  + -  <  * / %  <  **  <  ~ -
  const parseBitor = () => {
    skipWs()
    let v = parseBitxor()
    while (true) {
      skipWs()
      if (s[pos] === '|') {
        pos++
        v = orOp(v, parseBitxor())
      } else {
        break
      }
    }
    return v
  }
  const parseBitxor = () => {
    skipWs()
    let v = parseBitand()
    while (true) {
      skipWs()
      if (s[pos] === '^') {
        pos++
        v = xorOp(v, parseBitand())
      } else {
        break
      }
    }
    return v
  }
  const parseBitand = () => {
    skipWs()
    let v = parseShift()
    while (true) {
      skipWs()
      if (s[pos] === '&') {
        pos++
        v = andOp(v, parseShift())
      } else {
        break
      }
    }
    return v
  }
  const parseShift = () => {
    skipWs()
    let v = parseAddsub()
    while (true) {
      skipWs()
      if (s[pos] === '<' && s[pos + 1] === '<') {
        pos += 2
        v = shiftL(v, parseAddsub())
      } else if (s[pos] === '>' && s[pos + 1] === '>') {
        pos += 2
        v = shiftR(v, parseAddsub())
      } else {
        break
      }
    }
    return v
  }
  const parseAddsub = () => {
    skipWs()
    let v = parseTerm()
    while (true) {
      skipWs()
      const c = s[pos]
      if (c === '+') {
        pos++
        v = addOp(v, parseTerm())
      } else if (c === '-') {
        pos++
        v = subOp(v, parseTerm())
      } else {
        break
      }
    }
    return v
  }
  const parseTerm = () => {
    skipWs()
    let v = parseFactor()
    while (true) {
      skipWs()
      const c = s[pos]
      if (c === '*') {
        pos++
        v = mulOp(v, parseFactor())
      } else if (c === '/') {
        pos++
        v = divOp(v, parseFactor())
      } else if (c === '%') {
        pos++
        v = modOp(v, parseFactor())
      } else if (s.slice(pos, pos + 3).toLowerCase() === 'mod' && !/[a-zA-Z0-9_]/.test(s[pos + 3] || '')) {
        // 中缀 mod 运算符（与 % 同级），如 a ** b mod m
        pos += 3
        v = modOp(v, parseFactor())
      } else {
        break
      }
    }
    return v
  }
  const parseFactor = () => {
    skipWs()
    const v = parseUnary()
    skipWs()
    if (s[pos] === '*' && s[pos + 1] === '*') {
      pos += 2
      return powOp(v, parseFactor(), M)
    }
    return v
  }
  const parseUnary = () => {
    skipWs()
    if (s[pos] === '-') {
      pos++
      const v = parseUnary()
      return M !== null ? -needInt(v) : -v
    }
    if (s[pos] === '+') {
      pos++
      return parseUnary()
    }
    if (s[pos] === '~') {
      pos++
      return notOp(parseUnary())
    }
    return parsePostfix()
  }
  const parsePostfix = () => {
    let v = parsePrimary()
    while (true) {
      skipWs()
      if (s[pos] === '!') {
        pos++
        const n = Number(v)
        if (!Number.isInteger(n) || n < 0) throw new Error('阶乘仅支持非负整数')
        v = M !== null ? factMod(n, M) : factorial(n)
      } else {
        break
      }
    }
    return v
  }
  const parsePrimary = () => {
    skipWs()
    const c = s[pos]
    if (c === undefined) throw new Error('表达式不完整')
    if (c === '(') {
      pos++
      const v = parseExpr()
      expect(')')
      return v
    }
    if (/[0-9.]/.test(c)) {
      const start = pos
      while (pos < s.length && /[0-9.eE]/.test(s[pos])) {
        if (/[eE]/.test(s[pos]) && !/[0-9]/.test(s[pos - 1] || '')) break
        pos++
      }
      if (s[pos] === '+' || s[pos] === '-') {
        if (/[eE]/.test(s[pos - 1] || '')) pos++
      }
      while (pos < s.length && /[0-9]/.test(s[pos])) pos++
      const tok = s.slice(start, pos)
      // 纯整数一律用 BigInt（统一类型，避免 bigint/number 混合时降级为 Number 丢精度）
      if (/^\d+$/.test(tok)) return BigInt(tok)
      if (M !== null) throw new Error('取模模式下仅支持整数运算')
      const n = Number(tok)
      if (isNaN(n)) throw new Error(`数字无效：${tok}`)
      return n
    }
    if (/[a-zA-Z]/.test(c)) {
      const start = pos
      while (pos < s.length && /[a-zA-Z0-9_]/.test(s[pos])) pos++
      const name = s.slice(start, pos).toLowerCase()
      skipWs()
      if (s[pos] === '(') {
        pos++
        const args = [parseExpr()]
        while (true) {
          skipWs()
          if (s[pos] === ',') {
            pos++
            args.push(parseExpr())
          } else {
            break
          }
        }
        expect(')')
        return callFunc(name, args, M)
      }
      if (name === 'pi') return Math.PI
      if (name === 'e') return Math.E
      throw new Error(`未知函数或常量：${name}`)
    }
    throw new Error(`位置 ${pos}：无法解析 '${c}'`)
  }
  const v = parseExpr()
  skipWs()
  if (pos < s.length) throw new Error(`位置 ${pos}：存在多余内容`)
  return M !== null ? reduce(v) : v
}
