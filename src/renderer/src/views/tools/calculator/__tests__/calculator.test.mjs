import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  MODES,
  PAD_KEYS,
  CATEGORY_FUNCS,
  MOD_PRESETS
} from '../calcConstants.js'
import {
  comb,
  evaluate,
  evaluateFraction,
  factorial,
  factorize,
  fastPow,
  fmtFrac,
  gcd,
  lcm,
  modInverse,
  perm
} from '../calcEngine.js'

console.log('--- 开始 Calculator 单元测试 ---')

// 1. 工具清单：版本号只校验格式，避免每次发版都要改测试
console.log('1. 验证 tool.json 与常量表...')
const toolJsonPath = path.resolve('tools/calculator/tool.json')
const toolJson = JSON.parse(fs.readFileSync(toolJsonPath, 'utf-8'))
assert.equal(toolJson.id, 'calculator', 'tool.json 的 id 必须是 calculator')
assert.match(toolJson.version, /^\d+\.\d+\.\d+$/, 'tool.json 版本号应为 x.y.z')
assert.equal(toolJson.entry, 'index.html', '入口文件应为 index.html')
assert.ok(toolJson.minAppVersion, '必须声明 minAppVersion')
assert.deepEqual(MODES.map((m) => m.value), ['normal', 'mod', 'frac'], '三种模式必须齐备')
assert.ok(PAD_KEYS.includes('**'), '键盘必须提供 ** 幂运算符')
assert.ok(!PAD_KEYS.includes('^'), '键盘不能放裸 ^：该引擎里 ^ 是按位异或')
assert.ok(MOD_PRESETS.every((p) => /^\d+$/.test(p.value)), '模数预设必须是纯数字')
assert.ok(CATEGORY_FUNCS.bit.includes('^'), '^ 应归到位运算分类')
console.log('✓ tool.json 与常量表通过')

// 2. 普通模式：优先级、幂、取模、除法、除零
console.log('2. 验证普通模式四则与优先级...')
assert.equal(evaluate('1+2*3'), 7n, '乘法优先级应高于加法')
assert.equal(evaluate('(1+2)*3'), 9n, '括号应改变优先级')
assert.equal(evaluate('-3+1'), -2n, '一元负号应生效')
assert.equal(evaluate('2**10'), 1024n, '** 是幂运算')
assert.equal(evaluate('10%3'), 1n, '% 是取模')
assert.equal(evaluate('10/4'), 2.5, '单个 / 是实数除法')
assert.equal(evaluate('0.1+0.2'), 0.30000000000000004, '浮点加法保持原生语义')
assert.equal(evaluate('1e3'), 1000, '科学计数法应可解析')
assert.throws(() => evaluate('1/0'), /除以 0/, '除以 0 必须报错而不是返回 Infinity')
assert.throws(() => evaluate('   '), /表达式为空/, '空表达式必须报错')
assert.throws(() => evaluate('1+'), /./, '不完整表达式必须报错')
console.log('✓ 四则与优先级通过')

// 3. 位运算语义：^ 是异或，不是幂
console.log('3. 验证位运算语义...')
assert.equal(evaluate('2^10'), 8n, '^ 是按位异或（2 xor 10 = 8），不是幂')
assert.equal(evaluate('6&3'), 2n, '& 是按位与')
assert.equal(evaluate('6|1'), 7n, '| 是按位或')
assert.equal(evaluate('1<<4'), 16n, '<< 是左移')
assert.equal(evaluate('16>>2'), 4n, '>> 是右移')
assert.equal(evaluate('~0'), -1n, '~ 是按位取反')
console.log('✓ 位运算语义通过')

// 4. 函数与角度单位
console.log('4. 验证函数与角度单位...')
assert.equal(evaluate('sqrt(16)'), 4, 'sqrt 应开方')
assert.equal(evaluate('abs(-3)'), 3n, 'abs 应取绝对值（整数保持 BigInt）')
assert.equal(evaluate('abs(-3.5)'), 3.5, 'abs 对小数返回 Number')
assert.equal(evaluate('max(1,5,3)'), 5n, 'max 应取最大值')
assert.equal(evaluate('sin(30)'), 0.5, '默认角度制：sin(30) = 0.5')
assert.ok(
  Math.abs(evaluate('sin(30)', null, null, { angleUnit: 'rad' }) + 0.9880316240928618) < 1e-12,
  '弧度制下 sin(30) 应约为 -0.988'
)
assert.throws(() => evaluate('nope(1)'), /未知函数/, '未知函数必须报错')
console.log('✓ 函数与角度单位通过')

// 5. 模数模式：快速幂、除法转模逆、非法模数
console.log('5. 验证模数模式...')
assert.equal(evaluate('2**10', '1000'), 24n, '模 1000 下 2^10 = 24')
assert.equal(evaluate('2+3', '1000'), 5n, '传入模数即进入模数模式')
assert.throws(() => evaluate('1/3', null, 'mod'), /模数/, '模数模式缺模数必须报错')
assert.throws(() => evaluate('1+1', '0'), /正整数/, '模数 0 必须报错')
assert.throws(() => evaluate('1+1', 'abc'), /模数/, '非数字模数必须报错')
assert.equal(evaluate('1/3', '11'), 4n, '模 11 下 1/3 = 4（3×4≡1）')
console.log('✓ 模数模式通过')

// 6. 分数模式：精确约分
console.log('6. 验证分数模式...')
const half = evaluateFraction('1/3+1/6')
assert.deepEqual(half, { n: 1n, d: 2n }, '1/3 + 1/6 应精确等于 1/2')
assert.equal(fmtFrac(half), '1/2', '分数格式化应约分')
assert.equal(fmtFrac(evaluateFraction('2/4')), '1/2', '2/4 应约分为 1/2')
assert.equal(fmtFrac(evaluateFraction('1/2+1/2')), '1', '相加为整数时不应带分母')
console.log('✓ 分数模式通过')

// 7. 数论工具：分解、gcd/lcm、阶乘、组合、排列、快速幂、模逆元
console.log('7. 验证数论工具...')
assert.equal(factorize(360), '360 = 2^3 × 3^2 × 5', '360 应分解为 2^3 × 3^2 × 5')
assert.equal(factorize(97), '97 = 97', '质数应分解为自身')
assert.match(factorize(1), /≥ 2/, '小于 2 的输入应给出提示')
assert.equal(factorize(1n << 40n), `${1n << 40n} = 2^40`, '2 的大幂次应正确计数')
assert.equal(gcd(12, 18), 6n, 'gcd(12,18) = 6')
assert.equal(gcd(-12, 18), 6n, 'gcd 应取绝对值')
assert.equal(lcm(4, 6), 12n, 'lcm(4,6) = 12')
assert.equal(lcm(0, 5), 0n, '与 0 的最小公倍数为 0')
assert.equal(factorial(5), 120n, '5! = 120')
assert.throws(() => factorial(-1), /非负/, '负数阶乘必须报错')
assert.throws(() => factorial(10001), /阶乘过大/, '超过上限的阶乘必须报错')
assert.equal(comb(5, 2), 10n, 'C(5,2) = 10')
assert.equal(comb(5, 7), 0n, 'C(5,7) = 0')
assert.equal(comb(100, 50), 100891344545564193334812497256n, 'C(100,50) 应精确')
assert.equal(perm(5, 2), 20n, 'A(5,2) = 20')
assert.equal(perm(5, 7), 0n, 'A(5,7) = 0')
assert.equal(fastPow(2, 10), 1024n, '快速幂 2^10 = 1024')
assert.equal(fastPow(2, 10, 1000), 24n, '模意义下 2^10 = 24')
assert.throws(() => fastPow(2, -1), /非负/, '负指数必须报错')
assert.throws(() => fastPow(2, 10, 0), /正整数/, '模数 0 必须报错')
assert.equal(modInverse(3, 11), 4n, '3 在模 11 下的逆元是 4')
assert.equal(modInverse(2, 4), null, '不互质时无逆元，应返回 null')
assert.throws(() => modInverse(3, 0), /正整数/, '模数 0 必须报错')
console.log('✓ 数论工具通过')

// 8. 统一入口的模式路由
console.log('8. 验证 evaluate 的模式路由...')
assert.equal(typeof evaluate('1+1'), 'bigint', '默认走普通模式')
assert.deepEqual(evaluate('1/2', null, 'frac'), { n: 1n, d: 2n }, 'mode=frac 应走分数引擎')
assert.equal(evaluate('6/2', null, 'frac').n, 3n, '分数引擎也要能算出整数')
assert.equal(evaluate('1+1', '1000', null), 2n, '传 mod 且不传 mode 时按模数模式处理')
assert.equal(evaluate('1+1', '', null), 2n, '空模数应退回普通模式')
console.log('✓ 模式路由通过')

console.log('--- 全部 Calculator 单元测试验证通过！ ---')
