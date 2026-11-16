import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  STORAGE_KEY,
  LAYOUTS,
  FLOAT_POS,
  pad,
  toLocalInput,
  nextBreakTarget,
  parseDuration
} from '../timerPersist.js'

console.log('--- 开始 Timer 单元测试 ---')

// 1. 清单与常量
console.log('1. 验证 tool.json 与常量表...')
const toolJson = JSON.parse(fs.readFileSync(path.resolve('tools/timer/tool.json'), 'utf-8'))
assert.equal(toolJson.id, 'timer', 'tool.json 的 id 必须是 timer')
assert.match(toolJson.version, /^\d+\.\d+\.\d+$/, 'tool.json 版本号应为 x.y.z')
assert.equal(STORAGE_KEY, '7fa4-timer-v1', '存储键必须保持稳定（改名会丢掉用户已有配置）')
assert.deepEqual(LAYOUTS, [1, 2, 4], '布局只允许 1/2/4 分屏')
assert.equal(FLOAT_POS.length, 4, '悬浮窗应有 4 个停靠角')
assert.equal(new Set(FLOAT_POS.map((p) => p.key)).size, 4, '停靠角 key 必须唯一')
assert.ok(FLOAT_POS.every((p) => p.key && p.label && p.short), '停靠角需要 key/label/short')
assert.equal(pad(3), '03', 'pad 应补零')
assert.equal(pad(12), '12', '两位数不应被截断')
console.log('✓ tool.json 与常量表通过')

// 2. 时长解析：分钟数、时分秒、非法输入
console.log('2. 验证 parseDuration...')
assert.equal(parseDuration('90'), 90 * 60000, '纯数字按分钟解析')
assert.equal(parseDuration('0.5'), 30000, '支持半小时')
assert.equal(parseDuration('05:00'), 5 * 60000, 'mm:ss 解析')
assert.equal(parseDuration('1:30:00'), 90 * 60000, 'hh:mm:ss 解析')
assert.equal(parseDuration(' 10 '), 600000, '应忽略首尾空格')
assert.equal(parseDuration(''), 0, '空串应为 0')
assert.equal(parseDuration(null), 0, 'null 应为 0')
assert.equal(parseDuration(undefined), 0, 'undefined 应为 0')
assert.equal(parseDuration('abc'), 0, '非数字应为 0 而不是 NaN')
assert.equal(parseDuration('-5'), 0, '负时长应被夹到 0')
assert.equal(parseDuration('1:xx'), 0, '含非法分段的输入应为 0')
console.log('✓ parseDuration 通过')

// 3. 目标时刻：默认取最近的下课时间
console.log('3. 验证 nextBreakTarget...')
const at = (h, m) => new Date(2026, 4, 12, h, m, 0, 0).getTime()
const expectAt = (h, m, addDay = 0) => new Date(2026, 4, 12 + addDay, h, m, 0, 0).getTime()
assert.equal(nextBreakTarget(at(8, 0)), expectAt(12, 0), '上午应指向当天 12:00')
assert.equal(nextBreakTarget(at(12, 0)), expectAt(17, 30), '正好 12:00 时应指向下一场 17:30')
assert.equal(nextBreakTarget(at(13, 0)), expectAt(17, 30), '下午应指向 17:30')
assert.equal(nextBreakTarget(at(18, 0)), expectAt(22, 0), '晚上应指向 22:00')
assert.equal(nextBreakTarget(at(23, 0)), expectAt(12, 0, 1), '全部过点后应指向次日 12:00')
assert.equal(toLocalInput(expectAt(9, 5)), '2026-05-12T09:05', 'toLocalInput 应输出 datetime-local 格式')
console.log('✓ nextBreakTarget 通过')

// 4. 布局结构：ToolWorkspaceShell 默认横向排列，TimerTool 必须用纵向 .tm-body 包裹操作条与舞台
console.log('4. 验证 TimerTool 纵向布局容器...')
const timerVue = fs.readFileSync(path.resolve('src/renderer/src/views/tools/timer/TimerTool.vue'), 'utf-8')
const timerCss = fs.readFileSync(path.resolve('src/renderer/src/views/tools/timer/timer-tool.css'), 'utf-8')
assert.match(timerVue, /<div class="tm-body">[\s\S]*tm-actions[\s\S]*tm-stage/, 'TimerTool.vue 必须用 .tm-body 包裹 .tm-actions 与 .tm-stage')
assert.match(timerCss, /\.tm-body\s*\{[^}]*flex-direction:\s*column/, 'timer-tool.css 中的 .tm-body 必须设置 flex-direction: column')
console.log('✓ TimerTool 纵向布局容器通过')

console.log('--- 全部 Timer 单元测试验证通过！ ---')
