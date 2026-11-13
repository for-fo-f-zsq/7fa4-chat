#!/usr/bin/env bash
# 7FA4 Chat 官网服务启动包装脚本（由 systemd 7fa4-chat-site.service 调用）
# 将启动入口留在仓库内，后续若需调整启动参数或预检查，只需 git push 即可生效，无需 SSH 改 systemd 单元。
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "[start-site] ERROR: 未找到 node 可执行文件" >&2
  exit 1
fi

exec "$NODE_BIN" "${REPO_DIR}/site/server.js"
