@echo off
setlocal EnableDelayedExpansion
set "UPLOAD_COUNT=0"

REM ============================================================
REM  7FA4-Chat 构建产物上传脚本（Windows 版）
REM  功能与原 cmd-upload.sh 一致：把 build/ 下的安装包与
REM  CHANGELOG 上传到自建 GitLab 的 generic 包。
REM  依赖：Windows 10+ 自带 curl.exe 与 PowerShell。
REM  token 必须从环境变量读取，切勿硬编码到本文件。
REM ============================================================

REM ===== 配置 =====
set "GITLAB_HOST=http://jx.7fa4.cn:9080"
set "GITLAB_PROJECT=886"
set "PACKAGE_NAME=7FA4-Chat"

REM ===== 从 package.json 读取版本号 =====
for /f "delims=" %%V in ('powershell -NoProfile -Command "(Get-Content package.json | Select-String '\"version\"' | Select-Object -First 1).Line -replace '.*\"version\"\s*:\s*\"([^\"]+)\".*', '$1'"') do set "VERSION=%%V"
if "%VERSION%"=="" (
  echo [错误] 未能从 package.json 读取版本号，请检查文件格式。
  exit /b 1
)
echo [信息] 检测到版本号：%VERSION%

REM ===== token 必须从环境变量读取（避免硬编码泄露）=====
if "%GITLAB_TOKEN%"=="" (
  echo [错误] 请先设置环境变量 GITLAB_TOKEN，例如：
  echo         set GITLAB_TOKEN=glpat-xxxx
  exit /b 1
)

set "GITLAB_API=%GITLAB_HOST%/api/v4/projects/%GITLAB_PROJECT%"
set "GITLAB_URL=%GITLAB_API%/packages/generic/%PACKAGE_NAME%"

REM ===== 收集产物 =====
set "N=0"
for %%F in (
  "build\latest.yml"
  "build\latest-linux.yml"
  "build\latest-linux-arm64.yml"
  "build\7FA4-Chat-%VERSION%-*.exe"
  "build\7FA4-Chat-%VERSION%-*.zip"
  "build\7FA4-Chat-%VERSION%-*.AppImage"
  "build\7FA4-Chat-%VERSION%-*.deb"
  "CHANGELOG"
) do (
  if exist %%F (
    set "FILES[!N!]=%%F"
    set /a N+=1
  )
)
if %N%==0 (
  echo [错误] 未找到任何构建产物，请先运行 npm run dist
  exit /b 1
)
echo [信息] 共收集 %N% 个文件

REM ===== 第一遍：上传到版本目录 =====
echo [信息] 归档到版本目录 %VERSION%/
call :upload_all "%VERSION%"

REM ===== 删除旧的 latest 包 =====
echo [信息] 清理旧的 latest 包...
for /f %%I in ('powershell -NoProfile -Command "$t=$env:GITLAB_TOKEN; $api='%GITLAB_API%'; $pk='%PACKAGE_NAME%'; try { $r=Invoke-RestMethod -Headers @{'PRIVATE-TOKEN'=$t} -Uri ($api+'/packages?package_name='+$pk+'&version=latest&per_page=100'); $id=($r ^| Where-Object { $_.version -eq 'latest' } ^| Select-Object -First 1).id; if($id){ Invoke-RestMethod -Method Delete -Headers @{'PRIVATE-TOKEN'=$t} -Uri ($api+'/packages/'+$id); $id } else { '' } } catch { '' }"') do set "LATEST_ID=%%I"
if defined LATEST_ID if not "%LATEST_ID%"=="" (
  echo [信息] 已删除旧的 latest 包 (ID: %LATEST_ID%)
) else (
  echo [信息] 无旧 latest 包，跳过删除
)

REM ===== 第二遍：上传到 latest 目录 =====
echo [信息] 上传到 latest/（electron-updater 检查更新用）
call :upload_all "latest"

echo [完成] 上传结束，成功上传 %UPLOAD_COUNT% 个文件。
goto :eof

REM ===== 子程序 =====
:upload_all
set "DIR=%~1"
for /L %%I in (0,1,%N%-1) do (
  set "F=!FILES[%%I]!"
  if defined F call :upload_one "!F!" "%DIR%"
)
goto :eof

:upload_one
set "FP=%~1"
set "VD=%~2"
set "FN=%~nx1"
echo [上传] %FN% -^> %VD%/
curl.exe -sS --location --fail --header "PRIVATE-TOKEN: %GITLAB_TOKEN%" --upload-file "%FP%" "%GITLAB_URL%/%VD%/%FN%"
if errorlevel 1 (
  echo [警告] %FN% 上传到 %VD% 失败
) else (
  set /a UPLOAD_COUNT+=1
)
goto :eof
