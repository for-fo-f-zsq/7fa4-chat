// Exact rational-number evaluator (BigInt numerator/denominator).
import {
  comb, factorial, factorize, fmtNum, gcd, gcdBig, lcm, modInverse, perm
} from './numberTheory.js'

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

function fFloor(a) {
  const q = a.n / a.d
  return mkFrac(a.n % a.d !== 0n && a.n < 0n ? q - 1n : q)
}

function fCeil(a) {
  const q = a.n / a.d
  return mkFrac(a.n % a.d !== 0n && a.n > 0n ? q + 1n : q)
}

const fRound = (a) => fFloor(fAdd(a, mkFrac(1n, 2n)))

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

function fRoot(a, k) {
  if (a.n < 0n && k % 2 === 0) throw new Error('负数不能开偶次方')
  const rn = irootExact(a.n < 0n ? -a.n : a.n, k)
  const rd = irootExact(a.d, k)
  if (rn === null || rd === null) {
    throw new Error(`${k === 2 ? '√' : 'cbrt'}(${fmtFrac(a)}) 不是有理数（分数模式不支持无理数，可切到普通模式取近似值）`)
  }
  return mkFrac(a.n < 0n ? -rn : rn, rd)
}

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

export function evaluateFraction(expr, options = {}) {
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
      if (name === 'ans') {
        if (options?.ans != null) {
          if (isFrac(options.ans)) return options.ans
          if (typeof options.ans === 'bigint') return I(options.ans)
          if (typeof options.ans === 'number') {
            if (Number.isInteger(options.ans)) return I(BigInt(options.ans))
            if (Number.isFinite(options.ans)) return fracFromLiteral(String(options.ans))
          }
          if (typeof options.ans === 'string') {
            const trimmed = options.ans.trim()
            if (/^-?\d+\/-?\d+$/.test(trimmed)) {
              const [n, d] = trimmed.split('/')
              return mkFrac(n, d)
            }
            if (/^-?\d+$/.test(trimmed)) {
              return I(BigInt(trimmed))
            }
            if (/^-?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed) && trimmed !== '' && trimmed !== '.' && trimmed !== '-') {
              try {
                return fracFromLiteral(trimmed)
              } catch {
                // fallback
              }
            }
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
  return v
}

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
