/**
 * Vercel Serverless Function: GET /api/session
 * Cấp phát Đề thi đã loại bỏ 100% Đáp án Đúng (P0 Fix):
 * - Chỉ đọc từ bảng exam_papers
 * - Tuyệt đối KHÔNG đọc bảng exam_answer_keys
 * - Kiểm tra phiên thi và thời hạn làm bài của học sinh
 */

import { getSupabaseServerClient } from './_lib/supabaseClient.js';
import { verifyJWT } from './_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : (req.query?.token || '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Thiếu Token xác thực phiên thi!' });
    }

    const secretKey = process.env.JWT_SECRET_KEY || 'VNLAN_STUDENT_JWT_SECRET_2026';
    const teacherSecret = process.env.JWT_SECRET_KEY || 'VNLAN_TEACHER_JWT_SECRET_2026';

    let decoded = verifyJWT(token, secretKey);
    let isTeacher = false;

    if (!decoded) {
      // Thử giải mã bằng khóa Giáo viên
      decoded = verifyJWT(token, teacherSecret);
      if (decoded && decoded.role === 'teacher') {
        isTeacher = true;
      }
    }

    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Phiên thi không hợp lệ hoặc đã hết hạn!' });
    }

    const sessionId = decoded.sessionId || req.query?.session_id;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Thiếu mã ca thi!' });
    }

    const supabase = getSupabaseServerClient();

    // 1. Lấy thông tin Ca thi
    const { data: session, error: sErr } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sErr || !session) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy ca thi!' });
    }

    // 2. Lấy Đề thi công khai từ exam_papers (ĐÃ LOẠI BỎ ĐÁP ÁN ĐÚNG)
    const { data: paper, error: pErr } = await supabase
      .from('exam_papers')
      .select('id, version, questions_payload')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (pErr || !paper) {
      return res.status(404).json({ success: false, error: 'Đề thi của ca này chưa được tải lên hệ thống!' });
    }

    // 3. Nếu là Học sinh: Kiểm tra trạng thái nộp bài
    if (!isTeacher) {
      const studentCode = decoded.studentCode;
      const { data: attempt } = await supabase
        .from('student_exam_attempts')
        .select('status, deadline_at')
        .eq('session_id', sessionId)
        .eq('student_code', studentCode)
        .single();

      if (attempt && attempt.status === 'submitted') {
        return res.status(403).json({
          success: false,
          error: 'Thí sinh đã hoàn thành và nộp bài thi rồi!',
          code: 'ALREADY_SUBMITTED'
        });
      }
    }

    // Trả về cấu trúc đề thi an toàn (chỉ chứa câu hỏi, lựa chọn và điểm tối đa của câu)
    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        subject: session.subject,
        durationMinutes: session.duration_minutes,
        hardCutoffAt: session.hard_cutoff_at,
        status: session.status,
        allowReview: !!session.allow_review
      },
      paper: {
        id: paper.id,
        version: paper.version,
        questions: paper.questions_payload // Danh sách câu hỏi công khai
      },
      student: isTeacher ? null : {
        studentCode: decoded.studentCode,
        studentName: decoded.studentName,
        deadlineAt: decoded.deadlineAt
      }
    });
  } catch (error) {
    console.error('[API /api/session] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ' });
  }
}
