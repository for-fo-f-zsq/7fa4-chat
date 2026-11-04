/**
 * 计时器工具入口。
 *
 * 注意：timer/timerStore.js 在**模块求值阶段**就会访问 window.api（注册悬浮窗事件、
 * 查询悬浮窗是否已打开），并读取 localStorage 恢复上次配置。所以 bridge-client
 * 必须严格第一个 import —— 它会在 tool:init 到达之前先装好 window.api 代理，
 * 并把调用排队，端口就绪后再 flush，避免这些顶层调用丢失。
 */
import '../../shared/bridge-client.js'
import '../../shared/tool-base.css'

import { createApp } from 'vue'
import { applyUsersSnapshot } from '../../../src/renderer/src/utils.js'
import TimerTool from '../../../src/renderer/src/views/tools/timer/TimerTool.vue'

// 计时器需要用宿主用户名单选人：iframe 里没有主进程，向宿主要一份快照填进本地 store。
const bridge = window.__toolBridge
if (bridge && typeof bridge.getUsers === 'function') {
  bridge.getUsers().then((snapshot) => applyUsersSnapshot(snapshot)).catch(() => {})
}

createApp(TimerTool).mount('#app')
