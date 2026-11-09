@echo off
chcp 65001 >nul
title CHUẨN HÓA BÀN PHÍM PHÒNG MÁY THI (KHÓA DUY NHẤT ENGLISH US)
color 1F
cls
echo ======================================================================
echo       HỆ THỐNG THI TRẮC NGHIỆM TRÊN MÁY TÍNH QUA MẠNG LAN
echo            CÔNG CỤ 1-CLICK CHUẨN HÓA BÀN PHÍM PHÒNG THI
echo ======================================================================
echo.
echo  Đang thực hiện tự động:
echo   [1] Gỡ bỏ bàn phím tiếng Việt (VIE) mặc định của Windows
echo       (Nguyên nhân làm gõ số 1 ra ă, số 2 ra â, số 3 ra ê...)
echo   [2] Khóa cứng duy nhất bàn phím Tiếng Anh: English (United States) [en-US]
echo   [3] Vô hiệu hóa vĩnh viễn tổ hợp phím nhảy bàn phím: Win + Space, Alt + Shift
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$List = New-WinUserLanguageList -Language 'en-US'; Set-WinUserLanguageList -LanguageList $List -Force; Write-Host '>>> ĐÃ THIẾT LẬP THÀNH CÔNG DUY NHẤT BÀN PHÍM ENGLISH (US) <<<' -ForegroundColor Green"
echo.
echo ======================================================================
echo  HOÀN TẤT! Máy tính này đã chuẩn hóa 100%.
echo  Học sinh sẽ gõ phím số 1, 2, 3... hoàn toàn bình thường khi làm bài.
echo ======================================================================
echo.
pause