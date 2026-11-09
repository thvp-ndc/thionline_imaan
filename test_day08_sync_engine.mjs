import assert from 'node:assert';
import syncHandler from './api/sync.js';
import { signJWT } from './api/_lib/security.js';

const pushHandler = (req, res) => { req.query = { ...req.query, action: 'push' }; return syncHandler(req, res); };
const pullHandler = (req, res) => { req.query = { ...req.query, action: 'pull' }; return syncHandler(req, res); };
const ackHandler = (req, res) => { req.query = { ...req.query, action: 'ack' }; return syncHandler(req, res); };

console.log('================================================================');
console.log('  BỘ KIỂM THỬ ĐỘNG CƠ ĐỒNG BỘ 3 BƯỚC NGÀY 8 (SYNC PROTOCOL)     ');
console.log('================================================================');

function createMockReqRes({ method = 'GET', body = {}, query = {}, headers = {} }) {
  let statusCode = 200;
  let responseData = null;
  const req = { method, body, query, headers: { ...headers } };
  const res = {
    status(code) { statusCode = code; return this; },
    setHeader() { return this; },
    json(data) { responseData = data; return this; },
    _getStatusCode: () => statusCode,
    _getData: () => responseData
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

  const teacherSecret = 'VNLAN_TEACHER_JWT_SECRET_2026';
  const teacherToken = signJWT({ role: 'teacher', sub: 'admin' }, teacherSecret, 3600);
  const studentToken = signJWT({ role: 'student', sub: 'HS001' }, 'STUDENT_SECRET', 3600);

  // 1. Kiểm thử phân quyền API Push
  await it('SYNC-01: Học sinh hoặc người ngoài gọi /api/sync/push -> Bị chặn 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: {}
    });
    await pushHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401);
  });

  // 2. Kiểm thử thiếu dữ liệu Ca thi
  await it('SYNC-02: Đẩy dữ liệu rỗng lên Cloud -> Trả về lỗi 400 Bad Request', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${teacherToken}` },
      body: { session: null }
    });
    await pushHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 400);
  });

  // 3. Kiểm thử phân quyền API Pull
  await it('SYNC-03: Không có quyền gọi /api/sync/pull -> Bị chặn 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      headers: {},
      query: { session_id: 'S1' }
    });
    await pullHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401);
  });

  // 4. Kiểm thử yêu cầu Pull hợp lệ (Mock Supabase response)
  await it('SYNC-04: Giáo viên gọi Pull thành công -> Cấp mã batch_id duy nhất', async () => {
    // Giả lập phản hồi mạng từ Supabase PostgREST
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'sub-01',
          session_id: 'TEST_SESSION_2026',
          student_code: 'HS001',
          score: 8.5,
          sync_status: 'pending_pull'
        }
      ]
    });

    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        headers: { 'Authorization': `Bearer ${teacherToken}` },
        query: { session_id: 'TEST_SESSION_2026' }
      });
      await pullHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200);
      const data = res._getData();
      assert.strictEqual(data.success, true);
      assert.ok(data.batchId && data.batchId.startsWith('batch_'), 'Phải sinh mã đợt batch_id chuẩn');
      assert.strictEqual(data.itemCount, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 5. Kiểm thử API Acknowledge (Xác nhận hoàn tất)
  await it('SYNC-05: API Acknowledge chặn yêu cầu có danh sách ID rỗng', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${teacherToken}` },
      body: { batch_id: 'batch_01', acknowledged_item_ids: [] }
    });
    await ackHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 400);
  });

  console.log('================================================================');
  console.log(`  TỔNG KẾT: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runTests();
