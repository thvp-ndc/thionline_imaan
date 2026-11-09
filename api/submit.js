/**
 * Vercel Serverless Function: POST /api/submit
 * Nhận bài nộp, bảo đảm tính Idempotent & Chấm điểm độc lập tại Server (P0 Fix):
 * - Đọc đáp án bí mật từ exam_answer_keys
 * - Gọi @vnlan/core chấm điểm chuẩn xác
 * - Kiểm soát thời hạn với 120s ân hạn (Grace Period)
 * - Ghi bản ghi bài nộp bất biến (Immutable Submission)
 */

import { getSupabaseServerClient } from './lib/supabaseClient.js';
import { verifyJWT, calculatePayloadHash } from './lib/security.js';
import { gradeSubmission } from '../packages/vnlan-core/src/index.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const {
      exam_session_token,
      idempotency_key,
      answers_payload
    } = req.body || {};

    if (!exam_session_token || !idempotency_key) {
      return res.status(400).json({
        success: false,
        error: 'Thiếu Token phiên thi hoặc Mã định danh nộp bài (idempotency_key)!'
      });
    }

    const secretKey = process.env.JWT_SECRET_KEY || 'VNLAN_STUDENT_JWT_SECRET_2026';
    const decoded = verifyJWT(exam_session_token, secretKey);

    if (!decoded || decoded.type !== 'student_session') {
      return res.status(401).json({
        success: false,
        error: 'Phiên thi không hợp lệ hoặc đã hết hạn!'
      });
    }

    const { attemptId, sessionId, studentCode, deadlineAt } = decoded;
    const supabase = getSupabaseServerClient();

    // 1. Kiểm tra tính Chống gửi trùng lặp (Idempotency)
    const { data: existingByKey } = await supabase
      .from('student_submissions')
      .select('id, score, submitted_at')
      .eq('idempotency_key', idempotency_key)
      .single();

    if (existingByKey) {
      // Yêu cầu nộp bài lặp lại -> Trả về kết quả đã ghi nhận trước đó (An toàn tuyệt đối)
      return res.status(200).json({
        success: true,
        isDuplicateSubmission: true,
        submissionId: existingByKey.id,
        score: existingByKey.score,
        submittedAt: existingByKey.submitted_at,
        message: 'Bài thi đã được hệ thống ghi nhận thành công từ trước.'
      });
    }

    // 2. Kiểm tra xem Thí sinh đã có bài nộp nào khác trong ca thi chưa
    const { data: existingByStudent } = await supabase
      .from('student_submissions')
      .select('id, score, submitted_at')
      .eq('session_id', sessionId)
      .eq('student_code', studentCode)
      .single();

    if (existingByStudent) {
      return res.status(200).json({
        success: true,
        isDuplicateSubmission: true,
        submissionId: existingByStudent.id,
        score: existingByStudent.score,
        submittedAt: existingByStudent.submitted_at,
        message: 'Thí sinh đã có bài nộp chính thức trong ca thi này.'
      });
    }

    // 3. Kiểm tra Thời hạn làm bài Server-Authoritative
    const now = new Date();
    const deadlineTime = new Date(deadlineAt).getTime();
    const GRACE_PERIOD_MS = 120 * 1000; // 120 giây ân hạn độ trễ mạng

    if (now.getTime() > deadlineTime + GRACE_PERIOD_MS) {
      // Quá thời hạn quy định -> Đánh dấu recovery_required để giáo viên xử lý
      await supabase
        .from('student_exam_attempts')
        .update({ status: 'recovery_required', last_seen_at: now.toISOString() })
        .eq('id', attemptId);

      return res.status(403).json({
        success: false,
        error: 'Ca thi đã kết thúc vượt quá thời gian ân hạn mạng (120s). Bài nộp được chuyển vào hàng đợi chờ Giáo viên duyệt!',
        code: 'EXAM_DEADLINE_EXCEEDED'
      });
    }

    // 4. Lấy Đề thi công khai từ exam_papers
    const { data: paper, error: pErr } = await supabase
      .from('exam_papers')
      .select('id, questions_payload')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (pErr || !paper) {
      return res.status(500).json({ success: false, error: 'Không tìm thấy dữ liệu đề thi trên máy chủ!' });
    }

    // 5. Đọc Đáp án bí mật từ exam_answer_keys (CHỈ BACKEND SERVERLESS MỚI ĐƯỢC PHÉP TRUY CẬP)
    const { data: answerKeyRow, error: akErr } = await supabase
      .from('exam_answer_keys')
      .select('answer_key_payload')
      .eq('session_id', sessionId)
      .eq('paper_id', paper.id)
      .single();

    // Nếu ca thi chưa có bản ghi answer_key độc lập, fallback lấy từ trường câu hỏi gốc nếu có
    const rawAnswerMap = answerKeyRow?.answer_key_payload || {};

    // Gắn đáp án vào danh sách câu hỏi để gradingEngine chấm điểm
    const questionsWithAnswers = (paper.questions_payload || []).map(q => {
      const qId = q.id || q.question_id;
      const secretCa = rawAnswerMap[qId] || q.correct_answers || q.correct_answers_json;
      return {
        ...q,
        correct_answers: secretCa
      };
    });

    // 6. Chấm điểm độc lập tại Server qua @vnlan/core
    const gradingResult = gradeSubmission(questionsWithAnswers, answers_payload || {});

    // 7. Tính mã băm toàn vẹn SHA-256 của bài làm
    const payloadHash = calculatePayloadHash(answers_payload || {});

    // 8. Ghi nhận Bài nộp Bất biến vào student_submissions
    const submissionRecord = {
      session_id: sessionId,
      student_code: studentCode,
      attempt_id: attemptId,
      score: gradingResult.totalScore,
      mcq_score: gradingResult.mcqScore,
      essay_score: gradingResult.essayScore,
      details_json: gradingResult.perQuestionDetails,
      grading_version: 1,
      idempotency_key: idempotency_key,
      payload_hash: payloadHash,
      sync_status: 'pending_pull',
      submitted_at: now.toISOString()
    };

    const { data: insertedSub, error: subErr } = await supabase
      .from('student_submissions')
      .insert(submissionRecord)
      .single();

    if (subErr) {
      console.error('[API /api/submit] Insert submission error:', subErr);
    }

    // 9. Cập nhật trạng thái phiên thi sang submitted
    await supabase
      .from('student_exam_attempts')
      .update({
        status: 'submitted',
        submitted_at: now.toISOString(),
        last_seen_at: now.toISOString()
      })
      .eq('id', attemptId);

    // 10. Đọc chế độ công bố điểm của Ca thi
    const { data: sessionInfo } = await supabase
      .from('exam_sessions')
      .select('score_release_mode')
      .eq('id', sessionId)
      .single();

    const isImmediateRelease = sessionInfo?.score_release_mode === 'immediate';

    return res.status(200).json({
      success: true,
      submissionId: insertedSub?.id || idempotency_key,
      submittedAt: now.toISOString(),
      score: isImmediateRelease ? gradingResult.totalScore : null,
      mcqScore: isImmediateRelease ? gradingResult.mcqScore : null,
      essayScore: isImmediateRelease ? gradingResult.essayScore : null,
      totalQuestions: gradingResult.totalQuestions,
      answeredCount: gradingResult.answeredCount,
      correctCount: isImmediateRelease ? gradingResult.correctCount : null,
      isImmediateRelease,
      message: 'Chúc mừng bạn đã hoàn thành và nộp bài thi thành công!'
    });
  } catch (error) {
    console.error('[API /api/submit] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ trong quá trình thu bài!' });
  }
}
