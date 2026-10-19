@echo off
chcp 65001 >nul
title TRỐNG ĐỒNG - Bàn Điều Khiển Âm Thanh & Video Sự Kiện
echo ==========================================================
echo    TRỐNG ĐỒNG EVENT MEDIA STUDIO - CAO ĐẲNG LONG AN
echo ==========================================================
echo Đang khởi động hệ thống âm thanh và video sự kiện...
echo Trình duyệt sẽ tự động mở trong giây lát.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
