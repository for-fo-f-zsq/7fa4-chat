// 适配层存储单测：在 Node 里用 fake-indexeddb + happy-dom 模拟浏览器/Capacitor 环境，
// 加载真正的 web-api.js 适配层，同时验证：
//   1) Android 原生模式（IS_NATIVE = true）：IndexedDB 读写闭环与桌面 SQLite 语义一致；
//   2) 纯浏览器网页版模式（IS_NATIVE = false）：不落会话/消息，只把偏好存进 localStorage。
import 'fake-indexeddb/auto'
import { Window } from 'happy-dom'
import { Capacitor } from '@capacitor/core'

const win = new Window({ url: 'https://jx.7fa4.cn:8888/7fa4-chat/web/' })
globalThis.window = win
globalThis.document = win.document
globalThis.localStorage = win.localStorage
globalThis.location = win.location
// Node 内置 readonly navigator，跳过（store 测试不涉及 clipboard/online）
if (!globalThis.navigator?.userAgent) {
  try { Object.defineProperty(globalThis, 'navigator', { value: win.navigator, writable: true, configurable: true }) } catch {}
}
globalThis.URLSearchParams = win.URLSearchParams ?? URLSearchParams
// happy-dom 不提供 fetch；补一个只读 stub 避免模块初始化崩溃（本测只测 store，不联网）
globalThis.fetch = globalThis.fetch || (async () => ({ ok: false, status: 0, headers: new Map(), json: async () => ({}) }))
globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'))
globalThis.atob = globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary'))

const results = []
function chk(name, cond) { results.push([name, !!cond]) }

try {
  // ===== 第一部分：Android 原生模式（IS_NATIVE = true → IndexedDB 完整持久化） =====
  Capacitor.isNativePlatform = () => true
  await import('../../src/renderer/src/platform/web-api.js?native=1')
  const nativeApi = win.api

  chk('Android 模式 getPlatform === android', (await nativeApi.getPlatform()) === 'android')

  await nativeApi.storeInit(999)
  await nativeApi.storeSaveAll(999, {
    convos: [
      { kind: 'user', cid: 1, meta: { uid: 1, name: '张三', message_ids: [101, 102, 103, 104, 105] } },
      { kind: 'group', cid: 2, meta: { gid: 2, name: '群组', message_ids: [201, 202] } },
      { kind: 'user', cid: 3, meta: { uid: 3, name: '李四', message_ids: [301] } }
    ],
    messages: {
      'user:1': [
        { id: 101, sender: 1, send_time: 1000, content: '{"type":"text","content":"hi1"}' },
        { id: 102, sender: 1, send_time: 2000, content: '{"type":"text","content":"hi2"}' },
        { id: 103, sender: 1, send_time: 3000, content: '{"type":"text","content":"hi3"}' },
        { id: 104, sender: 1, send_time: 4000, content: '{"type":"text","content":"hi4"}' },
        { id: 105, sender: 1, send_time: 5000, content: '{"type":"text","content":"hi5"}' }
      ],
      'group:2': [
        { id: 201, sender: 2, send_time: 1000, content: '{"type":"text","content":"gz1"}' },
        { id: 202, sender: 2, send_time: 2000, content: '{"type":"text","content":"gz2"}' }
      ],
      'user:3': [
        { id: 301, sender: 3, send_time: 1000, content: '{"type":"text","content":"hi-lisi"}' }
      ]
    },
    prefs: { drafts: { a: 1 } }
  })
  chk('Android saveAll 成功完成', true)

  const convos = await nativeApi.storeLoadConvos(999)
  chk('loadConvos.users 含 2 个', Object.keys(convos.users || {}).length === 2)
  chk('loadConvos.groups 含 1 个', Object.keys(convos.groups || {}).length === 1)
  chk('convos.user.1.message_ids 保留', (convos.users?.['1'] || convos.users?.[1])?.message_ids?.length === 5)

  const m = await nativeApi.storeLoadMessages(999, 'user', 1, 1000)
  chk('user:1 读出 5 条', (m.data || []).length === 5)
  chk('user:1 降序 (id 105 在前)', m.data?.[0]?.id === 105)

  const last = await nativeApi.storeLoadLastMessages(999)
  chk('loadLastMessages 3 条', (last.data || []).length === 3)

  const prefs = await nativeApi.storeLoadPrefs(999)
  chk('prefs.drafts 恢复', (prefs.data || {}).drafts?.a === 1)

  const page1 = await nativeApi.storeLoadMessages(999, 'user', 1, 3)
  chk('limit=3 只返回 3 条（降序前 3）', (page1.data || []).length === 3)

  const ex = await nativeApi.storeExportAll(999)
  chk('exportAll.messages 8 条', Object.keys(ex.messages || {}).length === 8)

  await nativeApi.storeSaveAll(999, {
    convos: [{ kind: 'user', cid: 1, meta: { uid: 1, name: '张三', message_ids: [101, 102, 103, 104, 105, 106] } }],
    messages: { 'user:1': [{ id: 106, sender: 1, send_time: 6000, content: '{"type":"text","content":"hi6"}' }] },
    prefs: { drafts: { a: 2 } }
  })
  const m2 = await nativeApi.storeLoadMessages(999, 'user', 1, 1000)
  chk('追加后 user:1 读出 6 条（不清空旧 5 条）', (m2.data || []).length === 6)

  const imp = await nativeApi.storeImportAll(999, {
    users: { 1: { uid: 1, name: '张三', message_ids: [1, 2] }, 7: { uid: 7, name: '王五', message_ids: [] } },
    groups: {},
    messages: {
      1: { id: 1, send_time: 100, content: 'x1' },
      2: { id: 2, send_time: 200, content: 'x2' }
    }
  })
  chk('importAll 返回 messages=2', imp.messages === 2)

  // ===== 第二部分：网页端模式（IS_NATIVE = false → 不落消息，仅存偏好到 localStorage） =====
  Capacitor.isNativePlatform = () => false
  await import('../../src/renderer/src/platform/web-api.js?web=1')
  const webApi = win.api

  chk('Web 模式 getPlatform === web', (await webApi.getPlatform()) === 'web')
  await webApi.storeSaveAll(999, {
    convos: [{ kind: 'user', cid: 1, meta: { uid: 1 } }],
    messages: { 'user:1': [{ id: 1, send_time: 100, content: 'x' }] },
    prefs: { mutedConvos: { 'user:1': true } }
  })
  const webConvos = await webApi.storeLoadConvos(999)
  const webMsgs = await webApi.storeLoadMessages(999, 'user', 1, 100)
  const webPrefs = await webApi.storeLoadPrefs(999)
  const webEx = await webApi.storeExportAll(999)
  chk('Web 模式不持久化 convos', Object.keys(webConvos.users || {}).length === 0)
  chk('Web 模式不持久化 messages', (webMsgs.data || []).length === 0)
  chk('Web 模式持久化 prefs 到 localStorage', webPrefs.data?.mutedConvos?.['user:1'] === true)
  chk('Web 模式 exportAll 返回 unsupported', webEx.unsupported === true)
} catch (e) {
  results.push(['EXCEPTION: ' + (e.message || String(e)), false])
}

const pass = results.filter(([, ok]) => ok).length
const total = results.length
for (const [name, ok] of results) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
console.log(`\n${pass}/${total} 通过`)
process.exit(pass === total ? 0 : 1)
