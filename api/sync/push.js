/**
 * Vercel Serverless Function: POST /api/sync/push
 * Chiều Đẩy: Máy tính Giáo viên (Local) ➔ Cloud (P0 Fix):
 * - Đẩy Ca thi, Đề thi công khai, Đáp án bí mật và Whitelist
 * - Phát hiện xung đột sửa đề: Nếu ca thi đã có thí sinh nộp bài và checksum thay đổi -> TỪ CHỐI 409
 * - Tách riêng đề thi (exam_papers) và đáp án (exam_answer_keys)
 */

import { getSupabaseServerClient } from '../lib/supabaseClient.js';
import { verifyJWT, calculatePayloadHash } from '../lib/security.js';

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
        error: 'Chỉ có Giáo viên được xác thực mới có quyền đồng bộ đề thi lên Cloud!'
      });
    }

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
    const supabase = getSupabaseServerClient();

    // 2. Tính toán mã băm SHA-256 toàn vẹn của Đề thi
    const checksum = calculatePayloadHash(paper.questions_payload);

    // 3. Kiểm tra Xung đột Sửa đề (TC12):
    // Nếu ca thi đã tồn tại và ĐÃ CÓ BÀI THI CỦA HỌC SINH NỘP
    const { data: existingSubmissions } = await supabase
      .from('student_submissions')
      .select('id')
      .eq('session_id', sessionId)
      .limit(1);

    if (existingSubmissions && existingSubmissions.length > 0) {
      // Kiểm tra xem đề thi có bị thay đổi không
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
          code: 'SYNC_CONFLICT_EXAM_MODIFIED',
          error: `Ca thi [${sessionId}] đã có học sinh nộp bài trên Cloud. Hệ thống từ chối ghi đè đề thi mới vì sẽ làm sai lệch điểm số của các bài đã nộp! Vui lòng tạo ca thi mới hoặc tăng version đề.`
        });
      }
    }

    // 4. Lưu Ca thi vào exam_sessions
    await supabase
      .from('exam_sessions')
      .upsert({
        id: sessionId,
        title: session.title || 'Ca thi không tiêu đề',
        subject: session.subject || '',
        duration_minutes: Number(session.duration_minutes || 45),
        hard_cutoff_at: session.hard_cutoff_at || null,
        status: session.status || 'active',
        published_version: Number(session.published_version || 1),
        shuffle_questions: session.shuffle_questions !== false,
        shuffle_options: session.shuffle_options !== false,
        allow_review: !!session.allow_review,
        score_release_mode: session.score_release_mode || 'manual_release',
        scores_released_at: session.scores_released_at || null,
        updated_at: new Date().toISOString()
      }, 'id');

    // 5. Lưu Đề thi công khai vào exam_papers (ĐÃ TÁCH BỎ ĐÁP ÁN)
    const paperVersion = Number(paper.version || 1);
    const paperId = `paper_${sessionId}_v${paperVersion}`;

    await supabase
      .from('exam_papers')
      .upsert({
        id: paperId,
        session_id: sessionId,
        questions_payload: paper.questions_payload,
        version: paperVersion,
        checksum_sha256: checksum,
        created_at: new Date().toISOString()
      }, 'id');

    // 6. Lưu Đáp án bí mật vào exam_answer_keys (CẤM TUYỆT ĐỐI ANON ĐỌC)
    if (answer_key?.answer_key_payload) {
      const answerKeyId = `key_${sessionId}_v${paperVersion}`;
      await supabase
        .from('exam_answer_keys')
        .upsert({
          id: answerKeyId,
          session_id: sessionId,
          paper_id: paperId,
          answer_key_payload: answer_key.answer_key_payload,
          scoring_version: Number(answer_key.scoring_version || 1),
          created_at: new Date().toISOString()
        }, 'id');
    }

    // 7. Đồng bộ Danh sách Thí sinh (Whitelist)
    if (Array.isArray(whitelist) && whitelist.length > 0) {
      for (const student of whitelist) {
        if (!student.student_code) continue;
        await supabase
          .from('student_whitelist')
          .upsert({
            session_id: sessionId,
            student_code: String(student.student_code).trim().toUpperCase(),
            student_name: student.student_name || student.student_code,
            student_class: student.student_class || '',
            access_code_hash: student.access_code_hash || '',
            is_blocked: !!student.is_blocked
          }, 'session_id,student_code');
      }
    }

    return res.status(200).json({
      success: true,
      sessionId,
      version: paperVersion,
      checksumSha256: checksum,
      whitelistCount: whitelist.length,
      message: 'Đồng bộ Ca thi & Đề thi lên Cloud thành công an toàn!'
    });
  } catch (error) {
    console.error('[API /api/sync/push] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ trong quá trình đồng bộ lên Cloud!' });
  }
}
