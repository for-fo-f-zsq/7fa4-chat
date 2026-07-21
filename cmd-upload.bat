@echo off
setlocal enabledelayedexpansion
for /f "tokens=*" %%i in ('powershell -Command "(Get-Content package.json | Select-String '\"version\"' | Select-Object -First 1).Line -replace '.*\"version\"\s*:\s*\"([^\"]+)\".*', '$1'"') do set VERSION=%%i
git tag v%VERSION%
git push origin v%VERSION%
