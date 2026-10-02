# 7fa4 管理后台（/dev）

Vue 3 + Vite 构建的**自托管**管理后台，替代原先割裂的三个静态页
（`dev-index.html` / `dev-feedback.html` / `dev-posters.html`）。

## 为什么重构

| 旧做法的问题 | 现在的做法 |
| --- | --- |
| 三个页面各自内联 `<script>`，样式与工具函数大量重复 | 单一 SPA，统一设计系统（`src/styles.css`） |
| 认证靠 nginx `auth_basic` + 静态 `.htpasswd`，无法增删账户、无角色、无法审计 | 账户体系入库（scrypt 哈希 + 角色 + 会话 Cookie），支持创建/停用/删除与审计留痕 |
| 要装 CDN 脚本，离线/内网不可用 | 零 CDN，产物为纯静态资源（JS 137 KB / gzip 49 KB，CSS 25 KB / gzip 6 KB） |
| 改完页面要手动刷新 | 定时轮询自动更新，间隔可在「系统配置」里改 |
| 官网 `/` 与后台 `/dev` 是两套服务 | 同一个 Node 进程伺服，路由优先级：API v1 → 旧 API → 静态资源 → SPA 回退 |

## 目录结构

```
dev-console/
├── index.html              入口
├── vite.config.mjs         构建配置（base:'./'，产物带 hash 便于长缓存）
├── package.json
└── src/
    ├── main.js
    ├── App.vue             顶层：未登录显示登录页，已登录套 AppShell
    ├── styles.css          设计系统（色彩/间距/组件原语，深浅色令牌）
    ├── lib/
    │   ├── api.js          统一 API v1 客户端（{ok,data} / {ok,error} 契约）
    │   ├── legacy-api.js   旧接口适配（海报/反馈，被已发布客户端依赖，不可改）
    │   ├── store.js        全局状态 + 轮询调度器
    │   └── util.js         时间/字节格式化、轻提示
    ├── components/
    │   ├── AppShell.vue    侧栏 + 顶栏布局（响应式，窄屏抽屉）
    │   ├── BaseModal.vue   通用弹窗
    │   ├── ConfirmHost.vue Promise 化确认框
    │   ├── DropdownMenu.vue
    │   ├── EmptyState.vue
    │   ├── TableSkeleton.vue
    │   └── ToastHost.vue
    └── views/
        ├── LoginView.vue
        ├── OverviewView.vue    总览（数字卡 + 日活趋势 + 待办 + 最近操作）
        ├── PostersView.vue     海报审核（四页签 + 拖拽调序）
        ├── FeedbackView.vue    意见反馈（搜索/筛选/截图预览）
        ├── AccountsView.vue    管理员账户（仅超管）
        ├── ConfigView.vue      系统配置（schema 驱动动态表单）
        └── AuditView.vue       审计日志（筛选 + 分页 + 详情）
```

## 开发与构建

```bash
# 依赖：复用仓库根的 vue / vite / @vitejs/plugin-vue，无需单独 npm install
node dev-console/node_modules/vite/bin/vite.js build   # 产物 → dev-console/dist
```

> 本机开发时可 `cd dev-console && npx vite`（dev server 默认 5173），
> 通过 vite 的 proxy 指向后端 8090。生产直接构建静态产物。

## 权限模型

后端下发权限清单，前端**仅据此隐藏入口**；所有校验以服务端为准。

| 权限 | 说明 | 超管 | 运营 |
| --- | --- | :---: | :---: |
| `content.view` | 查看海报 / 反馈 | ✅ | ✅ |
| `content.manage` | 审核 / 删除内容 | ✅ | ✅ |
| `audit.view` | 查看审计日志 | ✅ | ✅ |
| `account.manage` | 管理管理员账户 | ✅ | ❌ |
| `config.manage` | 修改系统配置 | ✅ | ❌ |

## 轮询自动更新

`lib/store.js` 维护一个全局调度器：

- 各页在 `onMounted` 里 `registerPoller(key, fn)`，`onBeforeUnmount` 里 `unregisterPoller(key)`
- 间隔取自系统配置 `poll_interval_ms`（默认 15 s，范围 2–300 s），改动后立即生效
- `document.hidden` 时跳过（切到后台不做无意义请求）
- 单页刷新失败被吞掉，不影响其它页
- 侧栏底部显示同步状态，可一键暂停/恢复；顶栏有「立即刷新」

## 与已发布客户端的关系

**海报、反馈、统计三块仍走旧路径**（`/api/posters`、`/api/admin/posters`、
`/api/feedback`、`/api/stats`）。原因是：

1. 这些路径被 Electron 客户端 3.5.2 硬编码，无法远程热更；
2. 后台与客户端读同一份数据，天然一致，避免两套口径。

新增能力（账户、配置、审计）一律走 `/api/v1/*`，与旧路径共存。
