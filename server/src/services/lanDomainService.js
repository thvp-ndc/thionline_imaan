/**
 * lanDomainService.js
 * Dịch vụ phân giải tên miền mạng LAN nội bộ (Zero-Config):
 * Hỗ trợ tên miền: thionline.ndc, www.thionline.ndc, thionline.local, kiemtra.local
 * Hoạt động qua 3 giao thức song song:
 * 1. LLMNR (Link-Local Multicast Name Resolution) - UDP 5355 (224.0.0.252)
 * 2. mDNS (Multicast DNS) - UDP 5353 (224.0.0.251)
 * 3. Local Micro DNS Server - UDP 53 (0.0.0.0)
 * 4. HTTP Port 80 Auto-Redirector -> chuyển hướng http://thionline.ndc sang http://thionline.ndc:3000/student
 */

const dgram = require('node:dgram');
const http = require('node:http');
const os = require('node:os');
const { getLocalIpAddress } = require('./udpDiscovery');

const PRIMARY_DOMAIN = 'thionline.local';
const SUPPORTED_DOMAINS = [
  'thionline.local',
  'www.thionline.local',
  'kiemtra.local',
  'thi.local',
  'thionline.lan',
  'thionline',
  'thionline.ndc'
];

function parseDnsQuestion(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const id = buffer.readUInt16BE(0);
  const flags = buffer.readUInt16BE(2);
  const qdCount = buffer.readUInt16BE(4);
  if (qdCount < 1) return null;

  let offset = 12;
  const labels = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt8(offset++);
    if (len === 0) break;
    if (len > 63 || offset + len > buffer.length) return null;
    labels.push(buffer.toString('utf8', offset, offset + len));
    offset += len;
  }

  const domain = labels.join('.').toLowerCase();
  if (offset + 4 > buffer.length) return null;
  const qType = buffer.readUInt16BE(offset);
  const qClass = buffer.readUInt16BE(offset + 2) & 0x7fff;

  return { id, flags, domain, qType, qClass, questionRaw: buffer.slice(12, offset + 4) };
}

function buildDnsResponse(queryBuffer, targetIp, protocol = 'dns') {
  const q = parseDnsQuestion(queryBuffer);
  if (!q) return null;

  const header = Buffer.alloc(12);
  header.writeUInt16BE(q.id, 0);

  if (protocol === 'llmnr') {
    header.writeUInt16BE(0x8000, 2);
  } else if (protocol === 'mdns') {
    header.writeUInt16BE(0x8400, 2);
  } else {
    header.writeUInt16BE(0x8180, 2);
  }

  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(1, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const ipParts = targetIp.split('.').map(Number);
  if (ipParts.length !== 4) return null;

  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0);
  answer.writeUInt16BE(1, 2);
  answer.writeUInt16BE(1, 4);
  answer.writeUInt32BE(60, 6);
  answer.writeUInt16BE(4, 10);
  answer.writeUInt8(ipParts[0], 12);
  answer.writeUInt8(ipParts[1], 13);
  answer.writeUInt8(ipParts[2], 14);
  answer.writeUInt8(ipParts[3], 15);

  return Buffer.concat([header, q.questionRaw, answer]);
}

class LanDomainService {
  constructor(httpPort = 3000) {
    this.httpPort = httpPort;
    this.primaryDomain = PRIMARY_DOMAIN;
    this.llmnrSocket = null;
    this.mdnsSocket = null;
    this.dnsSocket = null;
    this.http80Server = null;
    this.hostname = os.hostname().toLowerCase();
    this.targetIp = getLocalIpAddress();
  }

  start() {
    this.targetIp = getLocalIpAddress();
    console.log(`[LAN Domain Service] Initializing domain "${this.primaryDomain}" for IP ${this.targetIp}...`);

    this.startLlmnr();
    this.startMdns();
    this.startLocalDns();
    this.startPort80Redirector();
  }

  isMatchingDomain(domain) {
    if (!domain) return false;
    const clean = domain.toLowerCase().trim();
    if (SUPPORTED_DOMAINS.includes(clean)) return true;
    if (clean === this.hostname || clean === `${this.hostname}.local`) return true;
    if (clean.endsWith('.local') || clean.endsWith('.lan') || clean.endsWith('.ndc')) {
      if (clean.includes('thionline') || clean.includes('kiemtra') || clean.includes('thi')) return true;
    }
    return false;
  }

  startLlmnr() {
    try {
      this.llmnrSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.llmnrSocket.on('error', () => {});

      this.llmnrSocket.on('message', (msg, rinfo) => {
        try {
          const q = parseDnsQuestion(msg);
          if (q && this.isMatchingDomain(q.domain)) {
            const currentIp = getLocalIpAddress();
            const resp = buildDnsResponse(msg, currentIp, 'llmnr');
            if (resp) {
              this.llmnrSocket.send(resp, 0, resp.length, rinfo.port, rinfo.address);
            }
          }
        } catch (e) {}
      });

      this.llmnrSocket.bind(5355, '0.0.0.0', () => {
        try {
          this.llmnrSocket.addMembership('224.0.0.252');
          console.log('[LAN Domain Service] LLMNR active on UDP 5355 (224.0.0.252)');
        } catch (e) {}
      });
    } catch (err) {}
  }

  startMdns() {
    try {
      this.mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.mdnsSocket.on('error', () => {});

      this.mdnsSocket.on('message', (msg, rinfo) => {
        try {
          const q = parseDnsQuestion(msg);
          if (q && this.isMatchingDomain(q.domain)) {
            const currentIp = getLocalIpAddress();
            const resp = buildDnsResponse(msg, currentIp, 'mdns');
            if (resp) {
              this.mdnsSocket.send(resp, 0, resp.length, rinfo.port, rinfo.address);
            }
          }
        } catch (e) {}
      });

      this.mdnsSocket.bind(5353, '0.0.0.0', () => {
        try {
          this.mdnsSocket.addMembership('224.0.0.251');
          console.log('[LAN Domain Service] mDNS active on UDP 5353 (224.0.0.251)');
        } catch (e) {}
      });
    } catch (err) {}
  }

  startLocalDns() {
    try {
      this.dnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.dnsSocket.on('error', () => {});

      this.dnsSocket.on('message', (msg, rinfo) => {
        try {
          const q = parseDnsQuestion(msg);
          if (q && this.isMatchingDomain(q.domain)) {
            const currentIp = getLocalIpAddress();
            const resp = buildDnsResponse(msg, currentIp, 'dns');
            if (resp) {
              this.dnsSocket.send(resp, 0, resp.length, rinfo.port, rinfo.address);
            }
          }
        } catch (e) {}
      });

      this.dnsSocket.bind(53, '0.0.0.0', () => {
        console.log('[LAN Domain Service] Local DNS active on UDP port 53');
      });
    } catch (err) {}
  }

  startPort80Redirector() {
    try {
      this.http80Server = http.createServer((req, res) => {
        const hostHeader = (req.headers.host || '').split(':')[0];
        const redirectUrl = `http://${hostHeader || this.primaryDomain}:${this.httpPort}/student`;
        res.writeHead(302, {
          Location: redirectUrl,
          'Content-Type': 'text/html; charset=utf-8'
        });
        res.end(`<html><body>Đang chuyển hướng đến phòng thi: <a href="${redirectUrl}">${redirectUrl}</a></body></html>`);
      });

      this.http80Server.on('error', () => {});

      this.http80Server.listen(80, '0.0.0.0', () => {
        console.log(`[LAN Domain Service] Port 80 auto-redirector active -> redirects http://${this.primaryDomain} to port ${this.httpPort}`);
      });
    } catch (e) {}
  }

  getDomainInfo() {
    const currentIp = getLocalIpAddress();
    return {
      primaryDomain: this.primaryDomain,
      studentDomainUrl: `http://${this.primaryDomain}:${this.httpPort}/student`,
      studentDomainShortUrl: `http://${this.primaryDomain}/student`,
      studentIpUrl: `http://${currentIp}:${this.httpPort}/student`,
      teacherIpUrl: `http://${currentIp}:${this.httpPort}/teacher`,
      hostname: this.hostname,
      currentIp,
      httpPort: this.httpPort,
      supportedDomains: SUPPORTED_DOMAINS
    };
  }

  generateHtmlLauncher() {
    const info = this.getDomainInfo();
    const targetUrl = info.studentIpUrl;
    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VNLAN - Cổng làm bài của học sinh</title>
  <style>
    body {
      background: #f8fafc;
      color: #1e293b;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 36px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 4px solid #2563eb;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 8px; font-size: 19px; color: #0f172a; font-weight: 800; }
    p { color: #64748b; font-size: 13px; margin: 0 0 20px; line-height: 1.5; }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: #ffffff;
      text-decoration: none;
      font-weight: bold;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 14px;
      margin-top: 10px;
      transition: background 0.2s;
    }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>VNLAN - Cổng làm bài của học sinh</h2>
    <p>Đang chuyển hướng đến phòng thi tại máy chủ:<br><b style="color: #2563eb; font-family: monospace;">${targetUrl}</b>...</p>
    <a id="directLink" class="btn" href="${targetUrl}">Bấm Vào Đây Để Vào Phòng Thi</a>
  </div>
  <script>
    window.location.replace("${targetUrl}");
  </script>
</body>
</html>`;
  }

    generateFirewallFixBat() {
    const info = this.getDomainInfo();
    return `@echo off
chcp 65001 >nul
:: Tu dong xin quyen Administrator neu chua co
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Dang yeu cau quyen Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ==========================================================
echo   DANG MO KHOA TUONG LUA WINDOWS CHO PHONG THI LAN
echo ==========================================================
echo.

:: 1. Mo cong TCP 3000 va 80 cho may hoc sinh ket noi
netsh advfirewall firewall delete rule name="ThiOnline LAN (TCP 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="ThiOnline LAN (TCP 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any

netsh advfirewall firewall delete rule name="ThiOnline LAN (TCP 80)" >nul 2>&1
netsh advfirewall firewall add rule name="ThiOnline LAN (TCP 80)" dir=in action=allow protocol=TCP localport=80 profile=any

:: 2. Mo cong UDP 5353 (mDNS) va 5355 (LLMNR) cho ten mien thionline.local
netsh advfirewall firewall delete rule name="ThiOnline mDNS (UDP 5353)" >nul 2>&1
netsh advfirewall firewall add rule name="ThiOnline mDNS (UDP 5353)" dir=in action=allow protocol=UDP localport=5353 profile=any

netsh advfirewall firewall delete rule name="ThiOnline LLMNR (UDP 5355)" >nul 2>&1
netsh advfirewall firewall add rule name="ThiOnline LLMNR (UDP 5355)" dir=in action=allow protocol=UDP localport=5355 profile=any

netsh advfirewall firewall delete rule name="ThiOnline Beacon (UDP 41234)" >nul 2>&1
netsh advfirewall firewall add rule name="ThiOnline Beacon (UDP 41234)" dir=in action=allow protocol=UDP localport=41234 profile=any

echo.
echo ==========================================================
echo [THANH CONG] DA MO KHOA TUONG LUA CHO MAY CON KET NOI!
echo.
echo Cac may hoc sinh trong phong may hien da co the truy cap:
echo   1. Qua Ten mien: http://${this.primaryDomain}:3000/student (hoac http://${this.primaryDomain}/student)
echo   2. Qua Dia chi IP: http://${info.currentIp}:3000/student
echo ==========================================================
echo.
pause
`;
  }

  generateBatInstaller() {
    const info = this.getDomainInfo();
    return `@echo off
chcp 65001 >nul
echo ===================================================
echo   CAI DAT LOI TAT PHONG THI TU DONG [${this.primaryDomain}]
echo ===================================================
echo.
echo Dang gan ten mien ${this.primaryDomain} tro ve may giao vien (${info.currentIp})...

set "HOSTS_FILE=%WINDIR%\\System32\\drivers\\etc\\hosts"
set "DESKTOP_DIR=%USERPROFILE%\\Desktop"

:: Them ban ghi hosts du phong
findstr /i "${this.primaryDomain}" "%HOSTS_FILE%" >nul 2>&1
if %errorlevel% neq 0 (
    echo ${info.currentIp} ${this.primaryDomain} >> "%HOSTS_FILE%" 2>nul
)

:: Tao file loi tat Desktop
echo [InternetShortcut] > "%DESKTOP_DIR%\\VaoPhongThi_NDC.url"
echo URL=${info.studentDomainUrl} >> "%DESKTOP_DIR%\\VaoPhongThi_NDC.url"
echo IconIndex=0 >> "%DESKTOP_DIR%\\VaoPhongThi_NDC.url"
echo IconFile=%WINDIR%\\System32\\shell32.dll >> "%DESKTOP_DIR%\\VaoPhongThi_NDC.url"

echo.
echo [THANH CONG] Da tao bieu tuong "VaoPhongThi_NDC" tren man hinh Desktop!
echo Hoc sinh chi can mo trinh duyet go: ${this.primaryDomain}:3000
echo.
pause
`;
  }

  stop() {
    if (this.llmnrSocket) { try { this.llmnrSocket.close(); } catch (e) {} }
    if (this.mdnsSocket) { try { this.mdnsSocket.close(); } catch (e) {} }
    if (this.dnsSocket) { try { this.dnsSocket.close(); } catch (e) {} }
    if (this.http80Server) { try { this.http80Server.close(); } catch (e) {} }
  }
}

module.exports = {
  LanDomainService,
  PRIMARY_DOMAIN,
  SUPPORTED_DOMAINS
};
