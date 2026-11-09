/**
 * @vnlan/server - CloudSyncService
 * Động cơ Đồng bộ Hai Chiều theo Giao thức 3 bước (3-Way Handshake) - P0 Fix:
 * - Bước 1: Pull danh sách bài thi từ Cloud
 * - Bước 2: Commit vào SQLite trong Transaction (phát hiện xung đột, không ghi đè ngầm)
 * - Bước 3: Gửi xác nhận Acknowledge lên Cloud
 */

const db = require('../db');
const crypto = require('node:crypto');

class CloudSyncService {
  /**
   * Đăng nhập lấy Token Giáo viên từ Cloud
   */
  async loginToCloud(cloudBaseUrl, teacherPasscode) {
    const cleanUrl = cloudBaseUrl.replace(/\/$/, '');
    const res = await fetch(`${cleanUrl}/api/auth/teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: teacherPasscode })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Đăng nhập vào Cloud thất bại. Kiểm tra lại Passcode!');
    }

    return data.token;
  }

  /**
   * CHIỀU ĐẨY (PUSH): Đẩy Ca thi, Đề thi và Whitelist từ máy bàn lên Cloud
   */
  async pushLocalSessionToCloud(sessionId, cloudBaseUrl, teacherPasscode) {
    const cleanUrl = cloudBaseUrl.replace(/\/$/, '');
    const token = await this.loginToCloud(cleanUrl, teacherPasscode);

    // 1. Đọc dữ liệu từ SQLite
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) {
      throw new Error(`Không tìm thấy ca thi [${sessionId}] trong CSDL máy bàn!`);
    }

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(session.exam_id);
    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(session.exam_id);

    // Tách riêng: Đề thi công khai (questions_payload) và Đáp án bí mật (answer_key_payload)
    const questionsPayload = [];
    const answerKeyPayload = {};

    questions.forEach((q) => {
      let opts = [];
      try { opts = JSON.parse(q.options_json || '[]'); } catch (e) {}

      // questionsPayload: TUYỆT ĐỐI KHÔNG chứa correct_answers
      questionsPayload.push({
        id: q.id,
        order_index: q.order_index,
        question_type: q.question_type,
        content: q.content,
        options: opts,
        max_score: q.max_score,
        scoring_config: q.scoring_config_json ? JSON.parse(q.scoring_config_json) : null
      });

      // answerKeyPayload: Lưu trữ riêng
      let ca = [];
      try { ca = JSON.parse(q.correct_answers_json || '[]'); } catch (e) { ca = [q.correct_answers_json]; }
      answerKeyPayload[q.id] = ca;
    });

    // 2. Lấy danh sách thí sinh trong ca thi nếu có
    const sessionStudents = db.prepare(`
      SELECT s.* FROM session_students ss
      JOIN students s ON ss.student_id = s.id
      WHERE ss.session_id = ?
    `).all(sessionId);

    const whitelist = sessionStudents.map((s) => ({
      student_code: s.student_code || s.id,
      student_name: s.student_name,
      student_class: s.class_name,
      access_code_hash: '' // Có thể băm ngày sinh s.dob nếu có
    }));

    // 3. Gửi gói tin lên Cloud
    const res = await fetch(`${cleanUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        session: {
          id: session.id,
          title: session.title,
          subject: exam ? exam.subject : '',
          duration_minutes: session.duration_minutes,
          status: 'active',
          published_version: 1,
          shuffle_questions: exam ? exam.shuffle_questions === 1 : true,
          shuffle_options: exam ? exam.shuffle_options === 1 : true,
          allow_review: exam ? exam.allow_review === 1 : false,
          score_release_mode: session.score_release_mode || 'manual_release'
        },
        paper: {
          version: 1,
          questions_payload: questionsPayload
        },
        answer_key: {
          scoring_version: 1,
          answer_key_payload: answerKeyPayload
        },
        whitelist
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Đẩy dữ liệu lên Cloud thất bại!');
    }

    return data;
  }

  /**
   * CHIỀU KÉO (PULL & COMMIT LOCAL): Kéo bài nộp về máy bàn theo Giao thức 3 bước
   */
  async pullCloudSubmissionsToLocal(sessionId, cloudBaseUrl, teacherPasscode) {
    const cleanUrl = cloudBaseUrl.replace(/\/$/, '');
    const token = await this.loginToCloud(cleanUrl, teacherPasscode);

    // --- BƯỚC 1: PULL (Kéo danh sách bài thi từ Cloud) ---
    const pullRes = await fetch(`${cleanUrl}/api/sync/pull?session_id=${encodeURIComponent(sessionId)}&limit=100`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const pullData = await pullRes.json();
    if (!pullRes.ok || !pullData.success) {
      throw new Error(pullData.error || 'Kéo dữ liệu từ Cloud thất bại!');
    }

    const { batchId, items = [] } = pullData;
    if (items.length === 0) {
      return { success: true, message: 'Không có bài nộp mới nào cần đồng bộ.', itemsSynced: 0 };
    }

    // --- BƯỚC 2: COMMIT LOCAL (Mở SQLite Transaction lưu an toàn & phát hiện xung đột) ---
    const acknowledgedIds = [];
    let conflictsCount = 0;

    const insertAttemptStmt = db.prepare(`
      INSERT INTO student_attempts (
        id, session_id, student_code, student_name, class_name,
        mcq_score, essay_score, total_score, is_graded, status,
        submitted_at, answers_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'submitted', ?, ?)
    `);

    const updateAttemptStmt = db.prepare(`
      UPDATE student_attempts
      SET mcq_score = ?, essay_score = ?, total_score = ?, answers_json = ?
      WHERE id = ?
    `);

    const findAttemptStmt = db.prepare('SELECT * FROM student_attempts WHERE session_id = ? AND student_code = ?');

    // Chạy Transaction trên SQLite
    db.exec('BEGIN TRANSACTION;');
    try {
      for (const item of items) {
        const existing = findAttemptStmt.get(sessionId, item.studentCode);

        if (!existing) {
          // Thêm mới hoàn toàn
          const attemptId = item.attemptId || `att_${sessionId}_${item.studentCode}_${Date.now()}`;
          insertAttemptStmt.run(
            attemptId,
            sessionId,
            item.studentCode,
            item.studentName || item.studentCode,
            item.studentClass || '',
            item.mcqScore || 0.0,
            item.essayScore || 0.0,
            item.score || 0.0,
            item.submittedAt || new Date().toISOString(),
            JSON.stringify(item.detailsJson || {})
          );
          acknowledgedIds.push(item.id);
        } else {
          // Bản ghi đã tồn tại -> Kiểm tra tính nhất quán (Conflict Detection - TC11, TC12)
          if (existing.total_score !== item.score) {
            conflictsCount++;
            console.warn(`[SYNC WARNING] Phát hiện lệch điểm số thí sinh [${item.studentCode}]: Local=${existing.total_score}, Cloud=${item.score}`);
          }
          // Bản ghi đã an toàn trong SQLite -> Cho phép xác nhận để Cloud không gửi lại
          acknowledgedIds.push(item.id);
        }
      }
      db.exec('COMMIT;');
    } catch (txErr) {
      db.exec('ROLLBACK;');
      throw new Error('Lỗi Transaction trong SQLite khi lưu bài thi: ' + txErr.message);
    }

    // --- BƯỚC 3: ACKNOWLEDGE (Gửi xác nhận hoàn tất lên Cloud) ---
    if (acknowledgedIds.length > 0) {
      const ackRes = await fetch(`${cleanUrl}/api/sync/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          batch_id: batchId,
          acknowledged_item_ids: acknowledgedIds
        })
      });

      const ackData = await ackRes.json();
      if (!ackRes.ok || !ackData.success) {
        console.warn('[SYNC WARNING] Đã lưu vào SQLite nhưng xác nhận Cloud gặp lỗi:', ackData.error);
      }
    }

    return {
      success: true,
      batchId,
      itemsSynced: acknowledgedIds.length,
      conflictsCount,
      message: `Đồng bộ hoàn tất thành công ${acknowledgedIds.length} bài thi về máy bàn!`
    };
  }
}

module.exports = new CloudSyncService();
