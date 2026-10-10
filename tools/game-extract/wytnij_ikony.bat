@echo off
title Wycinanie ikon jednostek z WARNO
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js. Zainstaluj go z https://nodejs.org/
  pause
  exit /b 1
)
set "GRA=%~dp0"
if exist "%~dp0Data\PC" set "GRA=%~dp0Data\PC"
node "%~dp0wytnij_ikony.js" "%GRA%" "%~dp0ikony_mapa.json" "%~dp0ikony_jednostek"
echo.
echo Gotowe. Ikony sa w folderze: %~dp0ikony_jednostek
pause
