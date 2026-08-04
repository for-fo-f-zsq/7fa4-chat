#!/bin/bash
# /dev 分析页 + GET /info 登录保护（nginx Basic Auth）；（幂等）
# 用法：AUTH_PASS='密码' bash apply_auth.sh
set -e
[ -n "$AUTH_PASS" ] || { echo 'ERROR: 请设置 AUTH_PASS 环境变量'; exit 1; }

# 1) 生成 htpasswd 文件（openssl apr1 格式，nginx 支持）
# 注意：hash 必须在外层 shell 生成（AUTH_PASS 可读），再经 sudo tee 写入，避免 sudo 清空环境变量
HASH=$(openssl passwd -apr1 "$AUTH_PASS")
printf 'for_fo_f:%s\n' "$HASH" | sudo tee /etc/nginx/.htpasswd-7fa4 > /dev/null
sudo chown root:www-data /etc/nginx/.htpasswd-7fa4
sudo chmod 640 /etc/nginx/.htpasswd-7fa4
echo 'htpasswd written (root:www-data 640)'

# 2) nginx 配置：/dev 加 auth；/info 改为 limit_except（POST 免认证，GET 需认证）
sudo python3 <<'PYEOF'
NGINX_CONF = '/etc/nginx/sites-enabled/website'
src = open(NGINX_CONF, encoding='utf-8').read()
if 'auth_basic_user_file' in src:
    print('nginx auth already patched, skip')
    raise SystemExit(0)

old_info = '''    # 访问统计上报
    location ^~ /info {
        proxy_pass http://127.0.0.1:8090/info;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }'''
new_info = '''    # 访问统计上报：POST（客户端加密上报）免认证；GET（查统计）需登录
    location = /info {
        add_header Cache-Control "no-cache";
        limit_except POST {
            auth_basic "7FA4 Restricted";
            auth_basic_user_file /etc/nginx/.htpasswd-7fa4;
        }
        proxy_pass http://127.0.0.1:8090/info;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }'''
assert old_info in src, 'info location missing'
src = src.replace(old_info, new_info, 1)

old_dev = '''    # 分析页 /dev：数据实时，禁止缓存
    location ^~ /dev/ {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }'''
new_dev = '''    # 分析页 /dev：需登录，数据实时禁止缓存
    location ^~ /dev/ {
        auth_basic "7FA4 Restricted";
        auth_basic_user_file /etc/nginx/.htpasswd-7fa4;
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }'''
assert old_dev in src, 'dev location missing'
src = src.replace(old_dev, new_dev, 1)

open(NGINX_CONF, 'w', encoding='utf-8').write(src)
print('nginx auth patched')
PYEOF

sudo nginx -t
sudo systemctl reload nginx
echo '=== auth deployed ==='
