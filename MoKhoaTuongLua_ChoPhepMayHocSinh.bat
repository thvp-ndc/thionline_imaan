@echo off
chcp 65001 >nul
title MỞ KHÓA TƯỜNG LỬA WINDOWS CHO HỆ THỐNG THI VNLAN

:: Tự động yêu cầu quyền Administrator nếu chưa có
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [*] Đang yêu cầu quyền Administrator...
    echo [*] Vui lòng bấm "Yes" (Có) trong cửa sổ thông báo hiện lên!
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ==============================================================================
echo       HỆ THỐNG VNLAN - MỞ KHÓA TƯỜNG LỬA CHO MÁY HỌC SINH KẾT NỐI MẠNG LAN
echo ==============================================================================
echo.

:: 1. Mở cổng TCP 3000 (Cổng chính Web & WebSocket VNLAN)
echo [1/4] Đang mở cổng TCP 3000 cho máy học sinh...
netsh advfirewall firewall delete rule name="VNLAN Exam Server (TCP 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="VNLAN Exam Server (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul

:: 2. Mở cổng TCP 80 (Cổng HTTP chuẩn redirect)
echo [2/4] Đang mở cổng TCP 80...
netsh advfirewall firewall delete rule name="VNLAN Exam HTTP (TCP 80)" >nul 2>&1
netsh advfirewall firewall add rule name="VNLAN Exam HTTP (TCP 80)" dir=in action=allow protocol=TCP localport=80 profile=any >nul

:: 3. Mở các cổng UDP (Phát sóng Beacon & Tên miền mạng LAN)
echo [3/4] Đang mở các cổng UDP 41234, 5353, 5355...
netsh advfirewall firewall delete rule name="VNLAN UDP Beacon (41234)" >nul 2>&1
netsh advfirewall firewall add rule name="VNLAN UDP Beacon (41234)" dir=in action=allow protocol=UDP localport=41234 profile=any >nul

netsh advfirewall firewall delete rule name="VNLAN mDNS (5353)" >nul 2>&1
netsh advfirewall firewall add rule name="VNLAN mDNS (5353)" dir=in action=allow protocol=UDP localport=5353 profile=any >nul

netsh advfirewall firewall delete rule name="VNLAN LLMNR (5355)" >nul 2>&1
netsh advfirewall firewall add rule name="VNLAN LLMNR (5355)" dir=in action=allow protocol=UDP localport=5355 profile=any >nul

:: 4. Cho phép trực tiếp ứng dụng Node.js kết nối Inbound
echo [4/4] Đang cho phép ứng dụng Node.js nhận kết nối từ mạng nội bộ...
where node > temp_node_path.txt 2>nul
set /p NODE_PATH=<temp_node_path.txt
del temp_node_path.txt >nul 2>&1
if defined NODE_PATH (
    netsh advfirewall firewall delete rule name="VNLAN Node.js Inbound" >nul 2>&1
    netsh advfirewall firewall add rule name="VNLAN Node.js Inbound" dir=in action=allow program="%NODE_PATH%" enable=yes profile=any >nul
)

:: 5. Chuyển card mạng LAN hiện tại sang Private nếu đang là Public
powershell -NoProfile -Command "try { Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' -and $_.IPv4Connectivity -ne 'NoTraffic' } | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue } catch {}" >nul 2>&1

echo.
echo ==============================================================================
echo [THÀNH CÔNG] ĐÃ MỞ TƯỜNG LỬA HOÀN TẤT CHO TOÀN BỘ PHÒNG MÁY!
echo.
echo Các máy học sinh trong phòng máy giờ có thể kết nối bình thường:
echo    Địa chỉ IP: http://192.168.1.13:3000/student
echo.
echo Lưu ý: Nhớ mở file 'KhoiDong_MayGiaoVien.bat' để máy chủ hoạt động trước khi thi!
echo ==============================================================================
echo.
pause
