@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 goto badpath
where node >nul 2>&1
if errorlevel 1 goto missing
node "scripts\launch.mjs" check
set "result=%errorlevel%"
if not "%result%"=="0" echo Operation failed. Read the error above and START-HERE-RU.md.
if "%result%"=="0" echo Done. No clippyXam executable was compiled.
popd
pause
exit /b %result%
:missing
echo Node.js 22.12 or newer is required. Install it from https://nodejs.org/
echo Then reopen this file. Instructions: START-HERE-RU.md
popd
pause
exit /b 1
:badpath
echo Extract the entire ZIP to a writable folder before launching.
pause
exit /b 1
