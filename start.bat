@echo off
title Opa-Sprechhilfe
cd /d "%~dp0"
echo.
echo   Opa-Sprechhilfe wird gestartet ...
echo   Der Browser oeffnet sich gleich von selbst.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo   Die Sprechhilfe wurde beendet.
pause
