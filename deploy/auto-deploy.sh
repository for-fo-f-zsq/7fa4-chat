#!/usr/bin/env bash
# 7FA4 Chat 服务器端自动拉取与部署脚本
# 由 systemd timer（7fa4-chat-deploy.timer）每分钟触发，也可手动执行：
#   bash deploy/auto-deploy.sh [--force] [--dry-run]
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 可选加载部署配置（导出环境变量供 git / npm 使用）
if [[ -f /etc/7fa4-chat/deploy.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/7fa4-chat/deploy.env
  set +a
fi

REPO_DIR="${REPO_DIR:-$DEFAULT_REPO_DIR}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-7fa4-chat-site}"
PORT="${PORT:-5300}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/healthz}"
LOCK_FILE="${LOCK_FILE:-/tmp/7fa4-chat-deploy.lock}"
NODE_MAX_MEM="${NODE_MAX_MEM:-2048}"
DEPLOY_PROXY="${DEPLOY_PROXY:-}"

if [[ -n "$DEPLOY_PROXY" ]]; then
  export HTTP_PROXY="$DEPLOY_PROXY" HTTPS_PROXY="$DEPLOY_PROXY" http_proxy="$DEPLOY_PROXY" https_proxy="$DEPLOY_PROXY"
fi
export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost}"
export no_proxy="$NO_PROXY"
export GIT_TERMINAL_PROMPT=0
export npm_config_cache="${npm_config_cache:-/tmp/7fa4-npm-cache}"

FORCE=0
DRY_RUN=0
POST_PULL=0
OLD_SHA_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --post-pull) POST_PULL=1; shift ;;
    --old-sha) OLD_SHA_ARG="${2:-}"; shift 2 ;;
    -h|--help)
      echo "用法: $0 [--force] [--dry-run]"
      exit 0
      ;;
    *) shift ;;
  esac
done

log() {
  echo "[auto-deploy $(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# 防重入锁（自举重入时沿用当前锁，不重复抢锁）
if [[ "$POST_PULL" -eq 0 ]]; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    exit 0
  fi
fi

cd "$REPO_DIR"

if [[ ! -d .git ]]; then
  log "ERROR: $REPO_DIR 不是 git 仓库"
  exit 1
fi

git config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true

fetch_remote() {
  if timeout 45 git fetch --prune "$REMOTE" "$BRANCH" --quiet; then
    return 0
  fi
  if [[ -n "$DEPLOY_PROXY" ]]; then
    log "WARN: 经代理 ${DEPLOY_PROXY} 拉取失败，尝试直连回退..."
    if env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy timeout 45 git fetch --prune "$REMOTE" "$BRANCH" --quiet; then
      return 0
    fi
  fi
  return 1
}

if [[ "$POST_PULL" -eq 0 ]]; then
  if ! fetch_remote; then
    log "WARN: git fetch ${REMOTE}/${BRANCH} 失败或超时，稍后重试"
    exit 1
  fi
  OLD_SHA="$(git rev-parse HEAD)"
  NEW_SHA="$(git rev-parse "${REMOTE}/${BRANCH}")"
else
  OLD_SHA="${OLD_SHA_ARG:-$(git rev-parse HEAD)}"
  NEW_SHA="$(git rev-parse HEAD)"
fi

NEED_WEB_BUILD=0
NEED_NPM_INSTALL=0
NEED_RESTART=0

[[ ! -d node_modules ]] && NEED_NPM_INSTALL=1
[[ ! -f site/public/web/index.html ]] && NEED_WEB_BUILD=1

if [[ "$POST_PULL" -eq 0 && "$OLD_SHA" == "$NEW_SHA" && "$FORCE" -eq 0 && "$NEED_NPM_INSTALL" -eq 0 && "$NEED_WEB_BUILD" -eq 0 ]]; then
  # 无更新且服务健康时静默退出，避免刷屏日志
  if curl --noproxy '*' -fsS -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
    exit 0
  fi
  log "WARN: 代码无变更但健康检查未通过，尝试恢复服务..."
  NEED_RESTART=1
fi

if [[ "$POST_PULL" -eq 0 ]]; then
  log "检测到更新或待构建状态: ${OLD_SHA:0:7} -> ${NEW_SHA:0:7} (force=${FORCE})"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ "$OLD_SHA" != "$NEW_SHA" ]]; then
      git diff --stat "$OLD_SHA" "$NEW_SHA"
    fi
    log "[dry-run] 未执行实际修改"
    exit 0
  fi
fi

CHANGED=""
if [[ "$OLD_SHA" != "$NEW_SHA" ]]; then
  CHANGED="$(git diff --name-only "$OLD_SHA" "$NEW_SHA" || true)"
fi

if [[ "$POST_PULL" -eq 0 && "$OLD_SHA" != "$NEW_SHA" ]]; then
  log "同步代码到 ${NEW_SHA:0:7} ..."
  git reset --hard "$NEW_SHA"
  chmod +x deploy/auto-deploy.sh deploy/start-site.sh deploy/setup-server.sh 2>/dev/null || true

  # 若部署脚本自身被更新，立即切换执行新版脚本，无需人工 SSH
  if echo "$CHANGED" | grep -qE '^deploy/auto-deploy\.sh$'; then
    log "检测到 deploy/auto-deploy.sh 已更新，切换至新版部署脚本继续执行..."
    EXTRA_ARGS=(--post-pull --old-sha "$OLD_SHA")
    [[ "$FORCE" -eq 1 ]] && EXTRA_ARGS+=(--force)
    exec /bin/bash "${REPO_DIR}/deploy/auto-deploy.sh" "${EXTRA_ARGS[@]}"
  fi
fi

# 判断是否仅改了纯桌面/安卓/文档文件；除此之外的任何网页/服务端/脚本更新都自动构建并部署
NON_WEB_ONLY_RE='^(src/main/|src/preload/|android/|resources/|\.github/|README\.md|CONTRIBUTING\.md|LICENSE|\.gitignore|\.gitattributes)'
HAS_WEB_OR_SITE_CHANGE=0
if [[ -n "$CHANGED" ]]; then
  if echo "$CHANGED" | grep -qvE "$NON_WEB_ONLY_RE"; then
    HAS_WEB_OR_SITE_CHANGE=1
  fi
fi

if [[ "$FORCE" -eq 1 ]]; then
  NEED_NPM_INSTALL=1
  NEED_WEB_BUILD=1
  NEED_RESTART=1
else
  if echo "$CHANGED" | grep -qE '^(package\.json|package-lock\.json)$'; then
    NEED_NPM_INSTALL=1
    NEED_WEB_BUILD=1
    NEED_RESTART=1
  fi
  if [[ "$HAS_WEB_OR_SITE_CHANGE" -eq 1 ]]; then
    # 只要改了网页前端/工具/配置/构建脚本/站点代码，均走统一 site:build + 平滑重启
    if echo "$CHANGED" | grep -qE '^(src/renderer/|tools/|config/|vite\.config|scripts/|package\.json)'; then
      NEED_WEB_BUILD=1
    fi
    NEED_RESTART=1
  fi
fi

restart_service() {
  if [[ "$EUID" -eq 0 ]]; then
    systemctl restart "$SERVICE_NAME"
  else
    sudo -n systemctl restart "$SERVICE_NAME"
  fi
}

wait_healthy() {
  for _ in $(seq 1 30); do
    if curl --noproxy '*' -fsS -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

write_deploy_meta() {
  local sha="$1"
  local ts
  ts="$(date -Iseconds)"
  printf '{"commit":"%s","deployedAt":"%s"}\n' "${sha:0:7}" "$ts" > "${REPO_DIR}/.deploy-meta.json"
}

rollback() {
  if [[ "$OLD_SHA" == "$NEW_SHA" ]]; then
    return 1
  fi
  log "ERROR: 部署失败，正在自动回滚到 ${OLD_SHA:0:7} ..."
  git reset --hard "$OLD_SHA"
  if [[ "$NEED_NPM_INSTALL" -eq 1 ]]; then
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund >/dev/null 2>&1 || true
  fi
  if [[ "$NEED_WEB_BUILD" -eq 1 ]]; then
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_MEM}" npm run site:build >/dev/null 2>&1 || true
  fi
  write_deploy_meta "$OLD_SHA" || true
  restart_service || true
  if wait_healthy; then
    log "已成功回滚至 ${OLD_SHA:0:7}，服务恢复健康"
  else
    log "CRITICAL: 回滚后健康检查仍未通过，请排查 journalctl -u ${SERVICE_NAME}"
  fi
  return 1
}

if [[ "$NEED_NPM_INSTALL" -eq 1 ]]; then
  log "安装依赖 (跳过 Electron 二进制下载) ..."
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund || rollback
fi

if [[ "$NEED_WEB_BUILD" -eq 1 ]]; then
  log "执行统一网页构建 (npm run site:build) ..."
  NODE_OPTIONS="--max-old-space-size=${NODE_MAX_MEM}" npm run site:build || rollback
fi

write_deploy_meta "$NEW_SHA"

if [[ "$NEED_RESTART" -eq 1 ]] || ! curl --noproxy '*' -fsS -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
  log "重启服务 ${SERVICE_NAME} ..."
  restart_service || rollback
fi

if ! wait_healthy; then
  log "ERROR: 健康检查失败 (${HEALTH_URL})"
  rollback
fi

log "部署成功！当前线上版本: ${NEW_SHA:0:7}"
