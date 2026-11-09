/**
 * Vercel Serverless Function: POST /api/sync/ack
 * Chiều Xác nhận (Bước 3): Máy tính Giáo viên ➔ Cloud (P0 Fix):
 * - Đánh dấu sync_status = 'synced_to_local'
 * - Lưu sync_batch_id và acknowledged_at
 * - TUYỆT ĐỐI KHÔNG XÓA bài thi trên Cloud (Bảo toàn dữ liệu kép)
 */

import { getSupabaseServerClient } from '../lib/supabaseClient.js';
import { verifyJWT } from '../lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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
        error: 'Chỉ có Giáo viên được xác thực mới có quyền gửi xác nhận đồng bộ!'
      });
    }

    const { batch_id, acknowledged_item_ids = [] } = req.body || {};

    if (!Array.isArray(acknowledged_item_ids) || acknowledged_item_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Danh sách ID bài thi xác nhận (acknowledged_item_ids) không được để trống!'
      });
    }

    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();

    // 2. Cập nhật trạng thái từng bản ghi đã kéo về thành công
    let updateCount = 0;
    for (const itemId of acknowledged_item_ids) {
      const { error: updErr } = await supabase
        .from('student_submissions')
        .update({
          sync_status: 'synced_to_local',
          sync_batch_id: batch_id || 'manual_sync',
          acknowledged_at: now
        })
        .eq('id', itemId);

      if (!updErr) updateCount++;
    }

    return res.status(200).json({
      success: true,
      batchId: batch_id,
      acknowledgedCount: updateCount,
      acknowledgedAt: now,
      message: `Đã xác nhận an toàn ${updateCount} bài thi đồng bộ về máy bàn.`
    });
  } catch (error) {
    console.error('[API /api/sync/ack] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ' });
  }
}
