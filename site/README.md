# 7FA4 Chat 官网与反馈服务 (site)

本项目为 **7FA4 Chat 官网** 与 **用户反馈系统** 的轻量 Node.js 服务端，同时负责托管 **网页端 (Web Client)** 静态构建产物。

## 目录结构

```
site/
├── server.js               # 官网与统一反向代理服务（端口 5300）
├── feedback.js             # 反馈功能核心逻辑（API 处理、鉴权、数据持久化）
├── public/                 # 静态托管资源根目录
│   ├── index.html          # 官网主页（产品介绍、最新下载链接、更新日志、赞助者列表等）
│   ├── style.css           # 官网样式
│   ├── app.js              # 官网前端逻辑（调用 /api/downloads, /api/changelog 等）
│   ├── favicon.ico
│   ├── assets/             # 官网专有图片/图标资源
│   ├── feedback/           # 反馈系统独立页面
│   │   ├── index.html      # 意见反馈提交页（/feedback，供网页版或浏览器直接访问）
│   │   └── admin.html      # 反馈管理后台（/feedback/admin）
│   └── web/                # 网页版客户端部署目录（由 npm run build:web -- --copy-to-site 同步产物）
├── data/                   # 运行时数据存储目录（不入库）
│   └── feedback/
│       ├── items.json      # 反馈列表数据
│       ├── .secret         # 管理员会话签名密钥（首次自动生成）
│       └── attachments/    # 用户提交的截图附件
├── test/
│   └── local-check.js      # 本地联调测试套件
└── mock/                   # 界面与预览 mock 脚本/资源
```

## 核心职责划分

1. **官网 (Landing Page)**：
   - 托管在根路径 `/`。
   - `/api/downloads`：从 GitLab generic packages 获取最新多平台安装包（Windows exe/zip、macOS dmg、Linux AppImage/deb、Android apk）的版本号、文件大小与 SHA256。
   - `/api/changelog`：读取并展示仓库内 `CHANGELOG`。
   - `/api/sponsors` 与 `/api/donate-qr`：赞助名单与赞赏二维码。
   - `/dl/<filename>`：流式转发安装包下载请求。

2. **用户反馈系统 (Feedback System)**：
   - `POST /api/feedback`：提交反馈（带文本、平台信息、可选截图 base64，开放 CORS 供桌面端及网页端直接 POST）。
   - `GET /feedback`：供纯网页端或外部浏览器直接填写的独立反馈页。
   - `GET /feedback/admin`：管理员后台，支持按状态筛选、一键切换已处理、下载附件截图。
   - 敏感文件（`items.json`, `.secret`, `attachments/*`）已在根目录 `.gitignore` 排除，确保隐私与安全。

3. **网页端宿主 (Web Client Host)**：
   - 托管于 `/web/`。
   - 优先读取 `site/public/web/`，未同步时会自动回退到根目录 `out/web/`。

## 运行与测试

在仓库根目录下执行：

```bash
# 启动官网与反馈服务（默认监听 127.0.0.1:5300）
npm run site:dev

# 自定义端口或环境变量启动
PORT=8080 node site/server.js

# 运行本地联调检查（需开放回环网络权限）
npm run site:test
```
