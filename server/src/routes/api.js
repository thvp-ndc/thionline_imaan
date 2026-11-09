const submissionZipService = require('../services/submissionZipService');
const express = require('express');
const router = express.Router();
const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const examService = require('../services/examService');
const gradingService = require('../services/gradingService');
const studentService = require('../services/studentService');
const wordExamParser = require('../services/wordExamParser');
const examExportService = require('../services/examExportService');
const { calculateTrueFalseScore, resolveCorrectAnswers } = require('../services/trueFalseUtils');
const { getLocalIpAddress } = require('../services/udpDiscovery');
const crypto = require('node:crypto');
const authService = require('../services/authService');
const curriculumService = require('../services/curriculumService');
const questionBankService = require('../services/questionBankService');
const matrixGeneratorService = require('../services/matrixGeneratorService');
const backupService = require('../services/backupService');
const duplicateDetectionService = require('../services/duplicateDetectionService');
const licenseService = require('../services/licenseService');
const questionBankBackupService = require('../services/questionBankBackupService');
const storageConfig = require('../config/storageConfig');
const { broadcastProgressUpdate } = require('../services/socketHandler');
const questionIntegrityValidator = require('../services/questionIntegrityValidator');

// VNLAN DRM & LICENSE ENFORCEMENT MIDDLEWARE
// Triển khai Lá Chắn Bảo Vệ Dữ Liệu & Nghiệp Vụ Thi (Data & Active Session Shield):
// - Khi giấy phép hết hạn: Chuyển sang Chế độ Xem & Xuất Dữ Liệu (Read-only & Export Mode)
// - BẢO VỆ CA THI ĐANG DIỄN RA: Tuyệt đối không chặn học sinh nộp bài (/student/submit) hoặc giáo viên kết thúc ca (/finish)
// - Chỉ chặn việc tạo đề thi mới (/exams), thêm câu hỏi mới, hoặc mở ca thi mới (/sessions, /start)
function licenseEnforceMiddleware(req, res, next) {
  const p = req.path;

  // 1. Các endpoint luôn được phép truy cập
  if (
    p.startsWith('/license') ||
    p.startsWith('/auth') ||
    p === '/server-info' ||
    p === '/system/backup' ||
    p === '/system/restore' ||
    p.startsWith('/question-bank/backup') ||
    p.includes('/export')
  ) {
    return next();
  }

  try {
    const status = licenseService.getLicenseStatus();

    // 2. Nếu giấy phép hết hạn hoặc ở chế độ Read-only & Export
    if (status.is_expired || status.is_tampered || status.read_only_export) {
      // 2.1. Cho phép tất cả các thao tác đọc dữ liệu (GET)
      if (req.method === 'GET') {
        return next();
      }

      // 2.2. Cho phép thí sinh lưu bài và nộp bài trong ca thi đang diễn ra (Bảo toàn bài thi học sinh)
      if (p === '/student/submit' || p.startsWith('/student/')) {
        return next();
      }

      // 2.3. Cho phép giáo viên kết thúc ca thi hoặc điều phối thí sinh trong ca đang mở
      if (p.endsWith('/finish') || p.includes('/attempts/')) {
        return next();
      }

      // 2.4. Chặn việc tạo đề thi mới hoặc mở ca thi mới khi giấy phép đã hết hạn
      if (
        (req.method === 'POST' && (p === '/sessions' || p === '/exams' || p === '/matrix/generate-exam')) ||
        p.endsWith('/start') ||
        p.startsWith('/question-bank/questions')
      ) {
        return res.status(403).json({
          success: false,
          license_blocked: true,
          read_only_export: true,
          error_code: status.is_tampered ? 'LICENSE_TAMPERED' : 'LICENSE_EXPIRED',
          status,
          message: 'Bản quyền VNLAN Exam Master đã hết hạn. Hệ thống đang ở Chế độ Xem lại & Xuất dữ liệu. Các ca thi đang diễn ra vẫn được nộp bài bình thường; không thể tạo đề mới hoặc mở thêm ca thi mới.'
        });
      }
    }
  } catch (err) {
    console.error('[VNLAN DRM] Middleware check error:', err);
  }

  next();
}

router.use(licenseEnforceMiddleware);

// === ORIGIN & CSRF PROTECTION GATE (CHỐNG WEB-TO-LOCAL ATTACKS TỪ TRANG WEB LẠ) ===
function csrfOriginProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 1. Kiểm tra header Sec-Fetch-Site (chuẩn Fetch Metadata RFC)
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite === 'cross-site') {
    console.warn(`[CSRF_BLOCKED] Chặn yêu cầu cross-site từ IP: ${getRealClientIp(req)}`);
    return res.status(403).json({
      success: false,
      message: 'LỖI BẢO MẬT: Phát hiện yêu cầu Cross-Site Request không được phép (CSRF Protection)!'
    });
  }

  // 2. Kiểm tra Origin / Referer
  const origin = req.headers['origin'] || req.headers['referer'];
  if (origin) {
    try {
      const parsedUrl = new URL(origin);
      const hostHeader = req.headers['host'];
      const reqHostname = hostHeader ? hostHeader.split(':')[0] : 'localhost';

      const isAllowedHost =
        parsedUrl.hostname === 'localhost' ||
        parsedUrl.hostname === '127.0.0.1' ||
        parsedUrl.hostname === '::1' ||
        parsedUrl.hostname === reqHostname ||
        parsedUrl.hostname.endsWith('.local');

      if (!isAllowedHost) {
        console.warn(`[CSRF_BLOCKED] Chặn Origin không hợp lệ: "${parsedUrl.hostname}" (kỳ vọng: ${reqHostname})`);
        return res.status(403).json({
          success: false,
          message: 'LỖI BẢO MẬT: Origin hoặc Referer không hợp lệ! Yêu cầu bị từ chối để chống tấn công Web-to-Local.'
        });
      }
    } catch (e) {
      // Bỏ qua lỗi parse URL
    }
  }

  next();
}

router.use(csrfOriginProtection);

// === AUTHENTICATION & LAN SECURITY HELPERS ===
function getRealClientIp(req) {
  const rawIp = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return rawIp.replace('::ffff:', '').trim();
}

function extractTeacherToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.headers['x-teacher-token']) {
    return req.headers['x-teacher-token'];
  }
  if (req.query?.teacher_token) {
    return req.query.teacher_token;
  }
  if (req.body?.teacher_token) {
    return req.body.teacher_token;
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)lan_teacher_token=([^;]*)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

// MIDDLEWARE BẢO VỆ PHÂN HỆ GIÁO VIÊN: BẮT BUỘC TOKEN XÁC THỰC MỌI NƠI (KỂ CẢ LOCALHOST)
function requireTeacherAuth(req, res, next) {
  const token = extractTeacherToken(req);

  // Bắt buộc xác thực Bearer token hoặc cookie của giáo viên, không bypass loopback 127.0.0.1
  if (token && authService.verifyToken(token)) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Truy cập bị từ chối: Yêu cầu xác thực tài khoản giáo viên (Token required)!',
    requireTeacherLogin: true
  });
}

function isTeacherRequest(req) {
  const token = extractTeacherToken(req);
  return Boolean(token && authService.verifyToken(token));
}

// === CÁC API BẢN QUYỀN THƯƠNG MẠI VNLAN ===
router.get('/license/status', (req, res) => {
  try {
    const status = licenseService.getLicenseStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/license/activate', requireTeacherAuth, (req, res) => {
  try {
    const { license_key } = req.body;
    const result = licenseService.activateLicense(license_key);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 0. TEACHER AUTHENTICATION GATE
router.post('/auth/teacher-login', (req, res) => {
  try {
    const { password } = req.body;
    const result = authService.login(password);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.setHeader('Set-Cookie', `lan_teacher_token=${result.token}; Path=/; SameSite=Lax; Max-Age=86400`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/auth/teacher-verify', (req, res) => {
  try {
    const token = extractTeacherToken(req);
    const isValid = authService.verifyToken(token);
    res.json({ success: isValid, authenticated: isValid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/auth/teacher-logout', (req, res) => {
  try {
    const token = extractTeacherToken(req);
    const result = authService.logout(token);
    res.setHeader('Set-Cookie', 'lan_teacher_token=; Path=/; SameSite=Lax; Max-Age=0');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/auth/change-teacher-password', requireTeacherAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = authService.changePassword(currentPassword, newPassword);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

function calculateCurrentAcademicYear() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = now.getMonth() >= 7 ? currentYear : currentYear - 1;
  return `${startYear} - ${startYear + 1}`;
}

function getSystemSchoolInfo() {
  const dynamicYear = calculateCurrentAcademicYear();
  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'school_info'").get();
    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        school_name: parsed.school_name || 'Trường THCS/THPT ...',
        department_name: parsed.department_name || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
        academic_year: parsed.academic_year || dynamicYear
      };
    }
  } catch (e) {}

  let licensedName = '';
  try {
    const status = licenseService.getLicenseStatus();
    if (status && status.client_name && status.client_name !== 'Khách Hàng VNLAN') {
      licensedName = status.client_name;
    }
  } catch (e) {}

  return {
    school_name: licensedName || 'Trường THCS/THPT ...',
    department_name: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
    academic_year: dynamicYear
  };
}

// 1. SYSTEM INFO & LAN ACCESS
router.get('/system/info', (req, res) => {
  const serverIp = getLocalIpAddress();
  const port = req.app.get('port') || 3000;
  res.json({
    success: true,
    serverIp,
    port,
    studentUrl: `http://${serverIp}:${port}/student`,
    schoolInfo: getSystemSchoolInfo(),
    timestamp: new Date().toISOString()
  });
});

// Lấy thông tin trường học
router.get('/system/school-info', (req, res) => {
  try {
    const schoolInfo = getSystemSchoolInfo();
    res.json({ success: true, schoolInfo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật thông tin trường học
router.post('/system/school-info', requireTeacherAuth, (req, res) => {
  try {
    const { school_name, department_name, academic_year } = req.body;
    if (!school_name || !school_name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên trường học không được để trống.' });
    }
    const info = {
      school_name: school_name.trim(),
      department_name: (department_name || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO').trim(),
      academic_year: (academic_year || '2025 - 2026').trim()
    };
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('school_info', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify(info));

    // Đồng bộ tên trường vào bảng system_license để các phân hệ bản quyền hiển thị đồng nhất
    try {
      const licRow = db.prepare('SELECT * FROM system_license WHERE id = 1').get();
      if (licRow && licRow.license_data_json) {
        const licData = JSON.parse(licRow.license_data_json);
        licData.client_name = info.school_name;
        db.prepare('UPDATE system_license SET license_data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
          .run(JSON.stringify(licData));
      }
    } catch (licErr) {}

    res.json({ success: true, schoolInfo: info, message: 'Cập nhật thông tin trường học thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/system/download-launcher', (req, res) => {
  try {
    const lanDomainService = req.app.get('lanDomainService');
    const htmlContent = lanDomainService ? lanDomainService.generateHtmlLauncher() : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ThiOnline.html"');
    res.send(htmlContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/system/download-firewall-fix', (req, res) => {
  try {
    const lanDomainService = req.app.get('lanDomainService');
    const batContent = lanDomainService ? lanDomainService.generateFirewallFixBat() : '';
    res.setHeader('Content-Type', 'application/x-bat');
    res.setHeader('Content-Disposition', 'attachment; filename="MoKhoaTuongLua_ChoPhepMayHocSinh.bat"');
    res.send(batContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/system/download-bat', (req, res) => {
  try {
    const lanDomainService = req.app.get('lanDomainService');
    const batContent = lanDomainService ? lanDomainService.generateBatInstaller() : '';
    res.setHeader('Content-Type', 'application/x-bat');
    res.setHeader('Content-Disposition', 'attachment; filename="CaiDatPhongMay.bat"');
    res.send(batContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// BACKUP & RESTORE HỆ THỐNG THI LAN (CSDL, ĐỀ THI, CA THI & HÌNH ẢNH)
router.get('/system/backup', requireTeacherAuth, async (req, res) => {
  try {
    const zipBuffer = await backupService.createFullBackupZip();
    const fileName = `Backup_DuLieuThi_LAN_${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi sao lưu hệ thống: ' + err.message });
  }
});

router.post('/system/restore', requireTeacherAuth, async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp file sao lưu (.zip)' });
    }
    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const result = await backupService.restoreFromZipBuffer(buffer);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khôi phục hệ thống: ' + err.message });
  }
});

// 2. EXAMS
router.get('/exams', requireTeacherAuth, (req, res) => {
  try {
    const list = examService.getAllExams();
    res.json({ success: true, exams: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/exams/:id', (req, res) => {
  try {
    const isTeacher = isTeacherRequest(req);
    // Nếu không phải giáo viên (học sinh gọi trộm), tuyệt đối không trả về đáp án đúng (includeAnswers = false)
    const exam = examService.getExamById(req.params.id, isTeacher);
    if (!exam) return res.status(404).json({ success: false, message: 'Đề thi không tồn tại' });
    res.json({ success: true, exam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/exams', requireTeacherAuth, (req, res) => {
  try {
    const {
      title,
      subject,
      duration_minutes,
      total_score,
      shuffle_questions,
      shuffle_options,
      school_name,
      school_year,
      grade,
      note,
      part_scores_json,
      questions
    } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đề thi' });
    }
    const created = examService.createExam({
      title,
      subject,
      duration_minutes,
      total_score,
      shuffle_questions,
      shuffle_options,
      school_name,
      school_year,
      grade,
      note,
      part_scores_json,
      questions
    });
    res.json({ success: true, exam: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/exams/:id', requireTeacherAuth, (req, res) => {
  try {
    const {
      title,
      subject,
      duration_minutes,
      total_score,
      shuffle_questions,
      shuffle_options,
      school_name,
      school_year,
      grade,
      note,
      part_scores_json,
      questions
    } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đề thi' });
    }
    const updated = examService.updateExam(req.params.id, {
      title,
      subject,
      duration_minutes,
      total_score,
      shuffle_questions,
      shuffle_options,
      school_name,
      school_year,
      grade,
      note,
      part_scores_json,
      questions
    });
    res.json({ success: true, exam: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update single question in an exam (Fast inline editing)
router.put('/exams/:id/questions/:questionId', requireTeacherAuth, (req, res) => {
  try {
    const { content, options, correct_answers, short_answer, scoring_config, rubric_guide, max_score, question_type } = req.body;
    const updatedExam = examService.updateSingleQuestion(req.params.id, req.params.questionId, {
      content,
      options,
      correct_answers,
      short_answer,
      scoring_config,
      rubric_guide,
      max_score,
      question_type
    });
    res.json({ success: true, exam: updatedExam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/exams/:id', requireTeacherAuth, (req, res) => {
  try {
    examService.deleteExam(req.params.id);
    res.json({ success: true, message: 'Đã xóa đề thi thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Upload exam image (from Clipboard paste, file select, or drag-drop)
router.post('/upload-image', requireTeacherAuth, (req, res) => {
  try {
    const { imageBase64, filename: originalName } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp dữ liệu hình ảnh' });
    }

    // Determine extension
    let ext = 'png';
    const match = imageBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
    if (match) {
      ext = match[1] === 'jpeg' ? 'jpg' : (match[1] === 'svg+xml' ? 'svg' : match[1]);
    } else if (originalName && originalName.includes('.')) {
      ext = originalName.split('.').pop().toLowerCase();
    }

    const uploadsDir = storageConfig.uploadsDir;
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const fileName = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      url: `/uploads/images/${fileName}`,
      fileName
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi lưu hình ảnh: ' + err.message });
  }
});

// Alias endpoint /upload cho TipTap Image upload (nhận base64 hoặc form payload)
router.post('/upload', requireTeacherAuth, (req, res) => {
  try {
    const { imageBase64, file: filePayload, filename: originalName } = req.body;
    const rawData = imageBase64 || filePayload;
    if (!rawData) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp dữ liệu hình ảnh' });
    }

    let ext = 'png';
    const match = rawData.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
    if (match) {
      ext = match[1] === 'jpeg' ? 'jpg' : (match[1] === 'svg+xml' ? 'svg' : match[1]);
    } else if (originalName && originalName.includes('.')) {
      ext = originalName.split('.').pop().toLowerCase();
    }

    const uploadsDir = storageConfig.uploadsDir;
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const cleanBase64 = rawData.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const fileName = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      url: `/uploads/images/${fileName}`,
      fileName
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi upload hình ảnh: ' + err.message });
  }
});

router.post('/exams/import-word', requireTeacherAuth, async (req, res) => {
  try {
    const { fileBase64, textContent } = req.body;
    let parsed;
    if (fileBase64) {
      const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
      parsed = await wordExamParser.parseWordBuffer(buffer, { context: 'exam' });
    } else if (textContent) {
      parsed = wordExamParser.parseExamText(textContent, { context: 'exam' });
    } else {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp file Word hoặc nội dung văn bản' });
    }

    res.json({
      success: true,
      context: parsed.context || 'exam',
      title: parsed.title,
      meta: parsed.meta,
      partScores: parsed.partScores,
      total_questions: parsed.total_questions,
      computed_total_score: parsed.computed_total_score,
      score_scale: parsed.score_scale || 10.0,
      warnings: parsed.warnings || [],
      questions: parsed.questions
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Download official Exam templates Word docx (tong_hop, tin_hoc, toan_khtn, ngoai_ngu)
router.get('/exams/templates-list', (req, res) => {
  try {
    const { EXAM_TEMPLATE_CONFIGS } = require('../services/templateGenerator');
    res.json({
      success: true,
      templates: (EXAM_TEMPLATE_CONFIGS || []).map(c => ({
        type: c.type,
        fileName: c.fileName,
        description: c.description,
        downloadUrl: `/api/exams/template/download-word?type=${c.type}`
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const handleExamTemplateDownload = async (req, res) => {
  try {
    const { EXAM_TEMPLATE_CONFIGS, generateAllStandardTemplates } = require('../services/templateGenerator');
    const requestedType = (req.query.type || 'tong_hop').toLowerCase();
    const config = (EXAM_TEMPLATE_CONFIGS || []).find(c => c.type === requestedType) || EXAM_TEMPLATE_CONFIGS[0];

    const publicTemplatesDir = path.resolve(__dirname, '../../public/templates');
    let templatePath = path.join(publicTemplatesDir, config.fileName);

    if (!fs.existsSync(templatePath)) {
      await generateAllStandardTemplates();
    }

    if (!fs.existsSync(templatePath)) {
      templatePath = path.resolve(__dirname, '../../..', config.fileName);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(config.fileName)}"`);
    res.sendFile(templatePath);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

router.get('/exams/template/download-word', handleExamTemplateDownload);
router.get('/exams/template-word', handleExamTemplateDownload);
router.get('/exams/sample-word', handleExamTemplateDownload);

// Download official Bank templates Word docx (bank_tong_hop, bank_tin_hoc, bank_toan_khtn, bank_ngoai_ngu)
router.get('/question-bank/templates-list', (req, res) => {
  try {
    const { BANK_TEMPLATE_CONFIGS } = require('../services/templateGenerator');
    res.json({
      success: true,
      templates: (BANK_TEMPLATE_CONFIGS || []).map(c => ({
        type: c.type,
        fileName: c.fileName,
        description: c.description,
        downloadUrl: `/api/question-bank/template/download-word?type=${c.type}`
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const handleBankTemplateDownload = async (req, res) => {
  try {
    const { BANK_TEMPLATE_CONFIGS, generateAllStandardTemplates } = require('../services/templateGenerator');
    const requestedType = (req.query.type || 'bank_tong_hop').toLowerCase();
    const config = (BANK_TEMPLATE_CONFIGS || []).find(c => c.type === requestedType) || BANK_TEMPLATE_CONFIGS[0];

    const publicTemplatesDir = path.resolve(__dirname, '../../public/templates');
    let templatePath = path.join(publicTemplatesDir, config.fileName);

    if (!fs.existsSync(templatePath)) {
      await generateAllStandardTemplates();
    }

    if (!fs.existsSync(templatePath)) {
      templatePath = path.resolve(__dirname, '../../..', config.fileName);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(config.fileName)}"`);
    res.sendFile(templatePath);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

router.get('/question-bank/template/download-word', handleBankTemplateDownload);

// Export exam to Word docx
router.get('/exams/:id/export-word', requireTeacherAuth, async (req, res) => {
  try {
    const mode = req.query.mode === 'teacher_key' ? 'teacher_key' : 'student';
    const margins = req.query.margins === 'normal' ? 'normal' : 'narrow';
    const showScore = req.query.showScore === '1' || req.query.showScore === 'true';
    const includeExaminerBox = req.query.includeExaminerBox === '1' || req.query.includeExaminerBox === 'true';
    const schoolName = req.query.schoolName ? String(req.query.schoolName).trim() : undefined;
    const departmentName = req.query.departmentName ? String(req.query.departmentName).trim() : undefined;
    const academicYear = req.query.academicYear ? String(req.query.academicYear).trim() : undefined;

    const exportOptions = {
      mode,
      margins,
      showScore,
      includeExaminerBox,
      schoolName,
      departmentName,
      academicYear
    };

    const { examTitle, buffer } = await examExportService.generateExamWordBuffer(req.params.id, exportOptions);
    const safeTitle = (examTitle || 'De_Thi').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9 -]/g, '_');
    const suffix = mode === 'student' ? 'Ban_In_Hoc_Sinh' : 'Kem_Dap_An_Va_Barem';
    const finalFilename = `${safeTitle}_${suffix}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFilename)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Export shuffled exam package (.zip)
router.post('/exams/:id/shuffle-package', requireTeacherAuth, async (req, res) => {
  try {
    const { variantCodes, options } = req.body;
    const { fileName, buffer } = await examExportService.generateShuffledExamPackageZip({
      masterExamId: req.params.id,
      variantCodes: Array.isArray(variantCodes) ? variantCodes : ['101', '102'],
      options: options || {}
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Preview shuffled exam variants (Xem trước đề hoán vị trước khi in / lưu)
router.post('/exams/:id/shuffle-preview', requireTeacherAuth, (req, res) => {
  try {
    const { variantCodes, options } = req.body;
    const { masterExam, variants } = examService.generateExamVariants(
      req.params.id,
      Array.isArray(variantCodes) ? variantCodes : ['101', '102'],
      options || {}
    );
    res.json({
      success: true,
      title: masterExam.title,
      grade_name: masterExam.grade,
      subject_name: masterExam.subject,
      duration_minutes: masterExam.duration_minutes,
      total_score: masterExam.total_score,
      options: options || {},
      variants: variants.map(v => ({
        code: v.variant_code,
        title: v.title,
        duration_minutes: v.duration_minutes || masterExam.duration_minutes,
        total_score: v.total_score || masterExam.total_score,
        questions: v.questions
      }))
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Save shuffled exam variants to database
router.post('/exams/:id/shuffle-save', requireTeacherAuth, async (req, res) => {
  try {
    const { variantCodes, options } = req.body;
    const result = examService.saveExamVariants(
      req.params.id,
      Array.isArray(variantCodes) ? variantCodes : ['101', '102'],
      options || {}
    );
    res.json({
      success: true,
      message: `Đã lưu thành công ${result.savedExams.length} mã đề hoán vị vào Ngân Hàng Đề Thi!`,
      savedExams: result.savedExams
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. SESSIONS
router.get('/sessions', requireTeacherAuth, (req, res) => {
  try {
    const sessions = examService.getAllSessions();
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/sessions/suggest-code', requireTeacherAuth, (req, res) => {
  try {
    const prefix = req.query.prefix || 'PHONG';
    const code = examService.generateUniqueSessionCode(prefix);
    res.json({ success: true, session_code: code });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions', requireTeacherAuth, (req, res) => {
  try {
    const {
      exam_id,
      matrix_id,
      distribution_mode,
      variant_exam_ids,
      generate_per_student,
      target_class,
      exam_type,
      score_release_mode,
      session_code,
      title,
      duration_minutes,
      status
    } = req.body;

    if ((!exam_id && !matrix_id) || !session_code) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn đề thi hoặc khung ma trận và nhập mã ca thi' });
    }
    const created = examService.createSession({
      exam_id: exam_id || null,
      matrix_id: matrix_id || null,
      distribution_mode: distribution_mode || (generate_per_student ? 'matrix_dynamic' : 'fixed'),
      variant_exam_ids: variant_exam_ids || null,
      generate_per_student: generate_per_student ? 1 : 0,
      target_class: target_class || null,
      exam_type: exam_type || 'GK',
      score_release_mode: score_release_mode || null,
      session_code,
      title: title || session_code,
      duration_minutes: duration_minutes || 45,
      status: status || 'waiting'
    });
    
    // Update active session code for UDP beacon
    const udpBeacon = req.app.get('udpBeacon');
    if (udpBeacon) udpBeacon.setSessionCode(session_code);

    res.json({ success: true, session: created });
  } catch (err) {
    if (err.code === 'SESSION_CODE_DUPLICATE' || err.message?.includes('UNIQUE constraint failed: exam_sessions.session_code')) {
      const suggested = err.suggestedCode || examService.generateUniqueSessionCode(req.body.target_class || 'PHONG');
      return res.status(400).json({ 
        success: false, 
        message: err.code === 'SESSION_CODE_DUPLICATE' ? err.message : `Mã ca thi "${req.body.session_code}" đã tồn tại. Gợi ý mã mới khả dụng: "${suggested}".`,
        suggested_code: suggested
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/sessions/:id', requireTeacherAuth, (req, res) => {
  try {
    const {
      session_code,
      title,
      duration_minutes,
      status,
      exam_id,
      matrix_id,
      distribution_mode,
      variant_exam_ids,
      generate_per_student,
      target_class,
      exam_type,
      score_release_mode
    } = req.body;

    if (!session_code || !title) {
      return res.status(400).json({ success: false, message: 'Thiếu mã ca thi hoặc tiêu đề' });
    }
    const updated = examService.updateSession(req.params.id, {
      session_code,
      title,
      duration_minutes,
      status,
      exam_id,
      matrix_id,
      distribution_mode: distribution_mode || (generate_per_student ? 'matrix_dynamic' : 'fixed'),
      variant_exam_ids: variant_exam_ids || null,
      generate_per_student,
      target_class,
      exam_type,
      score_release_mode
    });
    res.json({ success: true, session: updated });
  } catch (err) {
    if (err.code === 'SESSION_CODE_DUPLICATE' || err.message?.includes('UNIQUE constraint failed: exam_sessions.session_code')) {
      const suggested = err.suggestedCode || examService.generateUniqueSessionCode(req.body.target_class || 'PHONG');
      return res.status(400).json({ 
        success: false, 
        message: err.code === 'SESSION_CODE_DUPLICATE' ? err.message : `Mã ca thi "${req.body.session_code}" đã tồn tại. Gợi ý mã mới khả dụng: "${suggested}".`,
        suggested_code: suggested
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/:id/release-scores', requireTeacherAuth, (req, res) => {
  try {
    const { id } = req.params;
    const teacherName = req.teacher?.full_name || req.teacher?.username || 'Giáo viên';
    const result = examService.releaseSessionScores(id, teacherName);

    const io = req.app.get('io');
    if (io) {
      io.to(`session_${id}`).emit('scores_released', {
        sessionId: id,
        scores_released_at: result.scores_released_at
      });
      io.to(`teacher_session_${id}`).emit('scores_released_teacher', {
        sessionId: id,
        scores_released_at: result.scores_released_at
      });
    }

    res.json({
      success: true,
      message: `Đã công bố điểm cho ca thi [${result.session_code}] thành công!`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/sessions/:id', requireTeacherAuth, (req, res) => {
  try {
    examService.deleteSession(req.params.id);
    res.json({ success: true, message: 'Đã xóa ca thi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/:id/finish', requireTeacherAuth, (req, res) => {
  try {
    const { id } = req.params;
    const result = examService.finishSession(id);

    // Notify all connected students via Socket.IO to submit and lock
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${id}`).emit('command_force_submitted', {
        reason: 'Giám thị đã kết thúc ca thi. Toàn bộ bài làm đã được tự động nộp.'
      });
      io.to(`teacher_session_${id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã kết thúc ca thi! Đã tự động thu và chấm ${result.autoSubmittedCount} bài thi.`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/:id/start', requireTeacherAuth, (req, res) => {
  try {
    const { id } = req.params;
    const session = examService.getSessionById(id);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const startResult = examService.startSession(id);

    // Broadcast exam start to all students waiting in room session_{id}
    const io = req.app.get('io');
    if (io) {
      const rawExamPaper = examService.generateStudentExamPaper(
        session.exam_id,
        session.shuffle_questions === 1,
        session.shuffle_options === 1
      );
      // An toàn khảo thí: Khử sạch tuyệt đối mọi đáp án đúng trước khi phát sóng socket
      const examPaper = examService.sanitizeStudentPaper(rawExamPaper);

      io.to(`session_${id}`).emit('exam_started_broadcast', {
        sessionId: id,
        startTime: startResult.startTime,
        durationMinutes: session.duration_minutes || 45,
        examPaper
      });
      io.to(`teacher_session_${id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã phát lệnh bắt đầu làm bài cho ca thi! (${startResult.startedAttemptsCount} thí sinh bắt đầu)`,
      startResult
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Session Students Roster
router.get('/sessions/:id/students', requireTeacherAuth, (req, res) => {
  try {
    const list = examService.getSessionStudents(req.params.id);
    res.json({ success: true, students: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/:id/students', requireTeacherAuth, (req, res) => {
  try {
    const { studentIds, className } = req.body;
    let result;
    if (className) {
      result = examService.addStudentsByClassToSession(req.params.id, className);
    } else if (Array.isArray(studentIds)) {
      result = examService.addStudentsToSession(req.params.id, studentIds);
    } else {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp studentIds hoặc className' });
    }

    const io = req.app.get('io');
    if (io) io.to(`teacher_session_${req.params.id}`).emit('refresh_roster');

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/sessions/:id/students/:studentId', requireTeacherAuth, (req, res) => {
  try {
    examService.removeStudentFromSession(req.params.id, req.params.studentId);
    res.json({ success: true, message: 'Đã xóa học sinh khỏi ca thi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/sessions/:id/students', requireTeacherAuth, (req, res) => {
  try {
    examService.clearSessionStudents(req.params.id);
    res.json({ success: true, message: 'Đã xóa toàn bộ học sinh khỏi ca thi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Teacher unlock device
router.post('/teacher/attempts/:attemptId/unlock-device', requireTeacherAuth, (req, res) => {
  try {
    const { attemptId } = req.params;
    const { unlockStudentDevice } = require('../services/socketHandler');
    unlockStudentDevice(attemptId);

    const attempt = db.prepare('SELECT session_id, student_name, student_code FROM student_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
      const io = req.app.get('io');
      if (io) io.to(`teacher_session_${attempt.session_id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã mở khóa thiết bị cho thí sinh ${attempt?.student_name || ''} (${attempt?.student_code || ''}). Học sinh có thể đăng nhập trên máy mới.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Teacher resume attempt (Cho làm tiếp bài cũ, có thể bù giờ)
router.post('/teacher/attempts/:attemptId/resume', requireTeacherAuth, (req, res) => {
  try {
    const { attemptId } = req.params;
    const { extraTimeMinutes } = req.body;
    const { resumeStudentAttempt } = require('../services/socketHandler');
    
    const success = resumeStudentAttempt(attemptId, extraTimeMinutes);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lượt làm bài của thí sinh' });
    }

    const attempt = db.prepare('SELECT session_id, student_name, student_code FROM student_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
      const io = req.app.get('io');
      if (io) io.to(`teacher_session_${attempt.session_id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã mở lại bài thi cho thí sinh ${attempt?.student_name || ''} (${attempt?.student_code || ''}) làm tiếp thành công.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Teacher retake attempt (Hủy bài cũ, cho thi lại từ đầu)
router.post('/teacher/attempts/:attemptId/retake', requireTeacherAuth, (req, res) => {
  try {
    const { attemptId } = req.params;
    const { retakeStudentAttempt } = require('../services/socketHandler');
    
    const success = retakeStudentAttempt(attemptId);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lượt làm bài của thí sinh' });
    }

    const attempt = db.prepare('SELECT session_id, student_name, student_code FROM student_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
      const io = req.app.get('io');
      if (io) io.to(`teacher_session_${attempt.session_id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã đặt lại bài thi cho thí sinh ${attempt?.student_name || ''} (${attempt?.student_code || ''}). Thí sinh có thể thi lại từ đầu.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Teacher kick wrong login (Đá máy nhập nhầm SBD & giải phóng tài khoản)
router.post('/teacher/attempts/:attemptId/kick-wrong-login', requireTeacherAuth, (req, res) => {
  try {
    const { attemptId } = req.params;
    const { clearAnswers } = req.body;
    const { kickWrongLoginDevice } = require('../services/socketHandler');
    
    const success = kickWrongLoginDevice(attemptId, clearAnswers !== false);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lượt làm bài của thí sinh' });
    }

    const attempt = db.prepare('SELECT session_id, student_name, student_code FROM student_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
      const io = req.app.get('io');
      if (io) io.to(`teacher_session_${attempt.session_id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã thu hồi phiên đăng nhập nhầm của thí sinh ${attempt?.student_name || ''} (${attempt?.student_code || ''}). SBD đã được giải phóng.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Teacher unlock violation (Xóa cảnh báo vi phạm để tiếp tục thi)
router.post('/teacher/attempts/:attemptId/unlock-violation', requireTeacherAuth, (req, res) => {
  try {
    const { attemptId } = req.params;
    const { unlockViolation } = require('../services/socketHandler');
    
    unlockViolation(attemptId);

    const attempt = db.prepare('SELECT session_id, student_name, student_code FROM student_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
      const io = req.app.get('io');
      if (io) io.to(`teacher_session_${attempt.session_id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã xóa cảnh báo vi phạm cho thí sinh ${attempt?.student_name || ''} (${attempt?.student_code || ''}).`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/sessions/:code', (req, res) => {
  try {
    const session = examService.getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ success: false, message: 'Mã ca thi không hợp lệ' });
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. STUDENT ROSTER MANAGEMENT
router.get('/students', requireTeacherAuth, (req, res) => {
  try {
    const className = req.query.class || null;
    const students = studentService.getAllStudents(className);
    const classes = studentService.getDistinctClasses();
    res.json({ success: true, students, classes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/students', requireTeacherAuth, (req, res) => {
  try {
    const student = studentService.createStudent(req.body);
    res.json({ success: true, student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/students/:id', requireTeacherAuth, (req, res) => {
  try {
    const student = studentService.updateStudent(req.params.id, req.body);
    res.json({ success: true, student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/students/:id', requireTeacherAuth, (req, res) => {
  try {
    studentService.deleteStudent(req.params.id);
    res.json({ success: true, message: 'Đã xóa học sinh' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/students/batch-delete', requireTeacherAuth, (req, res) => {
  try {
    const { ids, className } = req.body;
    if (className) {
      const result = studentService.deleteStudentsByClass(className);
      return res.json({
        success: true,
        count: result.deletedCount,
        message: `Đã xóa thành công ${result.deletedCount} học sinh của lớp ${className}`
      });
    }
    if (Array.isArray(ids) && ids.length > 0) {
      const result = studentService.deleteStudents(ids);
      return res.json({
        success: true,
        count: result.deletedCount,
        message: `Đã xóa thành công ${result.deletedCount} học sinh đã chọn`
      });
    }
    return res.status(400).json({ success: false, message: 'Không có học sinh nào được chọn để xóa' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/students/lookup/:code', (req, res) => {
  try {
    const student = studentService.getStudentByCode(req.params.code);
    if (!student) return res.json({ success: false, found: false });
    res.json({ success: true, found: true, student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/students/export-template', requireTeacherAuth, (req, res) => {
  try {
    const { fileName, buffer } = studentService.generateTemplateExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/students/export-excel', requireTeacherAuth, (req, res) => {
  try {
    const { className, grade, sbdStatus, search } = req.query;
    const { fileName, buffer, count } = studentService.exportStudentsExcel({
      className: className || req.query.class,
      grade,
      sbdStatus: sbdStatus || req.query.sbd_status,
      search
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/students/auto-assign-sbd', requireTeacherAuth, (req, res) => {
  try {
    const result = studentService.autoAssignSbd(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/students/import-excel', requireTeacherAuth, (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ success: false, message: 'Không tìm thấy dữ liệu file' });

    const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    const result = studentService.importStudentsFromExcel(buffer);
    res.json({ success: true, importedCount: result.importedCount });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 5. STUDENT EXAM WORKFLOW
router.post('/student/join', (req, res) => {
  try {
    let { sessionCode, studentCode, studentName, className } = req.body;
    if (!sessionCode || !studentCode) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ Mã ca thi và Số báo danh (SBD)' });
    }

    // Tự động tìm kiếm họ tên và lớp nếu chưa có trong request
    if (!studentName) {
      const st = studentService.getStudentByCode(studentCode);
      if (st) {
        studentName = st.student_name;
        className = className || st.class_name || '';
      } else {
        studentName = studentCode.trim().toUpperCase();
      }
    }

    const session = examService.getSessionByCode(sessionCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi với mã này' });
    }

    if (session.status === 'finished') {
      return res.status(400).json({ success: false, message: 'Ca thi này đã kết thúc' });
    }

    // 1. Check if session has assigned student roster
    const allowedCheck = examService.isStudentAllowedInSession(session.id, studentCode);
    if (!allowedCheck.allowed) {
      return res.status(403).json({
        success: false,
        notInRoster: true,
        message: `Thí sinh [SBD: ${studentCode}] không có tên trong danh sách ca thi này! Vui lòng kiểm tra lại SBD hoặc liên hệ giám thị.`
      });
    }

    const clientIp = getRealClientIp(req);
    const nowIso = new Date().toISOString();

    // 2. Check single-device login constraint
    const { isStudentOnlineOnOtherIp } = require('../services/socketHandler');
    const onlineCheck = isStudentOnlineOnOtherIp(studentCode, clientIp);

    let attempt = db.prepare(`
      SELECT * FROM student_attempts 
      WHERE session_id = ? AND UPPER(student_code) = UPPER(?)
    `).get(session.id, studentCode);

    if (attempt) {
      // If currently online on another computer
      if (onlineCheck.isOnline) {
        return res.status(409).json({
          success: false,
          isDeviceLocked: true,
          lockedIp: onlineCheck.activeIp,
          message: `Thí sinh [SBD: ${studentCode}] hiện đang đăng nhập và làm bài trên máy khác (IP: ${onlineCheck.activeIp}). Mỗi học sinh chỉ được đăng nhập trên 1 máy tính duy nhất! Nếu máy cũ bị hỏng hoặc mất nguồn, vui lòng báo giám thị bấm "Mở khóa đổi máy".`
        });
      }

      // If attempt is locked to another IP and not explicitly unlocked by teacher
      if (attempt.client_ip && attempt.client_ip !== clientIp && (attempt.is_device_locked === 1 || attempt.is_device_locked === null) && attempt.status !== 'submitted' && attempt.status !== 'forced_submitted') {
        return res.status(409).json({
          success: false,
          isDeviceLocked: true,
          lockedIp: attempt.client_ip,
          message: `Thí sinh [SBD: ${studentCode}] trước đó đã đăng nhập tại máy [IP: ${attempt.client_ip}]. Mỗi học sinh chỉ được làm bài trên 1 máy tính! Hãy liên hệ giám thị bấm "Mở khóa đổi máy" để chuyển sang máy này.`
        });
      }
    }

    const initialStatus = session.status === 'waiting' ? 'waiting' : 'in_progress';

    if (!attempt) {
      const attemptId = crypto.randomUUID();
      const studentClassName = className || session.target_class || '';
      db.prepare(`
        INSERT INTO student_attempts (id, session_id, student_code, student_name, class_name, client_ip, status, start_time, is_device_locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        attemptId,
        session.id,
        studentCode.toUpperCase(),
        studentName,
        studentClassName,
        clientIp,
        initialStatus,
        session.status === 'in_progress' ? (session.start_time || nowIso) : null
      );

      attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    } else {
      // Re-bind to current IP and ensure locked
      db.prepare('UPDATE student_attempts SET client_ip = ?, is_device_locked = 1 WHERE id = ?').run(clientIp, attempt.id);
      attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attempt.id);
    }

    // If student already submitted
    if (attempt.status === 'submitted' || attempt.status === 'forced_submitted') {
      const safeAttempt = examService.sanitizeStudentAttempt(attempt, session);
      return res.json({
        success: true,
        alreadySubmitted: true,
        attempt: safeAttempt,
        message: 'Bạn đã nộp bài cho ca thi này.'
      });
    }

    // 3. If session is waiting: Do not send exam questions yet! Student enters waiting room
    if (session.status === 'waiting') {
      return res.json({
        success: true,
        alreadySubmitted: false,
        waitingForTeacher: true,
        attempt,
        session: {
          ...session,
          duration_minutes: Number(session.duration_minutes) || 45
        },
        message: 'Đã điểm danh vào ca thi thành công. Vui lòng chờ giám thị phát lệnh bắt đầu làm bài.'
      });
    }

    // 4. If session is in progress: Prepare exam paper & countdown
    const fullPaper = examService.getOrCreateStudentAttemptPaper(attempt.id, session);
    const examPaper = examService.sanitizeStudentPaper(fullPaper);

    // Fetch existing saved answers if resuming
    const savedAnswers = db.prepare(`
      SELECT question_id, selected_options_json, essay_content, short_answer 
      FROM student_answers WHERE attempt_id = ?
    `).all(attempt.id).map(a => ({
      question_id: a.question_id,
      selected_options: a.selected_options_json ? JSON.parse(a.selected_options_json) : [],
      essay_content: a.essay_content || '',
      short_answer: a.short_answer || ''
    }));

    // Calculate remaining duration in seconds based on SESSION DURATION_MINUTES
    const sessionDuration = Number(session.duration_minutes) || 45;
    const totalAllowedSeconds = (sessionDuration + (attempt.extra_time_minutes || 0)) * 60;

    // Use session start_time or attempt start_time
    let startIso = session.start_time || attempt.start_time || nowIso;
    if (!startIso.endsWith('Z') && !startIso.includes('+')) {
      startIso = startIso.replace(' ', 'T') + 'Z';
    }

    let startTimeMs = new Date(startIso).getTime();
    let elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));

    const remainingSeconds = Math.max(1, totalAllowedSeconds - elapsedSeconds);

    res.json({
      success: true,
      alreadySubmitted: false,
      waitingForTeacher: false,
      attempt,
      session: {
        ...session,
        duration_minutes: sessionDuration
      },
      examPaper,
      savedAnswers,
      remainingSeconds
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.0.1 STUDENT REQUEST DEVICE SWAP (Khi máy cũ bị treo/hỏng)
router.post('/student/request-device-swap', (req, res) => {
  try {
    const { sessionCode, studentCode, studentName } = req.body;
    if (!sessionCode || !studentCode) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    }
    const session = examService.getSessionByCode(sessionCode);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const clientIp = getRealClientIp(req);
    const io = req.app.get('io');
    if (io) {
      io.to(`teacher_session_${session.id}`).emit('student_device_swap_alert', {
        studentCode,
        studentName: studentName || studentCode,
        clientIp,
        time: new Date().toLocaleTimeString('vi-VN')
      });
    }
    res.json({ success: true, message: 'Đã gửi yêu cầu đổi máy tới Giám thị.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.0.2 STUDENT REPORT WRONG SBD COLLISION (Khi có người khác gõ nhầm SBD)
router.post('/student/report-wrong-login', (req, res) => {
  try {
    const { sessionCode, studentCode, studentName, lockedIp } = req.body;
    if (!sessionCode || !studentCode) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    }
    const session = examService.getSessionByCode(sessionCode);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const clientIp = getRealClientIp(req);
    const io = req.app.get('io');
    if (io) {
      io.to(`teacher_session_${session.id}`).emit('student_wrong_login_alert', {
        studentCode,
        studentName: studentName || studentCode,
        clientIp,
        lockedIp: lockedIp || 'Máy khác',
        time: new Date().toLocaleTimeString('vi-VN')
      });
    }
    res.json({ success: true, message: 'Đã báo cáo xung đột SBD tới Giám thị.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.0 REALTIME HTTP AUTO-SAVE & DUAL-CHANNEL PROGRESS SYNC
router.post('/student/save-answer', (req, res) => {
  try {
    const { attemptId, questionId, selectedOptions, essayContent, shortAnswer } = req.body;
    if (!attemptId || !questionId) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin câu hỏi hoặc bài làm' });
    }

    const attempt = db.prepare('SELECT id, session_id, status FROM student_attempts WHERE id = ?').get(attemptId);
    if (!attempt || attempt.status === 'submitted' || attempt.status === 'forced_submitted') {
      return res.status(403).json({ success: false, message: 'Bài thi không tồn tại hoặc đã kết thúc' });
    }

    const id = crypto.randomUUID();
    const selectedJson = selectedOptions ? JSON.stringify(selectedOptions) : null;
    const essay = essayContent !== undefined ? essayContent : null;
    const shortAns = shortAnswer !== undefined ? shortAnswer : null;

    db.prepare(`
      INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, short_answer, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        selected_options_json = COALESCE(excluded.selected_options_json, student_answers.selected_options_json),
        essay_content = COALESCE(excluded.essay_content, student_answers.essay_content),
        short_answer = COALESCE(excluded.short_answer, student_answers.short_answer),
        updated_at = CURRENT_TIMESTAMP
    `).run(id, attemptId, questionId, selectedJson, essay, shortAns);

    const answeredCount = db.prepare(`
      SELECT COUNT(*) as count FROM student_answers 
      WHERE attempt_id = ? AND (
        (selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR 
        (essay_content IS NOT NULL AND TRIM(essay_content) != '') OR
        (short_answer IS NOT NULL AND TRIM(short_answer) != '')
      )
    `).get(attemptId).count;

    broadcastProgressUpdate(attempt.session_id, attemptId, answeredCount);

    res.json({ success: true, answeredCount, timestamp: Date.now() });
  } catch (err) {
    console.error('[API] Lỗi lưu câu trả lời HTTP:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/student/sync-progress', (req, res) => {
  try {
    const { attemptId, answers } = req.body;
    if (!attemptId || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu đồng bộ không hợp lệ' });
    }

    const attempt = db.prepare('SELECT id, session_id, status FROM student_attempts WHERE id = ?').get(attemptId);
    if (!attempt || attempt.status === 'submitted' || attempt.status === 'forced_submitted') {
      return res.status(403).json({ success: false, message: 'Bài thi không tồn tại hoặc đã kết thúc' });
    }

    const upsertStmt = db.prepare(`
      INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, short_answer, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(attempt_id, question_id) DO UPDATE SET
        selected_options_json = COALESCE(excluded.selected_options_json, student_answers.selected_options_json),
        essay_content = COALESCE(excluded.essay_content, student_answers.essay_content),
        short_answer = COALESCE(excluded.short_answer, student_answers.short_answer),
        updated_at = CURRENT_TIMESTAMP
    `);

    db.exec('BEGIN;');
    try {
      for (const a of answers) {
        if (!a || !a.questionId) continue;
        const id = crypto.randomUUID();
        const selectedJson = a.selectedOptions ? JSON.stringify(a.selectedOptions) : null;
        const essay = a.essayContent !== undefined ? a.essayContent : null;
        const shortAns = a.shortAnswer !== undefined ? a.shortAnswer : null;
        upsertStmt.run(id, attemptId, a.questionId, selectedJson, essay, shortAns);
      }
      db.exec('COMMIT;');
    } catch (txErr) {
      db.exec('ROLLBACK;');
      throw txErr;
    }

    const answeredCount = db.prepare(`
      SELECT COUNT(*) as count FROM student_answers 
      WHERE attempt_id = ? AND (
        (selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR 
        (essay_content IS NOT NULL AND TRIM(essay_content) != '') OR
        (short_answer IS NOT NULL AND TRIM(short_answer) != '')
      )
    `).get(attemptId).count;

    broadcastProgressUpdate(attempt.session_id, attemptId, answeredCount);

    res.json({ success: true, answeredCount, timestamp: Date.now() });
  } catch (err) {
    console.error('[API] Lỗi đồng bộ tiến độ HTTP:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.1 STUDENT EXAM SUBMIT (HTTP FALLBACK FOR WEBSOCKET DROPS)
router.post('/student/submit', (req, res) => {
  try {
    const { attemptId, answers } = req.body;
    if (!attemptId) {
      return res.status(400).json({ success: false, message: 'Thiếu mã bài làm (attemptId)' });
    }

    const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin bài thi của thí sinh' });
    }

    // Xác thực IP kết nối thực tế để chống nộp trộm từ máy khác
    const clientIp = getRealClientIp(req);
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1';
    if (!isLocalhost && attempt.client_ip && attempt.client_ip !== clientIp && attempt.is_device_locked === 1) {
      return res.status(403).json({
        success: false,
        message: 'Lỗi bảo mật: Không thể nộp bài từ địa chỉ IP khác với thiết bị đã đăng ký làm bài!'
      });
    }

    if (attempt.status === 'submitted' || attempt.status === 'forced_submitted') {
      const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(attempt.session_id);
      const existingGrade = gradingService.autoGradeAttempt(attemptId);
      const studentResultDTO = examService.buildStudentResultDTO(attempt, session, existingGrade);
      return res.json({
        success: true,
        alreadySubmitted: true,
        message: studentResultDTO.message,
        gradeResult: studentResultDTO
      });
    }

    // Flush last-minute answers if provided
    if (Array.isArray(answers) && answers.length > 0) {
      const upsertStmt = db.prepare(`
        INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, short_answer, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(attempt_id, question_id) DO UPDATE SET
          selected_options_json = COALESCE(excluded.selected_options_json, student_answers.selected_options_json),
          essay_content = COALESCE(excluded.essay_content, student_answers.essay_content),
          short_answer = COALESCE(excluded.short_answer, student_answers.short_answer),
          updated_at = CURRENT_TIMESTAMP
      `);

      db.exec('BEGIN;');
      try {
        for (const a of answers) {
          const id = crypto.randomUUID();
          const selectedJson = a.selectedOptions !== undefined ? JSON.stringify(a.selectedOptions) : null;
          const essay = a.essayContent !== undefined ? a.essayContent : null;
          const shortAns = a.shortAnswer !== undefined ? a.shortAnswer : null;
          upsertStmt.run(id, attemptId, a.questionId, selectedJson, essay, shortAns);
        }
        db.exec('COMMIT;');
      } catch (txErr) {
        db.exec('ROLLBACK;');
        throw txErr;
      }
    }

    // Mark as submitted
    db.prepare(`
      UPDATE student_attempts 
      SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(attemptId);

    const gradeResult = gradingService.autoGradeAttempt(attemptId);
    const updatedAttempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(updatedAttempt.session_id);
    const studentResultDTO = examService.buildStudentResultDTO(updatedAttempt, session, gradeResult);

    // Notify teacher via Socket if IO is available
    const io = req.app.get('io');
    if (io && attempt.session_id) {
      io.to(`teacher_session_${attempt.session_id}`).emit('student_submitted_alert', {
        attemptId,
        gradeResult
      });
      io.to(`teacher_session_${attempt.session_id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: studentResultDTO.message,
      gradeResult: studentResultDTO
    });
  } catch (err) {
    console.error('[API] Error in /student/submit:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. ESSAY GRADING & TEACHER MONITORING
router.get('/teacher/sessions/:sessionId/live', requireTeacherAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.prepare(`
      SELECT s.*, 
        COALESCE(e.title, m.title, 'Không xác định') as exam_title,
        e.grade as exam_grade,
        e.total_score
      FROM exam_sessions s
      LEFT JOIN exams e ON s.exam_id = e.id
      LEFT JOIN exam_matrices m ON s.matrix_id = m.id
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions WHERE exam_id = ?').get(session.exam_id).count;

    const students = db.prepare(`
      SELECT st.*, s.dob,
        (SELECT COUNT(*) FROM student_answers WHERE attempt_id = st.id AND (
          (selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR 
          (essay_content IS NOT NULL AND TRIM(essay_content) != '') OR
          (short_answer IS NOT NULL AND TRIM(short_answer) != '')
        )) as answered_count
      FROM student_attempts st
      LEFT JOIN students s ON UPPER(st.student_code) = UPPER(s.student_code)
      WHERE st.session_id = ?
      ORDER BY st.student_code ASC
    `).all(sessionId);

    res.json({
      success: true,
      session,
      totalQuestions,
      students
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/teacher/sessions/:sessionId/essays', requireTeacherAuth, (req, res) => {
  try {
    const submissions = gradingService.getEssaySubmissions(req.params.sessionId);
    res.json({ success: true, submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/teacher/grade-essay', requireTeacherAuth, (req, res) => {
  try {
    const { answerId, manualScore, teacherFeedback } = req.body;
    if (!answerId || manualScore === undefined) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin điểm số hoặc bài làm' });
    }
    const result = gradingService.gradeEssayAnswer({ answerId, manualScore, teacherFeedback });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. EXCEL & STUDENT EXAM PAPER EXPORT
router.get('/teacher/sessions/:sessionId/export-excel', requireTeacherAuth, (req, res) => {
  try {
    const { fileName, buffer } = gradingService.generateExcelReport(req.params.sessionId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. STUDENT PAPER DETAIL & PRINT
router.get('/teacher/attempts/:attemptId/paper-detail', requireTeacherAuth, (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: 'Không tìm thấy bài thi của thí sinh' });

    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(attempt.session_id);
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(session.exam_id);

    let sessionOverrides = {};
    try {
      sessionOverrides = session.answer_key_overrides_json ? JSON.parse(session.answer_key_overrides_json) : {};
    } catch (e) {}
    const overridesMap = gradingService.prepareOverridesMap(sessionOverrides);

    let questions = [];
    if (attempt.exam_paper_json) {
      try {
        const paper = JSON.parse(attempt.exam_paper_json);
        questions = paper.questions || [];
      } catch (e) {}
    }
    if (questions.length === 0) {
      questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(exam.id).map((q, idx) => ({
        ...q,
        display_order: idx + 1,
        options: q.options_json ? JSON.parse(q.options_json) : [],
        correct_answers: q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []
      }));
    }

    const answers = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(attemptId);
    const answersMap = {};
    answers.forEach(a => { answersMap[a.question_id] = a; });

    const detailedQuestions = questions.map((q, idx) => {
      const ans = answersMap[q.id] || null;
      let selectedOptions = [];
      if (ans && ans.selected_options_json) {
        try { selectedOptions = JSON.parse(ans.selected_options_json); } catch (e) {}
      }

      const evalResult = gradingService.applyOverridesToQuestion(q, overridesMap, selectedOptions, ans);

      return {
        id: q.id,
        display_order: q.display_order || (idx + 1),
        question_type: q.question_type,
        content: q.content,
        options: evalResult.options,
        correct_answers: evalResult.correctAnswers,
        max_score: q.max_score,
        rubric_guide: q.rubric_guide,
        student_selected_options: selectedOptions,
        student_short_answer: ans ? (ans.short_answer || '') : '',
        student_essay_content: ans ? (ans.essay_content || '') : '',
        is_correct: evalResult.isCorrect,
        score_obtained: evalResult.scoreObtained,
        tf_details: evalResult.tfDetails,
        is_overridden: evalResult.isOverridden,
        override_info: evalResult.overrideInfo,
        teacher_feedback: ans ? (ans.teacher_feedback || '') : ''
      };
    });

    res.json({
      success: true,
      attempt,
      session,
      exam,
      questions: detailedQuestions
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/teacher/sessions/:sessionId/all-papers-detail', requireTeacherAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    let sessionOverrides = {};
    try {
      sessionOverrides = session.answer_key_overrides_json ? JSON.parse(session.answer_key_overrides_json) : {};
    } catch (e) {}
    const overridesMap = gradingService.prepareOverridesMap(sessionOverrides);

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(session.exam_id);
    const defaultQuestions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(exam.id).map((q, idx) => ({
      ...q,
      display_order: idx + 1,
      options: q.options_json ? JSON.parse(q.options_json) : [],
      correct_answers: q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []
    }));

    const attempts = db.prepare('SELECT * FROM student_attempts WHERE session_id = ? ORDER BY student_code ASC').all(sessionId);

    const papers = attempts.map(attempt => {
      let questions = [];
      if (attempt.exam_paper_json) {
        try {
          const paper = JSON.parse(attempt.exam_paper_json);
          questions = paper.questions || [];
        } catch (e) {}
      }
      if (questions.length === 0) {
        questions = defaultQuestions;
      }

      const answers = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(attempt.id);
      const answersMap = {};
      answers.forEach(a => { answersMap[a.question_id] = a; });

      const detailedQuestions = questions.map((q, idx) => {
        const ans = answersMap[q.id] || null;
        let selectedOptions = [];
        if (ans && ans.selected_options_json) {
          try { selectedOptions = JSON.parse(ans.selected_options_json); } catch (e) {}
        }

        const evalResult = gradingService.applyOverridesToQuestion(q, overridesMap, selectedOptions, ans);

        return {
          id: q.id,
          display_order: q.display_order || (idx + 1),
          question_type: q.question_type,
          content: q.content,
          options: evalResult.options,
          correct_answers: evalResult.correctAnswers,
          max_score: q.max_score,
          rubric_guide: q.rubric_guide,
          student_selected_options: selectedOptions,
          student_short_answer: ans ? (ans.short_answer || '') : '',
          student_essay_content: ans ? (ans.essay_content || '') : '',
          is_correct: evalResult.isCorrect,
          score_obtained: evalResult.scoreObtained,
          tf_details: evalResult.tfDetails,
          is_overridden: evalResult.isOverridden,
          override_info: evalResult.overrideInfo,
          teacher_feedback: ans ? (ans.teacher_feedback || '') : ''
        };
      });

      return {
        attempt,
        questions: detailedQuestions
      };
    });

    res.json({
      success: true,
      session,
      exam,
      papers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// REGRADE SESSION (ĐIỀU CHỈNH ĐÁP ÁN & CHẤM LẠI CA THI)
router.get('/teacher/sessions/:sessionId/answer-overrides', requireTeacherAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    let overrides = {};
    try {
      overrides = session.answer_key_overrides_json ? JSON.parse(session.answer_key_overrides_json) : {};
    } catch (e) {}

    // Master questions for UI display
    let questions = [];
    const isMatrixDynamic = (session.distribution_mode === 'matrix_dynamic') || (session.generate_per_student === 1 && session.matrix_id);

    if (isMatrixDynamic || session.matrix_id) {
      // Với ca thi tạo từ Ma Trận Động: Gom nhóm tất cả câu hỏi thực tế xuất hiện trong các bài làm của thí sinh
      const attempts = db.prepare('SELECT exam_paper_json FROM student_attempts WHERE session_id = ?').all(sessionId);
      const uniqueMap = new Map();
      const cleanText = (str) => (str || '').trim().replace(/\s+/g, ' ');

      attempts.forEach(att => {
        if (!att.exam_paper_json) return;
        try {
          const paper = JSON.parse(att.exam_paper_json);
          (paper.questions || []).forEach(q => {
            const ct = cleanText(q.content);
            if (!uniqueMap.has(ct)) {
              uniqueMap.set(ct, {
                ...q,
                id: q.id,
                student_occurrences: 1,
                options: Array.isArray(q.options) ? q.options : (q.options_json ? JSON.parse(q.options_json) : []),
                correct_answers: resolveCorrectAnswers(q)
              });
            } else {
              uniqueMap.get(ct).student_occurrences++;
            }
          });
        } catch (e) {}
      });

      if (uniqueMap.size > 0) {
        questions = Array.from(uniqueMap.values()).map((q, idx) => ({
          ...q,
          order_index: idx + 1
        }));
      }
    }

    if (questions.length === 0 && session.exam_id) {
      questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(session.exam_id).map((q, idx) => ({
        ...q,
        options: q.options_json ? JSON.parse(q.options_json) : [],
        correct_answers: resolveCorrectAnswers(q)
      }));
    }

    res.json({
      success: true,
      session,
      overrides,
      questions
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/teacher/sessions/:sessionId/regrade', requireTeacherAuth, (req, res) => {
  try {
    const { sessionId } = req.params;
    const { overrides } = req.body;
    const result = gradingService.regradeSession(sessionId, overrides);
    res.json({
      success: true,
      message: `Đã chấm lại thành công ${result.rescoredCount} bài làm thí sinh theo đáp án mới!`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// EXPORT ZIP CỦA TỪNG BÀI LÀM THEO SBD
router.get('/teacher/sessions/:sessionId/export-submissions-zip', requireTeacherAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const zipBuffer = await submissionZipService.generateSubmissionsZip(sessionId);
    const filename = `BaiLam_CaThi_${session.session_code || sessionId}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ==========================================
// 8. CURRICULUM: GRADES, SUBJECTS, TOPICS & LESSONS
// ==========================================

// Lấy danh sách Khối lớp
router.get('/curriculum/grades', (req, res) => {
  try {
    const list = curriculumService.getAllGrades();
    res.json({ success: true, grades: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy danh sách Môn học (hỗ trợ lọc theo grade_id)
router.get('/curriculum/subjects', (req, res) => {
  try {
    const { grade_id } = req.query;
    const list = curriculumService.getAllSubjects(grade_id || null);
    res.json({ success: true, subjects: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm Môn học mới
router.post('/curriculum/subjects', requireTeacherAuth, (req, res) => {
  try {
    const { name, code, description, grade_ids } = req.body;
    const created = curriculumService.createSubject({ name, code, description, grade_ids });
    res.json({ success: true, subject: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Sửa Môn học
router.put('/curriculum/subjects/:id', requireTeacherAuth, (req, res) => {
  try {
    const updated = curriculumService.updateSubject(req.params.id, req.body);
    res.json({ success: true, subject: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Xóa Môn học
router.delete('/curriculum/subjects/:id', requireTeacherAuth, (req, res) => {
  try {
    curriculumService.deleteSubject(req.params.id);
    res.json({ success: true, message: 'Đã xóa môn học thành công' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Lấy danh sách Phân môn theo Khối
router.get('/curriculum/grade-subjects', (req, res) => {
  try {
    const { grade_id } = req.query;
    const list = curriculumService.getGradeSubjects(grade_id);
    res.json({ success: true, grade_subjects: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy hoặc tạo liên kết Phân môn Khối
router.post('/curriculum/grade-subjects/get-or-create', requireTeacherAuth, (req, res) => {
  try {
    const { grade_id, subject_id, curriculum } = req.body;
    const item = curriculumService.getOrCreateGradeSubject(grade_id, subject_id, curriculum);
    res.json({ success: true, grade_subject: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy danh sách Chủ đề và Bài học của môn
router.get('/curriculum/topics', (req, res) => {
  try {
    const { grade_subject_id } = req.query;
    if (!grade_subject_id) return res.status(400).json({ success: false, message: 'Thiếu grade_subject_id' });
    const list = curriculumService.getTopicsByGradeSubject(grade_subject_id);
    res.json({ success: true, topics: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm Chủ đề mới
router.post('/curriculum/topics', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id, code, name, description, order_index } = req.body;
    const created = curriculumService.createTopic(grade_subject_id, { code, name, description, order_index });
    res.json({ success: true, topic: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Sửa Chủ đề
router.put('/curriculum/topics/:id', requireTeacherAuth, (req, res) => {
  try {
    const updated = curriculumService.updateTopic(req.params.id, req.body);
    res.json({ success: true, topic: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa Chủ đề
router.delete('/curriculum/topics/:id', requireTeacherAuth, (req, res) => {
  try {
    curriculumService.deleteTopic(req.params.id);
    res.json({ success: true, message: 'Đã xóa chủ đề thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm Bài học mới
router.post('/curriculum/lessons', requireTeacherAuth, (req, res) => {
  try {
    const { topic_id, code, name, objectives, objectives_by_level_json, order_index } = req.body;
    const created = curriculumService.createLesson(topic_id, { code, name, objectives, objectives_by_level_json, order_index });
    res.json({ success: true, lesson: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Sửa Bài học
router.put('/curriculum/lessons/:id', requireTeacherAuth, (req, res) => {
  try {
    const updated = curriculumService.updateLesson(req.params.id, req.body);
    res.json({ success: true, lesson: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật riêng yêu cầu cần đạt theo mức độ nhận thức (có xác nhận từ giáo viên)
router.put('/curriculum/lessons/:id/objective-level', requireTeacherAuth, (req, res) => {
  try {
    const { level, objective } = req.body;
    if (!level) return res.status(400).json({ success: false, message: 'Thiếu mức độ nhận thức' });
    const updated = curriculumService.updateLessonObjectiveByLevel(req.params.id, level, objective);
    res.json({ success: true, lesson: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa Bài học
router.delete('/curriculum/lessons/:id', requireTeacherAuth, (req, res) => {
  try {
    curriculumService.deleteLesson(req.params.id);
    res.json({ success: true, message: 'Đã xóa bài học thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Nhập hàng loạt Chủ đề & Bài học từ văn bản dạng outline
router.post('/curriculum/import-text', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id, text_content } = req.body;
    const result = curriculumService.importTopicsAndLessonsFromText(grade_subject_id, text_content);
    res.json({ success: true, message: `Đã tạo ${result.createdTopics} chủ đề và ${result.createdLessons} bài học!`, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Nạp sẵn khung chương trình chuẩn GDPT 2018
router.post('/curriculum/load-preset', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id, preset_key } = req.body;
    const result = curriculumService.loadStandardCurriculumPreset(grade_subject_id, preset_key);
    res.json({ success: true, message: `Đã nạp thành công ${result.createdTopics} chủ đề và ${result.createdLessons} bài học chuẩn!`, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 9. QUESTION BANK (NGÂN HÀNG CÂU HỎI)
// ==========================================

// Danh sách câu hỏi phân trang + bộ lọc
router.get('/question-bank', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id, topic_id, lesson_id, level, question_type, search, page, limit } = req.query;
    const data = questionBankService.getQuestions({
      grade_subject_id,
      topic_id,
      lesson_id,
      level,
      question_type,
      search,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10
    });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thống kê ma trận số lượng câu hỏi trong kho
router.get('/question-bank/stats', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id } = req.query;
    if (!grade_subject_id) return res.status(400).json({ success: false, message: 'Thiếu grade_subject_id' });
    const stats = questionBankService.getMatrixStats(grade_subject_id);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Đồng bộ thế hệ thống kê chi tiết câu hỏi (Generation-based Atomic Sync)
router.post('/question-bank/sync-stats', requireTeacherAuth, async (req, res) => {
  try {
    const questionStatsSyncService = require('../services/questionStatsSyncService');
    const result = await questionStatsSyncService.syncBankQuestionStats({ force: req.body?.force });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xuất ngân hàng câu hỏi ra file Word (.docx) chuẩn OMML Math và A4
router.get('/question-bank/export-word', requireTeacherAuth, async (req, res) => {
  try {
    const { grade_subject_id, topic_id, lesson_id, level, question_type, search, margins } = req.query;
    if (!grade_subject_id) return res.status(400).json({ success: false, message: 'Thiếu grade_subject_id' });

    const exportOptions = {
      margins: margins === 'normal' ? 'normal' : 'narrow'
    };

    const { title, buffer } = await examExportService.generateQuestionBankWordBuffer({
      grade_subject_id,
      topic_id,
      lesson_id,
      level,
      question_type,
      search
    }, exportOptions);

    const safeTitle = (title || 'Ngan_Hang_Cau_Hoi').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9 -]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.docx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === SAO LƯU & PHỤC HỒI CHUYÊN BIỆT CHO NGÂN HÀNG CÂU HỎI VNLAN ===

// 1. Tải tệp sao lưu (.vnlanqb)
router.get('/question-bank/backup/export', requireTeacherAuth, async (req, res) => {
  try {
    const { grade_subject_id, scope } = req.query;
    const { filename, buffer } = await questionBankBackupService.exportQuestionBank({
      gradeSubjectId: grade_subject_id || null,
      scope: scope || (grade_subject_id ? 'single' : 'all')
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi xuất sao lưu ngân hàng câu hỏi: ' + err.message });
  }
});

// 2. Phân tích & Xem trước tệp sao lưu (Inspect / Preview)
router.post('/question-bank/backup/inspect', requireTeacherAuth, async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tệp sao lưu (.vnlanqb hoặc .zip)' });
    }
    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const result = await questionBankBackupService.inspectBackup(buffer);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 3. Thực hiện phục hồi dữ liệu ngân hàng câu hỏi (Restore)
router.post('/question-bank/backup/restore', requireTeacherAuth, async (req, res) => {
  try {
    const { fileBase64, mode, handleDuplicates } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tệp sao lưu (.vnlanqb hoặc .zip)' });
    }
    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const result = await questionBankBackupService.restoreQuestionBank({
      fileBuffer: buffer,
      mode: mode || 'merge',
      handleDuplicates: handleDuplicates || 'skip'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi phục hồi ngân hàng câu hỏi: ' + err.message });
  }
});

// Chi tiết 1 câu hỏi
router.get('/question-bank/:id', requireTeacherAuth, (req, res) => {
  try {
    const question = questionBankService.getQuestionById(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi' });
    res.json({ success: true, question });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thống kê chi tiết câu hỏi & phân tích phương án (Item & Distractor Analysis)
router.get('/question-bank/:id/stats', requireTeacherAuth, (req, res) => {
  try {
    const stats = questionBankService.getQuestionStatistics(req.params.id);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Thêm câu hỏi mới vào ngân hàng
router.post('/question-bank', requireTeacherAuth, (req, res) => {
  try {
    const created = questionBankService.createQuestion(req.body);
    res.json({ success: true, question: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật câu hỏi
router.put('/question-bank/:id', requireTeacherAuth, (req, res) => {
  try {
    const updated = questionBankService.updateQuestion(req.params.id, req.body);
    res.json({ success: true, question: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa câu hỏi
router.delete('/question-bank/:id', requireTeacherAuth, (req, res) => {
  try {
    questionBankService.deleteQuestion(req.params.id);
    res.json({ success: true, message: 'Đã xóa câu hỏi thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Nhân bản câu hỏi
router.post('/question-bank/:id/duplicate', requireTeacherAuth, (req, res) => {
  try {
    const duplicated = questionBankService.duplicateQuestion(req.params.id);
    res.json({ success: true, question: duplicated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Kiểm tra trùng lặp cho một câu hỏi đang soạn thảo
router.post('/question-bank/check-duplicate', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id, content, options, question_type, exclude_question_id } = req.body;
    
    // 1. Kiểm tra trùng phương án
    const optionDuplicates = duplicateDetectionService.checkOptionDuplicates(options || [], question_type || 'single_choice');
    
    // 2. Kiểm tra trùng ngân hàng đề
    let bankDuplicate = null;
    if (grade_subject_id && content && content.trim()) {
      bankDuplicate = duplicateDetectionService.checkQuestionBankDuplicates(grade_subject_id, content, exclude_question_id);
    }

    res.json({
      success: true,
      has_option_duplicates: optionDuplicates.length > 0,
      option_duplicates: optionDuplicates,
      bank_duplicate: bankDuplicate
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Quét Tiền Kiểm Tra danh sách câu hỏi từ file Word (.docx) trước khi import
router.post('/question-bank/audit-word-import', requireTeacherAuth, async (req, res) => {
  try {
    const { fileBase64, grade_subject_id } = req.body;
    if (!fileBase64) return res.status(400).json({ success: false, message: 'Thiếu fileBase64' });
    if (!grade_subject_id) return res.status(400).json({ success: false, message: 'Thiếu grade_subject_id' });

    const base64Data = fileBase64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const parsed = await wordExamParser.parseWordBuffer(buffer);
    const questions = parsed.questions || [];

    const auditReport = duplicateDetectionService.auditQuestionsBeforeImport(grade_subject_id, questions);

    res.json({
      success: true,
      meta: parsed.meta || {},
      report: auditReport
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Nhập câu hỏi từ file Word (.docx) vào Ngân Hàng Câu Hỏi
// Hỗ trợ import_mode: 'skip_duplicates' (bỏ qua câu trùng), 'overwrite' (ghi đè), 'all' (nạp tất cả)
router.post('/question-bank/import-word', requireTeacherAuth, async (req, res) => {
  try {
    const { fileBase64, grade_subject_id, default_topic_id, default_lesson_id, import_mode = 'skip_duplicates', custom_questions } = req.body;
    if (!grade_subject_id) return res.status(400).json({ success: false, message: 'Thiếu grade_subject_id' });

    let questions = [];

    if (custom_questions && Array.isArray(custom_questions)) {
      // Nhận danh sách câu hỏi đã được lọc từ UI đối soát
      questions = custom_questions;
    } else {
      if (!fileBase64) return res.status(400).json({ success: false, message: 'Thiếu fileBase64' });
      const base64Data = fileBase64.replace(/^data:.*?;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const parsed = await wordExamParser.parseWordBuffer(buffer, { context: 'bank' });
      questions = parsed.questions || [];
    }

    // Nghiệp vụ Ngân hàng câu hỏi: Cho phép lưu trữ câu hỏi chờ duyệt (pending_review)
    // để giáo viên tích lũy câu hỏi và đối soát/duyệt sau.
    // Những câu hỏi chưa đủ điều kiện khảo thí sẽ tự động được gắn cờ pending_review,
    // và sẽ bị bộ sinh ma trận/mở ca thi khóa chặn 100%.
    questions = questions.map(q => {
      const isUnverified = questionIntegrityValidator.isUnverifiedQuestion(q);
      if (isUnverified) {
        return {
          ...q,
          status: 'pending_review',
          has_conflict: Boolean(q.has_conflict)
        };
      }
      return q;
    });

    // Nếu chọn chế độ 'skip_duplicates' và chưa lọc từ trước:
    if (import_mode === 'skip_duplicates' && (!custom_questions || custom_questions.length === 0)) {
      const audit = duplicateDetectionService.auditQuestionsBeforeImport(grade_subject_id, questions);
      questions = audit.audited_questions.filter(q => q.audit && !q.audit.bank_duplicate);
    }

    // Bộ nhớ cache các Chủ đề và Bài học đã có hoặc vừa tạo
    const existingTopics = curriculumService.getTopicsByGradeSubject(grade_subject_id);
    const topicMap = new Map(); // name.toLowerCase() -> topic_id
    const lessonMap = new Map(); // topic_id + ':' + lesson_name.toLowerCase() -> lesson_id

    for (const t of existingTopics) {
      topicMap.set(t.name.toLowerCase().trim(), t.id);
      if (t.code) topicMap.set(t.code.toLowerCase().trim(), t.id);
      for (const l of t.lessons || []) {
        lessonMap.set(`${t.id}:${l.name.toLowerCase().trim()}`, l.id);
        if (l.code) lessonMap.set(`${t.id}:${l.code.toLowerCase().trim()}`, l.id);
      }
    }

    let defaultTopic = default_topic_id;
    if (!defaultTopic && existingTopics.length > 0) {
      defaultTopic = existingTopics[0].id;
    } else if (!defaultTopic) {
      const createdT = curriculumService.createTopic(grade_subject_id, { name: 'Chủ đề 1: Kiến thức tổng hợp' });
      defaultTopic = createdT.id;
      topicMap.set(createdT.name.toLowerCase().trim(), createdT.id);
    }

    const preparedQuestions = [];

    for (const q of questions) {
      let targetTopicId = defaultTopic;
      let targetLessonId = default_lesson_id || null;

      // 1. Tự động tìm hoặc tạo Chủ đề từ file Word
      if (q.topic_title && q.topic_title.trim()) {
        const cleanT = q.topic_title.trim();
        const keyT = cleanT.toLowerCase();
        if (topicMap.has(keyT)) {
          targetTopicId = topicMap.get(keyT);
        } else {
          const newT = curriculumService.createTopic(grade_subject_id, { name: cleanT });
          targetTopicId = newT.id;
          topicMap.set(keyT, newT.id);
        }
      }

      // 2. Tự động tìm hoặc tạo Bài học từ file Word
      if (q.lesson_title && q.lesson_title.trim()) {
        const cleanL = q.lesson_title.trim();
        const keyL = `${targetTopicId}:${cleanL.toLowerCase()}`;
        if (lessonMap.has(keyL)) {
          targetLessonId = lessonMap.get(keyL);
        } else {
          const newL = curriculumService.createLesson(targetTopicId, { name: cleanL });
          targetLessonId = newL.id;
          lessonMap.set(keyL, newL.id);
        }
      }

      // KIỂM ĐỊNH SERVER-SIDE NGHIÊM NGẶT (FAIL-CLOSED SHIELD)
      // Không phụ thuộc vào client hay parser; câu hỏi chỉ được 'approved' khi thỏa mãn 100% điều kiện kiểm định:
      // 1. Phải đạt chuẩn toàn vẹn từ validator máy chủ (validateQuestionIntegrity)
      // 2. Không thuộc diện câu chưa xác minh (isUnverifiedQuestion)
      // 3. Không có cờ xung đột dữ liệu (has_conflict = false)
      // 4. Trạng thái chỉ định từ parser/workflow phải là 'approved'
      // Bất kỳ trường hợp nào không thỏa mãn (undefined, null, thiếu options, lỗi format) -> BẮT BUỘC là 'pending_review'
      const integrity = questionIntegrityValidator.validateQuestionIntegrity(q);
      const isUnverified = questionIntegrityValidator.isUnverifiedQuestion(q);
      const canBeApproved = integrity.isValid && !integrity.isPendingReview && !isUnverified && !q.has_conflict && q.status === 'approved';
      const finalStatus = canBeApproved ? 'approved' : 'pending_review';

      preparedQuestions.push({
        topic_id: targetTopicId,
        lesson_id: targetLessonId,
        level: q.level || 'biet',
        question_type: q.question_type || 'single_choice',
        content: q.content,
        options: q.options || [],
        correct_answers: q.correct_answers || [],
        short_answer: q.short_answer || (q.question_type === 'short_answer' && Array.isArray(q.correct_answers) ? q.correct_answers[0] : null),
        scoring_config: q.scoring_config || null,
        rubric_guide: q.rubric_guide || '',
        max_score: q.max_score || (q.question_type === 'short_answer' ? 0.5 : (q.question_type === 'true_false' ? 1.0 : (q.question_type === 'essay' ? 1.0 : 0.25))),
        status: finalStatus,
        has_conflict: Boolean(q.has_conflict || integrity.hasConflict)
      });
    }

    const importResult = questionBankService.importQuestionsBatch(
      grade_subject_id,
      defaultTopic,
      default_lesson_id,
      preparedQuestions
    );

    res.json({
      success: true,
      message: `Đã nhập thành công ${importResult.count} câu hỏi vào Ngân hàng câu hỏi!`,
      total_questions: importResult.count
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Quét kiểm tra trùng lặp cho các câu hỏi trong đề thi
router.post('/exams/check-duplicates', requireTeacherAuth, (req, res) => {
  try {
    const { questions } = req.body;
    if (!questions || !Array.isArray(questions)) {
      return res.json({ success: true, option_duplicates: [], intra_duplicates: [] });
    }

    // 1. Quét trùng phương án trong từng câu
    const optionDuplicates = [];
    questions.forEach((q, idx) => {
      const dups = duplicateDetectionService.checkOptionDuplicates(q.options || [], q.question_type);
      if (dups.length > 0) {
        optionDuplicates.push({
          question_index: idx,
          order_index: q.order_index || (idx + 1),
          duplicates: dups
        });
      }
    });

    // 2. Quét trùng câu hỏi nội bộ giữa các câu trong đề
    const intraDuplicates = duplicateDetectionService.checkIntraListDuplicates(questions);

    res.json({
      success: true,
      has_issues: optionDuplicates.length > 0 || intraDuplicates.length > 0,
      option_duplicates: optionDuplicates,
      intra_duplicates: intraDuplicates
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 10. EXAM MATRICES & MATRIX GENERATOR
// ==========================================

// Kiểm tra tính khả dụng của ma trận đề thi
router.post('/exams/validate-matrix', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id, matrix_items } = req.body;
    const result = matrixGeneratorService.validateMatrixAvailability(grade_subject_id, matrix_items);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Sinh đề thi tĩnh từ ma trận đưa vào Ngân hàng đề thi (exams)
router.post('/exams/generate-from-matrix', requireTeacherAuth, (req, res) => {
  try {
    const { title, grade_subject_id, duration_minutes, total_score, matrix_items, variants, variant_codes } = req.body;
    const result = matrixGeneratorService.generateExamFromMatrix({
      title,
      grade_subject_id,
      duration_minutes,
      total_score,
      matrix_items,
      variants,
      variant_codes
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy danh sách mẫu ma trận đã lưu
router.get('/exam-matrices', requireTeacherAuth, (req, res) => {
  try {
    const { grade_subject_id } = req.query;
    const list = matrixGeneratorService.getMatrixTemplates(grade_subject_id);
    res.json({ success: true, templates: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lưu mẫu ma trận
router.post('/exam-matrices', requireTeacherAuth, (req, res) => {
  try {
    const saved = matrixGeneratorService.saveMatrixTemplate(req.body);
    res.json({ success: true, template: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa mẫu ma trận
router.delete('/exam-matrices/:id', requireTeacherAuth, (req, res) => {
  try {
    matrixGeneratorService.deleteMatrixTemplate(req.params.id);
    res.json({ success: true, message: 'Đã xóa mẫu ma trận thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xem trước các mã đề thi hoán vị sinh từ Ma trận trước khi in hoặc lưu
router.post('/exam-matrices/preview-variants', requireTeacherAuth, (req, res) => {
  try {
    const result = matrixGeneratorService.previewVariants(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Xuất trọn gói đề thi in ấn (.zip) từ Ma trận
router.post('/exam-matrices/export-print-package', requireTeacherAuth, async (req, res) => {
  try {
    const {
      title,
      grade_subject_id,
      duration_minutes,
      total_score,
      variants,
      variant_codes,
      matrix_items,
      school_name
    } = req.body;

    const result = await examExportService.generateMatrixPrintPackage({
      title,
      grade_subject_id,
      duration_minutes,
      total_score,
      variants,
      variant_codes,
      matrix_items,
      school_name
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`);
    res.send(result.buffer);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Xuất riêng file Word Bảng ma trận & Bản đặc tả đề thi (.docx)
router.post('/exam-matrices/export-docx', requireTeacherAuth, async (req, res) => {
  try {
    const {
      title,
      grade_subject_id,
      duration_minutes,
      total_score,
      matrix_items,
      school_name
    } = req.body;

    const gs = db.prepare(`
      SELECT gs.*, g.name as grade_name, s.name as subject_name
      FROM grade_subjects gs
      JOIN grades g ON gs.grade_id = g.id
      JOIN subjects s ON gs.subject_id = s.id
      WHERE gs.id = ?
    `).get(grade_subject_id);

    const docxBuffer = await examExportService.generateMatrixAndSpecificationWordBuffer({
      title: title ? title.trim() : 'Ma Trận & Đặc Tả Đề Thi',
      grade_name: gs?.grade_name || '',
      subject_name: gs?.subject_name || '',
      duration_minutes: parseInt(duration_minutes, 10) || 45,
      total_score: parseFloat(total_score) || 10.0,
      matrix_items: matrix_items || [],
      school_name
    });

    const cleanTitle = (title || 'Ma_Tran').trim().replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]+/g, '_');
    const fileName = `Ma_Tran_Va_Ban_Dac_Ta_${cleanTitle}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(docxBuffer);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// 12. LƯU TRỮ HỒ SƠ PHÂN CẤP: LỚP -> TÊN CA THI
// ==========================================
const archiveService = require('../services/archiveService');

// Đồng bộ / Lưu trữ trọn bộ hồ sơ của ca thi vào ổ cứng
router.post('/sessions/:id/archive', requireTeacherAuth, async (req, res) => {
  try {
    const result = await archiveService.archiveSession(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Tải file ZIP trọn bộ hồ sơ ca thi (Lớp -> Tên ca thi)
router.get('/sessions/:id/archive-zip', requireTeacherAuth, async (req, res) => {
  try {
    const { fileName, buffer } = await archiveService.getArchiveZipBuffer(req.params.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy cây danh mục lưu trữ hồ sơ theo từng Lớp và từng Ca thi
router.get('/archive/tree', requireTeacherAuth, (req, res) => {
  try {
    const tree = archiveService.getArchiveTree();
    res.json({ success: true, tree });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mở thư mục lưu trữ trên máy tính máy chủ (Windows Explorer)
router.post('/archive/open-folder', requireTeacherAuth, (req, res) => {
  try {
    const { relativeFolder } = req.body;
    const { exec } = require('node:child_process');
    const path = require('node:path');
    const targetDir = relativeFolder ? path.join(archiveService.archiveBaseDir, relativeFolder) : archiveService.archiveBaseDir;
    if (process.platform === 'win32') {
      exec(`explorer "${targetDir.replace(/\//g, '\\')}"`);
    }
    res.json({ success: true, message: 'Đã mở thư mục lưu trữ trên máy tính máy chủ' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

