/**
 * Graph Editor 工具入口。
 *
 * bridge-client 必须第一个 import：GraphEditor.vue 的依赖链（utils.js 等）在模块求值阶段
 * 就可能访问 window.api。
 */
import '../../shared/bridge-client.js'
import '../../shared/tool-base.css'

import { createApp } from 'vue'
import GraphTool from '../../../src/renderer/src/views/tools/graph/GraphTool.vue'

createApp(GraphTool).mount('#app')
