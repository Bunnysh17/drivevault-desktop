@echo off
title DriveVault - PC Auto Backup
cd /d "%~dp0"
echo ========================================================
echo   Starting DriveVault Engine & Desktop Service
echo ========================================================
echo.

:: Start Next.js App
start "" "http://localhost:3000"
npm run dev
