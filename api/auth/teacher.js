/**
 * Vercel Serverless Function: POST /api/auth/teacher
 * Xác thực Giáo viên phía máy chủ - TUYỆT ĐỐI KHÔNG để lộ Secret ở Client
 */

import { signJWT } from '../lib/security.js';

export default async function handler(req, res) {
  // Chỉ chấp nhận phương thức POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { passcode, username, password } = req.body || {};
    const serverPasscode = process.env.TEACHER_ADMIN_PASSCODE || 'VNLAN@Teacher2026';
    const serverSecret = process.env.JWT_SECRET_KEY || 'VNLAN_TEACHER_JWT_SECRET_2026';

    const inputKey = passcode || password || '';
    if (!inputKey || inputKey !== serverPasscode) {
      return res.status(401).json({
        success: false,
        error: 'Mã xác thực Giáo viên không chính xác. Vui lòng thử lại!'
      });
    }

    // Cấp phát JWT token có thời hạn 4 giờ (14400 giây)
    const token = signJWT(
      {
        role: 'teacher',
        sub: username || 'teacher_admin',
        type: 'teacher_session'
      },
      serverSecret,
      14400
    );

    // Thiết lập HttpOnly Cookie để tăng cường an toàn (chống XSS)
    res.setHeader('Set-Cookie', [
      `vnlan_teacher_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=14400; ${
        process.env.NODE_ENV === 'production' ? 'Secure;' : ''
      }`
    ]);

    return res.status(200).json({
      success: true,
      role: 'teacher',
      token,
      expiresIn: 14400,
      message: 'Xác thực Giáo viên thành công'
    });
  } catch (error) {
    console.error('[API /api/auth/teacher] Error:', error);
    return res.status(500).json({ success: false, error: 'Lỗi máy chủ nội bộ' });
  }
}
