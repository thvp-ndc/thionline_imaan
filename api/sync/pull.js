/**
 * Vercel Serverless Function: GET /api/sync/pull
 * Chiều Kéo (Bước 1): Cloud ➔ Máy tính Giáo viên (Local):
 * - Cung cấp danh sách các bài thi đã nộp có phân trang con trỏ (Cursor-based)
 * - Gắn mã đợt đồng bộ (sync_batch_id)
 * - Chỉ lấy các bản ghi có sync_status = 'pending_pull'
 */

import { getSupabaseServerClient } from '../lib/supabaseClient.js';
import { verifyJWT } from '../lib/security.js';
import crypto from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 1. Xác thực quyền Giáo viên
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const teacherSecret = process.env.JWT_SECRET_KEY || 'VNLAN_TEACHER_JWT_SECRET_2026';
    const decoded = verifyJWT(token, teacherSecret);

    if (!decoded || decoded.role !== 'teacher') {
      return res.status(401).json({
        success: false,
        error: 'Chỉ có Giáo viên được xác thực mới có quyền kéo bài thi về máy bàn!'
      });
    }

    const { session_id, limit = '50' } = req.query || {};

    if (!session_id) {
      return res.status(400).json({ success: false, error: 'Thiếu mã ca thi (session_id)!' });
    }

    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const supabase = getSupabaseServerClient();

    // 2. Lấy danh sách bài nộp cần kéo về (pending_pull)
    const { data: submissions, error: subErr } = await supabase
      .from('student_submissions')
      .select('*')
      .eq('session_id', session_id)
      .eq('sync_status', 'pending_pull')
      .order('submitted_at', { ascending: true })
      .limit(pageSize);

    if (subErr) {
      console.error('[API /api/sync/pull] Fetch submissions error:', subErr);
      return res.status(500).json({ success: false, error: 'Lỗi truy vấn danh sách bài nộp trên Cloud!' });
    }

    const items = submissions || [];
    const batchId = `batch_${session_id}_${crypto.randomBytes(8).toString('hex')}`;

    return res.status(200).json({
      success: true,
      batchId,
      sessionId: session_id,
      itemCount: items.length,
      hasMore: items.length === pageSize,
      items: items.map(sub => ({
        id: sub.id,
        sessionId: sub.session_id,
        studentCode: sub.student_code,
        attemptId: sub.attempt_id,
        score: sub.score,
        mcqScore: sub.mcq_score,
        essayScore: sub.essay_score,
        detailsJson: sub.details_json,
        gradingVersion: sub.grading_version,
        idempotencyKey: sub.idempotency_key,
        payloadHash: sub.payload_hash,
        submittedAt: sub.submitted_at
      }))
    });
  } catch (error) {
    console.error('[API /api/sync/pull] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ' });
  }
}
