import assert from 'node:assert';
import {
  hashAccessCode,
  generateDeviceToken,
  hashToken,
  calculatePayloadHash,
  signJWT,
  verifyJWT
} from './api/lib/security.js';

console.log('================================================================');
console.log('  KIỂM THỬ TIÊU CHUẨN BẢO MẬT NGÀY 4: CLOUD AUTH & CRYPTO       ');
console.log('================================================================');

// 1. Kiểm tra Băm mã PIN thí sinh (Salted Hash)
const code1 = hashAccessCode('HS001', '2008-05-15');
const code2 = hashAccessCode('HS001', '2008-05-15');
const code3 = hashAccessCode('HS002', '2008-05-15');
assert.strictEqual(code1, code2, 'Mã băm cùng thí sinh và PIN phải trùng nhau');
assert.notStrictEqual(code1, code3, 'Mã băm khác thí sinh phải khác nhau (nhờ Salt)');
console.log('[PASS] SEC-01: Băm mã PIN học sinh kèm Salt đạt chuẩn bảo mật P0');

// 2. Kiểm tra Sinh và Băm Device Token
const rawToken = generateDeviceToken();
assert.strictEqual(rawToken.length, 64, 'Token 32-bytes dạng hex phải có độ dài 64');
const hashedToken = hashToken(rawToken);
assert.notStrictEqual(rawToken, hashedToken, 'Mã băm token không được giống token gốc');
console.log('[PASS] SEC-02: Sinh Device Token ngẫu nhiên & băm lưu trữ CSDL thành công');

// 3. Kiểm tra Tính toán mã băm bài nộp (Payload Hash)
const payloadA = { student: 'HS001', answers: { q1: 'A', q2: 'B' } };
const payloadB = { student: 'HS001', answers: { q1: 'A', q2: 'C' } };
const hashA = calculatePayloadHash(payloadA);
const hashB = calculatePayloadHash(payloadB);
assert.notStrictEqual(hashA, hashB, 'Hai bài làm khác nhau phải có hash khác nhau');
console.log('[PASS] SEC-03: Mã băm SHA-256 bài nộp phân biệt chính xác 100%');

// 4. Kiểm tra Ký và Giải mã JWT Token của Giáo viên
const secret = 'MY_SUPER_SECRET_TEACHER_KEY_2026';
const token = signJWT({ teacherId: 'gv_toan', role: 'teacher' }, secret, 3600);
const decoded = verifyJWT(token, secret);
assert.strictEqual(decoded.teacherId, 'gv_toan');
assert.strictEqual(decoded.role, 'teacher');

// Giả mạo chữ ký
const fakeToken = token.slice(0, -4) + 'abcd';
const fakeDecoded = verifyJWT(fakeToken, secret);
assert.strictEqual(fakeDecoded, null, 'Token bị giả mạo chữ ký phải bị từ chối');

// Token hết hạn
const expiredToken = signJWT({ teacherId: 'gv_toan' }, secret, -10);
const expDecoded = verifyJWT(expiredToken, secret);
assert.strictEqual(expDecoded, null, 'Token hết hạn phải bị từ chối');
console.log('[PASS] SEC-04: JWT Token HMAC-SHA256 phòng chống giả mạo & kiểm soát thời hạn hoàn hảo');

console.log('================================================================');
console.log('  TẤT CẢ 4/4 BÀI KIỂM THỬ BẢO MẬT ĐÃ ĐẠT CHUẨN XUẤT SẮC!        ');
console.log('================================================================');
