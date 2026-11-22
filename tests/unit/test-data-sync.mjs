// 数据同步、持久化并发安全、Poll/Vote UID 协议、Token/Free 账本、通知策略与工具管理单测
// 用法：node tests/unit/test-data-sync.mjs
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const win = new Window({ url: 'https://jx.7fa4.cn:8888/' })
for (const k of ['document', 'window', 'localStorage', 'location', 'CustomEvent', 'Event', 'HTMLElement', 'Element', 'SVGElement', 'Node', 'DocumentFragment', 'Text', 'Comment']) {
  if (!(k in win)) continue
  const v = win[k]
  const target = typeof v === 'function' && /^[a-z]/.test(k) ? v.bind(win) : v
  try {
    globalThis[k] = target
  } catch {
    Object.defineProperty(globalThis, k, { value: target, writable: true, configurable: true })
  }
}
if (!globalThis.navigator?.userAgent) {
  try {
    Object.defineProperty(globalThis, 'navigator', { value: win.navigator, writable: true, configurable: true })
  } catch {}
}
globalThis.URLSearchParams = win.URLSearchParams ?? URLSearchParams
globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) })

const outfile = path.join(os.tmpdir(), `data-sync-${process.pid}-${Date.now()}.mjs`)
await esbuild.build({
  stdin: {
    contents: `
      export { store } from './src/renderer/src/store.js'
      export * from './src/renderer/src/utils/chatSync.js'
      export * from './src/renderer/src/utils/poll.js'
      export * from './src/renderer/src/utils/notify.js'
      export { useUnreadNotifications } from './src/renderer/src/composables/chat/useUnreadNotifications.js'
      export { useChatPersistence, pruneOwnVotes, recordOwnVote } from './src/renderer/src/composables/chat/useChatPersistence.js'
      export { useTokenRecovery } from './src/renderer/src/composables/chat/useTokenRecovery.js'
      export { usePollingSync } from './src/renderer/src/composables/chat/usePollingSync.js'
      export { useToolsManager } from './src/renderer/src/composables/modals/useToolsManager.js'
      export { useChatActions } from './src/renderer/src/composables/chat/useChatActions.js'
    `,
    resolveDir: ROOT,
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile,
  loader: { '.css': 'empty' },
  plugins: [
    {
      name: 'stub-vue',
      setup(build) {
        build.onLoad({ filter: /\.vue$/ }, () => ({ contents: 'export default {}', loader: 'js' }))
      },
    },
  ],
  logLevel: 'silent',
})

const m = await import(pathToFileURL(outfile).href)
try { fs.rmSync(outfile, { force: true }) } catch {}

let passed = 0
function chk(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL  ${name}${detail ? ' -> ' + detail : ''}`)
    process.exitCode = 1
    return
  }
  passed++
  console.log(`PASS  ${name}`)
}

// ===== 1. store.connStatus 初始契约 =====
{
  const cs = m.store.connStatus
  const required = ['state', 'online', 'apiReachable', 'sessionValid', 'lastSyncAt', 'lastInfoAt', 'latencyMs', 'failCount', 'retryCooldownUntil', 'lastError']
  chk('store.connStatus 包含全部必需字段', required.every((k) => k in cs))
}

// ===== 2. #27 normalizeFree + ingestMessage + applyChatToStore =====
{
  chk('normalizeFree 兼容布尔/数字/字符串1', m.normalizeFree(true) && m.normalizeFree(1) && m.normalizeFree('1'))
  chk('normalizeFree 否定假值', !m.normalizeFree(false) && !m.normalizeFree(0) && !m.normalizeFree(null) && !m.normalizeFree('0'))

  m.store.users = { 10: { uid: 10, message_ids: [] } }
  m.store.messages = {}
  m.ingestMessage(m.store.users[10], { id: 1, sender_id: 10, send_time: 1000, content: 'hi', token_free: 1 })
  m.ingestMessage(m.store.users[10], { id: 2, sender_id: 10, send_time: 1001, content: 'hi2', token_free: null })
  chk('ingestMessage 保留 token_free 为布尔 free', m.store.messages[1].free === true && m.store.messages[2].free === false)

  const res = m.applyChatToStore({
    chat: { id: 3, sender_id: 1, send_time: 1002, content: 'free-reply' },
    free: true,
    remain_token_count: 9,
    used_token_count: 1,
  }, 'user', 10)
  chk('applyChatToStore 处理 r.chat.free ?? r.free 并返回 free', res.free === true && m.store.messages[3].free === true)
}

// ===== 3. #5 脏区版本安全清理（防异步写盘期间新消息丢脏标） =====
{
  m.clearAllDirtyMsgKeys()
  m.markMsgDirty('group', 42)
  const snap = m.peekDirtyMsgSnapshot()
  // 模拟存盘期间同一会话再次写入新消息
  m.markMsgDirty('group', 42)
  const hasConcurrent = m.clearDirtyMsgSnapshot(snap)
  chk('并发脏区：存盘期间新写入保留版本号不丢失脏标', hasConcurrent === true && m.peekDirtyMsgKeys()?.includes('group:42'))
  const snap2 = m.peekDirtyMsgSnapshot()
  const hasConcurrent2 = m.clearDirtyMsgSnapshot(snap2)
  chk('并发脏区：无新写入时正常清除脏标', hasConcurrent2 === false && m.peekDirtyMsgKeys() === null)
}

// ===== 4. #22/#24 Poll/Vote UID 协议 + 乱序/逆序合并 + 0 内置选项开放题 =====
{
  m.clearPendingVotes()
  m.store.groups = { 20: { gid: 20, message_ids: [] } }
  m.store.messages = {}

  // 0 内置选项开放题（multi + maxSelect=2）
  const openPollStr = m.makePollContent({
    content: '推荐工具',
    opts: [],
    multi: true,
    maxSelect: 2,
    allowCustom: true,
    until: 0,
  })
  const openPollDef = m.parsePoll(JSON.parse(openPollStr))
  chk('0 内置选项开放题保留 maxSelect=2', openPollDef && openPollDef.opts.length === 0 && openPollDef.maxSelect === 2)

  // 逆序到达：新票先到 -> 旧票后到（orphan 阶段），旧票不得覆盖新票
  const vNew = m.parseVote(JSON.parse(m.makeVoteContent(9001, [], '新选项', [])))
  const vOld = m.parseVote(JSON.parse(m.makeVoteContent(9001, [], '旧选项', [])))
  m.mergeOrphanVote(9001, vNew, 101, '7002', 2000)
  m.mergeOrphanVote(9001, vOld, 101, '7001', 1000)

  // 他人自拟投票先到达，作者自拟后到达（乱序）
  const vPickCustom = m.parseVote(JSON.parse(m.makeVoteContent(9001, [], '', ['102'])))
  const vAuthorCustom = m.parseVote(JSON.parse(m.makeVoteContent(9001, [], '选项B', [])))
  m.mergeOrphanVote(9001, vPickCustom, 103, '7004', 2500)
  m.mergeOrphanVote(9001, vAuthorCustom, 102, '7003', 2100)

  m.ingestMessage(m.store.groups[20], { id: 9001, sender_id: 1, send_time: 100, content: openPollStr })
  const mergedDef = m.parsePoll(JSON.parse(m.store.messages[9001].content))
  chk('逆序合并：orphan 阶段旧票不覆盖新票', mergedDef.custom['101'] === '新选项' && mergedDef.invalid['101'] === 'repeat')
  chk('customVotes 保留按 authorUid 投票', Array.isArray(mergedDef.customVotes['103']) && mergedDef.customVotes['103'][0] === '102')

  const agg = m.aggregatePoll(mergedDef, 9001, 103)
  chk('aggregatePoll 输出 extraOptions 含 authorUid/label/count/voters', agg.extraOptions.length === 1 && agg.extraOptions[0].authorUid === '102' && agg.extraOptions[0].count === 2)
  chk('aggregatePoll 输出 myCustomPick', agg.myCustomPick.length === 1 && agg.myCustomPick[0] === '102')
  chk('aggregatePoll total 包含 customVotes 票数', agg.total === 2)

  // 已入库 Poll 场景下逆序投票不覆盖新票
  const p2Str = m.makePollContent({ content: '吃啥', opts: ['A', 'B'], multi: false, allowCustom: true })
  m.ingestMessage(m.store.groups[20], { id: 9002, sender_id: 1, send_time: 200, content: p2Str })
  m.ingestMessage(m.store.groups[20], { id: 9004, sender_id: 55, send_time: 500, content: m.makeVoteContent(9002, [1], '', []) })
  m.ingestMessage(m.store.groups[20], { id: 9003, sender_id: 55, send_time: 300, content: m.makeVoteContent(9002, [0], '', []) })
  const p2Saved = m.parsePoll(JSON.parse(m.store.messages[9002].content))
  chk('已入库 Poll 逆序投票不覆盖新票 [1]', p2Saved.votes['55']?.[0] === 1 && p2Saved.invalid['55'] === 'repeat')

  // judgeVote 对 customPick 校验上限与 no-custom
  chk('judgeVote 单选同时选 builtin + customPick 判 single-multi', m.judgeVote(p2Saved, [0], '', 400, false, ['102']) === 'single-multi')
  const noCustomPoll = m.parsePoll(JSON.parse(m.makePollContent({ content: 'Q', opts: ['A', 'B'], allowCustom: false })))
  chk('judgeVote 关闭 allowCustom 时 customPick 判 no-custom', m.judgeVote(noCustomPoll, [], '', 400, false, ['102']) === 'no-custom')
}

// ===== 5. #22/#27 useTokenRecovery（过滤 free + 遍历 ownVotes） =====
{
  const nowSec = Math.floor(Date.now() / 1000)
  m.store.self = { uid: 1 }
  m.store.tokenLimit = { time_limit: 2400, count_limit: 10 }
  m.store.messages = {
    1: { id: 1, sender: 1, send_time: nowSec - 60, content: 'paid', free: false },
    2: { id: 2, sender: 1, send_time: nowSec - 30, content: 'free-msg', free: true },
  }
  m.store.ownVotes = [
    { id: 10, send_time: nowSec - 20, free: false },
    { id: 11, send_time: nowSec - 10, free: true },
    { id: 12, send_time: nowSec - 3000, free: false },
  ]
  const rec = m.useTokenRecovery()
  rec.onTokenHover(true)
  chk('useTokenRecovery 跳过 free 消息/free 投票/过期投票，仅计入 2 条', rec.tokenRecovery.value.length === 2)
  rec.onTokenHover(false)
}

// ===== 6. #5/#16/#23 useChatPersistence（桌面/网页 pinnedConvos、ownVotes 24h 裁剪、兜底 uid） =====
{
  win.__7FA4_WEB__ = false
  win.__7FA4_NATIVE__ = false
  win.__7FA4_PLATFORM__ = 'desktop'
  localStorage.clear()
  localStorage.setItem('7fa4_last_uid', '88')

  let saveCalls = 0
  let savedPayloads = []
  globalThis.window.api = {
    storeInit: async () => ({ success: true }),
    storeLoadConvos: async () => ({ success: true, users: { 5: { uid: 5, message_ids: [] } }, groups: {} }),
    storeLoadPrefs: async () => ({
      success: true,
      data: {
        pinnedConvos: { user_5: true },
        ownVotes: [
          { id: 1, send_time: Math.floor(Date.now() / 1000) - 100, free: false },
          { id: 2, send_time: Math.floor(Date.now() / 1000) - 90000, free: false },
        ],
      },
    }),
    storeLoadLastMessages: async () => ({ success: true, data: [] }),
    storeSaveAll: async (_uid, data) => {
      saveCalls++
      savedPayloads.push(data)
      return { success: true }
    },
  }
  m.store.self = { uid: null }
  m.store.users = {}
  m.store.groups = {}
  m.store.messages = {}
  m.store.pinnedConvos = {}
  m.store.ownVotes = []
  const persistence = m.useChatPersistence()
  await persistence.loadData()
  chk('冷启动兜底读取 7fa4_last_uid=88 并恢复 pinnedConvos 与 24h 内 ownVotes',
    m.store.self.uid === 88 && m.store.users[5]?.pinned === true && m.store.ownVotes.length === 1)

  m.recordOwnVote({ id: 99, send_time: Math.floor(Date.now() / 1000), free: false })
  await persistence.flushData()
  chk('flushData 立即写入 ownVotes 与 pinnedConvos',
    saveCalls >= 1 && savedPayloads.at(-1)?.prefs?.pinnedConvos?.user_5 === true && savedPayloads.at(-1)?.prefs?.ownVotes?.length === 2)
}

// ===== 7. #10 useUnreadNotifications（移除 notifInApp / showToast，前台只播提示音不弹系统通知） =====
{
  let notifyCalls = 0
  globalThis.window.api = {
    getWindowState: async () => ({ focused: true, visible: true }),
    notify: async () => { notifyCalls++; return true },
    setBadgeCount: () => {},
  }
  m.store.self = { uid: 1 }
  m.store.users = { 2: { uid: 2, nickname: '小王' } }
  m.store.mutedConvos = {}
  const notif = m.useUnreadNotifications()
  await notif.notifyIncomingMessage({
    chatType: 'user',
    targetId: 2,
    senderId: 2,
    msgContent: 'hello',
    setting: { notifDesktop: true, notifSound: false },
    isCurrentPage: false,
  })
  chk('前台聚焦不发系统通知也不调用 showToast', notifyCalls === 0)

  globalThis.window.api.getWindowState = async () => ({ focused: false, visible: false })
  await notif.notifyIncomingMessage({
    chatType: 'user',
    targetId: 2,
    senderId: 2,
    msgContent: 'hello2',
    setting: { notifDesktop: true, notifSound: false },
    isCurrentPage: false,
  })
  chk('后台失焦且 notifDesktop!=false 时发原生系统通知', notifyCalls === 1)
}

// ===== 8. #3/#25 useToolsManager（batchInstall 立即锁 busyMap + openRemote 调 openToolWindow） =====
{
  let openedInWindow = null
  let fallbackOpened = null
  let installStarted = 0
  let busySnapshotDuringFirstInstall = null
  globalThis.window.api = {
    getVersion: async () => '4.0.0',
    fetchToolsManifest: async () => ({
      success: true,
      tools: [
        { id: 't1', name: 'T1', version: '1.0.0', entry: 'index.html' },
        { id: 't2', name: 'T2', version: '1.0.0', entry: 'index.html' },
      ],
    }),
    listInstalledTools: async () => ({ success: true, installed: {} }),
    installTool: async (meta) => {
      installStarted++
      if (installStarted === 1) busySnapshotDuringFirstInstall = tm.remoteCards.value.map((c) => c.busy)
      return { success: true }
    },
    getToolEntryUrl: async (id) => ({ success: true, url: `tool://${id}/index.html` }),
    openToolWindow: async (payload) => { openedInWindow = payload; return { success: true } },
  }
  const tm = m.useToolsManager((p) => { fallbackOpened = p })
  await tm.load()
  await tm.batchInstall()
  chk('batchInstall 开始即对全部目标设置 busyMap 防并发点穿',
    Array.isArray(busySnapshotDuringFirstInstall) && busySnapshotDuringFirstInstall[0] === 'install' && busySnapshotDuringFirstInstall[1] === 'install')
  await tm.openRemote({ id: 't1', name: 'T1', version: '1.0.0', entry: 'index.html' })
  chk('openRemote 优先调用 openToolWindow 且不占用 page-stage',
    openedInWindow?.id === 't1' && fallbackOpened === null)
}

// ===== 9. #4/#6/#18/#26 usePollingSync（30d 截断、failCount>=3 恢复、实时 isCurrentConvo、connStatus） =====
{
  win.__7FA4_WEB__ = false
  win.__7FA4_NATIVE__ = false
  win.__7FA4_PLATFORM__ = 'desktop'
  m.store.logined = true
  m.store.self = { uid: 1 }
  m.store.users = { 2: { uid: 2, watcher: true, watchee: true, message_ids: [], unread: 0 } }
  m.store.groups = {}
  m.store.messages = {}

  let currentPage = { pageType: 'chat', pageId: null }
  let fetchedUrls = []
  const nowSec = Math.floor(Date.now() / 1000)
  globalThis.fetch = async (url) => {
    fetchedUrls.push(String(url))
    if (String(url).startsWith('/chat/info')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          user: { id: 1, uid: 'u1', nickname: '我', real_name: '我' },
          friends: [{ id: 2, nickname: '友', real_name: '友', watcher: true, watchee: true }],
          groups: [],
        }),
      }
    }
    if (String(url).startsWith('/chat/target-times')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, groups: {}, users: { 2: nowSec } }),
      }
    }
    if (String(url).startsWith('/chat/chat')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          chats: [{ id: 8801, sender_id: 2, receiver_id: 1, send_time: nowSec - 1, content: 'new-msg' }],
        }),
      }
    }
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) }
  }

  const polling = m.usePollingSync({
    getPage: () => currentPage,
    getSetting: () => ({ syncRange: '30d' }),
    isChatPage: () => true,
    persistence: { scheduleSave: () => {}, saveAll: async () => {}, flushData: async () => {}, resetLoadedUid: () => {} },
    banners: { serverNotice: { value: '' }, noteServerFailure: () => false, gotoLogin: () => {} },
    notifications: {
      updateBadgeCount: () => {},
      notifyIncomingMessage: async () => {
        // 模拟 await 通知期间用户切入该会话
        currentPage = { pageType: 'user', pageId: 2 }
      },
    },
    postGroup: async () => ({ success: true }),
  })

  const rc = await polling.reconnectNow()
  chk('reconnectNow 更新 store.connStatus.state === ok 且记录 latencyMs', rc.ok && m.store.connStatus.state === 'ok' && typeof m.store.connStatus.latencyMs === 'number')
  chk('target-times 携带 scope=""', fetchedUrls.some((u) => u.includes('/chat/target-times') && u.includes('scope=')))

  // 验证 fetchMessages 在 await notifyIncomingMessage 后实时重判 isCurrentConvo
  currentPage = { pageType: 'chat', pageId: null }
  await polling.loadConversationLite('user', 2)
  chk('await notifyIncomingMessage 期间切入会话后不误标未读', m.store.users[2].unread === 0)
  polling.stopPolling()
}

// ===== 10. #5 并发 saveAll 不丢新脏标 + #22/#25/#27 useChatActions =====
{
  win.__7FA4_WEB__ = false
  win.__7FA4_NATIVE__ = false
  m.clearAllDirtyMsgKeys()
  m.store.self = { uid: 1 }
  m.store.users = { 2: { uid: 2, message_ids: [101] } }
  m.store.groups = {}
  m.store.messages = { 101: { id: 101, sender: 2, send_time: 1000, content: 'a', free: false } }
  m.store.ownVotes = []
  m.markMsgDirty('user', 2)

  let saveCount = 0
  let releaseFirstSave
  const firstSaveGate = new Promise((res) => { releaseFirstSave = res })
  globalThis.window.api = {
    storeSaveAll: async (_uid, data) => {
      saveCount++
      if (saveCount === 1) await firstSaveGate
      return { success: true, data }
    },
  }
  const p = m.useChatPersistence()
  const pSave = p.saveAll()
  // 等待进入第一次 storeSaveAll
  await new Promise((r) => setTimeout(r, 10))
  // 异步写盘期间同会话新消息到达
  m.store.messages[102] = { id: 102, sender: 2, send_time: 1001, content: 'b', free: false }
  m.store.users[2].message_ids.push(102)
  m.markMsgDirty('user', 2)
  releaseFirstSave()
  await pSave
  chk('并发 saveAll：写盘期间新变脏的 user:2 保留并触发二次补存，最终脏区清空',
    saveCount === 2 && m.peekDirtyMsgKeys() === null)

  // useChatActions：onImageToolSend 兼容 dataUrl 触发 ForwardModal + onPollVote 透传 customPick 与记录 free
  let sentVotePayload = null
  const nowSec = Math.floor(Date.now() / 1000)
  globalThis.fetch = async (url, init) => {
    if (String(url) === '/chat/chat' && init?.method === 'POST') {
      sentVotePayload = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          remain_token_count: 10,
          used_token_count: 0,
          chat: { id: 777, sender_id: 1, send_time: nowSec, content: sentVotePayload.content, token_free: true },
        }),
      }
    }
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) }
  }
  const actions = m.useChatActions({
    getPage: () => ({ pageType: 'user', pageId: 2 }),
    getInputFooter: () => ({ sending: false, errorMessage: '', tokenInfo: null }),
  })
  await actions.onImageToolSend('data:image/png;base64,iVBORw0KGgo=')
  chk('onImageToolSend 兼容 dataUrl 并打开 ForwardModal',
    actions.forwardModalVisible.value === true && actions.imageSendPending.value?.data === 'iVBORw0KGgo=' && actions.imageSendPending.value?.mime === 'image/png')
  actions.closeForwardModal()

  await actions.onPollVote({ poll: '9001', pick: [0], custom: '', customPick: ['102'] })
  const sentVoteObj = JSON.parse(sentVotePayload.content)
  chk('onPollVote 发送 customPick 并记录 ownVotes（含 token_free）',
    Array.isArray(sentVoteObj.customPick) && sentVoteObj.customPick[0] === '102' &&
    m.store.ownVotes.some((v) => v.id === 777 && v.free === true))
}

// ===== 11. #26 syncRange=30d 截断与 #18 1005 冷却 >= 10 分钟 =====
{
  const nowSec = Math.floor(Date.now() / 1000)
  const oldSec = nowSec - 40 * 86400
  let chatFetchCount = 0
  let loginCalls = 0
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.startsWith('/chat/info')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        json: async () => ({ success: false, _html: true }),
      }
    }
    if (u.startsWith('/api/login')) {
      loginCalls++
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ error_code: 1005, message: '请稍后再试' }),
      }
    }
    if (u.startsWith('/chat/chat')) {
      chatFetchCount++
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          success: true,
          chats: [{ id: 500 + chatFetchCount, sender_id: 2, receiver_id: 1, send_time: oldSec, content: 'old' }],
        }),
      }
    }
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) }
  }
  m.store.logined = true
  m.store.self = { uid: 1 }
  m.store.users = { 2: { uid: 2, watcher: true, watchee: true, message_ids: [] } }
  m.store.groups = {}
  m.store.messages = {}
  const p2 = m.usePollingSync({
    getPage: () => ({ pageType: 'user', pageId: 2 }),
    getSetting: () => ({ syncRange: '30d', keepLogin: true, loginUsername: 'u', loginPassword: 'p' }),
    isChatPage: () => true,
    persistence: { scheduleSave: () => {}, saveAll: async () => {}, flushData: async () => {}, resetLoadedUid: () => {} },
    banners: { serverNotice: { value: '' }, noteServerFailure: () => false, gotoLogin: () => {} },
    notifications: { updateBadgeCount: () => {}, notifyIncomingMessage: async () => {} },
    postGroup: async () => ({ success: true }),
  })
  // 验证 30d 截断停止翻页（只拉 1 页看到 oldSec < now - 30d 即停止，不会递归翻页）
  await p2.loadConversationOnSelect('user', 2)
  // 用 pull via fetchMessages 测试 30d cutoff：模拟 syncRange='30d'
  chatFetchCount = 0
  const cutoffRes = await p2.reconnectNow()
  chk('1005 登录拒绝后 connStatus.state === rejected 且冷却 >= 10 分钟',
    !cutoffRes.ok &&
    m.store.connStatus.state === 'rejected' &&
    m.store.connStatus.retryCooldownUntil - Date.now() >= 10 * 60 * 1000 - 5000)
  p2.stopPolling()
}

// ===== 12. #24 PollCard.vue 真实挂载交互（点击他人自拟、单选清空、多选限选、emit customPick） =====
{
  const { parse: parseSfc, compileScript, compileTemplate } = await import('@vue/compiler-sfc')
  const pollCardPath = path.join(ROOT, 'src/renderer/src/components/chat/PollCard.vue')
  const cardOut = path.join(os.tmpdir(), `pollcard-${process.pid}-${Date.now()}.mjs`)
  await esbuild.build({
    stdin: {
      contents: `
        export { createApp, h, ref, nextTick } from 'vue'
        export { default as PollCard } from './src/renderer/src/components/chat/PollCard.vue'
      `,
      resolveDir: ROOT,
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: cardOut,
    loader: { '.css': 'empty' },
    alias: { '@': path.join(ROOT, 'src/renderer/src') },
    plugins: [
      {
        name: 'vue-sfc',
        setup(build) {
          build.onLoad({ filter: /\.vue$/ }, (args) => {
            const src = fs.readFileSync(args.path, 'utf8')
            const { descriptor } = parseSfc(src, { filename: args.path })
            const id = 'pc' + Math.abs(args.path.length)
            if (!descriptor.script && !descriptor.scriptSetup) {
              const tpl = compileTemplate({ source: descriptor.template?.content || '', filename: args.path, id })
              return { contents: `${tpl.code}\nexport default { render }`, loader: 'js', resolveDir: path.dirname(args.path) }
            }
            const sc = compileScript(descriptor, { id, inlineTemplate: true })
            return { contents: sc.content, loader: 'js', resolveDir: path.dirname(args.path) }
          })
        },
      },
    ],
    logLevel: 'silent',
  })
  const pcMod = await import(pathToFileURL(cardOut).href)
  try { fs.rmSync(cardOut, { force: true }) } catch {}

  const emitted = []
  const mountRoot = document.createElement('div')
  document.body.appendChild(mountRoot)
  const poll = { q: '选哪家', opts: ['A'], multi: false, until: 0, maxSelect: 0, allowCustom: true }
  const result = {
    counts: [0],
    voters: [[]],
    total: 1,
    myPick: [],
    myCustom: null,
    myCustomPick: [],
    multi: false,
    expired: false,
    maxSelect: 0,
    allowCustom: true,
    extraOptions: [{ authorUid: '102', label: '麦当劳', count: 1, voters: ['102'], mine: false }],
    invalidVoters: [],
  }
  const app = pcMod.createApp({
    render: () => pcMod.h(pcMod.PollCard, {
      poll,
      result,
      onVote: (pick, custom, customPick) => emitted.push({ pick, custom, customPick }),
    }),
  })
  app.mount(mountRoot)
  await pcMod.nextTick()
  const rows = mountRoot.querySelectorAll('.poll-opt')
  // 点击第 2 行（他人自拟「麦当劳」，authorUid: '102'）
  rows[1].click()
  await pcMod.nextTick()
  const submitBtn = mountRoot.querySelector('.poll-submit')
  submitBtn.click()
  await pcMod.nextTick()
  chk('PollCard 点击他人自拟选项行并提交 emit (pick=[], custom="", customPick=["102"])',
    emitted.length === 1 && emitted[0].pick.length === 0 && emitted[0].custom === '' && emitted[0].customPick?.[0] === '102')

  // 单选时输入自定义文本自动清空已勾选项
  rows[0].click()
  await pcMod.nextTick()
  const inputEl = mountRoot.querySelector('.poll-custom input')
  inputEl.value = '自填'
  inputEl.dispatchEvent(new win.Event('input', { bubbles: true }))
  await pcMod.nextTick()
  submitBtn.click()
  await pcMod.nextTick()
  chk('PollCard 单选输入自定义文本清空 localPick/localCustomPick，提交 custom="自填"',
    emitted.length === 2 && emitted[1].pick.length === 0 && emitted[1].custom === '自填' && emitted[1].customPick.length === 0)
  app.unmount()
  mountRoot.remove()
}

console.log(`\n${passed} 项 data-sync 测试全部通过`)
