/**
 * Vercel Serverless Function: POST /api/auth/teacher-verify
 * Kiểm tra tính hợp lệ của Token Giáo viên trên Cloud
 */

import { verifyJWT } from '../lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ authenticated: false, error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    let token = req.body?.token || '';
    if (!token && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    if (!token) {
      return res.status(200).json({ success: false, authenticated: false, message: 'Thiếu token' });
    }

    const secretKey = process.env.JWT_SECRET_KEY || 'VNLAN_TEACHER_JWT_SECRET_2026';
    const decoded = verifyJWT(token, secretKey);

    if (decoded && decoded.role === 'teacher') {
      return res.status(200).json({
        success: true,
        authenticated: true,
        teacher: { username: decoded.sub || 'admin' }
      });
    }

    return res.status(200).json({ success: false, authenticated: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  } catch (error) {
    return res.status(200).json({ success: false, authenticated: false, message: error.message });
  }
}
