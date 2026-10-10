@echo off
setlocal
set "BIN_DIR=%~dp0"
if exist "%BIN_DIR%\agentos.exe" (
  "%BIN_DIR%\agentos.exe" %*
) else (
  bun run "%BIN_DIR%\..\apps\cli\src\index.ts" %*
)
