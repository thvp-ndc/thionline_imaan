/**
 * Vercel Serverless Function: POST /api/submit
 * Nhận bài nộp, bảo đảm tính Idempotent & Chấm điểm độc lập tại Server (P0 Fix):
 * - Đọc đáp án bí mật từ Vercel Storage hoặc Supabase
 * - Gọi @vnlan/core chấm điểm chuẩn xác
 * - Kiểm soát thời hạn với 120s ân hạn (Grace Period)
 * - Ghi bản ghi bài nộp bất biến (Immutable Submission)
 */

import { getStorageClient } from './_lib/storageClient.js';
import { getSupabaseServerClient } from './_lib/supabaseClient.js';
import { verifyJWT, calculatePayloadHash } from './_lib/security.js';
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
    const now = new Date();

    // 1. Kiểm tra Thời hạn làm bài Server-Authoritative (120s ân hạn độ trễ mạng)
    if (deadlineAt) {
      const deadlineTime = new Date(deadlineAt).getTime();
      const GRACE_PERIOD_MS = 120 * 1000;
      if (now.getTime() > deadlineTime + GRACE_PERIOD_MS) {
        // Cập nhật trạng thái recovery_required
        const supabase = getSupabaseServerClient();
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
    }

    // 2. Kiểm tra Vercel Storage
    const storage = getStorageClient();
    const storageSession = await storage.getSession(sessionId);

    if (storageSession) {
      // 2.1 Kiểm tra xem học sinh đã có bài nộp chưa (Idempotency)
      const existingSub = await storage.getSubmission(storageSession.id, studentCode);
      if (existingSub) {
        return res.status(200).json({
          success: true,
          isDuplicateSubmission: true,
          submissionId: existingSub.id || idempotency_key,
          score: existingSub.score,
          submittedAt: existingSub.submitted_at,
          message: 'Bài thi đã được hệ thống ghi nhận thành công từ trước.'
        });
      }

      // 2.2 Lấy đề thi công khai & đáp án bí mật từ Vercel Storage
      const paper = await storage.getPaper(storageSession.id);
      const answerKeyRecord = await storage.getAnswerKey(storageSession.id);

      if (!paper) {
        return res.status(500).json({ success: false, error: 'Không tìm thấy dữ liệu đề thi trên máy chủ!' });
      }

      const rawAnswerMap = answerKeyRecord?.answer_key_payload || {};
      const questionsWithAnswers = (paper.questions_payload || []).map(q => {
        const qId = q.id || q.question_id;
        const secretCa = rawAnswerMap[qId] || q.correct_answers || q.correct_answers_json;
        return {
          ...q,
          correct_answers: secretCa
        };
      });

      // 2.3 Chấm điểm độc lập tại Server qua @vnlan/core
      const gradingResult = gradeSubmission(questionsWithAnswers, answers_payload || {});
      const payloadHash = calculatePayloadHash(answers_payload || {});

      // 2.4 Lưu bản ghi bài nộp bất biến vào Vercel Storage
      const submissionRecord = {
        id: `sub_${idempotency_key}`,
        session_id: storageSession.id,
        student_code: studentCode,
        attempt_id: attemptId,
        score: gradingResult.totalScore,
        mcq_score: gradingResult.mcqScore,
        essay_score: gradingResult.essayScore,
        details_json: gradingResult.perQuestionDetails,
        answers_payload: answers_payload || {},
        grading_version: 1,
        idempotency_key: idempotency_key,
        payload_hash: payloadHash,
        sync_status: 'pending_pull',
        submitted_at: now.toISOString()
      };

      await storage.saveSubmission(storageSession.id, studentCode, submissionRecord);

      const isImmediateRelease = storageSession.score_release_mode === 'immediate';

      return res.status(200).json({
        success: true,
        submissionId: submissionRecord.id,
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
    }

    // 3. Fallback: Supabase Backend
    const supabase = getSupabaseServerClient();

    // 3.1 Kiểm tra Idempotency
    const { data: existingByKey } = await supabase
      .from('student_submissions')
      .select('id, score, submitted_at')
      .eq('idempotency_key', idempotency_key)
      .single();

    if (existingByKey) {
      return res.status(200).json({
        success: true,
        isDuplicateSubmission: true,
        submissionId: existingByKey.id,
        score: existingByKey.score,
        submittedAt: existingByKey.submitted_at,
        message: 'Bài thi đã được hệ thống ghi nhận thành công từ trước.'
      });
    }

    // 3.2 Đọc đề thi và đáp án từ Supabase
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

    const { data: answerKeyRow } = await supabase
      .from('exam_answer_keys')
      .select('answer_key_payload')
      .eq('session_id', sessionId)
      .eq('paper_id', paper.id)
      .single();

    const rawAnswerMap = answerKeyRow?.answer_key_payload || {};
    const questionsWithAnswers = (paper.questions_payload || []).map(q => {
      const qId = q.id || q.question_id;
      const secretCa = rawAnswerMap[qId] || q.correct_answers || q.correct_answers_json;
      return {
        ...q,
        correct_answers: secretCa
      };
    });

    const gradingResult = gradeSubmission(questionsWithAnswers, answers_payload || {});
    const payloadHash = calculatePayloadHash(answers_payload || {});

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

    const { data: insertedSub } = await supabase
      .from('student_submissions')
      .insert(submissionRecord)
      .single();

    await supabase
      .from('student_exam_attempts')
      .update({
        status: 'submitted',
        submitted_at: now.toISOString(),
        last_seen_at: now.toISOString()
      })
      .eq('id', attemptId);

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
