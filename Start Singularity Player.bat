@echo off
title Singularity Music Player
color 0A
cls

echo ======================================================================
echo                      SINGULARITY MUSIC PLAYER
echo ======================================================================
echo.
echo  Starting local engine on http://localhost:8000 ...
echo.

cd /d "%~dp0"

if not exist "client\dist\index.html" (
    echo  Building production frontend assets...
    call npm run build
    echo.
)

echo  Opening Singularity Player at http://localhost:8000 ...
start "" "http://localhost:8000"

echo.
echo  ----------------------------------------------------------------------
echo  Server is active and running on http://localhost:8000
echo  Keep this window open while playing music.
echo  To stop the player, close this window or press Ctrl+C.
echo  ----------------------------------------------------------------------
echo.

npm start
