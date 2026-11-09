/**
 * Vercel Serverless Function: /api/teacher
 * Cổng Quản Trị Giáo Viên Trực Tuyến Đầy Đủ (Full Cloud Teacher Portal API)
 * Hoạt động 100% trên Vercel Storage (Vercel KV / Upstash) - Không cần Supabase:
 * - Xem danh sách ca thi & Bật/Tắt ca thi / Xóa ca thi
 * - Tạo ca thi mới trực tuyến kèm câu hỏi (Trắc nghiệm, Đúng/Sai, Điền số, Tự luận)
 * - Xem bảng điểm & danh sách bài nộp của cả lớp theo thời gian thực
 * - Chấm điểm câu hỏi tự luận trực tuyến
 * - Báo cáo trạng thái Vercel KV Storage
 */

import { getStorageClient } from './_lib/storageClient.js';
import { verifyJWT } from './_lib/security.js';

export default async function handler(req, res) {
  // 1. Xác thực quyền Giáo viên
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query?.token || '');

  const teacherSecret = process.env.JWT_SECRET_KEY || 'VNLAN_TEACHER_JWT_SECRET_2026';
  const decoded = verifyJWT(token, teacherSecret);

  if (!decoded || decoded.role !== 'teacher') {
    return res.status(401).json({
      success: false,
      error: 'Vui lòng đăng nhập bằng mật khẩu giáo viên để thực hiện thao tác này!'
    });
  }

  const storage = getStorageClient();
  const action = req.query?.action || (req.method === 'GET' ? 'sessions' : 'create_session');

  try {
    // -------------------------------------------------------------
    // HÀNH ĐỘNG 0: BÁO CÁO TRẠNG THÁI LƯU TRỮ VERCEL KV (GET)
    // -------------------------------------------------------------
    if (action === 'storage_status') {
      const sessions = await storage.listSessions();
      let totalSubmissions = 0;
      for (const s of sessions) {
        const subs = await storage.listSubmissions(s.id);
        totalSubmissions += subs.length;
      }

      return res.status(200).json({
        success: true,
        isKVConfigured: storage.isKVConfigured,
        storageMode: storage.isKVConfigured ? 'Vercel KV (Cloud Persistent)' : 'In-Memory (Ephemeral Session)',
        totalSessions: sessions.length,
        totalSubmissions,
        provider: '100% GitHub + Vercel'
      });
    }

    // -------------------------------------------------------------
    // HÀNH ĐỘNG 1: LẤY DANH SÁCH CA THI (GET)
    // -------------------------------------------------------------
    if (action === 'sessions') {
      const sessions = await storage.listSessions();
      // Bổ sung số lượng bài nộp cho từng ca thi
      const enrichedSessions = await Promise.all(sessions.map(async (s) => {
        const subs = await storage.listSubmissions(s.id);
        return {
          ...s,
          submissionsCount: subs.length
        };
      }));

      return res.status(200).json({
        success: true,
        sessions: enrichedSessions
      });
    }

    // -------------------------------------------------------------
    // HÀNH ĐỘNG 2: TẠO CA THI MỚI TRÊN CLOUD (POST)
    // -------------------------------------------------------------
    if (action === 'create_session') {
      const {
        title,
        subject_name,
        duration_minutes = 45,
        score_release_mode = 'immediate',
        allow_review = true,
        questions = []
      } = req.body || {};

      if (!title) {
        return res.status(400).json({ success: false, error: 'Vui lòng nhập tên ca thi!' });
      }

      const sessionId = `CA_${Date.now().toString(36).toUpperCase()}`;

      // 1. Lưu thông tin ca thi
      const sessionData = {
        id: sessionId,
        code: sessionId,
        title: title.trim(),
        subject_name: (subject_name || 'Kiểm tra chung').trim(),
        duration_minutes: Number(duration_minutes) || 45,
        status: 'active',
        score_release_mode,
        allow_review: !!allow_review,
        created_at: new Date().toISOString()
      };
      await storage.saveSession(sessionId, sessionData);

      // 2. Tách biệt Đề thi công khai và Đáp án bí mật (P0 Security)
      const publicQuestions = [];
      const secretAnswersMap = {};

      questions.forEach((q, idx) => {
        const qId = q.id || `q_${idx + 1}`;
        secretAnswersMap[qId] = q.correct_answers || q.correct_answer || null;

        // Bản ghi công khai (loại bỏ hoàn toàn trường đáp án)
        const { correct_answers, correct_answer, answer_key, ...safeQuestion } = q;
        publicQuestions.push({
          ...safeQuestion,
          id: qId,
          order_index: idx + 1
        });
      });

      // Lưu Đề thi công khai vào Vercel Storage
      await storage.savePaper(sessionId, {
        id: `paper_${sessionId}`,
        session_id: sessionId,
        version: 1,
        questions_payload: publicQuestions
      });

      // Lưu Đáp án bí mật vào Vercel Storage
      await storage.saveAnswerKey(sessionId, {
        session_id: sessionId,
        answer_key_payload: secretAnswersMap
      });

      return res.status(200).json({
        success: true,
        sessionId,
        message: 'Tạo ca thi trực tuyến thành công!',
        session: sessionData
      });
    }

    // -------------------------------------------------------------
    // HÀNH ĐỘNG 3: BẬT / TẮT TRẠNG THÁI CA THI (POST)
    // -------------------------------------------------------------
    if (action === 'toggle_session') {
      const { session_id, status } = req.body || {};
      const session = await storage.getSession(session_id);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy ca thi!' });
      }

      session.status = status || (session.status === 'active' ? 'closed' : 'active');
      session.updated_at = new Date().toISOString();
      await storage.saveSession(session.id, session);

      return res.status(200).json({
        success: true,
        session
      });
    }

    // -------------------------------------------------------------
    // HÀNH ĐỘNG 4: XÓA CA THI (POST)
    // -------------------------------------------------------------
    if (action === 'delete_session') {
      const { session_id } = req.body || {};
      if (!session_id) {
        return res.status(400).json({ success: false, error: 'Thiếu mã ca thi cần xóa!' });
      }

      await storage.deleteSession(session_id);
      return res.status(200).json({
        success: true,
        message: 'Đã xóa ca thi thành công!'
      });
    }

    // -------------------------------------------------------------
    // HÀNH ĐỘNG 5: XEM BẢNG ĐIỂM & BÀI NỘP CỦA HỌC SINH (GET)
    // -------------------------------------------------------------
    if (action === 'submissions') {
      const { session_id } = req.query || {};
      if (!session_id) {
        return res.status(400).json({ success: false, error: 'Thiếu mã ca thi!' });
      }

      const submissions = await storage.listSubmissions(session_id);
      const session = await storage.getSession(session_id);

      return res.status(200).json({
        success: true,
        sessionTitle: session?.title || session_id,
        count: submissions.length,
        submissions: submissions.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0))
      });
    }

    // -------------------------------------------------------------
    // HÀNH ĐỘNG 6: CHẤM BÀI TỰ LUẬN TRỰC TUYẾN (POST)
    // -------------------------------------------------------------
    if (action === 'grade_essay') {
      const { session_id, student_code, essay_score, question_id, teacher_feedback } = req.body || {};
      if (!session_id || !student_code) {
        return res.status(400).json({ success: false, error: 'Thiếu thông tin bài thi cần chấm!' });
      }

      const sub = await storage.getSubmission(session_id, student_code);
      if (!sub) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp của học sinh này!' });
      }

      const oldMcq = Number(sub.mcq_score) || 0;
      const newEssay = Number(essay_score) || 0;
      sub.essay_score = newEssay;
      sub.score = Math.round((oldMcq + newEssay) * 100) / 100;
      sub.regraded_at = new Date().toISOString();
      if (teacher_feedback !== undefined) {
        sub.teacher_feedback = teacher_feedback;
      }

      await storage.saveSubmission(session_id, student_code, sub);

      return res.status(200).json({
        success: true,
        message: 'Cập nhật điểm tự luận thành công!',
        newScore: sub.score,
        submission: sub
      });
    }

    // -------------------------------------------------------------
    // HÀNH ĐỘNG 7: KHỞI TẠO ĐỀ MẪU 2025 (POST)
    // -------------------------------------------------------------
    if (action === 'seed_sample') {
      await storage.seedSampleIfEmpty();
      return res.status(200).json({
        success: true,
        message: 'Đã nạp đề thi trải nghiệm chuẩn 2025 thành công!'
      });
    }

    return res.status(404).json({ success: false, error: 'Hành động không hợp lệ' });
  } catch (error) {
    console.error('[API /api/teacher] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ: ' + error.message });
  }
}
