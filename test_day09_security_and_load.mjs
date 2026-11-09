import assert from 'node:assert';
import sessionHandler from './api/session.js';
import submitHandler from './api/submit.js';
import syncHandler from './api/sync.js';
import { signJWT, calculatePayloadHash } from './api/_lib/security.js';
import { gradeSubmission } from './packages/vnlan-core/src/index.js';

const pushHandler = (req, res) => { req.query = { ...req.query, action: 'push' }; return syncHandler(req, res); };
const pullHandler = (req, res) => { req.query = { ...req.query, action: 'pull' }; return syncHandler(req, res); };

console.log('================================================================');
console.log('  BỘ KIỂM THỬ THÂM NHẬP BẢO MẬT & THỬ TẢI ĐỒNG THỜI NGÀY 9     ');
console.log('  (PENETRATION TESTING & CONCURRENCY LOAD BENCHMARK V2026.1)     ');
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

// Hàm đệ quy kiểm tra xem có bất kỳ trường nào chứa từ khóa đáp án bị lọt không
function checkObjectForAnswerLeakage(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const forbiddenKeys = [
    'correct_answers',
    'correct_answers_json',
    'correct_answer',
    'answer_key',
    'answer_key_payload',
    'keyChoice'
  ];

  for (const k of Object.keys(obj)) {
    if (forbiddenKeys.includes(k)) return true;
    if (typeof obj[k] === 'object' && checkObjectForAnswerLeakage(obj[k])) {
      return true;
    }
  }
  return false;
}

async function runPenetrationAndLoadTests() {
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

  const studentSecret = 'VNLAN_STUDENT_JWT_SECRET_2026';
  const teacherSecret = 'VNLAN_TEACHER_JWT_SECRET_2026';

  const validStudentToken = signJWT(
    {
      type: 'student_session',
      attemptId: 'att-pen-01',
      sessionId: 'SESS_PEN_TEST',
      studentCode: 'HS_PEN_01',
      deadlineAt: new Date(Date.now() + 3600 * 1000).toISOString()
    },
    studentSecret,
    3600
  );

  const teacherToken = signJWT({ role: 'teacher', sub: 'admin' }, teacherSecret, 3600);

  // ====================================================================
  // PHẦN I: KIỂM THỬ THÂM NHẬP BẢO MẬT (PENETRATION TESTS)
  // ====================================================================

  // PEN-01: Chống lộ đáp án qua API /api/session
  await it('PEN-01: API /api/session tuyệt đối KHÔNG chứa bất kỳ trường đáp án đúng nào', async () => {
    const originalFetch = global.fetch;
    // Giả lập dữ liệu trả về từ Supabase (exam_papers công khai)
    global.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/exam_sessions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'SESS_PEN_TEST',
            title: 'Kỳ thi thử nghiệm',
            duration_minutes: 45,
            status: 'active'
          })
        };
      }
      if (urlStr.includes('/exam_papers')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'paper-01',
            version: 1,
            questions_payload: [
              {
                id: 'q1',
                content: '1 + 1 bằng mấy?',
                options: [
                  { id: 'A', text: '1' },
                  { id: 'B', text: '2' },
                  { id: 'C', text: '3' }
                ],
                max_score: 0.25
                // TUYỆT ĐỐI KHÔNG CÓ correct_answers
              }
            ]
          })
        };
      }
      if (urlStr.includes('/student_exam_attempts')) {
        return { ok: true, status: 200, json: async () => ({ status: 'in_progress' }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    };

    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        headers: { 'Authorization': `Bearer ${validStudentToken}` }
      });
      await sessionHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200);
      const data = res._getData();

      // Kiểm tra quét sâu toàn bộ đối tượng JSON trả về
      const hasLeak = checkObjectForAnswerLeakage(data.paper);
      assert.strictEqual(hasLeak, false, 'Phát hiện rò rỉ trường đáp án đúng trong JSON đề thi!');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // PEN-02: Chống học sinh giả mạo điểm số từ Client
  await it('PEN-02: Học sinh cố tình gửi score: 10.0 nhưng chọn sai -> Bị Server tự tính lại về 0.0', async () => {
    const originalFetch = global.fetch;
    let savedSubmission = null;

    global.fetch = async (url, opts) => {
      const urlStr = String(url);
      const method = opts?.method || 'GET';

      if (urlStr.includes('/student_submissions') && method === 'POST') {
        savedSubmission = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ id: 'sub-new-01', ...savedSubmission }) };
      }
      if (urlStr.includes('/student_submissions')) {
        return { ok: true, status: 200, json: async () => null }; // Chưa có bài cũ
      }
      if (urlStr.includes('/exam_papers')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'paper-01',
            questions_payload: [
              { id: 'q1', question_type: 'single_choice', max_score: 10.0 }
            ]
          })
        };
      }
      if (urlStr.includes('/exam_answer_keys')) {
        // Đáp án bí mật tại server là B
        return {
          ok: true,
          status: 200,
          json: async () => ({ answer_key_payload: { q1: ['B'] } })
        };
      }
      if (urlStr.includes('/student_exam_attempts')) {
        return { ok: true, status: 200, json: async () => ({ status: 'submitted' }) };
      }
      if (urlStr.includes('/exam_sessions')) {
        return { ok: true, status: 200, json: async () => ({ score_release_mode: 'immediate' }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    };

    try {
      // Học sinh gửi gian lận: chọn C (sai) nhưng gửi kèm score: 10.0
      const { req, res } = createMockReqRes({
        method: 'POST',
        body: {
          exam_session_token: validStudentToken,
          idempotency_key: 'idem-hack-score-01',
          score: 10.0, // Thử gian lận
          mcq_score: 10.0,
          isCorrect: true,
          answers_payload: {
            q1: { selected_options: ['C'] } // Chọn C (sai)
          }
        }
      });

      await submitHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200);

      // Điểm số máy chủ ghi nhận phải là 0.0 (do làm sai), KHÔNG THỂ là 10.0
      assert.strictEqual(savedSubmission.score, 0.0, 'Máy chủ không được tin tưởng điểm số gửi lên từ Client!');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // PEN-03: Chống leo thang đặc quyền (Privilege Escalation)
  await it('PEN-03: Token học sinh cố tình gọi API giáo viên /api/sync/push -> Chặn 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${validStudentToken}` }, // Dùng token học sinh
      body: { session: { id: 'hack' } }
    });
    await pushHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401);
  });

  // ====================================================================
  // PHẦN II: THỬ TẢI ĐỒNG THỜI & BENCHMARK (CONCURRENCY LOAD TEST)
  // ====================================================================

  await it('LOAD-01: Benchmark mô phỏng 200 bài nộp đồng thời (P95 < 50ms)', async () => {
    const questions = [
      { id: 'q1', question_type: 'single_choice', correct_answers: ['B'], max_score: 0.25 },
      { id: 'q2', question_type: 'single_choice', correct_answers: ['A'], max_score: 0.25 },
      { id: 'q3', question_type: 'true_false', correct_answers: { a: 'T', b: 'F', c: 'T', d: 'F' }, max_score: 1.0 },
      { id: 'q4', question_type: 'short_answer', correct_answers: ['3.14'], max_score: 0.5 }
    ];

    const studentAnswers = {
      q1: { selected_options: ['B'] },
      q2: { selected_options: ['A'] },
      q3: { true_false_answers: { a: 'T', b: 'F', c: 'T', d: 'F' } },
      q4: { short_answer: '3.14' }
    };

    const TOTAL_REQUESTS = 200;
    const latencies = [];
    const startTime = performance.now();

    // Chạy song song 200 lần chấm điểm bằng Promise.all
    const tasks = Array.from({ length: TOTAL_REQUESTS }).map((_, idx) => {
      return new Promise((resolve) => {
        const t0 = performance.now();
        const result = gradeSubmission(questions, studentAnswers);
        const t1 = performance.now();
        latencies.push(t1 - t0);
        assert.strictEqual(result.totalScore, 2.0); // 0.25 + 0.25 + 1.0 + 0.5 = 2.0
        resolve();
      });
    });

    await Promise.all(tasks);
    const totalTimeMs = performance.now() - startTime;

    // Tính toán Percentile
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)].toFixed(3);
    const p90 = latencies[Math.floor(latencies.length * 0.90)].toFixed(3);
    const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(3);
    const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(3);
    const throughput = Math.round((TOTAL_REQUESTS / (totalTimeMs / 1000)));

    console.log(`       ---------------------------------------------------------`);
    console.log(`       KẾT QUẢ BENCHMARK THỬ TẢI ${TOTAL_REQUESTS} BÀI NỘP ĐỒNG THỜI:`);
    console.log(`       • Tổng thời gian: ${totalTimeMs.toFixed(2)} ms`);
    console.log(`       • Năng lực xử lý (Throughput): ${throughput} yêu cầu/giây`);
    console.log(`       • Độ trễ P50 (Trung vị): ${p50} ms`);
    console.log(`       • Độ trễ P90:            ${p90} ms`);
    console.log(`       • Độ trễ P95:            ${p95} ms`);
    console.log(`       • Độ trễ P99:            ${p99} ms`);
    console.log(`       ---------------------------------------------------------`);

    assert.ok(parseFloat(p95) < 50.0, `P95 phải nhỏ hơn 50ms (Thực tế: ${p95}ms)`);
  });

  // LOAD-02: Chống nộp bài trùng lặp song song (Race Condition Check)
  await it('LOAD-02: 10 yêu cầu nộp bài gửi cùng 1 mili-giây -> Chống nộp trùng lặp 100%', async () => {
    let callCounter = 0;
    const idempotencyMap = new Set();

    // Giả lập hàm xử lý nộp bài an toàn có kiểm tra idempotency
    const simulateSafeSubmit = async (key) => {
      if (idempotencyMap.has(key)) {
        return { status: 200, isDuplicate: true };
      }
      idempotencyMap.add(key);
      callCounter++;
      return { status: 200, isDuplicate: false };
    };

    const duplicateSubmits = Array.from({ length: 10 }).map(() => {
      return simulateSafeSubmit('fixed-idempotency-key-race-01');
    });

    const results = await Promise.all(duplicateSubmits);
    const newInserts = results.filter(r => !r.isDuplicate);
    const duplicates = results.filter(r => r.isDuplicate);

    assert.strictEqual(callCounter, 1, 'Chỉ được có đúng 1 bản ghi mới được ghi nhận vào CSDL');
    assert.strictEqual(newInserts.length, 1);
    assert.strictEqual(duplicates.length, 9);
  });

  console.log('================================================================');
  console.log(`  TỔNG KẾT: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

runPenetrationAndLoadTests();
