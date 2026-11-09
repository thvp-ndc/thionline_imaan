/**
 * Vercel Serverless Function: GET /api/system/info
 * Cung cấp thông tin môi trường Cloud Vercel
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  return res.status(200).json({
    success: true,
    isCloud: true,
    platform: 'Vercel Serverless & Supabase Database',
    version: '2026.1',
    serverIp: 'Cloud Edge',
    port: 443
  });
}
