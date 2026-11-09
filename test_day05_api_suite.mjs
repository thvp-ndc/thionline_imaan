import assert from 'node:assert';
import authHandler from './api/auth.js';
import sessionHandler from './api/session.js';
import submitHandler from './api/submit.js';
import heartbeatHandler from './api/heartbeat.js';
import { hashAccessCode, signJWT } from './api/_lib/security.js';

const teacherAuthHandler = (req, res) => { req.query = { ...req.query, action: 'teacher' }; return authHandler(req, res); };
const studentAuthHandler = (req, res) => { req.query = { ...req.query, action: 'student' }; return authHandler(req, res); };

console.log('================================================================');
console.log('  BỘ KIỂM THỬ TÍCH HỢP TOÀN DIỆN CÁC API NGÀY 5 (VERCEL API)     ');
console.log('================================================================');

// Helper giả lập Request/Response của Vercel Serverless Function
function createMockReqRes({ method = 'GET', body = {}, query = {}, headers = {} }) {
  const req = {
    method,
    body,
    query,
    headers: { ...headers }
  };

  let statusCode = 200;
  let responseData = null;
  let responseHeaders = {};

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(key, value) {
      responseHeaders[key] = value;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    _getStatusCode: () => statusCode,
    _getData: () => responseData,
    _getHeaders: () => responseHeaders
  };

  return { req, res };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function it(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`[PASS] ${name}`);
        passed++;
      } catch (err) {
        console.error(`[FAIL] ${name}`);
        console.error(`       Lỗi: ${err.message}`);
        failed++;
      }
    })();
  }

  // 1. Kiểm thử API Xác thực Giáo viên
  await it('API-01: Giáo viên đăng nhập sai passcode -> Bị từ chối 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { passcode: 'WRONG_PASSCODE' }
    });
    await teacherAuthHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401);
    assert.strictEqual(res._getData().success, false);
  });

  await it('API-02: Giáo viên đăng nhập đúng passcode -> Cấp Token & HttpOnly Cookie 200', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { passcode: 'VNLAN@Teacher2026' }
    });
    await teacherAuthHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200);
    assert.strictEqual(res._getData().success, true);
    assert.ok(res._getData().token, 'Phải có token JWT trả về');
    const cookie = res._getHeaders()['Set-Cookie']?.[0] || '';
    assert.ok(cookie.includes('HttpOnly'), 'Cookie phải có cờ HttpOnly');
  });

  // 2. Kiểm thử API Phát Đề Thi (Loại trừ 100% Đáp án Đúng)
  await it('API-03: API Phát đề /api/session chặn thí sinh không có token', async () => {
    const { req, res } = createMockReqRes({ method: 'GET', headers: {} });
    await sessionHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401);
  });

  // 3. Kiểm thử API Heartbeat (Đồng bộ thời gian máy chủ)
  await it('API-04: API Heartbeat tính toán chính xác remainingSeconds theo deadline máy chủ', async () => {
    const secretKey = 'VNLAN_STUDENT_JWT_SECRET_2026';
    const futureDeadline = new Date(Date.now() + 1800 * 1000).toISOString(); // Còn 30 phút
    const token = signJWT(
      {
        type: 'student_session',
        attemptId: 'att-123',
        sessionId: 'sess-01',
        studentCode: 'HS001',
        deadlineAt: futureDeadline
      },
      secretKey,
      3600
    );

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        exam_session_token: token,
        current_revision: 5
      }
    });

    await heartbeatHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200);
    const data = res._getData();
    assert.strictEqual(data.success, true);
    assert.ok(data.remainingSeconds > 1700 && data.remainingSeconds <= 1800, 'Thời gian còn lại phải xấp xỉ 1800s');
    assert.strictEqual(data.isTimeExpired, false);
  });

  // 4. Kiểm thử Chống Gian Lận Nộp Quá Giờ (Grace Period Exceeded)
  await it('API-05: API Submit từ chối nộp bài khi quá deadline + 120s ân hạn', async () => {
    const secretKey = 'VNLAN_STUDENT_JWT_SECRET_2026';
    const pastDeadline = new Date(Date.now() - 300 * 1000).toISOString(); // Đã hết giờ cách đây 5 phút
    const expiredToken = signJWT(
      {
        type: 'student_session',
        attemptId: 'att-past',
        sessionId: 'sess-01',
        studentCode: 'HS002',
        deadlineAt: pastDeadline
      },
      secretKey,
      3600
    );

    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        exam_session_token: expiredToken,
        idempotency_key: 'idem-past-01',
        answers_payload: { q1: { selected_options: ['A'] } }
      }
    });

    await submitHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 403);
    assert.strictEqual(res._getData().code, 'EXAM_DEADLINE_EXCEEDED');
  });

  console.log('================================================================');
  console.log(`  TỔNG KẾT: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runTests();
