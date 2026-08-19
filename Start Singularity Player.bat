@echo off
title Singularity Music Player
color 0A
cls

echo ======================================================================
echo                      SINGULARITY MUSIC PLAYER
echo ======================================================================
echo.
echo   [1] Launch Native Desktop App (Discord RPC, Tray, Media Keys)
echo   [2] Launch Web Player in Browser (http://localhost:8000)
echo   [3] Build Standalone Windows Installer (.exe)
echo.
set /p choice="Select an option [1-3] (Press Enter for 1): "

if "%choice%"=="" set choice=1

cd /d "%~dp0"

if not exist "client\dist\index.html" (
    echo.
    echo  Building production assets...
    call npm run build
    echo.
)

if "%choice%"=="1" (
    echo.
    echo  Starting Singularity Desktop App...
    npm run desktop:start
    exit /b
)

if "%choice%"=="2" (
    echo.
    echo  Opening Singularity Web Player at http://localhost:8000 ...
    start "" "http://localhost:8000"
    echo.
    echo  ----------------------------------------------------------------------
    echo  Web Server is active on http://localhost:8000
    echo  Keep this window open while playing music. Press Ctrl+C to stop.
    echo  ----------------------------------------------------------------------
    echo.
    npm start
    exit /b
)

if "%choice%"=="3" (
    echo.
    echo  Building Standalone Windows Installer (.exe)...
    call npm run dist:win
    echo.
    echo  Installer created in dist-electron/ folder!
    pause
    exit /b
)

