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

/** 数值比较：BigInt 与 Number 混用时统一按数值比（返回 -1 / 0 / 1） */
function numCmp(a, b) {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0
  const x = Number(a)
  const y = Number(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/** mex：集合里没出现的最小非负整数（竞赛常用）。模数模式下先在模意义下归一化 */
function mexOp(args, M) {
  if (!args.length) throw new Error('mex 需要至少一个参数')
  const seen = new Set()
  for (const a of args) {
    const x = intOf(a)
    if (x === null) throw new Error('mex 的参数需为整数')
    seen.add(M != null ? reduceMod(x, M) : x)
  }
  let r = 0n
  while (seen.has(r)) r += 1n
  return M != null ? reduceMod(r, M) : r
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
    // min / max 支持任意多个参数（≥2），不再卡死两个
    case 'min': {
      if (args.length < 2) throw new Error('min 需要至少两个参数')
      let r = args[0]
      for (let i = 1; i < args.length; i++) if (numCmp(args[i], r) < 0) r = args[i]
      return reduceMod(r, M)
    }
    case 'max': {
      if (args.length < 2) throw new Error('max 需要至少两个参数')
      let r = args[0]
      for (let i = 1; i < args.length; i++) if (numCmp(args[i], r) > 0) r = args[i]
      return reduceMod(r, M)
    }
    case 'mex': return mexOp(args, M)
    default:
      throw new Error(`未知函数：${name}`)
  }
}

function evaluateReal(expr, mod = null) {
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

/* ==================== 分数模式（精确有理数） ====================
 * 值类型：{ n: BigInt, d: BigInt }，恒有 d > 0、gcd(|n|, d) = 1（0 记为 0/1）。
 * ⚠️ 全程精确、不做浮点近似；**不支持无理数**：
 *    - 超越函数（sin/cos/tan/cot/ln/log2/log10/log/exp/反三角）直接报错；
 *    - 常数 π / e 报错（都是无理数）；
 *    - √ / cbrt 仅在结果是有理数时给精确值（√4 = 2、√(4/9) = 2/3），否则报错。
 * 小数在这个模式下是**精确**的：0.1 + 0.2 = 3/10（普通模式会得 0.30000000000000004）。
 * 幂指数要求整数（分数次幂会引入无理数，开方请用 √ / cbrt）。
 */

function gcdBig(a, b) {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** 规范化分数：约分、分母恒正、零记为 0/1 */
function mkFrac(n, d = 1n) {
  let N = BigInt(n)
  let D = BigInt(d)
  if (D === 0n) throw new Error('分母不能为 0')
  if (D < 0n) { N = -N; D = -D }
  if (N === 0n) return { n: 0n, d: 1n }
  const g = gcdBig(N, D)
  return { n: N / g, d: D / g }
}

export function isFrac(v) {
  return !!v && typeof v === 'object' && typeof v.n === 'bigint' && typeof v.d === 'bigint'
}

const fNeg = (a) => ({ n: -a.n, d: a.d })
const fAbs = (a) => ({ n: a.n < 0n ? -a.n : a.n, d: a.d })
const fAdd = (a, b) => mkFrac(a.n * b.d + b.n * a.d, a.d * b.d)
const fSub = (a, b) => mkFrac(a.n * b.d - b.n * a.d, a.d * b.d)
const fMul = (a, b) => mkFrac(a.n * b.n, a.d * b.d)

function fDiv(a, b) {
  if (b.n === 0n) throw new Error('不能除以 0')
  return mkFrac(a.n * b.d, a.d * b.n)
}

function fCmp(a, b) {
  const l = a.n * b.d
  const r = b.n * a.d
  return l < r ? -1 : l > r ? 1 : 0
}

/** BigInt 除法向零截断，负数要按余数符号修一步才是真正的 floor / ceil */
function fFloor(a) {
  const q = a.n / a.d
  return mkFrac(a.n % a.d !== 0n && a.n < 0n ? q - 1n : q)
}
function fCeil(a) {
  const q = a.n / a.d
  return mkFrac(a.n % a.d !== 0n && a.n > 0n ? q + 1n : q)
}
/** 与 JS Math.round 同语义（.5 向 +∞） */
const fRound = (a) => fFloor(fAdd(a, mkFrac(1n, 2n)))

/** 精确整数 k 次根：x 为完全 k 次方时返回根，否则 null（牛顿迭代 + 收敛后校正） */
function irootExact(x, k) {
  if (x < 0n) return null
  if (x < 2n) return x
  const K = BigInt(k)
  let r = 1n << BigInt(Math.ceil(x.toString(2).length / k))
  while (true) {
    const next = ((K - 1n) * r + x / r ** (K - 1n)) / K
    if (next >= r) break
    r = next
  }
  while (r ** K > x) r -= 1n
  while ((r + 1n) ** K <= x) r += 1n
  return r ** K === x ? r : null
}

/** 分数的 k 次根；结果不是有理数就报错（分数模式不支持无理数） */
function fRoot(a, k) {
  if (a.n < 0n && k % 2 === 0) throw new Error('负数不能开偶次方')
  const rn = irootExact(a.n < 0n ? -a.n : a.n, k)
  const rd = irootExact(a.d, k)
  if (rn === null || rd === null) {
    throw new Error(`${k === 2 ? '√' : 'cbrt'}(${fmtFrac(a)}) 不是有理数（分数模式不支持无理数，可切到普通模式取近似值）`)
  }
  return mkFrac(a.n < 0n ? -rn : rn, rd)
}

/** 整数次幂（负指数 = 取倒数再乘方） */
function fPow(a, e) {
  if (e === 0n) return mkFrac(1n)
  if (e < 0n) {
    if (a.n === 0n) throw new Error('0 的负数次幂无定义')
    return fPow(mkFrac(a.d, a.n), -e)
  }
  const mag = Math.max(Number(a.n < 0n ? -a.n : a.n) || 1, Number(a.d) || 1)
  if (Number(e) * Math.log10(mag) > 2e6) throw new Error('幂结果过大（超过 200 万位），请改用模数模式')
  let r = mkFrac(1n)
  let x = a
  let n = e
  while (n > 0n) {
    if (n & 1n) r = fMul(r, x)
    n >>= 1n
    if (n) x = fMul(x, x)
  }
  return r
}

/** 小数 / 科学计数法字面量 → 精确分数（0.1 → 1/10，1e-3 → 1/1000） */
function fracFromLiteral(tok) {
  const m = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(tok)
  if (!m || (!m[1] && !m[2])) throw new Error(`数字无效：${tok}`)
  const fp = m[2] || ''
  let n = BigInt((m[1] || '0') + fp)
  let d = 10n ** BigInt(fp.length)
  const ex = Number(m[3] || 0)
  if (Math.abs(ex) > 5000) throw new Error('指数过大')
  if (ex > 0) n *= 10n ** BigInt(ex)
  else if (ex < 0) d *= 10n ** BigInt(-ex)
  return mkFrac(n, d)
}

/** 分数模式下的函数分发（I 把 BigInt 包成整数分数） */
function callFrac(name, args, I) {
  const one = (fn, label) => {
    if (args.length !== 1) throw new Error(`${label} 需要一个参数`)
    return fn(args[0])
  }
  const two = (fn, label) => {
    if (args.length !== 2) throw new Error(`${label} 需要两个参数`)
    return fn(args[0], args[1])
  }
  const needInt = (v, label) => {
    if (!isFrac(v)) throw new Error(`${label} 需要整数`)
    if (v.d !== 1n) throw new Error(`${label} 需要整数（当前是 ${fmtFrac(v)}）`)
    return v.n
  }
  const ints2 = (fn, label) => two((a, b) => fn(needInt(a, label), needInt(b, label)), label)
  // ⚠️ 直接抛出，不要「返回一个抛错函数」—— 那样 callFrac 会把函数对象当结果值往外传
  const noIrr = (label) => {
    throw new Error(`分数模式不支持 ${label}（结果通常不是有理数，可切到普通模式取近似值）`)
  }
  switch (name) {
    case 'sqrt': return one((x) => fRoot(x, 2), 'sqrt')
    case 'cbrt': return one((x) => fRoot(x, 3), 'cbrt')
    case 'abs': return one((x) => fAbs(x), 'abs')
    case 'floor': return one((x) => fFloor(x), 'floor')
    case 'ceil': return one((x) => fCeil(x), 'ceil')
    case 'round': return one((x) => fRound(x), 'round')
    // min / max 支持任意多个参数（≥2），与真实模式同语义
    case 'min': {
      if (args.length < 2) throw new Error('min 需要至少两个参数')
      let r = args[0]
      for (let i = 1; i < args.length; i++) if (fCmp(args[i], r) < 0) r = args[i]
      return r
    }
    case 'max': {
      if (args.length < 2) throw new Error('max 需要至少两个参数')
      let r = args[0]
      for (let i = 1; i < args.length; i++) if (fCmp(args[i], r) > 0) r = args[i]
      return r
    }
    case 'mex': {
      if (!args.length) throw new Error('mex 需要至少一个参数')
      const seen = new Set()
      for (const a of args) seen.add(needInt(a, 'mex'))
      let r = 0n
      while (seen.has(r)) r += 1n
      return I(r)
    }
    case 'pow': return two((a, b) => fPow(a, needInt(b, '幂指数')), 'pow')
    case 'mod':
      return ints2((a, b) => { if (b === 0n) throw new Error('模数不能为 0'); return I(a % b) }, 'mod')
    case 'gcd': return ints2((a, b) => I(gcd(a, b)), 'gcd')
    case 'lcm': return ints2((a, b) => I(lcm(a, b)), 'lcm')
    case 'c':
    case 'comb': return ints2((a, b) => I(comb(a, b)), 'comb')
    case 'a':
    case 'perm': return ints2((a, b) => I(perm(a, b)), 'perm')
    case 'fact':
    case 'factorial': return one((x) => I(factorial(needInt(x, '阶乘'))), 'fact')
    case 'factor':
    case 'factorize': return one((x) => factorize(needInt(x, '分解')), 'factor')
    case 'inv':
    case 'inverse': {
      if (args.length !== 2) throw new Error('分数模式下 inv 需要显式模数：inv(a, m)')
      const r = modInverse(needInt(args[0], '逆元'), needInt(args[1], '逆元'))
      if (r === null) throw new Error('不存在模逆元（gcd(a,m) ≠ 1）')
      return I(r)
    }
    case 'ln': case 'log2': case 'log10': case 'log': case 'exp':
      return noIrr(name)
    case 'sin': case 'cos': case 'tan': case 'cot':
    case 'asin': case 'acos': case 'atan':
      return noIrr(name)
    default:
      throw new Error(`未知函数：${name}`)
  }
}

/** 分数模式求值：与普通模式同一套优先级与语法，只是值类型换成精确分数 */
export function evaluateFraction(expr) {
  const s = String(expr).trim()
  if (!s) throw new Error('表达式为空')
  const I = (x) => mkFrac(x)
  const needInt = (v, label) => {
    if (!isFrac(v)) throw new Error(`${label}需要整数操作数`)
    if (v.d !== 1n) throw new Error(`${label}需要整数（当前是 ${fmtFrac(v)}）`)
    return v.n
  }
  let pos = 0
  const skipWs = () => { while (pos < s.length && /\s/.test(s[pos])) pos++ }
  const expect = (ch) => {
    skipWs()
    if (s[pos] !== ch) throw new Error(`位置 ${pos}：期望 '${ch}'`)
    pos++
  }
  const factOp = (v) => {
    const n = needInt(v, '阶乘')
    if (n < 0n) throw new Error('阶乘仅支持非负整数')
    return I(factorial(n))
  }
  const parseExpr = () => parseBitor()
  const parseBitor = () => {
    skipWs()
    let v = parseBitxor()
    while (true) {
      skipWs()
      if (s[pos] === '|') { pos++; v = I(needInt(v, '按位或') | needInt(parseBitxor(), '按位或')) } else break
    }
    return v
  }
  const parseBitxor = () => {
    skipWs()
    let v = parseBitand()
    while (true) {
      skipWs()
      if (s[pos] === '^') { pos++; v = I(needInt(v, '按位异或') ^ needInt(parseBitand(), '按位异或')) } else break
    }
    return v
  }
  const parseBitand = () => {
    skipWs()
    let v = parseShift()
    while (true) {
      skipWs()
      if (s[pos] === '&') { pos++; v = I(needInt(v, '按位与') & needInt(parseShift(), '按位与')) } else break
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
        const n = needInt(parseAddsub(), '左移')
        if (n < 0n) throw new Error('移位数为负')
        if (n > 100000n) throw new Error('左移位数过大（上限 100000）')
        v = I(needInt(v, '左移') << n)
      } else if (s[pos] === '>' && s[pos + 1] === '>') {
        pos += 2
        const n = needInt(parseAddsub(), '右移')
        if (n < 0n) throw new Error('移位数为负')
        v = I(needInt(v, '右移') >> n)
      } else break
    }
    return v
  }
  const parseAddsub = () => {
    skipWs()
    let v = parseTerm()
    while (true) {
      skipWs()
      const c = s[pos]
      if (c === '+') { pos++; v = fAdd(v, parseTerm()) }
      else if (c === '-') { pos++; v = fSub(v, parseTerm()) }
      else break
    }
    return v
  }
  const parseTerm = () => {
    skipWs()
    let v = parseFactor()
    while (true) {
      skipWs()
      const c = s[pos]
      if (c === '*') { pos++; v = fMul(v, parseFactor()) }
      else if (c === '/') { pos++; v = fDiv(v, parseFactor()) }
      else if (c === '%') {
        pos++
        const b = needInt(parseFactor(), '%')
        if (b === 0n) throw new Error('模数不能为 0')
        v = I(needInt(v, '%') % b)
      } else if (s.slice(pos, pos + 3).toLowerCase() === 'mod' && !/[a-zA-Z0-9_]/.test(s[pos + 3] || '')) {
        pos += 3
        const b = needInt(parseFactor(), 'mod')
        if (b === 0n) throw new Error('模数不能为 0')
        v = I(needInt(v, 'mod') % b)
      } else break
    }
    return v
  }
  const parseFactor = () => {
    skipWs()
    const v = parseUnary()
    skipWs()
    if (s[pos] === '*' && s[pos + 1] === '*') {
      pos += 2
      const e = parseFactor()
      if (!isFrac(e) || e.d !== 1n) throw new Error('分数模式下幂指数需为整数（开方请用 √ / cbrt）')
      return fPow(v, e.n)
    }
    return v
  }
  const parseUnary = () => {
    skipWs()
    if (s[pos] === '-') { pos++; return fNeg(parseUnary()) }
    if (s[pos] === '+') { pos++; return parseUnary() }
    if (s[pos] === '~') { pos++; return I(~needInt(parseUnary(), '按位取反')) }
    return parsePostfix()
  }
  const parsePostfix = () => {
    let v = parsePrimary()
    while (true) {
      skipWs()
      if (s[pos] === '!') { pos++; v = factOp(v) } else break
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
      while (pos < s.length && /[0-9.]/.test(s[pos])) pos++
      if (/[eE]/.test(s[pos] || '') &&
        (/[0-9]/.test(s[pos + 1] || '') || (/[+-]/.test(s[pos + 1] || '') && /[0-9]/.test(s[pos + 2] || '')))) {
        pos++
        if (s[pos] === '+' || s[pos] === '-') pos++
        while (/[0-9]/.test(s[pos] || '')) pos++
      }
      return fracFromLiteral(s.slice(start, pos))
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
          if (s[pos] === ',') { pos++; args.push(parseExpr()) } else break
        }
        expect(')')
        return callFrac(name, args, I)
      }
      if (name === 'pi' || name === 'e') {
        throw new Error(`分数模式不支持常数 ${name}（无理数，可切到普通模式）`)
      }
      throw new Error(`未知函数或常量：${name}`)
    }
    throw new Error(`位置 ${pos}：无法解析 '${c}'`)
  }
  const v = parseExpr()
  skipWs()
  if (pos < s.length) throw new Error(`位置 ${pos}：存在多余内容`)
  return v
}

/** 分数 → 展示字符串（整数给十进制，其余给 n/d；超长按普通模式同款截断） */
export function fmtFrac(v) {
  if (typeof v === 'string') return v
  if (!isFrac(v)) return fmtNum(v)
  const cut = (x) => {
    const t = x.toString()
    if (t.length <= 40) return t
    return `${t.slice(0, 18)}…${t.slice(-8)}（共 ${t.length} 位）`
  }
  return v.d === 1n ? cut(v.n) : `${cut(v.n)}/${cut(v.d)}`
}

/** 分数的十进制近似（长除法，只用于展示、不参与后续计算）；整数返回空串 */
export function fracApprox(v, digits = 12) {
  if (!isFrac(v) || v.d === 1n) return ''
  const neg = v.n < 0n
  const a = neg ? -v.n : v.n
  const b = v.d
  let rem = a % b
  let frac = ''
  for (let i = 0; i < digits && rem !== 0n; i++) {
    rem *= 10n
    frac += (rem / b).toString()
    rem %= b
  }
  return (neg ? '-' : '') + (a / b).toString() + (frac ? '.' + frac : '')
}

/**
 * 统一入口。
 * @param {string} expr 表达式
 * @param {*} mod 模数（仅模数模式使用）
 * @param {'normal'|'mod'|'frac'|null} mode 计算模式；不传时保持旧行为（有 mod 即视为模数模式）
 */
export function evaluate(expr, mod = null, mode = null) {
  const m = mode == null ? ((mod == null || mod === '') ? 'normal' : 'mod') : mode
  if (m === 'frac') return evaluateFraction(expr)
  if (m === 'mod') {
    const M = mod == null ? '' : String(mod).trim()
    if (!/^\d+$/.test(M) || BigInt(M) <= 0n) {
      throw new Error('模数模式下请先填写正整数模数 m（一切运算都在模 m 意义下进行）')
    }
    return evaluateReal(expr, M)
  }
  return evaluateReal(expr, null)
}
