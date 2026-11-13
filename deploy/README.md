# 服务器自动拉取与部署（GitHub -> jxoi）

本目录提供一套免人工 SSH 的服务端自动部署方案：服务器通过 `systemd timer` 每分钟检查一次 GitHub `origin/main` 是否有新提交，发现更新后自动拉取、按需增量安装依赖与构建网页端（`/7fa4-chat/web/`），重启 `7fa4-chat-site` 并做 `/healthz` 健康校验；若新提交导致启动或健康检查失败，会自动回滚到上一个可用提交。

## 文件说明

| 文件 | 作用 |
| :--- | :--- |
| `deploy/auto-deploy.sh` | 自动检测 GitHub 更新、自举更新自身脚本、调用 `npm run site:build` 构建全部网页功能、重启服务与失败自动回滚 |
| `deploy/start-site.sh` | 官网服务启动包装脚本（后续调整启动参数仅需 `git push`，无需改 systemd 单元） |
| `deploy/setup-server.sh` | 服务端一次性初始化脚本（克隆仓库、迁移已有反馈数据、配置环境文件与 systemd） |
| `deploy/7fa4-chat-site.service` | 官网、反馈后端与网页端统一服务的 `systemd` 单元 |
| `deploy/7fa4-chat-deploy.service` | 执行 `auto-deploy.sh` 的一次性任务单元 |
| `deploy/7fa4-chat-deploy.timer` | 定时器单元（开机 30s 后首次触发，之后每 1 分钟检查一次） |

## 以后如何零 SSH 上线新功能？

1. **新增或修改网页功能**：
   - 修改现有网页端（`src/renderer/`）：推送到 `main` 后服务器自动执行 `npm run site:build` 并原子更新 `/7fa4-chat/web/`。
   - 新增独立网页页面/子应用：把静态产物放进或构建到 `site/public/<模块名>/`（如 `site/public/docs/index.html`），并把构建命令追加到 [scripts/web/build-site.mjs](../scripts/web/build-site.mjs) 中；`site/server.js` 会自动支持子目录 `index.html` 路由与斜杠重定向。
   - 新增服务端 API：直接在 `site/server.js` 中挂载路由并推送 `main`，服务器会自动重启服务并检验 `/healthz`。
2. **免 SSH 查看线上是否部署成功**：
   - 直接访问 `https://jx.7fa4.cn:8888/7fa4-chat/api/status`，即可看到当前线上版本号、`commit` 短哈希、`deployedAt` 与 `webReady` 状态。

## 首次在服务器上启用

只需登录服务器执行一次初始化即可，之后日常更新只需 `git push origin main`：

```bash
# 1. 拉取仓库（若尚未克隆）
git clone https://github.com/for-fo-f-zsq/7fa4-chat.git ~/7fa4-chat
cd ~/7fa4-chat

# 2. 执行初始化（可传 FEEDBACK_ADMIN_PASSWORD 指定反馈后台密码；会保留并迁移旧反馈数据）
sudo FEEDBACK_ADMIN_PASSWORD="你的后台密码" bash deploy/setup-server.sh
```

> **安全提示**：早期版本的 `scripts/deploy_to_server.py` 与 `site/feedback.js` 曾提交过明文凭据，现已移除。建议顺便在服务器上修改 `jxoi` 账户密码并核对 `/etc/7fa4-chat/site.env` 中的 `FEEDBACK_ADMIN_PASSWORD`。

## 增量构建与回滚策略

`auto-deploy.sh` 会对比 `git diff --name-only <old> <new>` 仅执行必要步骤：

1. `package.json` / `package-lock.json` 变化：`ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`（跳过 100MB+ 的 Electron 下载）。
2. `src/renderer/**`、`config/vite.web.config.mjs`、`scripts/web/build-web-app.mjs`、`scripts/web/build-site.mjs` 变化：执行 `npm run site:build`，通过 staging 目录原子切换 `site/public/web/`。
3. `site/`、`CHANGELOG`、`assets/`、`deploy/`、`package.json` 变化或服务不健康：免密执行 `sudo -n systemctl restart 7fa4-chat-site`。
4. 轮询 `http://127.0.0.1:5300/healthz`，若失败则自动 `git reset --hard <old>` 并恢复上一版服务。

## 常用运维命令

```bash
# 查看官网服务日志
journalctl -u 7fa4-chat-site -f

# 查看自动部署日志
journalctl -u 7fa4-chat-deploy -n 50 --no-pager

# 查看定时器状态
systemctl list-timers 7fa4-chat-deploy.timer

# 手动触发一次立即检测/强制重部署
sudo -u jxoi bash /home/jxoi/7fa4-chat/deploy/auto-deploy.sh --force
```
