@echo off
setlocal
set SRC=%USERPROFILE%\Downloads\latest.json
set DST=%~dp0changes\latest.json

if not exist "%~dp0changes" mkdir "%~dp0changes"

echo Moving "%SRC%" -> "%DST%"
move /Y "%SRC%" "%DST%" >nul
if errorlevel 1 (
  echo ❌ Move failed. Does "%SRC%" exist?
  exit /b 1
) else (
  echo ✅ Moved to "%DST%"
)
