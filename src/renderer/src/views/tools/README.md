# 这里放的是「工具包源码」，不是客户端内置页面

客户端**不再内置任何工具页**。工具中心里的列表全部来自远端清单（GitLab generic package
`TOOLS/latest` 的 `tools.json`），点开的是下载安装到 `userData/tools/<id>/<version>/` 的静态包。

本目录下的组件之所以还在 `src/renderer`，是因为**它们就是工具包的唯一源码**：

```
tools/<id>/src/main.js
  → import ... from '../../../src/renderer/src/views/tools/<...>.vue'
  → scripts/build-tools.mjs 用 vite 打成 dist-tools/<id>/<version>/
  → scripts/publish-tools.mjs 上传，客户端从线上拉
```

所以维护方式只有一条链路：

1. 改本目录里的 `.vue` / `.css` / `.js`，并把 `tools/<id>/tool.json` 的 `version` +1
   （工具包按版本目录安装，版本号不变客户端会认为「已是最新」）；
2. `npm run tools:local` —— 构建 **并** 装进本机 `%APPDATA%/7fa4-chat/tools/`，
   重启或重新打开该工具就能看到效果（本地验证走这条）；
3. `npm run publish:tools`（发布后客户端在工具中心点「更新」即可）。

> 约定：改完工具一律先本地装好给人测试，不要只跑 `build:tools` 就说「改好了」——
> `dist-tools/` 只是构建产物，App 真正加载的是 `userData/tools/<id>/<version>/`。

## 不要做的事

- **不要**在 `src/renderer` 的其它地方 import 本目录的组件（例如再放回 `ChatView.vue`）。
  编进主包就等于多一份副本，且用户点开的仍是下载包，会出现「改了 src 却看不到效果」的错配。
- 本目录没有 import 时不会进主包 bundle，这是预期行为。
- **不要**手工改 `userData/tools/` 里的包：那是安装结果，下次安装会被整体替换；
  令牌类修改请改 `src/renderer/src/css/tokens.css`（工具包通过
  `tools/shared/tool-base.css` → `src/renderer/src/css/index.css` 复用同一套令牌）。

## math（GeoGebra）

`tools/math/src/main.js` 不 import 任何 Vue 组件，直接把 iframe 指向构建产物里的
`geogebra/calculator.html`（由 `scripts/build-tools.mjs` 从 `resources/geogebra/` 复制）。
原先只为内置页存在的 `math/MathTool.vue` 已随内置页一起删除。
