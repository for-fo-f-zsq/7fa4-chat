// 通知策略单测：纯 Node，不触碰 window / window.api。
// 覆盖免打扰时段解析、DND 判定、通知闸门、隐私文案与 payload 契约（popup-ui / desktop-notify 依赖）。
import { store } from '../../src/renderer/src/store.js'
import {
  getConvoKey,
  parseHHMM,
  isWithinQuietHours,
  isDndActive,
  isDndTime,
  shouldNotify,
  shouldNotifyDetailed,
  getNotifContent,
  buildNotificationPayload,
  buildTestNotificationPayload,
} from '../../src/renderer/src/utils/notify.js'

const results = []
function chk(name, cond) {
  results.push([name, !!cond])
}

// 固定某个时刻（本地时区，与原实现 getHours() 语义一致）
function at(h, m = 0) {
  return new Date(2026, 4, 12, h, m, 0)
}

// ===== parseHHMM =====
chk("parseHHMM('22:00') === 1320", parseHHMM('22:00') === 1320)
chk("parseHHMM('00:00') === 0", parseHHMM('00:00') === 0)
chk("parseHHMM('23:59') === 1439", parseHHMM('23:59') === 1439)
chk("parseHHMM('7:05') 单位数小时也接受 = 425", parseHHMM('7:05') === 425)
chk("parseHHMM(' 08:30 ') 允许首尾空白 = 510", parseHHMM(' 08:30 ') === 510)
chk("parseHHMM('24:00') 归一到当天结束 1440", parseHHMM('24:00') === 1440)
chk("parseHHMM('24:00:00') 归一 1440", parseHHMM('24:00:00') === 1440)
chk("parseHHMM('22:00:30') 丢弃秒 = 1320", parseHHMM('22:00:30') === 1320)
chk("parseHHMM('22:60') 非法 -> null", parseHHMM('22:60') === null)
chk("parseHHMM('24:30') 非法 -> null", parseHHMM('24:30') === null)
chk("parseHHMM('22:0') 非法 -> null", parseHHMM('22:0') === null)
chk("parseHHMM('2200') 非法 -> null", parseHHMM('2200') === null)
chk("parseHHMM('abc') 非法 -> null", parseHHMM('abc') === null)
chk("parseHHMM('') 非法 -> null", parseHHMM('') === null)
chk('parseHHMM(null) 非法 -> null', parseHHMM(null) === null)
chk('parseHHMM(undefined) 非法 -> null', parseHHMM(undefined) === null)

// ===== isWithinQuietHours：跨零点 22:00 → 07:00 =====
chk('22:00-07:00 @23:00 命中', isWithinQuietHours('22:00', '07:00', at(23, 0)) === true)
chk('22:00-07:00 @00:30 命中', isWithinQuietHours('22:00', '07:00', at(0, 30)) === true)
chk('22:00-07:00 @06:59 命中', isWithinQuietHours('22:00', '07:00', at(6, 59)) === true)
chk('22:00-07:00 @07:00 结束点不含', isWithinQuietHours('22:00', '07:00', at(7, 0)) === false)
chk('22:00-07:00 @12:00 不命中', isWithinQuietHours('22:00', '07:00', at(12, 0)) === false)
chk('22:00-07:00 @21:59 不命中', isWithinQuietHours('22:00', '07:00', at(21, 59)) === false)
chk('22:00-07:00 @22:00 起始点含', isWithinQuietHours('22:00', '07:00', at(22, 0)) === true)

// ===== isWithinQuietHours：同日区间 09:00 → 17:00 =====
chk('09:00-17:00 @12:00 命中', isWithinQuietHours('09:00', '17:00', at(12, 0)) === true)
chk('09:00-17:00 @09:00 命中', isWithinQuietHours('09:00', '17:00', at(9, 0)) === true)
chk('09:00-17:00 @17:00 不命中', isWithinQuietHours('09:00', '17:00', at(17, 0)) === false)
chk('09:00-17:00 @08:59 不命中', isWithinQuietHours('09:00', '17:00', at(8, 59)) === false)

// ===== start === end / 非法格式 / 未传参 =====
chk('start===end 视为未配置 -> false', isWithinQuietHours('08:00', '08:00', at(8, 0)) === false)
chk('start 非法 -> false', isWithinQuietHours('bad', '07:00', at(23, 0)) === false)
chk('end 非法 -> false', isWithinQuietHours('22:00', '25:00', at(23, 0)) === false)
// <input type="time"> 的 24:00 / 带秒输入不能让整段定时免打扰静默失效
chk('22:00-24:00 @23:30 命中', isWithinQuietHours('22:00', '24:00', at(23, 30)) === true)
chk('22:00-24:00 @22:00 命中', isWithinQuietHours('22:00', '24:00', at(22, 0)) === true)
chk('22:00-24:00 @12:00 不命中', isWithinQuietHours('22:00', '24:00', at(12, 0)) === false)
chk('带秒输入 22:00:00-07:00:00 @23:00 命中', isWithinQuietHours('22:00:00', '07:00:00', at(23, 0)) === true)
chk('now 非法 Date -> false', isWithinQuietHours('22:00', '07:00', new Date('nope')) === false)
chk('默认 now 不抛异常', typeof isWithinQuietHours('22:00', '07:00') === 'boolean')

// ===== isDndActive / isDndTime =====
chk('dndEnabled=true 生效', isDndActive({ dndEnabled: true }, at(12, 0)) === true)
chk('空 setting 不生效', isDndActive({}, at(23, 0)) === false)
chk('undefined setting 不生效', isDndActive(undefined, at(23, 0)) === false)
chk('dndEnabled=false 且无定时 -> false', isDndActive({ dndEnabled: false }, at(23, 0)) === false)
chk(
  'dndSchedule=true + 时段 @23:00 生效',
  isDndActive({ dndSchedule: true, dndStart: '22:00', dndEnd: '07:00' }, at(23, 0)) === true,
)
chk(
  'dndSchedule=true + 时段 @12:00 不生效',
  isDndActive({ dndSchedule: true, dndStart: '22:00', dndEnd: '07:00' }, at(12, 0)) === false,
)
chk('dndSchedule=true 未填时段走默认 22:00-07:00', isDndActive({ dndSchedule: true }, at(23, 0)) === true)
chk('dndSchedule=false 只填时段 -> false', isDndActive({ dndStart: '22:00', dndEnd: '07:00' }, at(23, 0)) === false)
chk('isDndTime 与 isDndActive 等价', isDndTime({ dndEnabled: true }) === isDndActive({ dndEnabled: true }))

// ===== shouldNotify / shouldNotifyDetailed =====
chk('getConvoKey 拼接规则', getConvoKey('group', 12) === 'group_12')

store.mutedConvos = {}
chk('正常会话放行', shouldNotify('user', 1, {}) === true)
chk('正常会话 reason 为空', shouldNotifyDetailed('user', 1, {}).reason === '')

store.mutedConvos = { user_1: true }
chk('会话免打扰拦截', shouldNotify('user', 1, {}) === false)
const mutedDetail = shouldNotifyDetailed('user', 1, {})
chk('会话免打扰 reason=muted', mutedDetail.ok === false && mutedDetail.reason === 'muted')
chk('免打扰只作用于该会话', shouldNotify('user', 2, {}) === true)
store.mutedConvos = {}

const dndDetail = shouldNotifyDetailed('user', 1, { dndEnabled: true }, { chatType: 'user' })
chk('DND 拦截', shouldNotify('user', 1, { dndEnabled: true }) === false)
chk('DND reason=dnd', dndDetail.ok === false && dndDetail.reason === 'dnd')

// mention-only：只影响群聊
const mentionOnly = { notifMentionOnly: true }
chk(
  '群聊未提及时被 mention-only 拦下',
  shouldNotify('group', 5, mentionOnly, { chatType: 'group', mention: false }) === false,
)
chk(
  'mention-only reason',
  shouldNotifyDetailed('group', 5, mentionOnly, { chatType: 'group', mention: false }).reason ===
    'mention-only',
)
chk(
  '群聊提及时放行',
  shouldNotify('group', 5, mentionOnly, { chatType: 'group', mention: true }) === true,
)
chk('私聊不受 mention-only 影响', shouldNotify('user', 5, mentionOnly, { chatType: 'user', mention: false }) === true)
chk('未开启 mention-only 时群聊照常', shouldNotify('group', 5, {}, { chatType: 'group', mention: false }) === true)
chk('旧签名（无 opts）兼容', shouldNotify('group', 5, mentionOnly) === true)

// ===== getNotifContent =====
chk('隐私模式替换正文', getNotifContent('你好呀', { notifPrivacy: true }) === '收到一条新消息')
chk('非隐私模式原样返回', getNotifContent('你好呀', {}) === '你好呀')
chk('setting 为空也能返回正文', getNotifContent('x', undefined) === 'x')

// ===== buildNotificationPayload =====
const base = {
  chatType: 'group',
  targetId: 42,
  title: 'ACM 集训队',
  subtitle: '小明',
  body: '小明：晚上训练吗 (+2)',
  mention: true,
  count: 3,
  setting: { notifPosition: 'tl', notifDuration: 8000, notifPrivacy: false, theme: 'dark', fontSize: 16 },
  timestamp: 1700000000000,
}
const p1 = buildNotificationPayload(base)
chk('payload.id 稳定 = group_42', p1.id === 'group_42')
chk('payload.title 用群名', p1.title === 'ACM 集训队')
chk('payload.subtitle 用发送者名', p1.subtitle === '小明')
chk('payload.body 原样', p1.body === '小明：晚上训练吗 (+2)')
chk('payload.avatar 取标题首字大写', p1.avatar === 'A')
chk('payload.chatType', p1.chatType === 'group')
chk('payload.targetId', p1.targetId === 42)
chk('payload.mention', p1.mention === true)
chk('payload.count', p1.count === 3)
chk('payload.timestamp', p1.timestamp === 1700000000000)
chk('payload.position 合法值保留', p1.position === 'tl')
chk('payload.duration 合法值保留', p1.duration === 8000)
chk('payload.privacy', p1.privacy === false)
chk('payload.theme', p1.theme === 'dark')
chk('payload.fontSize', p1.fontSize === 16)
chk('payload.accent 缺省为空串', p1.accent === '')

// 私聊 + 全兜底
const p2 = buildNotificationPayload({
  chatType: 'user',
  targetId: 'u-9',
  title: 'nina',
  body: 'hi',
  setting: {},
})
chk('私聊 id = user_u-9', p2.id === 'user_u-9')
chk('私聊 subtitle 默认空串', p2.subtitle === '')
chk('position 非法兜底 br', p2.position === 'br')
chk('position 缺失兜底 br', buildNotificationPayload({ setting: {} }).position === 'br')
chk('position 非法值兜底 br', buildNotificationPayload({ setting: { notifPosition: 'middle' } }).position === 'br')
chk('duration 缺失兜底 6000', p2.duration === 6000)
chk('duration 过小夹到 3000', buildNotificationPayload({ setting: { notifDuration: 1000 } }).duration === 3000)
chk('duration 过大夹到 20000', buildNotificationPayload({ setting: { notifDuration: 99999 } }).duration === 20000)
chk('duration 非法兜底 6000', buildNotificationPayload({ setting: { notifDuration: 'abc' } }).duration === 6000)
chk('count 缺失下限 1', p2.count === 1)
chk('count 0 抬到 1', buildNotificationPayload({ count: 0 }).count === 1)
chk('count 负数抬到 1', buildNotificationPayload({ count: -5 }).count === 1)
chk('count 小数取整', buildNotificationPayload({ count: 2.9 }).count === 2)
chk('theme 缺省 default', p2.theme === 'default')
chk('fontSize 缺省 14', p2.fontSize === 14)
chk('fontSize 非法兜底 14', buildNotificationPayload({ setting: { fontSize: 'big' } }).fontSize === 14)
chk('privacy 跟随 setting', buildNotificationPayload({ setting: { notifPrivacy: true } }).privacy === true)
chk('timestamp 缺失时取当前时间', typeof p2.timestamp === 'number' && p2.timestamp > 1600000000000)
chk('accent 合法值小写归一', buildNotificationPayload({ accent: '#AABBCC' }).accent === '#aabbcc')
chk('accent 非法值丢弃', buildNotificationPayload({ accent: 'red' }).accent === '')
chk('chatType 非法收敛为 user', buildNotificationPayload({ chatType: 'room' }).chatType === 'user')
chk('中文标题头像取首字', buildNotificationPayload({ title: '群聊' }).avatar === '群')
chk('空标题回落到默认标题的首字', buildNotificationPayload({ title: '' }).avatar === '新')
chk('纯空白标题头像占位', buildNotificationPayload({ title: '   ' }).avatar === '?')
chk(
  '显式 avatar 优先',
  buildNotificationPayload({ title: 'abc', avatar: 'X' }).avatar === 'X',
)
chk('emoji 标题不被劈半', buildNotificationPayload({ title: '😀abc' }).avatar === '😀')

// ===== 测试通知 payload（必须体现「隐藏消息内容」） =====
const testPlain = buildTestNotificationPayload({})
chk('测试通知 id = group_（示例会话为空 targetId，不撞真实会话）', testPlain.id === 'group_')
chk('测试通知 targetId 为空串（点卡片不跳页）', testPlain.targetId === '')
chk('测试通知 chatType=group', testPlain.chatType === 'group')
chk('测试通知 title 是示例群名', testPlain.title === '7FA4 Chat 测试群')
chk('测试通知 subtitle 是发送者', testPlain.subtitle === '7FA4 小助手')
chk('非隐私时正文是测试文案', testPlain.body === '这是一条测试通知，收到说明通知已正常工作。')
chk('测试通知 count=1 且非 mention', testPlain.count === 1 && testPlain.mention === false)
chk('测试通知 avatar 取群名首字', testPlain.avatar === '7')

const testPrivacy = buildTestNotificationPayload({ notifPrivacy: true })
chk('隐私模式测试通知正文脱敏', testPrivacy.body === '收到一条新消息')
chk('隐私模式测试通知 privacy=true', testPrivacy.privacy === true)
chk('隐私模式仍保留群名标题（与真实消息一致）', testPrivacy.title === '7FA4 Chat 测试群')

const testStyled = buildTestNotificationPayload({ notifPosition: 'bl', notifDuration: 12000, theme: 'midnight', fontSize: 18 })
chk('测试通知沿用 position', testStyled.position === 'bl')
chk('测试通知沿用 duration', testStyled.duration === 12000)
chk('测试通知沿用 theme/fontSize', testStyled.theme === 'midnight' && testStyled.fontSize === 18)

// ===== 汇总 =====
let passed = 0
for (const [name, ok] of results) {
  if (ok) passed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
console.log(`\n${passed}/${results.length} 通过`)
if (passed !== results.length) process.exit(1)
