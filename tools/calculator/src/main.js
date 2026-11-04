/**
 * 计算器工具入口。
 *
 * 这个工具是迁移难度最低的：CalculatorTool.vue 只依赖 calcEngine.js / useNarrow / CSS，
 * 不访问 window.api，也不读宿主 store。桥接客户端仍然第一个 import，
 * 保持 6 个工具入口形态一致，后续统一迁移时不用回头改。
 */
import '../../shared/bridge-client.js'
import '../../shared/tool-base.css'

import { createApp } from 'vue'
import CalculatorTool from '../../../src/renderer/src/views/tools/calculator/CalculatorTool.vue'

createApp(CalculatorTool).mount('#app')
