// 消息列表滚动状态机单测：覆盖首屏补拉/历史合并/微幅上滚/主动发送等场景
import { Window } from 'happy-dom'

const win = new Window({ url: 'https://jx.7fa4.cn:8888/' })
globalThis.window = win
globalThis.document = win.document
globalThis.Element = win.Element
globalThis.HTMLElement = win.HTMLElement
globalThis.SVGElement = win.SVGElement
globalThis.Node = win.Node
globalThis.getComputedStyle = win.getComputedStyle.bind(win)
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { ref, nextTick, defineComponent, createApp } = await import('vue')
const { useMessageScroll } = await import('../../src/renderer/src/composables/chat/useMessageScroll.js')
const { markOwnSentMsg } = await import('../../src/renderer/src/utils/chatSync.js')
const { scrollToY, cancelScrollToY } = await import('../../src/renderer/src/utils/motion.js')

const results = []
function chk(name, cond) { results.push([name, !!cond]) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function makeMockArea({ scrollHeight = 2000, clientHeight = 600, scrollTop = 1400 } = {}) {
  const el = document.createElement('div')
  let _scrollHeight = scrollHeight
  let _clientHeight = clientHeight
  let _scrollTop = scrollTop
  Object.defineProperty(el, 'scrollHeight', {
    get: () => _scrollHeight,
    set: (v) => { _scrollHeight = v },
    configurable: true,
  })
  Object.defineProperty(el, 'clientHeight', {
    get: () => _clientHeight,
    set: (v) => { _clientHeight = v },
    configurable: true,
  })
  Object.defineProperty(el, 'scrollTop', {
    get: () => _scrollTop,
    set: (v) => { _scrollTop = Math.max(0, Math.min(Number(v) || 0, Math.max(0, _scrollHeight - _clientHeight))) },
    configurable: true,
  })
  return el
}

function mountHarness(initialMsgs, { pageIdVal = 10, selfUidVal = 1, canLoadOlderVal = null } = {}) {
  const area = makeMockArea()
  const messageAreaEl = ref(area)
  const pageType = ref('group')
  const pageId = ref(pageIdVal)
  const visibleCount = ref(20)
  const canLoadOlder = ref(canLoadOlderVal)
  const currentMessages = ref(initialMsgs)
  const targetUser = ref(null)
  const targetGroup = ref({ gid: pageIdVal, message_ids: initialMsgs.map((m) => m.id) })

  let api
  const Host = defineComponent({
    setup() {
      api = useMessageScroll({
        messageAreaEl,
        pageType: () => pageType.value,
        pageId: () => pageId.value,
        selfUid: () => selfUidVal,
        visibleCount: () => visibleCount.value,
        canLoadOlder: () => canLoadOlder.value,
        currentMessages,
        targetUser,
        targetGroup,
        onLoadOlder: () => { visibleCount.value += 20 },
        onLoadAll: () => {},
        onEnsureExpanded: () => {},
      })
      return () => null
    },
  })
  const root = document.createElement('div')
  const app = createApp(Host)
  app.mount(root)
  return { area, api, pageId, visibleCount, currentMessages, unmount: () => app.unmount() }
}

try {
  // 场景1：打开已有消息（且最后一条是自己发的）→ 立刻上滑 → 延迟补全历史消息，不应回弹到底部
  {
    const initial = [
      { id: 100, sender: 2, send_time: 100 },
      { id: 101, sender: 1, send_time: 101 },
    ]
    const h = mountHarness(initial, { pageIdVal: 10, selfUidVal: 1 })
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    h.area.scrollTop = 500
    h.api.onScroll()
    h.currentMessages.value = [
      { id: 90, sender: 2, send_time: 90 },
      { id: 91, sender: 1, send_time: 91 },
      ...initial,
    ]
    await nextTick()
    await sleep(60)
    chk('场景1：已有自己收尾消息的会话补拉历史后保持上滑位置不回底', h.area.scrollTop === 500)
    h.unmount()
  }

  // 场景2：先到 user 消息 → 用户上滑 → 延迟到达自己历史 send_user 消息（尾 ID 变大），不应回底
  {
    const initial = [{ id: 100, sender: 2, send_time: 100 }]
    const h = mountHarness(initial, { pageIdVal: 11, selfUidVal: 1, canLoadOlderVal: true })
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    h.area.scrollTop = 400
    h.api.onScroll()
    h.currentMessages.value = [...initial, { id: 105, sender: 1, send_time: 105 }]
    await nextTick()
    await sleep(60)
    chk('场景2：Web 分两段加载历史 send_user 后保持上滑位置不回底', h.area.scrollTop === 400)
    h.unmount()
  }

  // 场景3：微幅上滑仍在 60px 阈值内，随后发生无向下位移的 scroll 事件不应清掉上滑意图
  {
    const initial = [{ id: 200, sender: 2, send_time: 200 }]
    const h = mountHarness(initial, { pageIdVal: 12, selfUidVal: 1 })
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    h.area.dispatchEvent(new win.WheelEvent('wheel', { deltaY: -40 }))
    h.area.scrollTop = 1370
    h.api.onScroll()
    // 模拟气泡折叠导致的零位移或 1px 抖动 scroll
    h.api.onScroll()
    h.currentMessages.value = [...initial, { id: 201, sender: 2, send_time: 201 }]
    await nextTick()
    await sleep(60)
    chk('场景3：60px 阈值内微幅上滑不会因后续无位移 scroll 被清空意图', h.area.scrollTop === 1370)
    h.unmount()
  }

  // 场景4：上滑状态下本端主动发送新消息，应回到底部
  {
    const initial = [{ id: 300, sender: 2, send_time: 300 }]
    const h = mountHarness(initial, { pageIdVal: 13, selfUidVal: 1 })
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    h.area.scrollTop = 300
    h.api.onScroll()
    markOwnSentMsg(301)
    h.currentMessages.value = [...initial, { id: 301, sender: 1, send_time: 301 }]
    await nextTick()
    await sleep(360)
    chk('场景4：上滑后本端主动发送消息触发平滑回底', h.area.scrollTop === 1400)
    h.unmount()
  }

  // 场景5：停在底部时收到好友新消息，应跟随回底
  {
    const initial = [{ id: 400, sender: 2, send_time: 400 }]
    const h = mountHarness(initial, { pageIdVal: 14, selfUidVal: 1 })
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    h.area.scrollHeight = 2200
    h.currentMessages.value = [...initial, { id: 401, sender: 2, send_time: 401 }]
    await nextTick()
    await sleep(360)
    chk('场景5：停在底部收到好友新消息正常吸底', h.area.scrollTop === 1600)
    h.unmount()
  }

  // 场景6：初始仅有 1 条末消息缓存，随后在头部补全历史消息（尾 ID 不变）且未上滑时应自动贴底
  {
    const initial = [{ id: 520, sender: 2, send_time: 520 }]
    const h = mountHarness(initial, { pageIdVal: 15, selfUidVal: 1 })
    h.area.scrollHeight = 400
    h.area.scrollTop = 0
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    h.area.scrollHeight = 2400
    const older = Array.from({ length: 19 }, (_, i) => ({ id: 501 + i, sender: 2, send_time: 501 + i }))
    h.currentMessages.value = [...older, ...initial]
    await nextTick()
    await sleep(60)
    chk('场景6：仅有 1 条缓存消息打开后头部补齐历史且未上滑时自动贴底', h.area.scrollTop === 1800)
    h.unmount()
  }

  // 场景7：默认打开贴底后图片异步加载撑高容器时应保持贴底；已上滑时图片加载不回底
  {
    const initial = [{ id: 600, sender: 2, send_time: 600 }]
    const h = mountHarness(initial, { pageIdVal: 16, selfUidVal: 1 })
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    h.area.scrollHeight = 2500
    const img = document.createElement('img')
    h.area.appendChild(img)
    img.dispatchEvent(new win.Event('load'))
    await nextTick()
    chk('场景7a：未上滑时图片加载撑高容器保持贴底', h.area.scrollTop === 1900)

    h.area.scrollTop = 400
    h.api.onScroll()
    h.area.scrollHeight = 2900
    img.dispatchEvent(new win.Event('load'))
    await nextTick()
    chk('场景7b：已主动上滑时图片加载不会拉回底部', h.area.scrollTop === 400)
    h.unmount()
  }

  // 场景8：cancelScrollToY 中断滚动时必须触发 Promise resolve，避免调用方 finally 挂起
  {
    const area = makeMockArea({ scrollHeight: 3000, clientHeight: 600, scrollTop: 0 })
    let settled = false
    const p = scrollToY(area, 2400, { duration: 260 }).then(() => { settled = true })
    cancelScrollToY(area)
    await Promise.race([p, sleep(50)])
    chk('场景8：cancelScrollToY 立即 resolve 等待中的 Promise', settled === true)
  }

  // 场景9：上滑期间新消息计入 pinnedGrow，回底时清零，不无限膨胀
  {
    const initial = Array.from({ length: 20 }, (_, i) => ({ id: 700 + i, sender: 2, send_time: 700 + i }))
    const h = mountHarness(initial, { pageIdVal: 17, selfUidVal: 1, canLoadOlderVal: true })
    h.area.scrollTop = 300
    h.api.onScroll()
    h.currentMessages.value = [
      ...initial,
      { id: 720, sender: 2, send_time: 720 },
      { id: 721, sender: 2, send_time: 721 },
    ]
    await nextTick()
    const grownCount = h.api.visibleMessages.value.length
    h.api.scrollToBottom()
    await nextTick()
    await sleep(320)
    chk('场景9：上滑增窗回底后 visibleMessages 恢复基线窗口大小', grownCount === 22 && h.api.visibleMessages.value.length === 20)
    h.unmount()
  }

  // 场景10：snapToBottom 后 scrollHeight 突增触发无向上位移的 onScroll，不能误锁 userScrolledUp，后续图片加载仍须贴底
  {
    const initial = [{ id: 800, sender: 2, send_time: 800 }]
    const h = mountHarness(initial, { pageIdVal: 18, selfUidVal: 1 })
    h.api.scrollToBottomInstant({ respectUser: true })
    await nextTick()
    // 模拟图片刚解码撑高容器，随后上一轮 snapToBottom 排队的异步 scroll 到达（curTop 未减小）
    h.area.scrollHeight = 2300
    h.api.onScroll()
    const img = document.createElement('img')
    h.area.appendChild(img)
    img.dispatchEvent(new win.Event('load'))
    await nextTick()
    chk('场景10：scrollHeight 撑高引发无上滑位移的 scroll 后，图片加载仍贴底且 isAtBottom=true', h.area.scrollTop === 1700 && h.api.isAtBottom.value === true)
    h.unmount()
  }

  // 场景11：平滑滚底动画进行途中图片解码撑高容器，应动态追随新底端而非停在旧高度
  {
    const initial = [{ id: 900, sender: 2, send_time: 900 }]
    const h = mountHarness(initial, { pageIdVal: 19, selfUidVal: 1 })
    h.area.scrollTop = 1000
    h.api.onScroll()
    h.area.scrollHeight = 2000
    h.api.scrollToBottom()
    await nextTick()
    await sleep(40)
    // 动画中途两张大图先后加载撑高容器
    h.area.scrollHeight = 2450
    const img = document.createElement('img')
    h.area.appendChild(img)
    img.dispatchEvent(new win.Event('load'))
    await sleep(340)
    chk('场景11：滚底动画途中媒体撑高仍动态追随到最新底端', h.area.scrollTop === 1850 && h.api.isAtBottom.value === true)
    h.unmount()
  }
} catch (e) {
  results.push(['EXCEPTION: ' + (e.message || String(e)), false])
}

const pass = results.filter(([, ok]) => ok).length
const total = results.length
for (const [name, ok] of results) console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
console.log(`\n${pass}/${total} 通过`)
process.exit(pass === total ? 0 : 1)
