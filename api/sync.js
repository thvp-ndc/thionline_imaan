/**
 * Vercel Serverless Function: /api/sync
 * Bộ Điều Phối Đồng Bộ Dữ Liệu Thống Nhất (Unified Sync Dispatcher)
 * Hợp nhất Giao thức 3 bước (push, pull, ack) thành 1 function duy nhất
 * để tối ưu hóa quota Serverless Functions trên Vercel Hobby Plan (0đ).
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from './_lib/supabaseClient.js';
import { verifyJWT, calculatePayloadHash } from './_lib/security.js';

export default async function handler(req, res) {
  const rawUrl = req.url || '';
  const actionParam = req.query?.action || req.query?.path || '';

  let action = 'pull';
  if (rawUrl.includes('/push') || actionParam === 'push') {
    action = 'push';
  } else if (rawUrl.includes('/ack') || actionParam === 'ack') {
    action = 'ack';
  } else if (rawUrl.includes('/pull') || actionParam === 'pull') {
    action = 'pull';
  } else {
    action = req.method === 'GET' ? 'pull' : 'push';
  }

  // 1. Xác thực quyền Giáo viên (Bắt buộc cho mọi thao tác sync)
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const teacherSecret = process.env.JWT_SECRET_KEY || 'VNLAN_TEACHER_JWT_SECRET_2026';
  const decoded = verifyJWT(token, teacherSecret);

  if (!decoded || decoded.role !== 'teacher') {
    return res.status(401).json({
      success: false,
      error: 'Chỉ có Giáo viên được xác thực mới có quyền thực hiện thao tác đồng bộ!'
    });
  }

  const supabase = getSupabaseServerClient();

  // -------------------------------------------------------------
  // CHIỀU ĐẨY: PUSH (Local ➔ Cloud)
  // -------------------------------------------------------------
  if (action === 'push') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
      const {
        session,
        paper,
        answer_key,
        whitelist = []
      } = req.body || {};

      if (!session?.id || !paper?.questions_payload) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu thông tin Ca thi hoặc Nội dung câu hỏi!'
        });
      }

      const sessionId = session.id;

      // Tính toán mã băm SHA-256 toàn vẹn của Đề thi
      const checksum = calculatePayloadHash(paper.questions_payload);

      // Kiểm tra Xung đột Sửa đề: Nếu ca thi đã có học sinh nộp bài
      const { data: existingSubmissions } = await supabase
        .from('student_submissions')
        .select('id')
        .eq('session_id', sessionId)
        .limit(1);

      if (existingSubmissions && existingSubmissions.length > 0) {
        const { data: currentPaper } = await supabase
          .from('exam_papers')
          .select('checksum_sha256, version')
          .eq('session_id', sessionId)
          .order('version', { ascending: false })
          .limit(1)
          .single();

        if (currentPaper && currentPaper.checksum_sha256 !== checksum) {
          return res.status(409).json({
            success: false,
            error: 'Xung đột sửa đề: Ca thi này đã có bài làm của học sinh nộp lên Cloud. Không thể sửa đổi nội dung câu hỏi!',
            code: 'EXAM_PAPER_FROZEN'
          });
        }
      }

      // Upsert Ca thi vào exam_sessions
      const sessionRecord = {
        id: sessionId,
        title: session.title || 'Ca thi không tên',
        subject_name: session.subject_name || '',
        duration_minutes: session.duration_minutes || 45,
        status: session.status || 'active',
        start_time: session.start_time || new Date().toISOString(),
        end_time: session.end_time || null,
        hard_cutoff_at: session.hard_cutoff_at || null,
        score_release_mode: session.score_release_mode || 'immediate',
        allow_review: !!session.allow_review,
        sync_version: (session.sync_version || 0) + 1,
        last_synced_at: new Date().toISOString()
      };

      const { error: sessErr } = await supabase
        .from('exam_sessions')
        .upsert(sessionRecord, 'id');

      if (sessErr) {
        console.error('[API /api/sync/push] Session upsert error:', sessErr);
        return res.status(500).json({ success: false, error: 'Lỗi cập nhật Ca thi lên Cloud!' });
      }

      // Lưu Đề thi công khai (exam_papers)
      const paperRecord = {
        session_id: sessionId,
        version: paper.version || 1,
        questions_payload: paper.questions_payload,
        checksum_sha256: checksum
      };

      const { data: insertedPaper, error: paperErr } = await supabase
        .from('exam_papers')
        .insert(paperRecord)
        .single();

      if (paperErr) {
        console.error('[API /api/sync/push] Paper insert error:', paperErr);
      }

      // Lưu Đáp án bí mật (exam_answer_keys)
      if (answer_key?.answer_key_payload) {
        const answerKeyRecord = {
          session_id: sessionId,
          paper_id: insertedPaper?.id || null,
          answer_key_payload: answer_key.answer_key_payload,
          key_version: answer_key.version || 1
        };

        const { error: keyErr } = await supabase
          .from('exam_answer_keys')
          .insert(answerKeyRecord);

        if (keyErr) {
          console.error('[API /api/sync/push] Answer key insert error:', keyErr);
        }
      }

      // Đồng bộ Danh sách thí sinh (student_whitelist)
      if (Array.isArray(whitelist) && whitelist.length > 0) {
        const whitelistRecords = whitelist.map(w => ({
          session_id: sessionId,
          student_code: String(w.student_code || '').trim().toUpperCase(),
          student_name: w.student_name || '',
          student_class: w.student_class || '',
          access_code_hash: w.access_code_hash || null,
          is_blocked: !!w.is_blocked
        }));

        await supabase
          .from('student_whitelist')
          .upsert(whitelistRecords, 'session_id,student_code');
      }

      return res.status(200).json({
        success: true,
        sessionId,
        checksum,
        questionsCount: paper.questions_payload.length,
        whitelistCount: whitelist.length,
        message: 'Đẩy dữ liệu ca thi lên Cloud thành công an toàn!'
      });
    } catch (error) {
      console.error('[API /api/sync/push] Error:', error);
      return res.status(500).json({ success: false, error: 'Lỗi máy chủ trong quá trình đẩy đề!' });
    }
  }

  // -------------------------------------------------------------
  // CHIỀU KÉO: PULL (Cloud ➔ Local)
  // -------------------------------------------------------------
  if (action === 'pull') {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
      const { session_id, limit = '50' } = req.query || {};

      if (!session_id) {
        return res.status(400).json({ success: false, error: 'Thiếu mã ca thi (session_id)!' });
      }

      const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

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
        batch_id: batchId,
        count: items.length,
        itemCount: items.length,
        items: items.map(sub => ({
          id: sub.id,
          session_id: sub.session_id,
          student_code: sub.student_code,
          score: sub.score,
          mcq_score: sub.mcq_score,
          essay_score: sub.essay_score,
          answers_payload: sub.details_json,
          payload_hash: sub.payload_hash,
          idempotency_key: sub.idempotency_key,
          submitted_at: sub.submitted_at
        }))
      });
    } catch (error) {
      console.error('[API /api/sync/pull] Error:', error);
      return res.status(500).json({ success: false, error: 'Lỗi máy chủ trong quá trình kéo bài nộp!' });
    }
  }

  // -------------------------------------------------------------
  // CHIỀU XÁC NHẬN: ACK (Local ➔ Cloud)
  // -------------------------------------------------------------
  if (action === 'ack') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
      const { batch_id, acknowledged_item_ids = [] } = req.body || {};

      if (!Array.isArray(acknowledged_item_ids) || acknowledged_item_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Danh sách ID bài thi xác nhận (acknowledged_item_ids) không được để trống!'
        });
      }

      const now = new Date().toISOString();
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
        acknowledgedCount: updateCount,
        batch_id,
        acknowledged_at: now,
        message: `Đã xác nhận an toàn ${updateCount} bài thi về máy bàn thành công!`
      });
    } catch (error) {
      console.error('[API /api/sync/ack] Error:', error);
      return res.status(500).json({ success: false, error: 'Lỗi xác nhận đồng bộ' });
    }
  }

  return res.status(404).json({ success: false, error: 'Hành động đồng bộ không hợp lệ' });
}
