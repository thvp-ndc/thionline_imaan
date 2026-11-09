/**
 * @vnlan/online - Security Utilities (Zero-Dependency Node.js Crypto)
 * Bảo mật cấp cao theo tiêu chuẩn P0:
 * - HMAC-SHA256 JWT Token cho Giáo viên
 * - Cấp quyền thiết bị nguyên tử (Atomic Device Authorization)
 * - Băm mã truy cập kèm Salt cho Học sinh (Access Code Hashing)
 * - Băm nội dung bài nộp (Payload Hash SHA-256) chống gian lận
 */

import crypto from 'node:crypto';

const SYSTEM_SALT = process.env.SYSTEM_SECURITY_SALT || 'VNLAN_HYBRID_CLOUD_2026_SECURITY_SALT';

/**
 * Băm mã PIN / Ngày sinh của học sinh kèm Salt (Chống lộ PII)
 */
export function hashAccessCode(studentCode, rawPin) {
  const cleanCode = String(studentCode || '').trim().toUpperCase();
  const cleanPin = String(rawPin || '').trim();
  return crypto
    .createHash('sha256')
    .update(`${cleanCode}_${cleanPin}_${SYSTEM_SALT}`)
    .digest('hex');
}

/**
 * Sinh Server Device Token ngẫu nhiên (32 bytes cryptographically secure)
 */
export function generateDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Băm Device Token để lưu vào CSDL (Không lưu token rõ)
 */
export function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex');
}

/**
 * Tính mã băm SHA-256 của nội dung bài nộp (Kiểm tra toàn vẹn & chống sửa đổi)
 */
export function calculatePayloadHash(payload) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto
    .createHash('sha256')
    .update(serialized)
    .digest('hex');
}

/**
 * Sinh mã JWT Token gọn nhẹ (HMAC-SHA256)
 */
export function signJWT(payload, secretKey, expiresInSeconds = 14400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secretKey || SYSTEM_SALT)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  return `${b64Header}.${b64Payload}.${signature}`;
}

/**
 * Xác thực JWT Token (HMAC-SHA256)
 */
export function verifyJWT(token, secretKey) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [b64Header, b64Payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secretKey || SYSTEM_SALT)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Token hết hạn
    }
    return payload;
  } catch (e) {
    return null;
  }
}
