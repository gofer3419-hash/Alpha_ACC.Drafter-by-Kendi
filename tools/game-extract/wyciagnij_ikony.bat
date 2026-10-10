@echo off
title Wyciaganie ikon z WARNO
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js. Zainstaluj go z https://nodejs.org/ i uruchom ponownie.
  pause
  exit /b 1
)

set "GRA=%~dp0"
if exist "%~dp0Data\PC" set "GRA=%~dp0Data\PC"

echo Szukam ikon w: %GRA%
echo To moze potrwac kilka minut...
node "%~dp0wyciagnij_ikony.js" "%GRA%" "%~dp0ikony2d"
echo.
echo Gotowe. Wynik jest w folderze: %~dp0ikony2d
pause
