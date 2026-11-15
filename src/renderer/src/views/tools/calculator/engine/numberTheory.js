// Number-theory primitives and BigInt/Number formatting for Calculator.

export const FACT_MAX = 10000

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

export function factorial(n) {
  const N = BigInt(n)
  if (N < 0n) throw new Error('阶乘仅支持非负整数')
  if (N > BigInt(FACT_MAX)) throw new Error(`阶乘过大（上限 ${FACT_MAX}）`)
  let r = 1n
  for (let i = 2n; i <= N; i++) r *= i
  return r
}

export function factorize(n) {
  const x0 = BigInt(n)
  if (x0 < 2n) return '输入需为 ≥ 2 的整数'
  const parts = []
  let x = x0
  let c2 = 0
  while (x % 2n === 0n) { x /= 2n; c2++ }
  if (c2) parts.push(c2 === 1 || c2 === 1n ? '2' : `2^${c2}`)
  for (let p = 3n; p * p <= x; p += 2n) {
    let c = 0
    while (x % p === 0n) { x /= p; c++ }
    if (c) parts.push(c === 1 || c === 1n ? `${p}` : `${p}^${c}`)
    if (p * p > x) break
  }
  if (x > 1n) parts.push(`${x}`)
  return `${x0} = ${parts.join(' × ')}`
}

export function gcdBig(a, b) {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

export function gcd(a, b) {
  return gcdBig(BigInt(a), BigInt(b))
}

export function lcm(a, b) {
  const x = BigInt(a) < 0n ? -BigInt(a) : BigInt(a)
  const y = BigInt(b) < 0n ? -BigInt(b) : BigInt(b)
  if (!x && !y) return 0n
  return (x / gcdBig(x, y)) * y
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
