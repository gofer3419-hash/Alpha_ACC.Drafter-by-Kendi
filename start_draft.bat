@echo off
title ACC.DRAFTER
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js. Zainstaluj go z https://nodejs.org/ i uruchom ponownie.
  exit /b 1
)

if not exist node_modules (
  echo Pierwsze uruchomienie: instaluje zaleznosci, to potrwa chwile...
  call npm install
  if errorlevel 1 (
    echo Instalacja nie powiodla sie.
    exit /b 1
  )
)

echo Uruchamiam strone: http://localhost:8080
echo Aby zatrzymac serwer, zamknij to okno albo wcisnij Ctrl+C.
call npm start
