// 挂载真实 ChatView 的 setup，用模拟服务端验证跨轮补拉，不依赖真实账号或网络。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const win = new Window({ url: 'https://example.com/' })
win.document.write('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'navigator', 'localStorage', 'Element', 'HTMLElement', 'SVGElement']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? win : win[key], configurable: true })
}
window.api = {
  loadSetting: async () => ({}), saveSetting: async () => ({ success: true }),
  getVersion: async () => '3.8.1', windowIsMaximized: async () => false,
  onWindowMaximized: () => () => {}, onNotifClick: () => () => {}, onAppFlushBeforeClose: () => () => {},
  getWindowState: async () => ({ focused: true, visible: true }), setBadgeCount: () => {},
  storeSaveAll: async () => ({ success: true }), clearSessionCookies: async () => {},
}
globalThis.fetch = async () => { throw new Error('Unexpected network request') }

const outfile = path.join(os.tmpdir(), `message-backfill-${process.pid}-${Date.now()}.mjs`)
let app
try {
  await esbuild.build({
    stdin: {
      contents: `
        export { default as ChatView } from './src/renderer/src/views/ChatView.vue'
        export { createApp, nextTick } from 'vue'
        export { store } from './src/renderer/src/store.js'
        export { takeDirtyMsgKeys } from './src/renderer/src/utils.js'
      `,
      resolveDir: root,
      loader: 'js',
    },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile,
    loader: { '.css': 'empty' },
    define: {
      'process.env.NODE_ENV': '"test"',
      __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    plugins: [{
      name: 'chat-script',
      setup(build) {
        build.onLoad({ filter: /\.vue$/ }, ({ path: filename }) => {
          if (path.basename(filename) !== 'ChatView.vue') return { contents: 'export default {}' }
          const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })
          assert.equal(errors.length, 0)
          const compiled = compileScript(descriptor, { id: 'message-backfill', genDefaultAs: 'ChatView' })
          return {
            contents: compiled.content + '\nChatView.render = () => null; export default ChatView;',
            resolveDir: path.dirname(filename), loader: 'js',
          }
        })
      },
    }],
    logLevel: 'silent',
  })
  const { ChatView, createApp, nextTick, store, takeDirtyMsgKeys } = await import(pathToFileURL(outfile).href)
  app = createApp(ChatView)
  const vueErrors = []
  app.config.errorHandler = error => vueErrors.push(error)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const component = app.mount(host).$.setupState
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
  assert.deepEqual(vueErrors, [])

  let messages, requests, failRequest, nextId, waitForResponse
  const baseTime = Math.floor(Date.now() / 1000) - 10000
  const response = data => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => data })
  function reset() {
    component.backfillJobs.clear()
    component.lastSendTimes.clear()
    component.sameSecondRechecked.clear()
    component.infoLoopRunning = true
    component.setting = { notifSound: false }
    store.self.uid = 1
    store.logined = false
    store.users = { 3: { uid: 3, watcher: true, watchee: true, message_ids: [] } }
    store.groups = { 2: { gid: 2, message_ids: [] } }
    store.messages = {}
    takeDirtyMsgKeys()
    messages = []
    requests = []
    nextId = 1
    failRequest = () => false
    waitForResponse = null
    globalThis.fetch = async url => {
      const parsed = new URL(url, 'https://example.com')
      if (parsed.pathname === '/logout') return response({ success: true })
      assert.equal(parsed.pathname, '/chat/chat')
      const request = {
        type: parsed.searchParams.get('type'), id: Number(parsed.searchParams.get('target_id')),
        end: Number(parsed.searchParams.get('end_time')), take: Number(parsed.searchParams.get('take')),
      }
      requests.push(request)
      if (waitForResponse) await waitForResponse
      if (failRequest(request, requests.length)) return response({ success: false })
      const chats = messages.filter(m => m.direction === request.type && m.target === request.id && m.send_time < request.end)
        .sort((a, b) => b.send_time - a.send_time || b.id - a.id).slice(0, request.take)
      return response({ success: true, chats })
    }
  }
  function addMessages(type, target, count, { start = 1, sameSecond = false } = {}) {
    if (type === 'group') store.groups[target] ||= { gid: target, message_ids: [] }
    for (let i = 0; i < count; i++) {
      messages.push({
        id: nextId++, direction: type, target,
        sender_id: type === 'send_user' ? 1 : 3, receiver_id: type === 'group' || type === 'send_user' ? target : 1,
        send_time: baseTime + start + (sameSecond ? 0 : i), content: JSON.stringify({ type: 'text', content: `message ${nextId}` }),
      })
    }
  }
  async function drain() {
    for (let round = 0; component.backfillJobs.size && round < 50; round++) await component.resumeBackfills()
    assert.equal(component.backfillJobs.size, 0, '所有补拉任务应完成')
    assert.deepEqual(Object.keys(store.messages).map(Number).sort((a, b) => a - b), messages.map(m => m.id).sort((a, b) => a - b))
    for (const target of [...Object.values(store.groups), ...Object.values(store.users)]) {
      assert.equal(new Set(target.message_ids).size, target.message_ids.length, '不能重复插入消息 ID')
    }
  }

  reset()
  addMessages('group', 2, 100)
  const first = await component.pullConversation('group', 2, false)
  assert.equal(first.done, false)
  assert.equal(Object.keys(store.messages).length, 44)
  const nextEnd = component.backfillJobs.get('g:2').group[0].end
  requests.length = 0
  await component.resumeBackfills()
  assert.equal(requests[0].end, Math.floor(nextEnd / 1000) + 1, '下一轮必须从未完成的页继续')
  await drain()
  console.log('PASS 100-message backlog resumes after the first 44 messages')

  reset()
  addMessages('user', 3, 125)
  addMessages('send_user', 3, 83, { start: 500 })
  await component.pullConversation('user', 3, false)
  const jobs = component.backfillJobs.get('u:3')
  assert.notEqual(jobs.user[0].end, jobs.send_user[0].end)
  await drain()
  console.log('PASS incoming and outgoing private messages retain separate cursors')

  reset()
  addMessages('group', 2, 100)
  failRequest = (request, index) => index === 2
  assert.equal((await component.pullConversation('group', 2, false)).ok, false)
  const failedPage = requests.at(-1)
  failRequest = () => true
  await component.resumeBackfills()
  assert.equal(component.backfillJobs.size, 1, '失败不能丢掉补拉任务')
  assert.deepEqual(requests.at(-1), failedPage)
  failRequest = () => false
  requests.length = 0
  await drain()
  assert.deepEqual(requests[0], failedPage)
  console.log('PASS failures preserve the exact page until a successful retry')

  for (const added of [3, 150]) {
    reset()
    addMessages('group', 2, 100)
    await component.pullConversation('group', 2, false)
    const oldCursor = { ...component.backfillJobs.get('g:2').group[0] }
    addMessages('group', 2, added, { start: 101 })
    await component.pullConversation('group', 2, false)
    assert.deepEqual(component.backfillJobs.get('g:2').group[0], oldCursor)
    await drain()
    console.log(`PASS ${added} newer messages do not overwrite the older backlog`)
  }

  reset()
  addMessages('group', 2, 1000)
  const fresh = await component.pullConversation('group', 2, true)
  assert.equal(fresh.done, false)
  assert.equal(requests.length, 4, '新会话补拉也应遵守每轮请求预算')
  await drain()
  console.log('PASS fresh conversations paginate across rounds within the request budget')

  reset()
  addMessages('group', 2, 20)
  addMessages('group', 2, 80, { start: 100, sameSecond: true })
  await component.pullConversation('group', 2, false)
  await drain()
  console.log('PASS a full second of messages expands the page before moving to older history')

  reset()
  addMessages('group', 2, 101, { start: 100, sameSecond: true })
  await component.pullConversation('group', 2, false)
  await component.resumeBackfills()
  assert.equal(Object.keys(store.messages).length, 100)
  assert.equal(component.backfillJobs.size, 1, '秒级游标超过单页容量时不能谎报完成')
  console.log('PASS second-level cursor saturation remains pending instead of claiming completion')

  addMessages('group', 2, 200, { start: 101 })
  await component.pullConversation('group', 2, false)
  for (let round = 0; round < 15; round++) await component.resumeBackfills()
  for (const message of messages.filter(m => m.send_time > baseTime + 100)) {
    assert.ok(store.messages[message.id], '同秒游标暂时不可前进时，也必须继续处理新的缺口')
  }
  assert.equal(component.backfillJobs.size, 1)
  console.log('PASS a saturated cursor does not starve newer gaps in the same conversation')

  reset()
  for (const id of [2, 4, 5, 6]) {
    addMessages('group', id, 100)
    await component.pullConversation('group', id, false)
  }
  failRequest = request => request.id !== 6
  requests.length = 0
  await component.resumeBackfills()
  assert.equal(requests.some(r => r.id === 6), false)
  await component.resumeBackfills()
  assert.equal(requests.some(r => r.id === 6), true, '失败会话不能一直占住补拉预算')
  failRequest = () => false
  await drain()
  console.log('PASS failed conversations rotate so other backlogs can progress')

  reset()
  addMessages('group', 2, 100)
  await component.pullConversation('group', 2, false)
  let release
  waitForResponse = new Promise(resolve => { release = resolve })
  const inFlight = component.resumeBackfills()
  await component.logout()
  release()
  await inFlight
  assert.equal(component.backfillJobs.size, 0)
  assert.equal(Object.keys(store.messages).length, 0)
  assert.deepEqual(vueErrors, [])
  console.log('PASS logout clears pending work and ignores late responses')
  console.log('\nAll message backfill checks passed.')
} finally {
  app?.unmount()
  await win.happyDOM.close()
  fs.rmSync(outfile, { force: true })
}
