/**
 * Vercel Serverless Function: /api/health
 * Kiểm tra trạng thái hoạt động của hệ sinh thái Cloud
 */

export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    system: 'VNLAN Online Hybrid Cloud',
    engine: '@vnlan/core v1.0.0',
    timestamp: new Date().toISOString(),
    timezone: 'Asia/Ho_Chi_Minh'
  });
}
