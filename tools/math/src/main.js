/**
 * GeoGebra 工具入口。
 *
 * spec §5 规定：math 工具不挂 MathTool.vue（那个组件依赖 window.__7FA4_WEB__ 与
 * `geo://ggb/` 自定义协议，属于 Electron 内置页的做法），而是一个全屏 iframe 指向
 * 构建产物里的 geogebra/calculator.html。因此这里没有 Vue，只需要桥接客户端
 * （宿主仍可能下发主题 / getEnv，GeoGebra 页面本身在子 frame 里不受影响）。
 *
 * geogebra/ 目录由 scripts/build-tools.mjs 在 Vite 构建后从 tools/math/geogebra/
 * 原样复制过来，不在本模块的 import 图里。它只属于本工具，不随主程序安装包分发。
 */
import '../../shared/bridge-client.js'

// 兜底：万一宿主 / 构建链路对 iframe 的 src 做了改写或剥掉，运行时补上相对路径。
const frame = document.getElementById('ggb')
if (frame && !frame.getAttribute('src')) {
  frame.src = './geogebra/calculator.html'
}
