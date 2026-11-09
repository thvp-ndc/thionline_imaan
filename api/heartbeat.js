/**
 * Vercel Serverless Function: POST /api/heartbeat
 * Cập nhật Nhịp tim & Đồng bộ Đồng hồ Server-Authoritative (P0 Fix):
 * - Phân biệt rõ last_seen_at và last_progress_at
 * - Kiểm soát thời gian đếm ngược chính xác theo giờ máy chủ
 * - Lưu tạm delta câu trả lời để phòng chống mất bài
 */

import { getSupabaseServerClient } from './_lib/supabaseClient.js';
import { verifyJWT } from './_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const {
      exam_session_token,
      current_revision,
      delta_answers,
      is_progress_update
    } = req.body || {};

    if (!exam_session_token) {
      return res.status(401).json({ success: false, error: 'Thiếu Token phiên thi!' });
    }

    const secretKey = process.env.JWT_SECRET_KEY || 'VNLAN_STUDENT_JWT_SECRET_2026';
    const decoded = verifyJWT(exam_session_token, secretKey);

    if (!decoded || decoded.type !== 'student_session') {
      return res.status(401).json({ success: false, error: 'Phiên thi không hợp lệ hoặc đã hết hạn!' });
    }

    const { attemptId, deadlineAt } = decoded;
    const now = new Date();
    const deadlineTime = new Date(deadlineAt).getTime();
    const remainingSeconds = Math.max(0, Math.floor((deadlineTime - now.getTime()) / 1000));

    const supabase = getSupabaseServerClient();

    const updatePayload = {
      last_seen_at: now.toISOString()
    };

    if (current_revision !== undefined) {
      updatePayload.current_revision = Number(current_revision);
    }

    if (is_progress_update) {
      updatePayload.last_progress_at = now.toISOString();
      if (delta_answers) {
        updatePayload.answers_delta_json = delta_answers;
      }
    }

    await supabase
      .from('student_exam_attempts')
      .update(updatePayload)
      .eq('id', attemptId);

    return res.status(200).json({
      success: true,
      serverTime: now.toISOString(),
      remainingSeconds,
      isTimeExpired: remainingSeconds <= 0
    });
  } catch (error) {
    console.error('[API /api/heartbeat] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ' });
  }
}
