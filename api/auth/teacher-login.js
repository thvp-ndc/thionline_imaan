/**
 * Vercel Serverless Function: POST /api/auth/teacher-login
 * Alias for /api/auth/teacher to support both client auth pathways
 */

import teacherAuthHandler from './teacher.js';

export default async function handler(req, res) {
  return teacherAuthHandler(req, res);
}
