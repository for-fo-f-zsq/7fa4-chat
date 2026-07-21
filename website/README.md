# 7FA4 Chat — 官网

一个介绍 7FA4 Chat 的单页落地页，包含功能介绍、应用预览、版本下载与更新日志。
**没有构建步骤，没有需要维护的静态数据文件** —— 下载列表和更新日志都在浏览器里
直接从 GitLab 实时抓取，永远是最新状态。

```
website/
├── public/                       # 直接部署的纯静态站点
│   ├── index.html
│   ├── assets/
│   │   ├── css/style.css
│   │   ├── js/
│   │   │   ├── api.js            # 运行时 GitLab 爬虫（版本 / 制品 / CHANGELOG）
│   │   │   ├── main.js           # 页面交互 + 调用 api.js 渲染
│   │   │   └── data.js           # 静态内容（功能卡片文案）
│   │   └── icon.png / icon.ico
└── README.md
```

## 工作原理

页面加载时，`assets/js/api.js` 直接向 GitLab 发请求：

| 数据 | 接口 |
| --- | --- |
| 全部版本号 | `GET /api/v4/projects/663/packages`（自动翻页） |
| 每个版本的安装包 + 大小 + SHA-512 | `GET /api/v4/projects/663/packages/generic/7FA4-Chat/<ver>/latest*.yml` |
| 更新日志 | `GET /api/v4/projects/663/repository/files/CHANGELOG/raw?ref=main` |
| 项目信息（链接 / Star） | `GET /api/v4/projects/663` |

GitLab 这几个接口都返回 `Access-Control-Allow-Origin: *`，浏览器可跨域直连，无需代理。
版本列表与文件仓库是私有项目，所以用一个 **只读访问令牌**（`read_api`）放在 `api.js` 顶部。
令牌只能读取，没有写入权限。

## 本地预览

`public/` 是纯静态目录，任意静态服务器均可：

```bash
cd public
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

> 注意：用 `file://` 直接打开不会工作 —— fetch 跨域与相对路径需要 HTTP 服务。

## 部署

把 `public/` 整个目录上传到任意静态托管（Nginx / GitHub Pages / Vercel / Netlify …）。
**没有任何构建步骤**，发布新版客户端后页面会自动看到新版本。

## 设计要点

- 深色优先 + 玻璃拟态，附浅色主题切换（记忆在 `localStorage`）
- 渐变高光、滚动入场动画、指针跟随的卡片光晕
- 自动检测访客操作系统，默认推荐对应平台安装包
- 历史版本可展开，每个包附带 SHA-512 校验信息
- 完整响应式，支持移动端汉堡菜单
- 尊重 `prefers-reduced-motion`
- 数据加载中显示动画指示器，加载失败显示友好降级（并提供 GitLab 直链）

## 更换访问令牌

如果令牌需要轮换，编辑 `public/assets/js/api.js` 顶部的 `TOKEN` 常量即可：

```js
const TOKEN = 'glpat-xxxxxxxxxxxx';
```
