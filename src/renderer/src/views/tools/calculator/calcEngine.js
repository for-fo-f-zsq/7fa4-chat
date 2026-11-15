// Calculator engine public barrel: expression evaluation + number-theory helpers.
import { evaluateFraction, fmtFrac, fracApprox, isFrac } from './engine/fractionEval.js'
import { comb, factorial, factorize, fastPow, fmtNum, gcd, lcm, modInverse, perm } from './engine/numberTheory.js'
import { evaluateReal } from './engine/realEval.js'

export {
  comb,
  evaluateFraction,
  factorial,
  factorize,
  fastPow,
  fmtFrac,
  fmtNum,
  fracApprox,
  gcd,
  isFrac,
  lcm,
  modInverse,
  perm
}

/**
 * Unified calculator entry point.
 * @param {string} expr
 * @param {*} mod
 * @param {'normal'|'mod'|'frac'|null} mode
 * @param {object|string} [options]
 */
export function evaluate(expr, mod = null, mode = null, options = {}) {
  const m = mode == null ? ((mod == null || mod === '') ? 'normal' : 'mod') : mode
  const opts = typeof options === 'string' ? { angleUnit: options } : (options || {})
  if (m === 'frac') return evaluateFraction(expr, opts)
  if (m === 'mod') {
    const M = mod == null ? '' : String(mod).trim()
    if (!/^\d+$/.test(M) || BigInt(M) <= 0n) {
      throw new Error('模数模式下请先填写正整数模数 m（一切运算都在模 m 意义下进行）')
    }
    return evaluateReal(expr, M, opts)
  }
  return evaluateReal(expr, null, opts)
}
