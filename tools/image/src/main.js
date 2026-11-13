/**
 * 图片编辑工具入口。
 *
 * bridge-client 必须第一个 import：ImageTool.vue 的依赖链（utils.js 等）在模块求值阶段
 * 就可能访问 window.api，而桥接客户端要在宿主 tool:init 之前就把代理装好。
 */
import '../../shared/bridge-client.js'
import '../../shared/tool-base.css'

import { createApp } from 'vue'
import ImageTool from '../../../src/renderer/src/views/tools/image/ImageTool.vue'

createApp(ImageTool).mount('#app')
