/**
 * Vercel Serverless Function: POST /api/auth/student
 * Cổng Xác thực Thí sinh (Student Gatekeeper):
 * - Kiểm tra Whitelist & Băm mã PIN (Chống lộ PII)
 * - Quản lý máy trạng thái phiên thi (student_exam_attempts)
 * - Cấp token thiết bị ngẫu nhiên & tính toán deadline_at độc lập
 */

import { getSupabaseServerClient } from '../lib/supabaseClient.js';
import { hashAccessCode, generateDeviceToken, hashToken, signJWT } from '../lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { session_id, student_code, access_code } = req.body || {};

    if (!session_id || !student_code) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng cung cấp đầy đủ Mã ca thi và Số báo danh!'
      });
    }

    const cleanSessionId = String(session_id).trim();
    const cleanStudentCode = String(student_code).trim().toUpperCase();
    const cleanAccessCode = String(access_code || '').trim();

    const supabase = getSupabaseServerClient();

    // 1. Kiểm tra trạng thái Ca thi
    const { data: session, error: sessionErr } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('id', cleanSessionId)
      .single();

    if (sessionErr || !session) {
      return res.status(404).json({
        success: false,
        error: 'Ca thi không tồn tại hoặc đã bị xóa!'
      });
    }

    if (session.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: session.status === 'draft'
          ? 'Ca thi chưa được Giáo viên mở!'
          : 'Ca thi đã kết thúc. Cổng thi đã đóng!'
      });
    }

    // 2. Kiểm tra Danh sách thí sinh (Whitelist)
    const { data: whitelistUser } = await supabase
      .from('student_whitelist')
      .select('*')
      .eq('session_id', cleanSessionId)
      .eq('student_code', cleanStudentCode)
      .single();

    let studentName = cleanStudentCode;
    let studentClass = '';

    if (whitelistUser) {
      if (whitelistUser.is_blocked) {
        return res.status(403).json({
          success: false,
          error: 'Tài khoản của bạn đã bị khóa do vi phạm quy chế thi!'
        });
      }

      // Đối chiếu mã PIN băm kèm Salt
      const expectedHash = hashAccessCode(cleanStudentCode, cleanAccessCode);
      if (whitelistUser.access_code_hash && whitelistUser.access_code_hash !== expectedHash) {
        return res.status(401).json({
          success: false,
          error: 'Mã truy cập / Ngày sinh không chính xác. Vui lòng kiểm tra lại!'
        });
      }

      studentName = whitelistUser.student_name || cleanStudentCode;
      studentClass = whitelistUser.student_class || '';
    }

    // 3. Kiểm tra xem thí sinh đã có phiên làm bài trước đó chưa
    const { data: existingAttempt } = await supabase
      .from('student_exam_attempts')
      .select('*')
      .eq('session_id', cleanSessionId)
      .eq('student_code', cleanStudentCode)
      .single();

    if (existingAttempt && existingAttempt.status === 'submitted') {
      return res.status(403).json({
        success: false,
        error: 'Thí sinh đã nộp bài thi cho ca này rồi. Không được phép làm lại!',
        code: 'ALREADY_SUBMITTED'
      });
    }

    // 4. Khởi tạo hoặc cập nhật Phiên thi (Attempt)
    const serverDeviceToken = generateDeviceToken();
    const deviceTokenHash = hashToken(serverDeviceToken);
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    let attemptId;
    let startedAt;
    let deadlineAt;

    const now = new Date();
    const durationMs = Number(session.duration_minutes || 45) * 60 * 1000;
    let calculatedDeadline = new Date(now.getTime() + durationMs);

    // Ràng buộc hạn chót tuyệt đối của ca thi nếu có
    if (session.hard_cutoff_at) {
      const cutoff = new Date(session.hard_cutoff_at);
      if (cutoff < calculatedDeadline) {
        calculatedDeadline = cutoff;
      }
    }

    if (existingAttempt) {
      // Học sinh tiếp tục phiên thi đang dang dở (ví dụ mất mạng khôi phục lại)
      attemptId = existingAttempt.id;
      startedAt = existingAttempt.started_at;
      deadlineAt = existingAttempt.deadline_at;

      // Cập nhật token thiết bị mới & nhịp tim
      await supabase
        .from('student_exam_attempts')
        .update({
          device_token_hash: deviceTokenHash,
          last_seen_at: now.toISOString(),
          status: 'in_progress',
          client_ip: clientIp,
          user_agent: userAgent
        })
        .eq('id', attemptId);
    } else {
      // Tạo phiên thi mới hoàn toàn
      startedAt = now.toISOString();
      deadlineAt = calculatedDeadline.toISOString();

      const { data: newAttempt, error: insertErr } = await supabase
        .from('student_exam_attempts')
        .insert({
          session_id: cleanSessionId,
          student_code: cleanStudentCode,
          started_at: startedAt,
          deadline_at: deadlineAt,
          status: 'in_progress',
          device_token_hash: deviceTokenHash,
          client_ip: clientIp,
          user_agent: userAgent,
          current_revision: 0
        })
        .single();

      if (insertErr) {
        console.error('[API /api/auth/student] Attempt insert error:', insertErr);
      }
      attemptId = newAttempt?.id || `${cleanSessionId}_${cleanStudentCode}`;
    }

    // 5. Cấp phát exam_session_token có chữ ký bí mật
    const serverSecret = process.env.JWT_SECRET_KEY || 'VNLAN_STUDENT_JWT_SECRET_2026';
    const examSessionToken = signJWT(
      {
        type: 'student_session',
        attemptId,
        sessionId: cleanSessionId,
        studentCode: cleanStudentCode,
        studentName,
        studentClass,
        deviceToken: serverDeviceToken,
        deadlineAt
      },
      serverSecret,
      Math.ceil(durationMs / 1000) + 7200 // Hết hạn sau thời gian thi + 2 giờ ân hạn
    );

    return res.status(200).json({
      success: true,
      examSessionToken,
      studentCode: cleanStudentCode,
      studentName,
      studentClass,
      sessionTitle: session.title,
      durationMinutes: session.duration_minutes,
      startedAt,
      deadlineAt,
      allowReview: !!session.allow_review
    });
  } catch (error) {
    console.error('[API /api/auth/student] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ' });
  }
}
