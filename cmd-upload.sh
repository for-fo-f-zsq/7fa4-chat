#!/bin/bash

# 从 package.json 中提取版本号
VERSION=$(awk -F'"' '/"version"/ {print $4; exit}' package.json)

if [ -z "$VERSION" ]; then
    echo "错误：未能从 package.json 中提取版本号，请检查文件格式。"
    exit 1
fi

echo "检测到版本号：$VERSION"

# npm run dist

GITLAB_API="http://jx.7fa4.cn:9080/api/v4/projects/886"
GITLAB_URL="${GITLAB_API}/packages/generic/7FA4-Chat"
GITLAB_TOKEN="${GITLAB_TOKEN:?请先设置环境变量 GITLAB_TOKEN，例如：export GITLAB_TOKEN=glpat-xxxx}"
UPLOAD_COUNT=0

# 上传单个文件到指定目录
upload_file() {
    local file_path=$1
    local version_dir=$2
    local file_name=$(basename "$file_path")

    echo "上传：${file_name} -> ${version_dir}/"
    curl --location \
         --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
         --upload-file "$file_path" \
         "${GITLAB_URL}/${version_dir}/${file_name}" \
         -k > /dev/null 2>&1

    if [ $? -ne 0 ]; then
        echo "警告：${file_name} 上传到 ${version_dir} 失败"
    else
        UPLOAD_COUNT=$((UPLOAD_COUNT + 1))
    fi
}

# 收集所有需要上传的文件
FILES=()
for yml_file in build/latest.yml build/latest-linux.yml build/latest-linux-arm64.yml; do
    [ -f "$yml_file" ] && FILES+=("$yml_file")
done
for file in build/7FA4-Chat-${VERSION}-*.exe \
            build/7FA4-Chat-${VERSION}-*.zip \
            build/7FA4-Chat-${VERSION}-*.AppImage \
            build/7FA4-Chat-${VERSION}-*.deb; do
    [ -f "$file" ] && FILES+=("$file")
done
# 包含 CHANGELOG 文件
[ -f "CHANGELOG" ] && FILES+=("CHANGELOG")

if [ ${#FILES[@]} -eq 0 ]; then
    echo "未找到任何构建产物"
    exit 1
fi

# 上传到版本目录（归档）
for file in "${FILES[@]}"; do
    upload_file "$file" "$VERSION"
done

# 删除旧的 latest 包（避免同名文件冲突）
echo "清理旧的 latest 包..."
LATEST_PKG_ID=$(curl -s "${GITLAB_API}/packages?package_name=7FA4-Chat&version=latest&per_page=1" \
    -k --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" 2>/dev/null \
    | python3 -c "import sys,json; pkgs=json.load(sys.stdin); print(pkgs[0]['id'] if pkgs and pkgs[0]['version']=='latest' else '')" 2>/dev/null)

if [ -n "$LATEST_PKG_ID" ]; then
    curl -s -X DELETE "${GITLAB_API}/packages/${LATEST_PKG_ID}" \
         -k --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" > /dev/null 2>&1
    echo "已删除旧的 latest 包 (ID: ${LATEST_PKG_ID})"
fi

# 上传到 latest 目录（electron-updater 检查更新用的固定路径）
for file in "${FILES[@]}"; do
    upload_file "$file" "latest"
done

echo "上传结束，成功上传 ${UPLOAD_COUNT} 个文件。"
