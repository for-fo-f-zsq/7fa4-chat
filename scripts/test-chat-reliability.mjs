// 编译真实 ChatView 和 utils，仅替换子组件视图与网络/存储接口。
// 验证登录失效提示、保存失败重试，以及异步保存期间新增消息不会漏存。
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
for (const key of ['window', 'document', 'navigator', 'localStorage', 'Element', 'HTMLElement', 'SVGElement']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? win : win[key], configurable: true })
}
window.api = {
  loadSetting: async () => ({}),
  getVersion: async () => '3.8.1',
  windowIsMaximized: async () => false,
  onWindowMaximized: () => () => {},
  onNotifClick: () => () => {},
  onAppFlushBeforeClose: () => () => {},
}
globalThis.fetch = async () => { throw new Error('Unexpected network request') }

const outfile = path.join(os.tmpdir(), `chat-reliability-${process.pid}-${Date.now()}.mjs`)
let app
try {
  await esbuild.build({
    stdin: {
      contents: `
        export { default as ChatView } from './src/renderer/src/views/ChatView.vue'
        export { createApp, nextTick } from 'vue'
        export { store } from './src/renderer/src/store.js'
        export { safeFetch, markMsgDirty, takeDirtyMsgKeys } from './src/renderer/src/utils.js'
      `,
      resolveDir: root,
      loader: 'js',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile,
    loader: { '.css': 'empty' },
    alias: { '@': path.join(root, 'src/renderer/src') },
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{
      name: 'chat-script',
      setup(build) {
        build.onLoad({ filter: /\.vue$/ }, ({ path: filename }) => {
          if (path.basename(filename) !== 'ChatView.vue') return { contents: 'export default {}' }
          const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })
          assert.equal(errors.length, 0)
          // 不编译模板，保留真实 setup 的全部绑定，便于驱动轮询与保存入口。
          const compiled = compileScript(descriptor, { id: 'chat-reliability', genDefaultAs: 'ChatView' })
          return {
            contents: compiled.content + '\nChatView.render = () => null; export default ChatView;',
            resolveDir: path.dirname(filename),
            loader: 'js',
          }
        })
      },
    }],
    logLevel: 'silent',
  })
  const { ChatView, createApp, nextTick, store, safeFetch, markMsgDirty, takeDirtyMsgKeys } = await import(pathToFileURL(outfile).href)
  app = createApp(ChatView)
  const vueErrors = []
  app.config.errorHandler = error => vueErrors.push(error)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const component = app.mount(host).$.setupState
  // 游客启动只加载偏好，不会启动聊天轮询；等待异步 mounted 钩子完成。
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
  assert.deepEqual(vueErrors, [])

  store.self.uid = 1
  store.groups = { 2: { gid: 2, message_ids: [] } }
  for (const mode of ['html', 'invalid-json']) {
    component.serverNotice = ''
    globalThis.fetch = async () => ({
      ok: true,
      headers: { get: () => mode === 'html' ? 'text/html' : 'application/json' },
      json: async () => { throw new SyntaxError('Unexpected HTML response') },
    })
    const response = await safeFetch('/chat/info')
    assert.equal(response._html, true)
    assert.equal((await response.json())._html, true)
    assert.equal(await component.probeTargetTimes(), null)
    assert.equal(component.serverNotice, '登录状态已失效，请重新登录')
    assert.equal(store.netError, false)
    console.log(`PASS session expiry: ${mode}`)
  }

  component.serverNotice = ''
  globalThis.fetch = async () => { throw new Error('offline') }
  assert.equal(await component.probeTargetTimes(), null)
  assert.equal(component.serverNotice, '')
  assert.equal(store.netError, true)
  globalThis.fetch = async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) })
  const response = await safeFetch('/chat/info')
  assert.equal(response._html, undefined)
  assert.equal((await response.json()).success, true)
  assert.equal(store.netError, false)
  console.log('PASS network failure stays distinct from session expiry; JSON success clears network error')

  const resetMessages = () => {
    takeDirtyMsgKeys()
    store.users = { 3: { uid: 3, message_ids: [101] } }
    store.groups = { 2: { gid: 2, message_ids: [102] } }
    store.messages = { 101: { id: 101, content: 'first' }, 102: { id: 102, content: 'group' } }
    store.drafts = {}
    markMsgDirty('user', 3)
    markMsgDirty('group', 2)
  }
  const expectSaveFailure = async () => {
    const errors = []
    const original = console.error
    console.error = (...args) => errors.push(args)
    try { await component.saveAll() } finally { console.error = original }
    assert.equal(errors.length, 1, '保存失败应记录诊断信息')
  }

  for (const mode of ['returned-failure', 'rejected-promise', 'missing-result', 'serialization-error']) {
    resetMessages()
    const calls = []
    window.api.storeSaveAll = async (uid, data) => {
      assert.equal(uid, 1)
      calls.push(data)
      if (mode === 'rejected-promise') throw new Error('write failed')
      return mode === 'missing-result' ? undefined : { success: false, error: 'write failed' }
    }
    if (mode === 'serialization-error') store.messages[101].content = 1n
    await expectSaveFailure()
    store.messages[101].content = 'first'
    window.api.storeSaveAll = async (uid, data) => { calls.push(data); return { success: true } }
    await component.saveAll()
    assert.deepEqual(Object.keys(calls.at(-1).messages).sort(), ['group:2', 'user:3'])
    assert.equal(calls.at(-1).messages['user:3'][0].content, 'first')
    await component.saveAll()
    assert.deepEqual(calls.at(-1).messages, {}, '成功保存后不应重复提交未变化的消息')
    console.log(`PASS save retry: ${mode}`)
  }

  for (const succeeds of [true, false]) {
    resetMessages()
    const calls = []
    let finish
    window.api.storeSaveAll = (uid, data) => {
      calls.push(data)
      return new Promise(resolve => { finish = resolve })
    }
    const pending = succeeds ? component.saveAll() : expectSaveFailure()
    store.messages[101].content = 'changed while saving'
    markMsgDirty('user', 3)
    store.groups[4] = { gid: 4, message_ids: [103] }
    store.messages[103] = { id: 103, content: 'new conversation' }
    markMsgDirty('group', 4)
    finish({ success: succeeds, error: succeeds ? undefined : 'write failed' })
    await pending
    window.api.storeSaveAll = async (uid, data) => { calls.push(data); return { success: true } }
    await component.saveAll()
    assert.equal(calls[0].messages['user:3'][0].content, 'first', '在途快照不可被新变化修改')
    assert.equal(calls[1].messages['user:3'][0].content, 'changed while saving')
    assert.equal(calls[1].messages['group:4'][0].id, 103)
    assert.equal('group:2' in calls[1].messages, !succeeds, '只重试失败批次，保留在途新增标记')
    assert.equal(takeDirtyMsgKeys(), null)
    console.log(`PASS changes during ${succeeds ? 'successful' : 'failed'} save`)
  }
  assert.deepEqual(vueErrors, [])
  console.log('\nAll chat reliability checks passed.')
} finally {
  app?.unmount()
  await win.happyDOM.close()
  fs.rmSync(outfile, { force: true })
}
