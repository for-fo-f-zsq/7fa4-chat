// Real & modular recursive-descent expression evaluator.
import {
  FACT_MAX, comb, factorial, factorize, fastPow, gcd, lcm, modInverse, perm
} from './numberTheory.js'

function isIntVal(v) {
  return typeof v === 'bigint' || Number.isInteger(v)
}

function intOf(v) {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v)
  return null
}

function numCmp(a, b) {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0
  const x = Number(a)
  const y = Number(b)
  return x < y ? -1 : x > y ? 1 : 0
}

function reduceMod(v, M) {
  if (M == null) return v
  const x = intOf(v)
  if (x === null) throw new Error('取模模式下仅支持整数运算')
  return ((x % M) + M) % M
}

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

function degToRad(deg) { return (deg * Math.PI) / 180 }
function radToDeg(rad) { return (rad * 180) / Math.PI }
function cleanFloat(val) {
  if (Math.abs(val) < 1e-15) return 0
  return Number(val.toPrecision(12))
}

function evalSin(x, angleUnit) {
  const n = Number(x)
  if (angleUnit === 'deg') {
    const norm = ((n % 360) + 360) % 360
    if (norm === 0 || norm === 180) return 0
    if (norm === 90) return 1
    if (norm === 270) return -1
    if (norm === 30 || norm === 150) return 0.5
    if (norm === 210 || norm === 330) return -0.5
    return cleanFloat(Math.sin(degToRad(n)))
  }
  return Math.sin(n)
}

function evalCos(x, angleUnit) {
  const n = Number(x)
  if (angleUnit === 'deg') {
    const norm = ((n % 360) + 360) % 360
    if (norm === 90 || norm === 270) return 0
    if (norm === 0) return 1
    if (norm === 180) return -1
    if (norm === 60 || norm === 300) return 0.5
    if (norm === 120 || norm === 240) return -0.5
    return cleanFloat(Math.cos(degToRad(n)))
  }
  return Math.cos(n)
}

function evalTan(x, angleUnit) {
  const n = Number(x)
  if (angleUnit === 'deg') {
    const norm = ((n % 360) + 360) % 360
    if (norm === 90 || norm === 270) throw new Error('tan 在 90°/270° 处无定义')
    if (norm === 0 || norm === 180) return 0
    if (norm === 45 || norm === 225) return 1
    if (norm === 135 || norm === 315) return -1
    return cleanFloat(Math.tan(degToRad(n)))
  }
  return Math.tan(n)
}

function evalCot(x, angleUnit) {
  const n = Number(x)
  if (angleUnit === 'deg') {
    const norm = ((n % 360) + 360) % 360
    if (norm === 0 || norm === 180) throw new Error('cot 在 0°/180° 处无定义')
    if (norm === 90 || norm === 270) return 0
    if (norm === 45 || norm === 225) return 1
    if (norm === 135 || norm === 315) return -1
    const t = Math.tan(degToRad(n))
    if (Math.abs(t) < 1e-12) throw new Error('cot 在此处无定义（tan 接近 0）')
    return cleanFloat(1 / t)
  }
  const t = Math.tan(n)
  if (Math.abs(t) < 1e-12) throw new Error('cot 在此处无定义（tan 接近 0）')
  return 1 / t
}

function evalAsin(x, angleUnit) {
  const n = Number(x)
  if (n < -1 || n > 1) throw new Error('asin 定义域为 [-1, 1]')
  const r = Math.asin(n)
  if (angleUnit === 'deg') {
    if (n === 0.5) return 30
    if (n === -0.5) return -30
    if (n === 1) return 90
    if (n === -1) return -90
    if (n === 0) return 0
    return cleanFloat(radToDeg(r))
  }
  return r
}

function evalAcos(x, angleUnit) {
  const n = Number(x)
  if (n < -1 || n > 1) throw new Error('acos 定义域为 [-1, 1]')
  const r = Math.acos(n)
  if (angleUnit === 'deg') {
    if (n === 0.5) return 60
    if (n === -0.5) return 120
    if (n === 1) return 0
    if (n === -1) return 180
    if (n === 0) return 90
    return cleanFloat(radToDeg(r))
  }
  return r
}

function evalAtan(x, angleUnit) {
  const n = Number(x)
  const r = Math.atan(n)
  if (angleUnit === 'deg') {
    if (n === 1) return 45
    if (n === -1) return -45
    if (n === 0) return 0
    return cleanFloat(radToDeg(r))
  }
  return r
}

function callFunc(name, args, M, angleUnit = 'deg') {
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
      if (args.length === 1) return callFunc('log10', args, M, angleUnit)
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
    case 'sin': return realOnly((x) => evalSin(x, angleUnit), 'sin')
    case 'cos': return realOnly((x) => evalCos(x, angleUnit), 'cos')
    case 'tan': return realOnly((x) => evalTan(x, angleUnit), 'tan')
    case 'cot': return realOnly((x) => evalCot(x, angleUnit), 'cot')
    case 'asin': return realOnly((x) => evalAsin(x, angleUnit), 'asin')
    case 'acos': return realOnly((x) => evalAcos(x, angleUnit), 'acos')
    case 'atan': return realOnly((x) => evalAtan(x, angleUnit), 'atan')
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

export function evaluateReal(expr, mod = null, options = {}) {
  const opts = typeof options === 'string' ? { angleUnit: options } : (options || {})
  const angleUnit = opts.angleUnit === 'rad' ? 'rad' : 'deg'
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
      const aa = reduce(needInt(a))
      const bb = reduce(needInt(b))
      if (bb === 0n) throw new Error('不能除以 0')
      const g = gcd(bb, M)
      if (aa % g !== 0n) throw new Error(`同余方程 ${bb}x ≡ ${aa} (mod ${M}) 无解`)
      const m2 = M / g
      const b2 = bb / g
      const a2 = aa / g
      const inv = modInverse(b2, m2)
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
  const parseBitor = () => {
    skipWs()
    let v = parseBitxor()
    while (true) {
      skipWs()
      if (s[pos] === '|') {
        pos++
        v = orOp(v, parseBitxor())
      } else break
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
      } else break
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
      } else break
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
      if (c === '+') {
        pos++
        v = addOp(v, parseTerm())
      } else if (c === '-') {
        pos++
        v = subOp(v, parseTerm())
      } else break
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
        pos += 3
        v = modOp(v, parseFactor())
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
      } else break
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
          } else break
        }
        expect(')')
        return callFunc(name, args, M, angleUnit)
      }
      if (name === 'pi') return Math.PI
      if (name === 'e') return Math.E
      if (name === 'ans') {
        if (opts.ans !== undefined && opts.ans !== null && opts.ans !== '') {
          const a = opts.ans
          if (typeof a === 'bigint') return a
          if (typeof a === 'number') {
            if (!isNaN(a)) return a
          }
          if (typeof a === 'object' && a !== null && typeof a.n === 'bigint' && typeof a.d === 'bigint') {
            if (a.d === 0n) throw new Error('Ans 分母为 0')
            return Number(a.n) / Number(a.d)
          }
          if (typeof a === 'string') {
            const trimmed = a.trim()
            const fracMatch = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(trimmed)
            if (fracMatch) {
              const den = Number(fracMatch[2])
              if (den === 0) throw new Error('Ans 分母为 0')
              return Number(fracMatch[1]) / den
            }
            if (/^-?\d+$/.test(trimmed)) {
              try {
                return BigInt(trimmed)
              } catch {
                // fallback to Number
              }
            }
            const num = Number(trimmed)
            if (!isNaN(num)) return num
          }
        }
        throw new Error('Ans 暂无有效值')
      }
      throw new Error(`未知函数或常量：${name}`)
    }
    throw new Error(`位置 ${pos}：无法解析 '${c}'`)
  }
  const v = parseExpr()
  skipWs()
  if (pos < s.length) throw new Error(`位置 ${pos}：存在多余内容`)
  return M !== null ? reduce(v) : v
}
