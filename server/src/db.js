const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const storageConfig = require('./config/storageConfig');
const crashRecovery = require('./services/crashRecovery');

// --- CRASH RECOVERY SHIELD (TỰ ĐỘNG PHỤC HỒI NẾU MẤT ĐIỆN KHI ĐỔI TỆP CSDL) ---
// Chạy trước khi mở kết nối CSDL chính để đảm bảo tệp CSDL toàn vẹn 100%
try {
  crashRecovery.checkAndRecover(storageConfig.dataDir, storageConfig.dbPath);
} catch (recoveryErr) {
  console.error('[DB] FATAL_CRASH_RECOVERY: Lỗi nghiêm trọng khi phục hồi CSDL sau sự cố:', recoveryErr.message);
  process.exit(54);
}

// --- FAIL-CLOSED MAINTENANCE LOCK GUARD (DATABASE LAYER) ---
// Chặn 100% mọi worker / service kết nối CSDL khi hệ thống đang trong khung giờ bảo trì
const checkLockPaths = [
  path.resolve(__dirname, '../data/.maintenance_lock'),
  storageConfig && storageConfig.dataDir ? path.resolve(storageConfig.dataDir, '.maintenance_lock') : null
].filter(Boolean);

for (const lockFile of checkLockPaths) {
  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (lockData.blockAllRestarts !== false) {
        console.error(`[DB] FATAL_LOCKDOWN: CSDL đang bị khóa bảo trì độc quyền (.maintenance_lock)! Từ chối kết nối.`);
        process.exit(53);
      }
    } catch (err) {
      console.error('[DB] FATAL_LOCKDOWN_FAIL_CLOSED: Tệp .maintenance_lock tồn tại nhưng hỏng! Từ chối kết nối.');
      process.exit(53);
    }
  }
}

const dbPath = storageConfig.dbPath;
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;'); // 5000ms timeout to prevent SQLITE_BUSY under heavy concurrent exam submissions
db.exec('PRAGMA synchronous = NORMAL;'); // Recommended for WAL mode: high write throughput, safely durable

function initSchema() {
  // Nhận diện First-run qua cấu trúc CSDL: kiểm tra bảng system_settings đã tồn tại hay chưa
  const checkSettingsTable = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='system_settings'").get();
  const isFirstRun = checkSettingsTable.count === 0;

  db.exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT,
      duration_minutes INTEGER DEFAULT 45,
      total_score REAL DEFAULT 10.0,
      status TEXT DEFAULT 'draft',
      allow_review INTEGER DEFAULT 0,
      shuffle_questions INTEGER DEFAULT 1,
      shuffle_options INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      question_type TEXT NOT NULL, -- 'single_choice', 'multiple_choice', 'true_false', 'essay'
      content TEXT NOT NULL,
      options_json TEXT, -- JSON array
      correct_answers_json TEXT, -- JSON array of correct option IDs
      rubric_guide TEXT, -- Hướng dẫn chấm/đáp án mẫu cho tự luận
      scoring_config_json TEXT, -- Cấu hình chấm điểm chi tiết (JSON object)
      max_score REAL NOT NULL DEFAULT 1.0,
      FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      session_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 45,
      status TEXT DEFAULT 'waiting', -- 'waiting', 'in_progress', 'finished'
      score_release_mode TEXT DEFAULT 'manual_release', -- 'hidden', 'immediate', 'manual_release'
      scores_released_at TEXT,
      scores_released_by TEXT,
      start_time DATETIME,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      student_code TEXT UNIQUE, -- SBD / Mã học sinh (có thể để trống trước khi đánh SBD)
      student_name TEXT NOT NULL,
      class_name TEXT,
      gender TEXT,
      dob TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_code TEXT NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT,
      client_ip TEXT,
      client_machine_name TEXT,
      extra_time_minutes INTEGER DEFAULT 0,
      mcq_score REAL DEFAULT 0.0,
      essay_score REAL DEFAULT 0.0,
      total_score REAL DEFAULT 0.0,
      is_graded INTEGER DEFAULT 0,
      violations_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'in_progress', -- 'waiting', 'in_progress', 'submitted', 'forced_submitted'
      submitted_at DATETIME,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_device_locked INTEGER DEFAULT 1,
      exam_paper_json TEXT,
      answers_json TEXT,
      FOREIGN KEY(session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      selected_options_json TEXT,
      essay_content TEXT,
      auto_score REAL DEFAULT 0.0,
      manual_score REAL DEFAULT NULL,
      teacher_feedback TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(attempt_id) REFERENCES student_attempts(id) ON DELETE CASCADE,
      UNIQUE(attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      student_code TEXT,
      event_type TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS session_students (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 1. Khối lớp (Grades)
    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level_type TEXT DEFAULT 'thpt',
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Môn học (Subjects)
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Phân môn theo khối lớp (Grade - Subject)
    CREATE TABLE IF NOT EXISTS grade_subjects (
      id TEXT PRIMARY KEY,
      grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      curriculum TEXT DEFAULT 'Chung',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(grade_id, subject_id, curriculum)
    );

    -- 4. Chủ đề / Chương học (Topics)
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      grade_subject_id TEXT NOT NULL REFERENCES grade_subjects(id) ON DELETE CASCADE,
      code TEXT,
      name TEXT NOT NULL,
      description TEXT,
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Bài học cụ thể (Lessons)
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      code TEXT,
      name TEXT NOT NULL,
      objectives TEXT,
      objectives_by_level_json TEXT,
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. Ngân hàng câu hỏi chuẩn hóa (Question Bank)
    CREATE TABLE IF NOT EXISTS question_bank (
      id TEXT PRIMARY KEY,
      grade_subject_id TEXT NOT NULL REFERENCES grade_subjects(id) ON DELETE CASCADE,
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
      level TEXT NOT NULL CHECK(level IN ('biet', 'hieu', 'van_dung')),
      question_type TEXT NOT NULL CHECK(question_type IN ('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay')),
      content TEXT NOT NULL,
      options_json TEXT,
      correct_answers_json TEXT,
      short_answer TEXT,
      rubric_guide TEXT,
      scoring_config_json TEXT,
      default_score REAL DEFAULT 0.25,
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. Khung ma trận đề thi (Exam Matrices)
    CREATE TABLE IF NOT EXISTS exam_matrices (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      grade_subject_id TEXT NOT NULL REFERENCES grade_subjects(id) ON DELETE CASCADE,
      duration_minutes INTEGER DEFAULT 45,
      total_score REAL DEFAULT 10.0,
      matrix_items_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Chỉ mục tối ưu tốc độ truy vấn
    CREATE INDEX IF NOT EXISTS idx_qb_grade_subject ON question_bank(grade_subject_id);
    CREATE INDEX IF NOT EXISTS idx_qb_topic ON question_bank(topic_id);
    CREATE INDEX IF NOT EXISTS idx_qb_lesson ON question_bank(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_qb_level_type ON question_bank(level, question_type);
    CREATE INDEX IF NOT EXISTS idx_topics_gs ON topics(grade_subject_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_topic ON lessons(topic_id);

    -- 8. Tầng thống kê chi tiết ngân hàng câu hỏi (VNLAN V3.0)
    CREATE TABLE IF NOT EXISTS question_source_links (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_instance_id TEXT NOT NULL,
      bank_question_id TEXT,
      bank_revision INTEGER DEFAULT 1,
      match_method TEXT NOT NULL,
      match_status TEXT NOT NULL,
      content_fingerprint TEXT,
      answer_fingerprint TEXT,
      confidence_note TEXT,
      verified_at TEXT,
      verified_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_attempt_question UNIQUE (attempt_id, question_instance_id)
    );
    CREATE INDEX IF NOT EXISTS idx_qsl_bank_qid ON question_source_links(bank_question_id);
    CREATE INDEX IF NOT EXISTS idx_qsl_status ON question_source_links(match_status);
    CREATE INDEX IF NOT EXISTS idx_qsl_cfp ON question_source_links(content_fingerprint);

    CREATE TABLE IF NOT EXISTS question_stats_generations (
      generation_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      published_at TEXT,
      total_questions INTEGER DEFAULT 0,
      total_answers_processed INTEGER DEFAULT 0,
      summary_metrics_json TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS question_stats_control (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      active_generation_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (active_generation_id) REFERENCES question_stats_generations(generation_id)
    );
    INSERT OR IGNORE INTO question_stats_control (singleton_id, active_generation_id) VALUES (1, NULL);

    CREATE TABLE IF NOT EXISTS question_stats_summary (
      generation_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      usage_exam_count INTEGER DEFAULT 0,
      usage_paper_count INTEGER DEFAULT 0,
      exposed_count INTEGER DEFAULT 0,
      answered_count INTEGER DEFAULT 0,
      blank_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      fully_correct_count INTEGER DEFAULT 0,
      partially_correct_count INTEGER DEFAULT 0,
      correct_rate_on_answered REAL DEFAULT 0.0,
      correct_rate_on_exposed REAL DEFAULT 0.0,
      response_rate REAL DEFAULT 0.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (generation_id, question_id)
    );
    CREATE INDEX IF NOT EXISTS idx_qss_gen_qid ON question_stats_summary(generation_id, question_id);

    CREATE TABLE IF NOT EXISTS question_option_stats (
      generation_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      bank_option_id TEXT NOT NULL,
      bank_label TEXT NOT NULL,
      option_text_sample TEXT,
      selected_count INTEGER DEFAULT 0,
      selected_rate REAL DEFAULT 0.0,
      is_correct_in_bank INTEGER DEFAULT 0,
      PRIMARY KEY (generation_id, question_id, bank_option_id)
    );

    CREATE TABLE IF NOT EXISTS question_tf_item_stats (
      generation_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      item_text TEXT,
      true_count INTEGER DEFAULT 0,
      false_count INTEGER DEFAULT 0,
      blank_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      bank_correct_state INTEGER,
      PRIMARY KEY (generation_id, question_id, item_key)
    );

    CREATE TABLE IF NOT EXISTS question_short_answer_stats (
      generation_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      normalized_answer TEXT NOT NULL,
      response_count INTEGER DEFAULT 0,
      distinct_student_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      is_grouped_other INTEGER DEFAULT 0,
      PRIMARY KEY (generation_id, question_id, normalized_answer)
    );
  `);

  // Ensure duration_minutes column exists in exam_sessions if table was already created
  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN duration_minutes INTEGER DEFAULT 45;');
  } catch (e) {
    // Column already exists
  }

  // Ensure is_device_locked column exists in student_attempts
  try {
    db.exec('ALTER TABLE student_attempts ADD COLUMN is_device_locked INTEGER DEFAULT 1;');
  } catch (e) {
    // Column already exists
  }

  // Ensure exam_paper_json column exists in student_attempts
  try {
    db.exec('ALTER TABLE student_attempts ADD COLUMN exam_paper_json TEXT;');
  } catch (e) {
    // Column already exists
  }

  // Ensure answer_key_overrides_json column exists in exam_sessions
  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN answer_key_overrides_json TEXT;');
  } catch (e) {
    // Column already exists
  }

  // Ensure matrix_id, generate_per_student, target_class columns exist in exam_sessions
  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN matrix_id TEXT;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN generate_per_student INTEGER DEFAULT 0;');
  } catch (e) {}

  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN target_class TEXT;');
  } catch (e) {}

  try {
    db.exec("ALTER TABLE exam_sessions ADD COLUMN distribution_mode TEXT DEFAULT 'fixed';");
  } catch (e) {}

  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN variant_exam_ids_json TEXT;');
  } catch (e) {}

  try {
    db.exec("ALTER TABLE exam_sessions ADD COLUMN exam_type TEXT DEFAULT 'GK';");
  } catch (e) {}

  try {
    db.exec('ALTER TABLE student_attempts ADD COLUMN variant_code TEXT;');
  } catch (e) {}

  // Bổ sung các cột kiểm soát chế độ công bố điểm số
  try {
    db.exec("ALTER TABLE exam_sessions ADD COLUMN score_release_mode TEXT DEFAULT 'manual_release';");
  } catch (e) {}
  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN scores_released_at TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN scores_released_by TEXT;');
  } catch (e) {}

  // Bổ sung các cột thông tin hành chính, điểm 4 phần và câu trả lời ngắn
  try { db.exec('ALTER TABLE exams ADD COLUMN school_name TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE exams ADD COLUMN school_year TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE exams ADD COLUMN grade TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE exams ADD COLUMN note TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE exams ADD COLUMN part_scores_json TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE questions ADD COLUMN short_answer TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE questions ADD COLUMN scoring_config_json TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE student_answers ADD COLUMN short_answer TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE question_bank ADD COLUMN short_answer TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE question_bank ADD COLUMN scoring_config_json TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE questions ADD COLUMN bank_question_id TEXT REFERENCES question_bank(id) ON DELETE SET NULL;'); } catch (e) {}
  // Đảm bảo cột dob (ngày sinh) tồn tại trong bảng students
  try { db.exec('ALTER TABLE students ADD COLUMN dob TEXT;'); } catch (e) {}
  // Đảm bảo cột student_code trong bảng students cho phép NULL (khi chưa đánh SBD)
  try {
    const colInfo = db.prepare("PRAGMA table_info(students)").all();
    const codeCol = colInfo.find(c => c.name === 'student_code');
    if (codeCol && codeCol.notnull === 1) {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec(`
        CREATE TABLE students_migrated_code (
          id TEXT PRIMARY KEY,
          student_code TEXT UNIQUE,
          student_name TEXT NOT NULL,
          class_name TEXT,
          gender TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO students_migrated_code SELECT id, student_code, student_name, class_name, gender, created_at FROM students;
        DROP TABLE students;
        ALTER TABLE students_migrated_code RENAME TO students;
      `);
      db.exec('PRAGMA foreign_keys = ON;');
    }
  } catch (e) {}

  // Tự động liên kết các câu hỏi trong đề thi với ngân hàng câu hỏi nếu có nội dung trùng khớp
  try {
    const unlinked = db.prepare('SELECT id, content FROM questions WHERE bank_question_id IS NULL').all();
    if (unlinked.length > 0) {
      const bankItems = db.prepare('SELECT id, content FROM question_bank').all();
      const updateStmt = db.prepare('UPDATE questions SET bank_question_id = ? WHERE id = ?');
      for (const eq of unlinked) {
        if (!eq.content) continue;
        const cleanEq = eq.content.trim().replace(/\s+/g, ' ');
        const match = bankItems.find(bq => bq.content && bq.content.trim().replace(/\s+/g, ' ') === cleanEq);
        if (match) {
          updateStmt.run(match.id, eq.id);
        }
      }
    }
  } catch (e) {}

  // Migration: Bổ sung answers_json vào student_attempts nếu chưa có
  try {
    const attemptColumns = db.prepare('PRAGMA table_info(student_attempts)').all().map(c => c.name);
    if (!attemptColumns.includes('answers_json')) {
      db.prepare('ALTER TABLE student_attempts ADD COLUMN answers_json TEXT').run();
    }
  } catch (e) {}

  // Migration: Bổ sung objectives_by_level_json vào lessons nếu chưa có
  try {
    const lessonColumns = db.prepare('PRAGMA table_info(lessons)').all().map(c => c.name);
    if (!lessonColumns.includes('objectives_by_level_json')) {
      db.prepare('ALTER TABLE lessons ADD COLUMN objectives_by_level_json TEXT').run();
    }
  } catch (e) {}

  // Chỉ nạp cấu hình hệ thống ban đầu nếu là lần chạy đầu tiên (Bản sạch Clean Slate)
  if (isFirstRun) {
    console.log('[DB] Phát hiện khởi tạo hệ thống lần đầu: Nạp cấu hình tối thiểu (Clean Slate)...');
    seedMinimalSystemConfig();
  }
}

function calculateCurrentAcademicYear() {
  const now = new Date();
  const currentYear = now.getFullYear();
  // Từ tháng 8 (index >= 7) là năm học mới
  const startYear = now.getMonth() >= 7 ? currentYear : currentYear - 1;
  return `${startYear} - ${startYear + 1}`;
}

function hashInitialPassword(pwd) {
  const SALT = 'lan_exam_salt_ndc_2025';
  return crypto.createHmac('sha256', SALT).update(String(pwd)).digest('hex');
}

function seedMinimalSystemConfig() {
  try {
    // 1. Quản trị viên mặc định (admin / admin123) kèm cờ bắt buộc đổi mật khẩu lần đầu
    const defaultPwdHash = hashInitialPassword('admin123');
    const insertSetting = db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    insertSetting.run('teacher_password_hash', defaultPwdHash);
    insertSetting.run('must_change_password', '1');

    // 2. Thông tin trường học mặc định với năm học tính động theo thời gian thực
    const initialSchoolInfo = {
      school_name: 'Trường THCS/THPT ...',
      department_name: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
      academic_year: calculateCurrentAcademicYear()
    };
    insertSetting.run('school_info', JSON.stringify(initialSchoolInfo));

    // 3. Khối lớp chuẩn GDPT 2018 (Khối 6 -> 12)
    const insertGrade = db.prepare('INSERT OR IGNORE INTO grades (id, name, level_type, order_index) VALUES (?, ?, ?, ?)');
    const standardGrades = [
      { id: 'k10', name: 'Khối 10', level_type: 'thpt', order: 1 },
      { id: 'k11', name: 'Khối 11', level_type: 'thpt', order: 2 },
      { id: 'k12', name: 'Khối 12', level_type: 'thpt', order: 3 },
      { id: 'k6', name: 'Khối 6', level_type: 'thcs', order: 4 },
      { id: 'k7', name: 'Khối 7', level_type: 'thcs', order: 5 },
      { id: 'k8', name: 'Khối 8', level_type: 'thcs', order: 6 },
      { id: 'k9', name: 'Khối 9', level_type: 'thcs', order: 7 }
    ];
    for (const g of standardGrades) {
      insertGrade.run(g.id, g.name, g.level_type, g.order);
    }

    // 4. Môn học chuẩn hóa GDPT 2018
    const insertSub = db.prepare('INSERT OR IGNORE INTO subjects (id, name, code, description) VALUES (?, ?, ?, ?)');
    const standardSubjects = [
      { id: 'tin_hoc', name: 'Tin học', code: 'TIN', desc: 'Môn Tin học phổ thông' },
      { id: 'toan', name: 'Toán học', code: 'TOAN', desc: 'Môn Toán học' },
      { id: 'ngu_van', name: 'Ngữ văn', code: 'VAN', desc: 'Môn Ngữ văn' },
      { id: 'tieng_anh', name: 'Tiếng Anh', code: 'ANH', desc: 'Môn Tiếng Anh' },
      { id: 'cong_nghe', name: 'Công nghệ', code: 'CN', desc: 'Môn Công nghệ phổ thông' },
      { id: 'khtn', name: 'Khoa học tự nhiên (KHTN)', code: 'KHTN', desc: 'Môn Khoa học tự nhiên cấp THCS' },
      { id: 'ls_dl', name: 'Lịch sử và Địa lí (LSDL)', code: 'LSDL', desc: 'Môn Lịch sử và Địa lí cấp THCS' },
      { id: 'gdcd', name: 'Giáo dục công dân (GDCD)', code: 'GDCD', desc: 'Môn Giáo dục công dân cấp THCS' },
      { id: 'vat_li', name: 'Vật lí', code: 'LY', desc: 'Môn Vật lí' },
      { id: 'hoa_hoc', name: 'Hóa học', code: 'HOA', desc: 'Môn Hóa học' },
      { id: 'sinh_hoc', name: 'Sinh học', code: 'SINH', desc: 'Môn Sinh học' },
      { id: 'lich_su', name: 'Lịch sử', code: 'SU', desc: 'Môn Lịch sử' },
      { id: 'dia_li', name: 'Địa lí', code: 'DIA', desc: 'Môn Địa lí' },
      { id: 'gdktpl', name: 'Giáo dục KT & PL', code: 'GDKTPL', desc: 'Giáo dục kinh tế và pháp luật cấp THPT' }
    ];
    for (const s of standardSubjects) {
      insertSub.run(s.id, s.name, s.code, s.desc);
    }

    // 5. Liên kết Grade_Subjects
    const allGrades = db.prepare('SELECT id FROM grades').all();
    const allSubjects = db.prepare('SELECT id FROM subjects').all();
    const insertGS = db.prepare('INSERT OR IGNORE INTO grade_subjects (id, grade_id, subject_id, curriculum) VALUES (?, ?, ?, ?)');
    for (const g of allGrades) {
      for (const s of allSubjects) {
        insertGS.run(`${g.id}_${s.id}`, g.id, s.id, 'Chung');
      }
    }

    console.log('[DB] Đã hoàn tất nạp cấu hình hệ thống ban đầu (Bản sạch 100% không dữ liệu rác).');
  } catch (err) {
    console.error('[DB] Lỗi nạp cấu hình tối thiểu:', err.message);
  }
}

initSchema();

module.exports = db;

