// 适配层 IndexedDB 存储单测：在 node 里用 fake-indexeddb + happy-dom 模拟浏览器环境，
// 加载真正的 web-api.js 适配层，验证 store 读写闭环是否与桌面 SQLite 语义一致。
import 'fake-indexeddb/auto'
import { Window } from 'happy-dom'

const win = new Window()
globalThis.window = win
globalThis.document = win.document
globalThis.localStorage = win.localStorage
// Node 24 内置 readonly navigator，跳过（store 测试不涉及 clipboard/online）
if (!globalThis.navigator?.userAgent) {
  try { Object.defineProperty(globalThis, 'navigator', { value: win.navigator, writable: true, configurable: true }) } catch {}
}
globalThis.URLSearchParams = win.URLSearchParams ?? URLSearchParams
// happy-dom 不提供 fetch；补一个只读 stub 避免模块初始化崩溃（本测只测 store，不联网）
globalThis.fetch = globalThis.fetch || (async () => ({ ok: false, status: 0, headers: new Map(), json: async () => ({}) }))
globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'))
globalThis.atob = globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary'))

const { window: _w } = globalThis
await import('../src/renderer/src/platform/web-api.js')
const api = _w.api

const results = []
function chk(name, cond) { results.push([name, !!cond]) }

try {
  // 1. init + saveAll（3 会话消息 + convos + prefs）
  await api.storeInit(999)
  await api.storeSaveAll(999, {
    convos: [
      { kind: 'user', cid: 1, meta: { uid: 1, name: '张三', message_ids: [101, 102, 103, 104, 105] } },
      { kind: 'group', cid: 2, meta: { gid: 2, name: '群组', message_ids: [201, 202] } },
      { kind: 'user', cid: 3, meta: { uid: 3, name: '李四', message_ids: [301] } },
    ],
    messages: {
      'user:1': [
        { id: 101, sender: 1, send_time: 1000, content: '{"type":"text","content":"hi1"}' },
        { id: 102, sender: 1, send_time: 2000, content: '{"type":"text","content":"hi2"}' },
        { id: 103, sender: 1, send_time: 3000, content: '{"type":"text","content":"hi3"}' },
        { id: 104, sender: 1, send_time: 4000, content: '{"type":"text","content":"hi4"}' },
        { id: 105, sender: 1, send_time: 5000, content: '{"type":"text","content":"hi5"}' },
      ],
      'group:2': [
        { id: 201, sender: 2, send_time: 1000, content: '{"type":"text","content":"gz1"}' },
        { id: 202, sender: 2, send_time: 2000, content: '{"type":"text","content":"gz2"}' },
      ],
      'user:3': [
        { id: 301, sender: 3, send_time: 1000, content: '{"type":"text","content":"hi-lisi"}' },
      ],
    },
    prefs: { favorites: [{ id: 1 }], drafts: { a: 1 } },
  })
  chk('saveAll 成功完成', true)

  // 2. loadConvos
  const convos = await api.storeLoadConvos(999)
  chk('loadConvos.users 含 2 个', Object.keys(convos.users || {}).length === 2)
  chk('loadConvos.groups 含 1 个', Object.keys(convos.groups || {}).length === 1)
  chk('convos.user.1.message_ids 保留', (convos.users?.['1'] || convos.users?.[1])?.message_ids?.length === 5)

  // 3. loadMessages（ensureConvoMessages 主路径，limit 1000）——按 send_time 降序
  const m = await api.storeLoadMessages(999, 'user', 1, 1000)
  chk('user:1 读出 5 条', (m.data || []).length === 5)
  chk('user:1 降序 (id 105 在前)', m.data?.[0]?.id === 105)

  // 4. loadLastMessages（会话预览，每会话最新一条）
  const last = await api.storeLoadLastMessages(999)
  chk('loadLastMessages 3 条', (last.data || []).length === 3)

  // 5. loadPrefs
  const prefs = await api.storeLoadPrefs(999)
  chk('prefs.favorites 恢复', (prefs.data || {}).favorites?.length === 1)

  // 6. loadMessages 不带 before（翻页语义），分页翻一半
  const page1 = await api.storeLoadMessages(999, 'user', 1, 3)
  chk('limit=3 只返回 3 条（降序前 3）', (page1.data || []).length === 3)

  // 7. exportAll 全量导出
  const ex = await api.storeExportAll(999)
  chk('exportAll.messages 8 条', Object.keys(ex.messages || {}).length === 8)

  // 8. 再次 saveAll（幂等：增量合并不清空已有历史）——模拟历史在库后又写入新会话
  await api.storeSaveAll(999, {
    convos: [{ kind: 'user', cid: 1, meta: { uid: 1, name: '张三', message_ids: [101, 102, 103, 104, 105, 106] } }],
    messages: { 'user:1': [{ id: 106, sender: 1, send_time: 6000, content: '{"type":"text","content":"hi6"}' }] },
    prefs: { favorites: [{ id: 1 }] },
  })
  const m2 = await api.storeLoadMessages(999, 'user', 1, 1000)
  chk('追加后 user:1 读出 6 条（不清空旧 5 条）', (m2.data || []).length === 6)

  // 9. importAll（恢复备份语义）
  const imp = await api.storeImportAll(999, {
    users: { 1: { uid: 1, name: '张三', message_ids: [1, 2] }, 7: { uid: 7, name: '王五', message_ids: [] } },
    groups: {},
    messages: {
      1: { id: 1, send_time: 100, content: 'x1' },
      2: { id: 2, send_time: 200, content: 'x2' },
    },
  })
  chk('importAll 返回 messages=2', imp.messages === 2)
} catch (e) {
  results.push(['EXCEPTION: ' + (e.message || String(e)), false])
}

const pass = results.filter(([, ok]) => ok).length
const total = results.length
for (const [name, ok] of results) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
console.log(`\n${pass}/${total} 通过`)
process.exit(pass === total ? 0 : 1)
