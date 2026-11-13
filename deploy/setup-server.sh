#!/usr/bin/env bash
# 7FA4 Chat 服务器端一次性初始化脚本（安装自动拉取与部署服务）
# 用法：sudo bash deploy/setup-server.sh
set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "请使用 sudo 运行: sudo bash $0"
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-jxoi}}"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "ERROR: 用户不存在: $DEPLOY_USER"
  exit 1
fi

USER_HOME="$(eval echo "~${DEPLOY_USER}")"
REPO_URL="${REPO_URL:-https://github.com/for-fo-f-zsq/7fa4-chat.git}"
REPO_DIR="${REPO_DIR:-${USER_HOME}/7fa4-chat}"
BRANCH="${BRANCH:-main}"
LEGACY_SITE_DIR="${LEGACY_SITE_DIR:-${USER_HOME}/7fa4-chat-site}"
FEEDBACK_DIR="${FEEDBACK_DIR:-/var/lib/7fa4-chat/feedback}"
PORT="${PORT:-5300}"
GITLAB_BASE="${GITLAB_BASE:-https://jx.7fa4.cn:9080}"
GITLAB_PROJECT="${GITLAB_PROJECT:-886}"
DEPLOY_PROXY="${DEPLOY_PROXY:-}"

if [[ -n "$DEPLOY_PROXY" ]]; then
  export HTTP_PROXY="$DEPLOY_PROXY" HTTPS_PROXY="$DEPLOY_PROXY" http_proxy="$DEPLOY_PROXY" https_proxy="$DEPLOY_PROXY"
fi
export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost}"
export no_proxy="$NO_PROXY"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: 未找到 node，请先安装 Node.js >= 20"
  exit 1
fi
echo "[setup] Node: $NODE_BIN ($("$NODE_BIN" -v))"
echo "[setup] Deploy user: $DEPLOY_USER"
echo "[setup] Repo dir: $REPO_DIR"
echo "[setup] Feedback dir: $FEEDBACK_DIR"

# 1. 确保代码仓库已克隆到 REPO_DIR
if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "[setup] 克隆仓库 ${REPO_URL} -> ${REPO_DIR} ..."
  sudo -u "$DEPLOY_USER" env \
    HTTP_PROXY="${HTTP_PROXY:-}" HTTPS_PROXY="${HTTPS_PROXY:-}" \
    http_proxy="${http_proxy:-}" https_proxy="${https_proxy:-}" \
    NO_PROXY="${NO_PROXY:-}" no_proxy="${no_proxy:-}" \
    git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
else
  echo "[setup] 仓库已存在，更新远程配置 ..."
  sudo -u "$DEPLOY_USER" git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
fi

# 2. 迁移既有反馈数据（防止旧目录 7fa4-chat-site/data/feedback 丢失）
mkdir -p "${FEEDBACK_DIR}/attachments"
if [[ -d "${LEGACY_SITE_DIR}/data/feedback" && ! -f "${FEEDBACK_DIR}/items.json" ]]; then
  echo "[setup] 迁移旧反馈数据: ${LEGACY_SITE_DIR}/data/feedback -> ${FEEDBACK_DIR}"
  cp -a "${LEGACY_SITE_DIR}/data/feedback/." "${FEEDBACK_DIR}/"
elif [[ -d "${REPO_DIR}/site/data/feedback" && ! -f "${FEEDBACK_DIR}/items.json" ]]; then
  if [[ -f "${REPO_DIR}/site/data/feedback/items.json" || -f "${REPO_DIR}/site/data/feedback/.secret" ]]; then
    echo "[setup] 迁移仓库内反馈数据 -> ${FEEDBACK_DIR}"
    cp -a "${REPO_DIR}/site/data/feedback/." "${FEEDBACK_DIR}/"
  fi
fi
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$FEEDBACK_DIR"
chmod 700 "$FEEDBACK_DIR"
[[ -f "${FEEDBACK_DIR}/.secret" ]] && chmod 600 "${FEEDBACK_DIR}/.secret"

# 3. 写入 /etc/7fa4-chat/site.env 与 deploy.env（保留已有密码）
mkdir -p /etc/7fa4-chat
SITE_ENV="/etc/7fa4-chat/site.env"
DEPLOY_ENV="/etc/7fa4-chat/deploy.env"

if [[ ! -f "$SITE_ENV" ]]; then
  ADMIN_PW="${FEEDBACK_ADMIN_PASSWORD:-}"
  if [[ -z "$ADMIN_PW" ]]; then
    ADMIN_PW="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20)"
    echo "[setup] 已自动生成反馈后台密码（请记录并在需要时修改 ${SITE_ENV}）:"
    echo "        FEEDBACK_ADMIN_PASSWORD=${ADMIN_PW}"
  fi
  cat >"$SITE_ENV" <<EOF
HOST=127.0.0.1
PORT=${PORT}
FEEDBACK_DIR=${FEEDBACK_DIR}
FEEDBACK_ADMIN_PASSWORD=${ADMIN_PW}
GITLAB_BASE=${GITLAB_BASE}
GITLAB_PROJECT=${GITLAB_PROJECT}
EOF
  chown "root:${DEPLOY_USER}" "$SITE_ENV"
  chmod 640 "$SITE_ENV"
else
  echo "[setup] 保留已有 ${SITE_ENV}"
fi

cat >"$DEPLOY_ENV" <<EOF
REPO_DIR=${REPO_DIR}
REMOTE=origin
BRANCH=${BRANCH}
SERVICE_NAME=7fa4-chat-site
PORT=${PORT}
HEALTH_URL=http://127.0.0.1:${PORT}/healthz
DEPLOY_PROXY=${DEPLOY_PROXY}
EOF
chmod 644 "$DEPLOY_ENV"

# 4. 配置免密重启权限（仅限重启 7fa4-chat-site 服务）
SUDOERS_FILE="/etc/sudoers.d/7fa4-chat-deploy"
SYSTEMCTL_BIN="$(command -v systemctl)"
cat >"$SUDOERS_FILE" <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: ${SYSTEMCTL_BIN} restart 7fa4-chat-site
EOF
chmod 0440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE"

# 5. 渲染并安装 systemd 单元
render_unit() {
  local src="$1"
  local dst="$2"
  sed \
    -e "s|__USER__|${DEPLOY_USER}|g" \
    -e "s|__REPO_DIR__|${REPO_DIR}|g" \
    -e "s|__NODE_BIN__|${NODE_BIN}|g" \
    -e "s|__FEEDBACK_DIR__|${FEEDBACK_DIR}|g" \
    "$src" >"$dst"
}

render_unit "${REPO_DIR}/deploy/7fa4-chat-site.service" /etc/systemd/system/7fa4-chat-site.service
render_unit "${REPO_DIR}/deploy/7fa4-chat-deploy.service" /etc/systemd/system/7fa4-chat-deploy.service
cp "${REPO_DIR}/deploy/7fa4-chat-deploy.timer" /etc/systemd/system/7fa4-chat-deploy.timer

chmod +x "${REPO_DIR}/deploy/auto-deploy.sh" "${REPO_DIR}/deploy/start-site.sh"
systemctl daemon-reload
systemctl enable 7fa4-chat-site.service
systemctl enable 7fa4-chat-deploy.timer

# 6. 首次强制执行一次拉取构建并重启服务
echo "[setup] 执行首次构建与启动 ..."
sudo -u "$DEPLOY_USER" bash "${REPO_DIR}/deploy/auto-deploy.sh" --force

systemctl start 7fa4-chat-deploy.timer

echo "[setup] 完成！服务状态："
systemctl --no-pager --full status 7fa4-chat-site.service | head -n 15
echo "--- timer ---"
systemctl --no-pager list-timers 7fa4-chat-deploy.timer
