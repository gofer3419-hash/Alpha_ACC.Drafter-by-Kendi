@echo off
title ACC.DRAFTER
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js. Zainstaluj go z https://nodejs.org/ i uruchom ponownie.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Pierwsze uruchomienie: instaluje zaleznosci, to potrwa chwile...
  call npm install
  if errorlevel 1 (
    echo Instalacja nie powiodla sie.
    pause
    exit /b 1
  )
)

echo Buduje strone (przy kazdym uruchomieniu, kilkadziesiat sekund)...
call npm run build
if errorlevel 1 (
  echo Budowanie nie powiodlo sie.
  pause
  exit /b 1
)

echo.
echo Uruchamiam serwer. Adresy dla graczy pokaze ponizej ("Inni").
echo Przegladarka otworzy sie za chwile.
start "" http://localhost:8080
call npm run serve
pause
