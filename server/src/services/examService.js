const db = require('../db');
const crypto = require('node:crypto');
const questionIntegrityValidator = require('./questionIntegrityValidator');
const {
  generateContentFingerprint,
  generateAnswerFingerprint,
  generateRevisionFingerprint,
  buildOptionMappings
} = require('./questionFingerprintUtils');

/**
 * Bộ sinh số ngẫu nhiên có Seed (Mulberry32) phục vụ tái lập mã đề và kiểm toán
 */
function createSeededRandom(seedStr) {
  if (!seedStr || typeof seedStr !== 'string') {
    seedStr = crypto.randomUUID();
  }
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function shuffleArray(array, rng = Math.random) {
  const arr = [...array];
  const randFn = typeof rng === 'function' ? rng : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Xáo trộn phương án trắc nghiệm có bảo toàn phương án cố định ([[FIX_OPTION]] hoặc <o>)
 * Phương án cố định (ví dụ "D. Cả A và B đều đúng") giữ nguyên vị trí, chỉ xáo trộn các phương án tự do.
 */
function shuffleOptionsPreservingFixed(options, correctAnswers, standardLabels = ['A', 'B', 'C', 'D'], rng = Math.random) {
  if (!options || options.length <= 1) return { options, correctAnswers };

  const fixedPositions = new Set();
  options.forEach((opt, idx) => {
    if (opt.is_fixed) fixedPositions.add(idx);
  });

  if (fixedPositions.size === options.length) {
    const fixedOpts = options.map((opt, idx) => ({
      id: standardLabels[idx] || opt.id,
      text: opt.text,
      is_fixed: true
    }));
    return { options: fixedOpts, correctAnswers };
  }

  const movableItems = [];
  options.forEach((opt, idx) => {
    if (!fixedPositions.has(idx)) {
      movableItems.push({
        originalId: opt.id || standardLabels[idx] || String.fromCharCode(65 + idx),
        text: opt.text,
        is_fixed: false
      });
    }
  });

  const shuffledMovable = shuffleArray(movableItems, rng);

  let movableIdx = 0;
  const assembledItems = options.map((opt, idx) => {
    if (fixedPositions.has(idx)) {
      return {
        originalId: opt.id || standardLabels[idx] || String.fromCharCode(65 + idx),
        text: opt.text,
        is_fixed: true
      };
    } else {
      return shuffledMovable[movableIdx++];
    }
  });

  const finalOptions = assembledItems.map((item, idx) => ({
    id: standardLabels[idx] || item.originalId,
    text: item.text,
    is_fixed: Boolean(item.is_fixed)
  }));

  const origAnswers = Array.isArray(correctAnswers) ? correctAnswers : (correctAnswers ? [correctAnswers] : []);
  const origSet = new Set(origAnswers.map(String));
  const newAnswers = [];
  assembledItems.forEach((item, idx) => {
    if (origSet.has(String(item.originalId))) {
      newAnswers.push(standardLabels[idx]);
    }
  });

  return {
    options: finalOptions,
    correctAnswers: Array.isArray(correctAnswers) ? newAnswers : (newAnswers[0] || '')
  };
}

/**
 * Xáo trộn danh sách câu hỏi có bảo toàn câu cố định ([[FIX_QUESTION]] hoặc <c>)
 * và giữ chùm câu hỏi ngữ liệu chung ([[GROUP_START]]) luôn liền kề nhau
 */
function shuffleQuestionsPreservingGroupsAndFixed(questionsList, rng = Math.random) {
  if (!questionsList || questionsList.length <= 1) return [...(questionsList || [])];

  const units = [];
  let currentGroupUnit = null;

  questionsList.forEach(q => {
    const isFixed = Boolean(q.is_fixed || q.scoring_config?.is_fixed);
    const groupId = q.group_id || q.scoring_config?.group_id;

    if (groupId) {
      if (currentGroupUnit && currentGroupUnit.groupId === groupId) {
        currentGroupUnit.items.push(q);
        if (isFixed) currentGroupUnit.is_fixed = true;
      } else {
        if (currentGroupUnit) units.push(currentGroupUnit);
        currentGroupUnit = { type: 'group', groupId, items: [q], is_fixed: isFixed };
      }
    } else {
      if (currentGroupUnit) {
        units.push(currentGroupUnit);
        currentGroupUnit = null;
      }
      units.push({ type: 'single', items: [q], is_fixed: isFixed });
    }
  });
  if (currentGroupUnit) units.push(currentGroupUnit);

  const fixedIndices = new Set();
  units.forEach((u, idx) => {
    if (u.is_fixed) fixedIndices.add(idx);
  });

  const movableUnits = units.filter((u, idx) => !fixedIndices.has(idx));
  const shuffledMovable = shuffleArray(movableUnits, rng);

  let movablePtr = 0;
  const assembledUnits = units.map((u, idx) => {
    if (fixedIndices.has(idx)) {
      return u;
    } else {
      return shuffledMovable[movablePtr++];
    }
  });

  const result = [];
  assembledUnits.forEach(u => {
    result.push(...u.items);
  });
  return result;
}

/**
 * Chuẩn hóa dữ liệu câu hỏi đề thi (Bảo toàn mảng đáp án & scoring_config 3 lớp)
 */
function sanitizeExamQuestion(q) {
  const isShort = q.question_type === 'short_answer';
  let correctAnswers = [];
  if (Array.isArray(q.correct_answers)) {
    correctAnswers = q.correct_answers.map(String).map(s => s.trim()).filter(Boolean);
  } else if (typeof q.correct_answers === 'string') {
    try {
      const parsed = JSON.parse(q.correct_answers);
      if (Array.isArray(parsed)) {
        correctAnswers = parsed.map(String).map(s => s.trim()).filter(Boolean);
      } else if (parsed && typeof parsed === 'object') {
        correctAnswers = parsed;
      } else {
        correctAnswers = [q.correct_answers.trim()];
      }
    } catch (e) {
      correctAnswers = [q.correct_answers.trim()];
    }
  } else if (q.correct_answers && typeof q.correct_answers === 'object') {
    correctAnswers = q.correct_answers;
  }

  // Fallback nếu câu hỏi trả lời ngắn chỉ có q.short_answer
  if (isShort && (!Array.isArray(correctAnswers) || correctAnswers.length === 0) && q.short_answer) {
    correctAnswers = [String(q.short_answer).trim()];
  }

  let shortAnswer = q.short_answer || '';
  if (isShort && !shortAnswer && Array.isArray(correctAnswers) && correctAnswers.length > 0) {
    shortAnswer = correctAnswers[0];
  }

  let scoringConfig = null;
  const rawCfg = q.scoring_config || (q.scoring_config_json ? (typeof q.scoring_config_json === 'string' ? JSON.parse(q.scoring_config_json) : q.scoring_config_json) : null);
  if (rawCfg && typeof rawCfg === 'object') {
    scoringConfig = { ...rawCfg };
  } else {
    scoringConfig = {};
  }

  // Luôn bảo toàn metadata is_fixed và group_id cho mọi loại câu hỏi
  if (q.is_fixed !== undefined) {
    scoringConfig.is_fixed = Boolean(q.is_fixed);
  }
  if (q.group_id !== undefined) {
    scoringConfig.group_id = q.group_id || null;
  }
  // Đồng bộ và bảo toàn status & has_conflict vào scoringConfig
  if (q.status !== undefined) {
    scoringConfig.status = q.status;
  }
  if (q.has_conflict !== undefined) {
    scoringConfig.has_conflict = Boolean(q.has_conflict);
  }

  if (isShort && !scoringConfig.answer_format) {
    scoringConfig.answer_format = 'decimal';
    scoringConfig.allow_comma_dot_equivalence = true;
    scoringConfig.case_sensitive = false;
    scoringConfig.numeric_equivalence = false;
    scoringConfig.exam_sheet_compatible = false;
    scoringConfig.max_characters = null;
  }

  return {
    correctAnswers,
    shortAnswer: shortAnswer || null,
    scoringConfig
  };
}

/**
 * Kiểm tra câu hỏi chưa duyệt (pending_review) hoặc xung đột đáp án (has_conflict)
 * Ủy quyền cho questionIntegrityValidator chuẩn hóa trên toàn hệ thống
 */
function isUnverifiedQuestion(q, options = {}) {
  return questionIntegrityValidator.isUnverifiedQuestion(q, options);
}

class ExamService {
  getAllExams() {
    const exams = db.prepare('SELECT * FROM exams ORDER BY created_at DESC').all();
    return exams.map((exam) => {
      const qStats = db.prepare(`
        SELECT 
          COUNT(*) as total_questions,
          SUM(CASE WHEN question_type = 'single_choice' OR question_type = 'multiple_choice' THEN 1 ELSE 0 END) as mcq_count,
          SUM(CASE WHEN question_type = 'true_false' THEN 1 ELSE 0 END) as tf_count,
          SUM(CASE WHEN question_type = 'essay' THEN 1 ELSE 0 END) as essay_count,
          SUM(max_score) as sum_score
        FROM questions WHERE exam_id = ?
      `).get(exam.id);
      return {
        ...exam,
        total_questions: qStats.total_questions || 0,
        mcq_count: qStats.mcq_count || 0,
        tf_count: qStats.tf_count || 0,
        essay_count: qStats.essay_count || 0,
        sum_score: qStats.sum_score || 0
      };
    });
  }

  getExamById(id, includeAnswers = true) {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
    if (!exam) return null;

    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(id);
    
    exam.questions = questions.map((q) => {
      let scoringConfig = null;
      if (q.scoring_config_json) {
        try { scoringConfig = JSON.parse(q.scoring_config_json); } catch (e) {}
      }
      let ca = [];
      if (includeAnswers) {
        ca = questionIntegrityValidator.parseCorrectAnswers(q) || [];
      }

      let resolvedStatus = q.status || scoringConfig?.status;
      if (!resolvedStatus) {
        resolvedStatus = q.question_type === 'essay' ? 'pending_review' : 'approved';
      }

      const parsed = {
        ...q,
        options: q.options_json ? JSON.parse(q.options_json) : [],
        correct_answers: ca,
        scoring_config: scoringConfig,
        status: resolvedStatus,
        has_conflict: Boolean(q.has_conflict !== undefined ? q.has_conflict : scoringConfig?.has_conflict),
        is_fixed: Boolean(scoringConfig?.is_fixed),
        group_id: scoringConfig?.group_id || null
      };
      return parsed;
    });

    if (!includeAnswers) {
      return this.buildStudentPaperDTO(exam);
    }

    return exam;
  }

  createExam({
    title,
    subject,
    duration_minutes = 45,
    total_score = 10.0,
    shuffle_questions = 1,
    shuffle_options = 1,
    school_name = '',
    school_year = '',
    grade = '',
    note = '',
    part_scores_json = null,
    questions = []
  }) {
    const id = crypto.randomUUID();
    const partScoresStr = typeof part_scores_json === 'object' && part_scores_json !== null
      ? JSON.stringify(part_scores_json)
      : (part_scores_json || null);

    db.prepare(`
      INSERT INTO exams (id, title, subject, duration_minutes, total_score, status, shuffle_questions, shuffle_options, school_name, school_year, grade, note, part_scores_json)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      subject,
      Number(duration_minutes) || 45,
      Number(total_score),
      shuffle_questions ? 1 : 0,
      shuffle_options ? 1 : 0,
      school_name || '',
      school_year || '',
      grade || '',
      note || '',
      partScoresStr
    );

    const insertQ = db.prepare(`
      INSERT INTO questions (id, exam_id, order_index, question_type, content, options_json, correct_answers_json, short_answer, scoring_config_json, rubric_guide, max_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    questions.forEach((q, idx) => {
      const qId = crypto.randomUUID();
      const sanitized = sanitizeExamQuestion(q);
      insertQ.run(
        qId,
        id,
        idx + 1,
        q.question_type || 'single_choice',
        q.content,
        JSON.stringify(q.options || []),
        JSON.stringify(sanitized.correctAnswers),
        sanitized.shortAnswer,
        sanitized.scoringConfig ? JSON.stringify(sanitized.scoringConfig) : null,
        q.rubric_guide || '',
        Number(q.max_score !== undefined ? q.max_score : 1.0)
      );
    });

    return this.getExamById(id, true);
  }

  updateExam(id, {
    title,
    subject,
    duration_minutes = 45,
    total_score = 10.0,
    shuffle_questions = 1,
    shuffle_options = 1,
    school_name = '',
    school_year = '',
    grade = '',
    note = '',
    part_scores_json = null,
    questions = []
  }) {
    const partScoresStr = typeof part_scores_json === 'object' && part_scores_json !== null
      ? JSON.stringify(part_scores_json)
      : (part_scores_json || null);

    db.prepare(`
      UPDATE exams 
      SET title = ?, subject = ?, duration_minutes = ?, total_score = ?, shuffle_questions = ?, shuffle_options = ?,
          school_name = ?, school_year = ?, grade = ?, note = ?, part_scores_json = ?
      WHERE id = ?
    `).run(
      title,
      subject,
      Number(duration_minutes) || 45,
      Number(total_score),
      shuffle_questions ? 1 : 0,
      shuffle_options ? 1 : 0,
      school_name || '',
      school_year || '',
      grade || '',
      note || '',
      partScoresStr,
      id
    );

    // Safe question update: preserve question IDs and existing student_answers
    const existingQuestions = db.prepare('SELECT id FROM questions WHERE exam_id = ?').all(id);
    const existingIdSet = new Set(existingQuestions.map(q => q.id));
    const incomingIdSet = new Set(questions.filter(q => q.id).map(q => q.id));

    // Delete only questions that were removed and have NO student answers referencing them
    for (const eq of existingQuestions) {
      if (!incomingIdSet.has(eq.id)) {
        const ansCount = db.prepare('SELECT COUNT(*) as c FROM student_answers WHERE question_id = ?').get(eq.id);
        if (!ansCount || ansCount.c === 0) {
          db.prepare('DELETE FROM questions WHERE id = ?').run(eq.id);
        }
      }
    }

    const upsertStmt = db.prepare(`
      INSERT INTO questions (id, exam_id, order_index, question_type, content, options_json, correct_answers_json, short_answer, scoring_config_json, rubric_guide, max_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        order_index = excluded.order_index,
        question_type = excluded.question_type,
        content = excluded.content,
        options_json = excluded.options_json,
        correct_answers_json = excluded.correct_answers_json,
        short_answer = excluded.short_answer,
        scoring_config_json = excluded.scoring_config_json,
        rubric_guide = excluded.rubric_guide,
        max_score = excluded.max_score
    `);

    questions.forEach((q, idx) => {
      const qId = q.id || crypto.randomUUID();
      const sanitized = sanitizeExamQuestion(q);
      upsertStmt.run(
        qId,
        id,
        idx + 1,
        q.question_type || 'single_choice',
        q.content,
        JSON.stringify(q.options || []),
        JSON.stringify(sanitized.correctAnswers),
        sanitized.shortAnswer,
        sanitized.scoringConfig ? JSON.stringify(sanitized.scoringConfig) : null,
        q.rubric_guide || '',
        Number(q.max_score !== undefined ? q.max_score : 1.0)
      );
    });

    return this.getExamById(id, true);
  }

  updateSingleQuestion(examId, questionId, {
    content,
    options,
    correct_answers,
    short_answer,
    scoring_config,
    rubric_guide,
    max_score,
    question_type
  }) {
    const q = db.prepare('SELECT * FROM questions WHERE id = ? AND exam_id = ?').get(questionId, examId);
    if (!q) throw new Error('Không tìm thấy câu hỏi trong đề thi này');

    let sCfgJson = undefined;
    if (scoring_config !== undefined) {
      sCfgJson = scoring_config ? JSON.stringify(scoring_config) : null;
    }

    const updateStmt = db.prepare(`
      UPDATE questions
      SET content = COALESCE(?, content),
          options_json = COALESCE(?, options_json),
          correct_answers_json = COALESCE(?, correct_answers_json),
          short_answer = ?,
          scoring_config_json = COALESCE(?, scoring_config_json),
          rubric_guide = COALESCE(?, rubric_guide),
          max_score = COALESCE(?, max_score),
          question_type = COALESCE(?, question_type)
      WHERE id = ? AND exam_id = ?
    `);

    updateStmt.run(
      content !== undefined ? content : null,
      options !== undefined ? JSON.stringify(options) : null,
      correct_answers !== undefined ? JSON.stringify(correct_answers) : null,
      short_answer !== undefined ? short_answer : q.short_answer,
      sCfgJson !== undefined ? sCfgJson : null,
      rubric_guide !== undefined ? rubric_guide : null,
      max_score !== undefined ? Number(max_score) : null,
      question_type !== undefined ? question_type : null,
      questionId,
      examId
    );

    // Cập nhật lại tổng điểm đề thi
    const sumScore = db.prepare('SELECT SUM(max_score) as total FROM questions WHERE exam_id = ?').get(examId);
    if (sumScore && sumScore.total !== null) {
      db.prepare('UPDATE exams SET total_score = ? WHERE id = ?').run(Math.round(sumScore.total * 100) / 100, examId);
    }

    return this.getExamById(examId, true);
  }

  deleteExam(id) {
    db.prepare('DELETE FROM exams WHERE id = ?').run(id);
    return true;
  }

  // SESSIONS
  getAllSessions() {
    return db.prepare(`
      SELECT s.*, 
        COALESCE(e.title, m.title, 'Không xác định') as exam_title,
        e.grade as exam_grade,
        m.title as matrix_title,
        (SELECT COUNT(*) FROM student_attempts WHERE session_id = s.id) as student_count,
        (SELECT COUNT(*) FROM session_students WHERE session_id = s.id) as assigned_student_count,
        (SELECT class_name FROM student_attempts WHERE session_id = s.id AND class_name IS NOT NULL LIMIT 1) as student_class
      FROM exam_sessions s
      LEFT JOIN exams e ON s.exam_id = e.id
      LEFT JOIN exam_matrices m ON s.matrix_id = m.id
      ORDER BY s.created_at DESC
    `).all();
  }

  generateUniqueSessionCode(rawPrefix = 'PHONG') {
    let cleanPrefix = String(rawPrefix || 'PHONG').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanPrefix) cleanPrefix = 'PHONG';

    const existingRows = db.prepare('SELECT UPPER(session_code) as code FROM exam_sessions').all();
    const existingCodes = new Set(existingRows.map(r => r.code));

    // Nếu prefix kết thúc bằng mã loại thi (ví dụ: -GK, -TX, -CK, -KTTX) -> sinh dạng 10A1-GK1, 9A1-TX1
    const isExamTypeSuffix = /-(GK|TX|CK|KTTX)$/i.test(cleanPrefix);
    if (isExamTypeSuffix) {
      for (let i = 1; i <= 99; i++) {
        const candidate = `${cleanPrefix}${i}`;
        if (!existingCodes.has(candidate)) {
          return candidate;
        }
      }
    }

    // Thử tuần tự dạng PREFIX-01, PREFIX-02...
    for (let i = 1; i <= 99; i++) {
      const pad = i < 10 ? `0${i}` : `${i}`;
      const candidate = `${cleanPrefix}-${pad}`;
      if (!existingCodes.has(candidate)) {
        return candidate;
      }
    }

    // Nếu vẫn trùng, sinh mã ngẫu nhiên 3 chữ số
    for (let attempts = 0; attempts < 100; attempts++) {
      const randNum = Math.floor(100 + Math.random() * 900);
      const candidate = `${cleanPrefix}-${randNum}`;
      if (!existingCodes.has(candidate)) {
        return candidate;
      }
    }

    return `${cleanPrefix}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }

  createSession({
    exam_id = null,
    matrix_id = null,
    distribution_mode = 'fixed',
    variant_exam_ids = null,
    generate_per_student = 0,
    target_class = null,
    exam_type = 'GK',
    score_release_mode = null,
    session_code,
    title,
    duration_minutes = 45,
    status = 'waiting'
  }) {
    const id = crypto.randomUUID();
    let finalExamId = exam_id;

    let normalizedCode = (session_code || '').trim().toUpperCase();
    if (!normalizedCode) {
      normalizedCode = this.generateUniqueSessionCode(target_class || 'PHONG');
    }

    // Pre-check trùng mã ca thi
    const duplicate = db.prepare('SELECT id, session_code, title FROM exam_sessions WHERE UPPER(session_code) = UPPER(?)').get(normalizedCode);
    if (duplicate) {
      const suggested = this.generateUniqueSessionCode(target_class || normalizedCode);
      const err = new Error(`Mã ca thi "${normalizedCode}" đã tồn tại (đang được dùng bởi ca "${duplicate.title}"). Gợi ý mã mới khả dụng: "${suggested}".`);
      err.code = 'SESSION_CODE_DUPLICATE';
      err.suggestedCode = suggested;
      throw err;
    }

    const finalDistMode = (distribution_mode === 'matrix_dynamic' || generate_per_student === 1) ? 'matrix_dynamic' : 'fixed';
    const finalGeneratePerStudent = finalDistMode === 'matrix_dynamic' ? 1 : 0;
    const variantExamIdsJson = Array.isArray(variant_exam_ids) ? JSON.stringify(variant_exam_ids) : (typeof variant_exam_ids === 'string' ? variant_exam_ids : null);

    // Xác định chế độ công bố điểm (score_release_mode):
    // GK / CK mặc định là 'manual_release' (Giáo viên công bố sau)
    // KTTX mặc định là 'immediate' (Hiện điểm ngay)
    let finalScoreReleaseMode = score_release_mode;
    if (!finalScoreReleaseMode || !['hidden', 'immediate', 'manual_release'].includes(finalScoreReleaseMode)) {
      finalScoreReleaseMode = (exam_type === 'KTTX') ? 'immediate' : 'manual_release';
    }

    // Nếu tạo ca thi từ Ma Trận mà chưa có exam_id cụ thể, sinh một đề mẫu chuẩn
    if (matrix_id && !finalExamId) {
      try {
        const matrix = db.prepare('SELECT * FROM exam_matrices WHERE id = ?').get(matrix_id);
        if (matrix) {
          const matrixGeneratorService = require('./matrixGeneratorService');
          const matrixItems = JSON.parse(matrix.matrix_items_json || '[]');
          const gen = matrixGeneratorService.generateExamFromMatrix({
            title: title ? `${title} (Đề gốc)` : matrix.title,
            grade_subject_id: matrix.grade_subject_id,
            duration_minutes: duration_minutes || matrix.duration_minutes || 45,
            total_score: matrix.total_score || 10.0,
            matrix_items: matrixItems,
            variants: 1
          });
          if (gen.exams && gen.exams.length > 0) {
            finalExamId = gen.exams[0].id;
          }
        }
      } catch (err) {
        console.error('Auto create master exam from matrix error:', err);
        throw err;
      }
    }

    // Kiểm tra an toàn Zero-Guesswork: Tuyệt đối không cho phép mở ca thi nếu đề thi còn câu hỏi xung đột hoặc chưa duyệt đáp án
    const examIdsToCheck = [finalExamId];
    if (variantExamIdsJson) {
      try {
        const vIds = JSON.parse(variantExamIdsJson);
        if (Array.isArray(vIds)) {
          vIds.forEach(vid => { if (vid && !examIdsToCheck.includes(vid)) examIdsToCheck.push(vid); });
        }
      } catch (e) {}
    }

    for (const eid of examIdsToCheck) {
      if (!eid) continue;
      const examToCheck = this.getExamById(eid, true);
      if (examToCheck && Array.isArray(examToCheck.questions)) {
        const unverified = examToCheck.questions.filter(isUnverifiedQuestion);
        if (unverified.length > 0) {
          const err = new Error(`Không thể mở ca thi: Đề thi "${examToCheck.title}" chứa ${unverified.length} câu hỏi đang xung đột hoặc chưa được giáo viên duyệt đáp án (Câu ${unverified.map(q => q.order_index).join(', ')}). Vui lòng hoàn tất đối soát trước khi mở thi!`);
          err.code = 'UNVERIFIED_EXAM_QUESTIONS';
          throw err;
        }
      }
    }

    db.prepare(`
      INSERT INTO exam_sessions (
        id, exam_id, matrix_id, generate_per_student, distribution_mode, variant_exam_ids_json,
        target_class, exam_type, score_release_mode, session_code, title, duration_minutes, status, start_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      finalExamId,
      matrix_id || null,
      finalGeneratePerStudent,
      finalDistMode,
      variantExamIdsJson,
      target_class ? target_class.trim() : null,
      exam_type || 'GK',
      finalScoreReleaseMode,
      normalizedCode,
      title,
      Number(duration_minutes),
      status,
      status === 'in_progress' ? new Date().toISOString() : null
    );
    return this.getSessionByCode(normalizedCode);
  }

  updateSession(id, {
    session_code,
    title,
    duration_minutes = 45,
    status = 'waiting',
    exam_id,
    matrix_id,
    distribution_mode = 'fixed',
    variant_exam_ids = null,
    generate_per_student,
    target_class,
    exam_type = 'GK',
    score_release_mode
  }) {
    let normalizedCode = (session_code || '').trim().toUpperCase();
    if (!normalizedCode) {
      normalizedCode = this.generateUniqueSessionCode(target_class || 'PHONG');
    }

    // Pre-check trùng mã ca thi với ca khác
    const duplicate = db.prepare('SELECT id, session_code, title FROM exam_sessions WHERE UPPER(session_code) = UPPER(?) AND id != ?').get(normalizedCode, id);
    if (duplicate) {
      const suggested = this.generateUniqueSessionCode(target_class || normalizedCode);
      const err = new Error(`Mã ca thi "${normalizedCode}" đã tồn tại (đang được dùng bởi ca "${duplicate.title}"). Gợi ý mã mới khả dụng: "${suggested}".`);
      err.code = 'SESSION_CODE_DUPLICATE';
      err.suggestedCode = suggested;
      throw err;
    }

    const finalDistMode = (distribution_mode === 'matrix_dynamic' || generate_per_student === 1) ? 'matrix_dynamic' : 'fixed';
    const finalGeneratePerStudent = finalDistMode === 'matrix_dynamic' ? 1 : 0;
    const variantExamIdsJson = Array.isArray(variant_exam_ids) ? JSON.stringify(variant_exam_ids) : (typeof variant_exam_ids === 'string' ? variant_exam_ids : null);

    const validReleaseMode = ['hidden', 'immediate', 'manual_release'].includes(score_release_mode) ? score_release_mode : null;

    db.prepare(`
      UPDATE exam_sessions 
      SET session_code = ?, 
          title = ?, 
          duration_minutes = ?, 
          status = ?, 
          exam_id = COALESCE(?, exam_id),
          matrix_id = ?,
          generate_per_student = ?,
          distribution_mode = ?,
          variant_exam_ids_json = ?,
          target_class = ?,
          exam_type = COALESCE(?, exam_type),
          score_release_mode = COALESCE(?, score_release_mode)
      WHERE id = ?
    `).run(
      normalizedCode,
      title,
      Number(duration_minutes),
      status,
      exam_id || null,
      matrix_id || null,
      finalGeneratePerStudent,
      finalDistMode,
      variantExamIdsJson,
      target_class ? target_class.trim() : null,
      exam_type || null,
      validReleaseMode,
      id
    );

    return this.getSessionByCode(normalizedCode);
  }

  /**
   * Kiểm tra xem học sinh có được phép xem điểm của ca thi này hay không (Fail-Closed)
   */
  canStudentViewScore(session) {
    if (!session || typeof session !== 'object') return false;
    const mode = session.score_release_mode;
    if (mode === 'immediate') return true;
    if (mode === 'manual_release') return Boolean(session.scores_released_at);
    if (mode === 'hidden') return false;
    return false; // Fail-closed mặc định: không có chế độ hợp lệ thì không cho xem
  }

  /**
   * Giáo viên thực hiện thao tác công bố điểm ca thi (Idempotent, có ghi nhật ký)
   */
  releaseSessionScores(sessionId, teacherUsername = 'Giáo viên') {
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) throw new Error('Không tìm thấy ca thi');

    const releasedAt = session.scores_released_at || new Date().toISOString();
    const releasedBy = session.scores_released_by || teacherUsername;

    db.prepare(`
      UPDATE exam_sessions 
      SET scores_released_at = ?, scores_released_by = ?
      WHERE id = ?
    `).run(releasedAt, releasedBy, sessionId);

    console.log(`[Score Release Audit] Ca thi ${session.session_code} (${sessionId}) được công bố điểm bởi [${releasedBy}] lúc [${releasedAt}]`);

    return {
      success: true,
      sessionId,
      session_code: session.session_code,
      scores_released_at: releasedAt,
      scores_released_by: releasedBy
    };
  }

  /**
   * Tạo DTO kết quả bài làm cho học sinh tuân thủ Strict Allowlist (Zero-Leakage):
   * Khi điểm CHƯA ĐƯỢC PHÉP CÔNG BỐ (hoặc chưa chấm xong):
   * TUYỆT ĐỐI KHÔNG TỒN TẠI total_score, mcq_score, essay_score, part_stats,
   * total_questions, answered_count, completed_count trong JSON!
   */
  buildStudentResultDTO(attempt, session, fullGrade = null) {
    if (!attempt) return null;
    const canView = this.canStudentViewScore(session);
    const isGradedVal = fullGrade?.is_graded ?? attempt.is_graded;
    const gradingIsFinal = Number(isGradedVal) === 1 || isGradedVal === true;

    // Khi CHƯA được phép xem điểm hoặc CHƯA chấm xong: trả về biên nhận tối giản bảo mật
    if (!canView || !gradingIsFinal) {
      return {
        attemptId: attempt.id,
        submission_status: 'submitted',
        submitted_at: attempt.submitted_at ?? null,
        show_score: false,
        message: 'Bài thi đã được ghi nhận trên máy chủ. Điểm số được bảo mật và sẽ được công bố theo quy định.'
      };
    }

    // Khi ĐÃ ĐƯỢC PHÉP và ĐÃ CHẤM XONG: Trả về DTO đầy đủ với điểm và thống kê
    const totalQuestions = Number(fullGrade?.total_questions ?? attempt.total_questions ?? 0);
    const answeredCount = Number(fullGrade?.answered_count ?? attempt.answered_count ?? 0);
    const completedCount = Number(fullGrade?.completed_count ?? answeredCount);

    const dto = {
      attemptId: attempt.id,
      submission_status: 'submitted',
      submitted_at: attempt.submitted_at ?? null,
      show_score: true,
      is_graded: 1,
      total_questions: totalQuestions,
      answered_count: answeredCount,
      completed_count: completedCount,
      total_score: Number(fullGrade?.total_score ?? attempt.total_score ?? 0),
      mcq_score: Number(fullGrade?.mcq_score ?? attempt.mcq_score ?? 0),
      essay_score: Number(fullGrade?.essay_score ?? attempt.essay_score ?? 0),
      message: 'Đã ghi nhận và chấm điểm hoàn tất.'
    };

    if (fullGrade?.part1_stats) dto.part1_stats = fullGrade.part1_stats;
    if (fullGrade?.part2_stats) dto.part2_stats = fullGrade.part2_stats;
    if (fullGrade?.part3_stats) dto.part3_stats = fullGrade.part3_stats;
    if (fullGrade?.essay_stats) dto.essay_stats = fullGrade.essay_stats;

    return dto;
  }

  /**
   * Lọc sạch thông tin điểm số trong đối tượng attempt trước khi trả về máy học sinh (Zero-Leakage)
   */
  sanitizeStudentAttempt(attempt, session) {
    if (!attempt) return null;
    const canView = this.canStudentViewScore(session);
    const isGradedVal = attempt.is_graded;
    const gradingIsFinal = Number(isGradedVal) === 1 || isGradedVal === true;

    const safeAttempt = {
      id: attempt.id,
      session_id: attempt.session_id,
      student_code: attempt.student_code,
      student_name: attempt.student_name,
      class_name: attempt.class_name,
      client_ip: attempt.client_ip,
      client_machine_name: attempt.client_machine_name,
      status: attempt.status,
      start_time: attempt.start_time,
      submitted_at: attempt.submitted_at ?? null,
      extra_time_minutes: attempt.extra_time_minutes,
      variant_code: attempt.variant_code
    };

    // Chỉ đính kèm trường điểm nếu đã được phép và chấm xong
    if (canView && gradingIsFinal) {
      safeAttempt.is_graded = 1;
      safeAttempt.mcq_score = attempt.mcq_score;
      safeAttempt.essay_score = attempt.essay_score;
      safeAttempt.total_score = attempt.total_score;
    }

    return safeAttempt;
  }

  deleteSession(id) {
    db.prepare('DELETE FROM exam_sessions WHERE id = ?').run(id);
    return true;
  }

  startSession(id) {
    const session = this.getSessionById(id);
    if (!session) throw new Error('Không tìm thấy ca thi');

    // Kiểm tra an toàn Zero-Guesswork trước khi phát lệnh làm bài
    if (session.exam_id) {
      const examToCheck = this.getExamById(session.exam_id, true);
      if (examToCheck && Array.isArray(examToCheck.questions)) {
        const unverified = examToCheck.questions.filter(isUnverifiedQuestion);
        if (unverified.length > 0) {
          const err = new Error(`Không thể bắt đầu ca thi: Đề thi "${examToCheck.title}" chứa ${unverified.length} câu hỏi chưa duyệt đáp án. Vui lòng hoàn tất đối soát!`);
          err.code = 'UNVERIFIED_EXAM_QUESTIONS';
          throw err;
        }
      }
    }

    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE exam_sessions 
      SET status = 'in_progress', start_time = ?
      WHERE id = ?
    `).run(nowIso, id);

    // Also transition any waiting attempts to in_progress with this start_time
    const result = db.prepare(`
      UPDATE student_attempts 
      SET status = 'in_progress', start_time = ?
      WHERE session_id = ? AND status = 'waiting'
    `).run(nowIso, id);

    // Pre-generate and store individual exam papers for all attempts in this session if missing
    if (session) {
      const waitingAttempts = db.prepare('SELECT id, exam_paper_json, student_code, student_name FROM student_attempts WHERE session_id = ?').all(id);
      for (const att of waitingAttempts) {
        if (!att.exam_paper_json) {
          this.getOrCreateStudentAttemptPaper(att.id, session);
        }
      }
    }

    return {
      session: this.getSessionById(id),
      startedAttemptsCount: result.changes,
      startTime: nowIso
    };
  }

  finishSession(id) {
    const gradingService = require('./gradingService');

    // 1. Mark session as finished
    db.prepare(`
      UPDATE exam_sessions 
      SET status = 'finished', end_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    // 2. Automatically submit and grade any students who are still in progress
    const activeAttempts = db.prepare(`
      SELECT id FROM student_attempts 
      WHERE session_id = ? AND status = 'in_progress'
    `).all(id);

    let autoSubmittedCount = 0;
    for (const att of activeAttempts) {
      db.prepare(`
        UPDATE student_attempts 
        SET status = 'forced_submitted', submitted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(att.id);

      gradingService.autoGradeAttempt(att.id);
      autoSubmittedCount++;
    }

    // 3. Tự động lưu trữ hồ sơ ca thi vào thư mục: Lớp -> Tên ca thi
    try {
      const archiveService = require('./archiveService');
      archiveService.archiveSession(id).catch(err => {
        console.error('Auto archive on finish error:', err);
      });
    } catch (e) {}

    return {
      sessionId: id,
      autoSubmittedCount
    };
  }

  getSessionById(id) {
    const session = db.prepare(`
      SELECT s.*, 
        COALESCE(e.title, m.title, 'Không xác định') as exam_title,
        e.shuffle_questions, e.shuffle_options,
        COALESCE(e.total_score, m.total_score, 10.0) as total_score,
        m.title as matrix_title
      FROM exam_sessions s
      LEFT JOIN exams e ON s.exam_id = e.id
      LEFT JOIN exam_matrices m ON s.matrix_id = m.id
      WHERE s.id = ?
    `).get(id);
    return session || null;
  }

  getSessionByCode(code) {
    const session = db.prepare(`
      SELECT s.*, 
        COALESCE(e.title, m.title, 'Không xác định') as exam_title,
        e.shuffle_questions, e.shuffle_options,
        COALESCE(e.total_score, m.total_score, 10.0) as total_score,
        m.title as matrix_title
      FROM exam_sessions s
      LEFT JOIN exams e ON s.exam_id = e.id
      LEFT JOIN exam_matrices m ON s.matrix_id = m.id
      WHERE UPPER(s.session_code) = UPPER(?)
    `).get(code);
    return session || null;
  }

  // --- SESSION STUDENTS MANAGEMENT ---
  getSessionStudents(sessionId) {
    return db.prepare(`
      SELECT st.id, st.student_code, st.student_name, st.class_name, st.gender, st.dob,
             ss.created_at as assigned_at,
             att.id as attempt_id, att.status as attempt_status, att.client_ip,
             att.mcq_score, att.essay_score, att.total_score, att.submitted_at
      FROM session_students ss
      JOIN students st ON ss.student_id = st.id
      LEFT JOIN student_attempts att ON att.session_id = ss.session_id AND UPPER(att.student_code) = UPPER(st.student_code)
      WHERE ss.session_id = ?
      ORDER BY st.class_name ASC, st.student_code ASC
    `).all(sessionId);
  }

  getSessionStudentCount(sessionId) {
    const row = db.prepare('SELECT COUNT(*) as count FROM session_students WHERE session_id = ?').get(sessionId);
    return row ? row.count : 0;
  }

  addStudentsToSession(sessionId, studentIds = []) {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO session_students (id, session_id, student_id)
      VALUES (?, ?, ?)
    `);
    let addedCount = 0;
    for (const sId of studentIds) {
      const res = insertStmt.run(crypto.randomUUID(), sessionId, sId);
      if (res.changes > 0) addedCount++;
    }
    return { addedCount, totalInSession: this.getSessionStudentCount(sessionId) };
  }

  addStudentsByClassToSession(sessionId, className) {
    const students = db.prepare('SELECT id FROM students WHERE class_name = ?').all(className);
    const studentIds = students.map(s => s.id);
    return this.addStudentsToSession(sessionId, studentIds);
  }

  removeStudentFromSession(sessionId, studentId) {
    db.prepare('DELETE FROM session_students WHERE session_id = ? AND student_id = ?').run(sessionId, studentId);
    return true;
  }

  clearSessionStudents(sessionId) {
    db.prepare('DELETE FROM session_students WHERE session_id = ?').run(sessionId);
    return true;
  }

  isStudentAllowedInSession(sessionId, studentCode) {
    const assignedCount = this.getSessionStudentCount(sessionId);
    // If no students assigned specifically to this session, allow any registered student
    if (assignedCount === 0) {
      return { allowed: true, hasRoster: false };
    }
    // If ca thi has an assigned roster, verify studentCode is in the list
    const found = db.prepare(`
      SELECT ss.id
      FROM session_students ss
      JOIN students st ON ss.student_id = st.id
      WHERE ss.session_id = ? AND UPPER(st.student_code) = UPPER(?)
    `).get(sessionId, studentCode.trim());

    return { allowed: !!found, hasRoster: true };
  }

  // Prepares the exam paper for a specific student
  // ĐÁP ÁN A, B, C, D TRONG PHẦN LÀM BÀI CỦA HỌC SINH GIỮ NGUYÊN THỨ TỰ, CHỈ ĐẢO NỘI DUNG VÀ ĐỒNG BỘ ĐÁP ÁN ĐÚNG
  // RIÊNG PHẦN TỰ LUẬN KHÔNG BAO GIỜ BỊ XÁO TRỘN THEO YÊU CẦU
  generateStudentExamPaper(examId, shuffleQ = true, shuffleOpt = true, shuffleTfOpt = null) {
    const exam = this.getExamById(examId, true); // TRUE: Tải kèm đáp án đúng để đồng bộ chính xác khi đảo
    if (!exam) return null;

    const useShuffleTf = shuffleTfOpt !== null ? Boolean(shuffleTfOpt) : Boolean(shuffleOpt);

    const STANDARD_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    // Tách riêng 4 nhóm câu hỏi theo chuẩn Bộ GD&ĐT 2025:
    // - Phần I: Trắc nghiệm lựa chọn (A, B, C, D)
    // - Phần II: Trắc nghiệm Đúng/Sai (4 ý a, b, c, d)
    // - Phần III: Trắc nghiệm Trả lời ngắn
    // - Phần IV: Tự luận (giữ nguyên vị trí ở cuối)
    const part1Questions = (exam.questions || []).filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const part2Questions = (exam.questions || []).filter(q => q.question_type === 'true_false');
    const part3Questions = (exam.questions || []).filter(q => q.question_type === 'short_answer');
    const essayQuestions = (exam.questions || []).filter(q => q.question_type === 'essay');

    // 1. Xáo trộn thứ tự các câu hỏi trong từng phần riêng biệt nếu được bật (bảo toàn câu cố định và nhóm câu ngữ liệu)
    let finalPart1 = shuffleQ ? shuffleQuestionsPreservingGroupsAndFixed(part1Questions) : [...part1Questions];
    let finalPart2 = shuffleQ ? shuffleQuestionsPreservingGroupsAndFixed(part2Questions) : [...part2Questions];
    let finalPart3 = shuffleQ ? shuffleQuestionsPreservingGroupsAndFixed(part3Questions) : [...part3Questions];

    // 2. Xáo trộn NỘI DUNG các lựa chọn của Phần I (Bảo toàn phương án cố định [[FIX_OPTION]])
    finalPart1 = finalPart1.map(q => {
      let options = q.options || [];
      let correctAnswers = q.correct_answers || [];

      if (shuffleOpt && options.length > 1) {
        const shuffledRes = shuffleOptionsPreservingFixed(options, correctAnswers, STANDARD_LABELS);
        options = shuffledRes.options;
        correctAnswers = shuffledRes.correctAnswers;
      } else if (options.length > 0) {
        options = options.map((opt, idx) => ({
          id: STANDARD_LABELS[idx] || opt.id,
          text: opt.text,
          is_fixed: Boolean(opt.is_fixed)
        }));
      }

      return {
        ...q,
        options,
        correct_answers: correctAnswers
      };
    });

    // Phần II (Đúng/Sai): Hoán vị các ý a, b, c, d nếu được bật (tự động re-map đáp án Đúng/Sai)
    const { shuffleTrueFalseOptions } = require('./trueFalseUtils');
    finalPart2 = finalPart2.map(q => {
      if (useShuffleTf) {
        return shuffleTrueFalseOptions(q, shuffleArray);
      }
      return {
        ...q,
        options: (q.options || []).map(opt => ({
          id: opt.id ? String(opt.id).toLowerCase() : 'a',
          text: opt.text
        }))
      };
    });

    // Phần III (Trả lời ngắn): Giữ nguyên định dạng
    finalPart3 = finalPart3.map(q => ({
      ...q
    }));

    // 3. RIÊNG PHẦN TỰ LUẬN: GIỮ NGUYÊN 100% THỨ TỰ GỐC DO GIÁO VIÊN SOẠN
    const finalEssay = [...essayQuestions];

    // Ghép lại theo đúng thứ tự chuẩn Bộ GD&ĐT: Phần I -> Phần II (Đúng/Sai) -> Phần III (Trả lời ngắn) -> Phần IV (Tự Luận)
    const allQuestions = [...finalPart1, ...finalPart2, ...finalPart3, ...finalEssay].map((q, idx) => ({
      ...q,
      display_order: idx + 1
    }));

    exam.questions = allQuestions;
    return exam;
  }

  // Lấy hoặc khởi tạo đề thi cho từng thí sinh:
  // - Chế độ "matrix_dynamic": Sinh động theo ma trận trực tiếp từ ngân hàng cho từng thí sinh
  // - Chế độ "fixed": Phát theo đề cố định (các mã đề 101, 102... chia đều theo số báo danh)
  // - Xử lý lưu vết: Khi thí sinh bắt đầu, lưu danh sách question_ids và thứ tự đáp án vào exam_paper_json
  //   để đảm bảo khi F5 hoặc đổi máy vẫn giữ nguyên đề thi cũ 100%.
  getOrCreateStudentAttemptPaper(attemptId, session) {
    let attempt = null;
    if (attemptId) {
      attempt = db.prepare('SELECT id, exam_paper_json, student_code, student_name, variant_code FROM student_attempts WHERE id = ?').get(attemptId);
      // XỬ LÝ LƯU VẾT: Nếu thí sinh đã có đề thi lưu trong DB, luôn trả về đúng đề thi cũ
      if (attempt && attempt.exam_paper_json) {
        try {
          return JSON.parse(attempt.exam_paper_json);
        } catch (e) {
          console.error('Error parsing existing exam_paper_json:', e);
          // Fail-closed: Tuyệt đối không tự ý sinh lại đề mới làm sai lệch đề thi đã nhận của thí sinh!
          throw new Error(`[GIÁM THỊ CẦN XỬ LÝ] Lỗi toàn vẹn snapshot đề thi (Attempt ID: ${attemptId}): Cấu trúc exam_paper_json bị hỏng. Hệ thống từ chối tự ý sinh lại đề mới để đảm bảo tính bất biến và công bằng thi cử. Hướng dẫn giám thị: Kiểm tra tình trạng máy thí sinh và thực hiện Đổi máy thi hoặc Cấp lại bài thi có kiểm soát.`);
        }
      }
    }

    if (!session) return null;

    const isMatrixDynamic = (session.distribution_mode === 'matrix_dynamic') || 
                            (session.generate_per_student === 1 && session.matrix_id);

    let paper = null;
    let variantCode = null;

    if (isMatrixDynamic && session.matrix_id) {
      // 1. CHẾ ĐỘ SINH ĐỘNG THEO MA TRẬN: Bốc ngẫu nhiên câu hỏi trực tiếp từ ngân hàng theo cấu trúc ma trận
      try {
        const matrixGeneratorService = require('./matrixGeneratorService');
        paper = matrixGeneratorService.generateDynamicStudentExam({
          sessionId: session.id,
          matrixId: session.matrix_id,
          studentCode: attempt ? attempt.student_code : 'HS',
          studentName: attempt ? attempt.student_name : 'Học sinh'
        });
        variantCode = 'Đề ma trận';
      } catch (err) {
        console.error('Error generating dynamic exam per student from matrix:', err);
      }
    }

    if (!paper) {
      // 2. CHẾ ĐỘ PHÁT THEO ĐỀ CỐ ĐỊNH: Chia đều các mã đề (101, 102...) theo số báo danh
      let assignedExamId = session.exam_id;
      let variantExamIds = [];

      if (session.variant_exam_ids_json) {
        try {
          const parsed = JSON.parse(session.variant_exam_ids_json);
          if (Array.isArray(parsed) && parsed.length > 0) {
            variantExamIds = parsed;
          }
        } catch (e) {}
      }

      // Nếu chưa có mảng mã đề rõ ràng, tự động tìm các đề cùng bộ (Mã đề 101, 102...)
      if (variantExamIds.length === 0 && session.exam_id) {
        const baseExam = db.prepare('SELECT id, title FROM exams WHERE id = ?').get(session.exam_id);
        if (baseExam && baseExam.title) {
          const cleanBaseTitle = baseExam.title.replace(/\s*-\s*Mã đề\s*\d+.*$/i, '').trim();
          const siblingExams = db.prepare(`
            SELECT id, title FROM exams 
            WHERE (title LIKE ? OR title = ?)
            ORDER BY title ASC
          `).all(`${cleanBaseTitle} - Mã đề %`, cleanBaseTitle);

          if (siblingExams.length > 1) {
            variantExamIds = siblingExams.map(x => x.id);
          }
        }
      }

      // Nếu có nhiều mã đề (101, 102...): Chia đều theo số báo danh (SBD) của thí sinh
      if (variantExamIds.length > 0) {
        let studentIndex = 0;
        if (attempt && attempt.student_code) {
          const numMatch = attempt.student_code.match(/(\d+)/);
          if (numMatch) {
            studentIndex = parseInt(numMatch[1], 10);
          } else {
            let hash = 0;
            for (let i = 0; i < attempt.student_code.length; i++) {
              hash = (hash * 31 + attempt.student_code.charCodeAt(i)) & 0xffffffff;
            }
            studentIndex = Math.abs(hash);
          }
        }
        const pickedIdx = studentIndex % variantExamIds.length;
        assignedExamId = variantExamIds[pickedIdx];
      }

      if (assignedExamId) {
        paper = this.generateStudentExamPaper(
          assignedExamId,
          session.shuffle_questions === 1,
          session.shuffle_options === 1
        );
        const examRow = db.prepare('SELECT title FROM exams WHERE id = ?').get(assignedExamId);
        if (examRow && examRow.title) {
          const matchCode = examRow.title.match(/Mã đề\s*(\d+)/i);
          variantCode = matchCode ? matchCode[1] : null;
        }
      }
    }

    // XỬ LÝ LƯU VẾT: Lưu ngay vào bảng bài làm của thí sinh (student_attempts)
    // Đảm bảo khi F5 hoặc đổi máy vẫn giữ nguyên đề thi cũ và thứ tự câu hỏi / đáp án 100%
    if (attemptId && paper) {
      if (variantCode) {
        paper.variant_code = variantCode;
      }
      db.prepare(`
        UPDATE student_attempts 
        SET exam_paper_json = ?, variant_code = COALESCE(?, variant_code) 
        WHERE id = ?
      `).run(JSON.stringify(paper), variantCode || null, attemptId);
    }

    return paper;
  }

  // CHUẨN HÓA DTO ĐỀ THI HỌC SINH THEO ALLOWLIST TƯỜNG MINH (EXPLICIT ALLOWLIST)
  // Chỉ đưa vào các trường được định danh cho phép đối với đề thi, câu hỏi và phương án.
  // Tuyệt đối không dùng blocklist (delete fields); mọi trường mới mở rộng đều không thể lọt ra ngoài.
  buildStudentQuestionDTO(q) {
    if (!q || typeof q !== 'object') return null;

    let sanitizedOptions = [];
    if (Array.isArray(q.options)) {
      sanitizedOptions = q.options.map(opt => {
        if (!opt || typeof opt !== 'object') {
          const str = String(opt || '');
          return { id: '', text: str, content: str };
        }
        const optText = String(opt.text !== undefined ? opt.text : (opt.content !== undefined ? opt.content : ''));
        return {
          id: String(opt.id || ''),
          text: optText,
          content: optText,
          is_fixed: Boolean(opt.is_fixed)
        };
      });
    }

    return {
      id: String(q.id || ''),
      exam_id: q.exam_id ? String(q.exam_id) : undefined,
      order_index: Number(q.order_index) || 0,
      display_order: q.display_order !== undefined ? Number(q.display_order) : undefined,
      question_type: String(q.question_type || 'single_choice'),
      content: String(q.content || ''),
      max_score: Number(q.max_score) || 1.0,
      options: sanitizedOptions
    };
  }

  buildStudentPaperDTO(paper) {
    if (!paper || typeof paper !== 'object') return null;

    return {
      id: String(paper.id || ''),
      title: String(paper.title || ''),
      subject: paper.subject ? String(paper.subject) : '',
      duration_minutes: Number(paper.duration_minutes) || 45,
      total_score: Number(paper.total_score) || 10.0,
      status: String(paper.status || 'active'),
      allow_review: Number(paper.allow_review) || 0,
      shuffle_questions: Number(paper.shuffle_questions) || 0,
      shuffle_options: Number(paper.shuffle_options) || 0,
      school_name: paper.school_name ? String(paper.school_name) : '',
      school_year: paper.school_year ? String(paper.school_year) : '',
      grade: paper.grade ? String(paper.grade) : '',
      part_scores_json: paper.part_scores_json || null,
      questions: Array.isArray(paper.questions)
        ? paper.questions.map(q => this.buildStudentQuestionDTO(q)).filter(Boolean)
        : []
    };
  }

  // Phương thức sanitizeStudentPaper gọi trực tiếp Strict Allowlist DTO
  sanitizeStudentPaper(paper) {
    return this.buildStudentPaperDTO(paper);
  }

  // --- TRỘN ĐỀ HOÁN VỊ TỪ ĐỀ GỐC (EXAM PERMUTATION ENGINE - HARDENED) ---
  generateSingleShuffledVariant(masterExam, variantCode, options = {}) {
    if (!masterExam || !Array.isArray(masterExam.questions)) {
      throw new Error('Đề thi gốc không hợp lệ hoặc không có danh sách câu hỏi');
    }

    const shuffleQ = options.shuffleQuestions !== undefined ? Boolean(options.shuffleQuestions) : true;
    const shuffleOpt = options.shuffleOptions !== undefined ? Boolean(options.shuffleOptions) : true;
    const shuffleTfOpt = options.shuffleTfOptions !== undefined ? Boolean(options.shuffleTfOptions) : Boolean(shuffleOpt);
    const STANDARD_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    // 1. Khởi tạo Seeded PRNG nếu có seed hoặc sinh deterministically từ masterExamId + variantCode
    const seed = options.seed || `${masterExam.id || 'exam'}_var_${variantCode}_${options.sessionSalt || 'salt2025'}`;
    const rng = createSeededRandom(seed);
    const shuffleFn = (arr) => shuffleArray(arr, rng);

    // 2. Kiểm tra tính toàn vẹn (Validation & Fail-Closed)
    // 2.1 Phát hiện trùng ID
    const seenIds = new Set();
    for (const q of masterExam.questions) {
      if (!q.id) {
        throw new Error('Phát hiện câu hỏi thiếu ID định danh trong đề thi');
      }
      if (seenIds.has(q.id)) {
        throw new Error(`Phát hiện câu hỏi trùng ID: ${q.id}`);
      }
      seenIds.add(q.id);
    }

    // 2.2 Phân vùng 4 phần nghiêm ngặt (Fail-closed nếu type lạ/thiếu)
    const part1Questions = [];
    const part2Questions = [];
    const part3Questions = [];
    const essayQuestions = [];

    const VALID_TYPES = new Set(['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay']);

    for (const q of masterExam.questions) {
      if (!q.question_type || !VALID_TYPES.has(q.question_type)) {
        throw new Error(`Câu hỏi ID ${q.id} không có question_type hợp lệ (nhận được: ${q.question_type || 'null'})`);
      }
      if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
        part1Questions.push(q);
      } else if (q.question_type === 'true_false') {
        part2Questions.push(q);
      } else if (q.question_type === 'short_answer') {
        part3Questions.push(q);
      } else if (q.question_type === 'essay') {
        essayQuestions.push(q);
      }
    }

    const totalCategorized = part1Questions.length + part2Questions.length + part3Questions.length + essayQuestions.length;
    if (totalCategorized !== masterExam.questions.length) {
      throw new Error(`Lỗi phân vùng: Tổng số câu được phân loại (${totalCategorized}) không khớp tổng số câu ban đầu (${masterExam.questions.length})`);
    }

    // 3. Hoán vị thứ tự câu hỏi trong từng phần độc lập (Fisher-Yates PRNG)
    // Sắp xếp sư phạm chuẩn: Nhóm theo mức độ nhận thức (Biết -> Hiểu -> Vận dụng) và xáo trộn bên trong từng nhóm
    const shuffleByCognitiveLevel = (questions) => {
      if (!shuffleQ || !Array.isArray(questions) || questions.length <= 1) return [...questions];
      const LEVEL_ORDER = ['nhan_biet', 'biet', 'thong_hieu', 'hieu', 'van_dung', 'van_dung_cao'];
      const groups = new Map();
      const otherGroup = [];

      for (const q of questions) {
        const lvl = q.level ? String(q.level).trim().toLowerCase() : null;
        if (lvl && LEVEL_ORDER.includes(lvl)) {
          if (!groups.has(lvl)) groups.set(lvl, []);
          groups.get(lvl).push(q);
        } else {
          otherGroup.push(q);
        }
      }

      // Nếu tất cả câu hỏi đều không có level hợp lệ, xáo trộn toàn bộ danh sách
      if (groups.size === 0) {
        return shuffleFn(questions);
      }

      const res = [];
      const normalizedLevelBuckets = [
        ['nhan_biet', 'biet'],
        ['thong_hieu', 'hieu'],
        ['van_dung'],
        ['van_dung_cao']
      ];

      for (const bucket of normalizedLevelBuckets) {
        const bucketQs = [];
        for (const k of bucket) {
          if (groups.has(k)) {
            bucketQs.push(...groups.get(k));
            groups.delete(k);
          }
        }
        if (bucketQs.length > 0) {
          res.push(...shuffleFn(bucketQs));
        }
      }

      // Các nhóm còn lại nếu có
      for (const remaining of groups.values()) {
        res.push(...shuffleFn(remaining));
      }

      if (otherGroup.length > 0) {
        res.push(...shuffleFn(otherGroup));
      }

      return res;
    };

    let finalPart1 = shuffleByCognitiveLevel(part1Questions);
    let finalPart2 = shuffleByCognitiveLevel(part2Questions);
    let finalPart3 = shuffleByCognitiveLevel(part3Questions);
    let finalPart4 = [...essayQuestions]; // Tự luận giữ cố định

    // 4. Hoán vị nội dung phương án Phần I & Chuẩn hóa ánh xạ đáp án (Risk 2.1 Hardening & T07 Arbitrary ID)
    finalPart1 = finalPart1.map(q => {
      let options = q.options ? JSON.parse(JSON.stringify(q.options)) : [];
      let rawCorrect = q.correct_answers !== undefined ? q.correct_answers : q.correct_answers_json;
      if (typeof rawCorrect === 'string') {
        try { rawCorrect = JSON.parse(rawCorrect); } catch (e) {}
      }

      // Chuẩn hóa tập đáp án đúng ban đầu thành Set các chuỗi so sánh
      const correctTokens = new Set();
      if (Array.isArray(rawCorrect)) {
        rawCorrect.forEach(x => {
          if (x !== null && x !== undefined) {
            const s = String(x).trim();
            correctTokens.add(s);
            correctTokens.add(s.toUpperCase());
            correctTokens.add(s.toLowerCase());
          }
        });
      } else if (rawCorrect !== null && rawCorrect !== undefined && typeof rawCorrect === 'object') {
        Object.entries(rawCorrect).forEach(([k, v]) => {
          if (v === 'T' || v === true || v === 'Đ') {
            correctTokens.add(k);
            correctTokens.add(k.toUpperCase());
            correctTokens.add(k.toLowerCase());
          }
        });
      } else if (rawCorrect !== null && rawCorrect !== undefined) {
        const s = String(rawCorrect).trim();
        correctTokens.add(s);
        correctTokens.add(s.toUpperCase());
        correctTokens.add(s.toLowerCase());
      }

      if (shuffleOpt && options.length > 1) {
        // Gắn cờ isCorrect cho từng option TRƯỚC KHI TRỘN (Hỗ trợ cả nhãn A/B/C/D và ID tùy biến/UUID - T07)
        let anyMatched = false;
        const preliminaryItems = options.map((opt, idx) => {
          const origId = opt.id !== undefined && opt.id !== null ? String(opt.id).trim() : STANDARD_LABELS[idx];
          const posLabel = STANDARD_LABELS[idx] || String.fromCharCode(65 + idx);
          const isCorrect = (
            correctTokens.has(origId) ||
            correctTokens.has(origId.toUpperCase()) ||
            correctTokens.has(origId.toLowerCase()) ||
            correctTokens.has(posLabel) ||
            correctTokens.has(posLabel.toLowerCase())
          );
          if (isCorrect) anyMatched = true;
          return {
            originalId: origId,
            originalLabel: posLabel,
            text: opt.text !== undefined ? opt.text : (opt.content || ''),
            isCorrect
          };
        });

        // Fallback: nếu chưa khớp bất kỳ phương án nào theo ID/nhãn, thử kiểm tra theo chỉ số số học idx (0..N-1)
        const items = anyMatched ? preliminaryItems : options.map((opt, idx) => {
          const origId = opt.id !== undefined && opt.id !== null ? String(opt.id).trim() : STANDARD_LABELS[idx];
          const posLabel = STANDARD_LABELS[idx] || String.fromCharCode(65 + idx);
          const isCorrect = correctTokens.has(String(idx));
          return {
            originalId: origId,
            originalLabel: posLabel,
            text: opt.text !== undefined ? opt.text : (opt.content || ''),
            isCorrect
          };
        });

        const correctCount = items.filter(it => it.isCorrect).length;
        if (q.question_type === 'single_choice' && correctCount !== 1) {
          throw new Error(
            `Câu hỏi trắc nghiệm [ID: ${q.id || q.bank_question_id}] có số đáp án đúng không hợp lệ (${correctCount} đáp án đúng). ` +
            `Dạng single_choice bắt buộc phải có đúng 1 đáp án đúng để hoán vị an toàn.`
          );
        }

        // Xáo trộn bằng PRNG
        const shuffledItems = shuffleFn(items);

        // Tái lập options với nhãn A, B, C, D chuẩn
        options = shuffledItems.map((item, idx) => ({
          id: STANDARD_LABELS[idx],
          text: item.text
        }));

        // Ánh xạ lại mảng đáp án đúng theo nhãn mới
        const newCorrectAnswers = [];
        const optionsMap = {};
        shuffledItems.forEach((item, idx) => {
          const newLabel = STANDARD_LABELS[idx];
          optionsMap[newLabel] = item.originalId;
          if (item.isCorrect) {
            newCorrectAnswers.push(newLabel);
          }
        });

        return {
          ...q,
          options,
          options_map: optionsMap,
          correct_answers: newCorrectAnswers,
          correct_answers_json: JSON.stringify(newCorrectAnswers)
        };
      } else if (options.length > 0) {
        options = options.map((opt, idx) => ({
          id: STANDARD_LABELS[idx] || opt.id,
          text: opt.text !== undefined ? opt.text : (opt.content || '')
        }));
        return {
          ...q,
          options,
          correct_answers: Array.from(correctTokens)
        };
      }
      return q;
    });

    // 5. Hoán vị nội dung 4 ý Phần II (Đúng/Sai) qua trueFalseUtils
    const { shuffleTrueFalseOptions } = require('./trueFalseUtils');
    finalPart2 = finalPart2.map(q => {
      if (shuffleTfOpt) {
        return shuffleTrueFalseOptions(q, shuffleFn);
      }
      return q;
    });

    // 6. Xử lý Phần III (Trả lời ngắn): Bảo toàn 100% thuộc tính nguyên tử
    finalPart3 = finalPart3.map(q => ({
      ...q,
      short_answer: q.short_answer !== undefined ? q.short_answer : (Array.isArray(q.correct_answers) ? q.correct_answers[0] : ''),
      correct_answers: Array.isArray(q.correct_answers) && q.correct_answers.length > 0
        ? q.correct_answers
        : (q.short_answer ? [String(q.short_answer).trim()] : []),
      correct_answers_json: q.correct_answers_json || (q.short_answer ? JSON.stringify([String(q.short_answer).trim()]) : '[]'),
      scoring_config: q.scoring_config || null,
      scoring_config_json: q.scoring_config_json || (q.scoring_config ? JSON.stringify(q.scoring_config) : null)
    }));

    // 7. Hợp nhất 4 phần và đánh lại chỉ số hiển thị liên tục 1..N
    // Bảo toàn nguồn gốc câu hỏi ngân hàng, fingerprint đa lớp và ánh xạ hai chiều display_to_bank
    const allQuestions = [...finalPart1, ...finalPart2, ...finalPart3, ...finalPart4].map((q, idx) => {
      const bankQId = q.bank_question_id || q.id || null;
      const bankRev = q.bank_revision || q.revision || 1;
      const contentFp = q.content_fingerprint || generateContentFingerprint(q);
      const answerFp = q.answer_fingerprint || generateAnswerFingerprint(q);
      const revisionFp = q.revision_fingerprint || generateRevisionFingerprint(q, bankRev);
      const mapping = buildOptionMappings(q.options, q.options_map);

      return {
        ...q,
        bank_question_id: bankQId,
        bank_revision: bankRev,
        content_fingerprint: contentFp,
        answer_fingerprint: answerFp,
        revision_fingerprint: revisionFp,
        display_to_bank: mapping.display_to_bank,
        bank_to_display: mapping.bank_to_display,
        options_meta: mapping.options_meta,
        order_index: idx + 1,
        display_order: idx + 1
      };
    });

    // Kiểm tra bảo toàn số lượng
    if (allQuestions.length !== masterExam.questions.length) {
      throw new Error(`Lỗi toàn vẹn: Đề hoán vị có ${allQuestions.length} câu, đề gốc có ${masterExam.questions.length} câu`);
    }

    // 8. Tạo Manifest kiểm toán & Bảng ánh xạ đối chiếu (Audit Manifest)
    const questionsMapping = allQuestions.map((q, idx) => {
      const origIndex = masterExam.questions.findIndex(mq => mq.id === q.id);
      return {
        variant_order: idx + 1,
        master_order: origIndex >= 0 ? origIndex + 1 : null,
        master_question_id: q.id,
        question_type: q.question_type,
        options_map: q.options_map || null
      };
    });

    const manifestData = {
      variant_code: String(variantCode).trim(),
      seed,
      master_exam_id: masterExam.id,
      total_questions: allQuestions.length,
      questions_mapping: questionsMapping,
      created_at: new Date().toISOString()
    };
    const manifestHash = crypto.createHash('sha256').update(JSON.stringify(manifestData)).digest('hex');

    const cleanTitle = (masterExam.title || 'Đề Thi').replace(/\s*-\s*Mã đề\s*\w+/i, '').trim();

    return {
      ...masterExam,
      variant_code: String(variantCode).trim(),
      title: `${cleanTitle} - Mã đề ${String(variantCode).trim()}`,
      questions: allQuestions,
      manifest: manifestData,
      manifest_hash: manifestHash
    };
  }

  generateExamVariants(masterExamId, variantCodes = ['101', '102'], options = {}) {
    const masterExam = this.getExamById(masterExamId, true);
    if (!masterExam) throw new Error('Không tìm thấy đề thi gốc');

    // Chặn hoán vị nếu đề gốc chứa câu hỏi chưa duyệt hoặc xung đột đáp án
    const unverified = (masterExam.questions || []).filter(isUnverifiedQuestion);
    if (unverified.length > 0) {
      const err = new Error(`Không thể trộn đề: Đề thi gốc "${masterExam.title}" chứa ${unverified.length} câu hỏi chưa duyệt hoặc đang xung đột đáp án (Câu ${unverified.map(q => q.order_index).join(', ')}). Vui lòng hoàn tất đối soát trước khi trộn đề!`);
      err.code = 'UNVERIFIED_EXAM_QUESTIONS';
      throw err;
    }

    const cleanCodes = (variantCodes || []).map(c => String(c).trim()).filter(Boolean);
    if (cleanCodes.length === 0) {
      cleanCodes.push('101', '102');
    }

    const variants = cleanCodes.map(code => this.generateSingleShuffledVariant(masterExam, code, options));
    return { masterExam, variants };
  }

  saveExamVariants(masterExamId, variantCodes = ['101', '102'], options = {}) {
    const { masterExam, variants } = this.generateExamVariants(masterExamId, variantCodes, options);
    const savedExams = [];

    const insertExamStmt = db.prepare(`
      INSERT INTO exams (
        id, title, subject, duration_minutes, total_score, status,
        allow_review, shuffle_questions, shuffle_options,
        school_name, school_year, grade, note, part_scores_json
      ) VALUES (?, ?, ?, ?, ?, 'published', 0, 0, 0, ?, ?, ?, ?, ?)
    `);

    const insertQuestionStmt = db.prepare(`
      INSERT INTO questions (
        id, exam_id, order_index, question_type, content,
        options_json, correct_answers_json, rubric_guide, max_score,
        short_answer, bank_question_id, scoring_config_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN;');
    try {
      for (const variant of variants) {
        const newExamId = crypto.randomUUID();
        const partScoresStr = typeof masterExam.part_scores_json === 'string'
          ? masterExam.part_scores_json
          : JSON.stringify(masterExam.part_scores_json || { part1: 3.0, part2: 2.0, part3: 2.0, part4: 3.0 });

        const manifestShort = variant.manifest_hash ? variant.manifest_hash.slice(0, 12) : '';

        insertExamStmt.run(
          newExamId,
          variant.title,
          masterExam.subject || 'Chung',
          masterExam.duration_minutes || 45,
          masterExam.total_score || 10.0,
          masterExam.school_name || '',
          masterExam.school_year || '',
          masterExam.grade || '',
          `Hoán vị mã ${variant.variant_code} từ đề gốc: ${masterExam.title} (Manifest: ${manifestShort})`,
          partScoresStr
        );

        for (const q of variant.questions) {
          const qId = crypto.randomUUID();
          insertQuestionStmt.run(
            qId,
            newExamId,
            q.order_index,
            q.question_type,
            q.content,
            JSON.stringify(q.options || []),
            typeof q.correct_answers === 'string' ? q.correct_answers : JSON.stringify(q.correct_answers || []),
            q.rubric_guide || '',
            q.max_score || 1.0,
            q.short_answer || (Array.isArray(q.correct_answers) ? q.correct_answers[0] : '') || '',
            q.bank_question_id || q.id,
            q.scoring_config_json || (q.scoring_config ? JSON.stringify(q.scoring_config) : null)
          );
        }

        savedExams.push({
          id: newExamId,
          variant_code: variant.variant_code,
          title: variant.title,
          questions_count: variant.questions.length,
          manifest_hash: variant.manifest_hash
        });
      }
      db.exec('COMMIT;');
      return { masterExam, variants, savedExams };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}

ExamService.prototype.sanitizeExamQuestion = sanitizeExamQuestion;
const serviceInstance = new ExamService();
serviceInstance.sanitizeExamQuestion = sanitizeExamQuestion;

module.exports = serviceInstance;
module.exports.sanitizeExamQuestion = sanitizeExamQuestion;
module.exports.isUnverifiedQuestion = isUnverifiedQuestion;
