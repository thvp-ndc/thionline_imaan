/**
 * Vercel Serverless Function: GET /api/results
 * Cổng Tra cứu Kết quả & Bài làm Thí sinh (P0 Security):
 * - Kiểm tra quyền công bố điểm của Ca thi (score_release_mode)
 * - Chỉ mở khóa chi tiết câu đúng/sai khi cho phép (allow_review)
 */

import { getStorageClient } from './_lib/storageClient.js';
import { getSupabaseServerClient } from './_lib/supabaseClient.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { session_id, student_code } = req.query || {};

    if (!session_id || !student_code) {
      return res.status(400).json({ success: false, error: 'Vui lòng cung cấp Mã ca thi và Số báo danh!' });
    }

    const cleanSessionId = String(session_id).trim();
    const cleanStudentCode = String(student_code).trim().toUpperCase();

    // 1. Kiểm tra trong Vercel Storage
    const storage = getStorageClient();
    const storageSession = await storage.getSession(cleanSessionId);

    if (storageSession) {
      const submission = await storage.getSubmission(storageSession.id, cleanStudentCode);
      if (!submission) {
        return res.status(404).json({
          success: false,
          error: 'Chưa tìm thấy bài thi đã nộp cho Số báo danh này trong ca thi!'
        });
      }

      const isScoresReleased = (
        storageSession.score_release_mode === 'immediate' ||
        storageSession.scores_released_at !== undefined
      );

      if (!isScoresReleased) {
        return res.status(200).json({
          success: true,
          isScoresReleased: false,
          submittedAt: submission.submitted_at,
          studentCode: cleanStudentCode,
          sessionTitle: storageSession.title,
          message: 'Bài thi đã được ghi nhận an toàn trên hệ thống. Điểm số sẽ được Giáo viên công bố sau!'
        });
      }

      return res.status(200).json({
        success: true,
        isScoresReleased: true,
        allowReview: !!storageSession.allow_review,
        studentCode: cleanStudentCode,
        sessionTitle: storageSession.title,
        score: submission.score,
        mcqScore: submission.mcq_score,
        essayScore: submission.essay_score,
        submittedAt: submission.submitted_at,
        details: storageSession.allow_review ? submission.details_json : null,
        message: 'Tra cứu kết quả bài thi thành công!'
      });
    }

    // 2. Fallback: Supabase Backend
    const supabase = getSupabaseServerClient();

    const { data: session, error: sErr } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('id', cleanSessionId)
      .single();

    if (sErr || !session) {
      return res.status(404).json({ success: false, error: 'Ca thi không tồn tại!' });
    }

    const isScoresReleased = (
      session.score_release_mode === 'immediate' ||
      (session.score_release_mode === 'manual_release' && session.scores_released_at !== null)
    );

    const { data: submission, error: subErr } = await supabase
      .from('student_submissions')
      .select('*')
      .eq('session_id', cleanSessionId)
      .eq('student_code', cleanStudentCode)
      .single();

    if (subErr || !submission) {
      return res.status(404).json({
        success: false,
        error: 'Chưa tìm thấy bài thi đã nộp cho Số báo danh này trong ca thi!'
      });
    }

    if (!isScoresReleased) {
      return res.status(200).json({
        success: true,
        isScoresReleased: false,
        submittedAt: submission.submitted_at,
        studentCode: cleanStudentCode,
        sessionTitle: session.title,
        message: 'Bài thi đã được ghi nhận an toàn trên hệ thống. Điểm số sẽ được Giáo viên công bố sau!'
      });
    }

    return res.status(200).json({
      success: true,
      isScoresReleased: true,
      allowReview: !!session.allow_review,
      studentCode: cleanStudentCode,
      sessionTitle: session.title,
      score: submission.score,
      mcqScore: submission.mcq_score,
      essayScore: submission.essay_score,
      submittedAt: submission.submitted_at,
      details: session.allow_review ? submission.details_json : null,
      message: 'Tra cứu kết quả bài thi thành công!'
    });
  } catch (error) {
    console.error('[API /api/results] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ' });
  }
}
