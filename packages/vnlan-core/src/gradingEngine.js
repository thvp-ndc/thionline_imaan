/**
 * @vnlan/core - Pure Business Logic Grading Engine
 * Chấm điểm độc lập, không phụ thuộc CSDL (Database-Agnostic).
 * Dùng chung 100% cho:
 * 1. Offline Server (Node Express / SQLite)
 * 2. Online Serverless (Vercel Functions / Supabase)
 * 
 * Hỗ trợ toàn diện 4 dạng câu hỏi:
 * - single_choice: Trắc nghiệm 1 đáp án đúng (Phần I)
 * - multiple_choice: Trắc nghiệm nhiều đáp án đúng
 * - true_false: Trắc nghiệm Đúng/Sai 4 ý lũy tiến theo chuẩn Bộ GD&ĐT 2025 (Phần II)
 * - short_answer: Trả lời ngắn 3 lớp chuẩn hóa + phiếu thi 4 ô THPT (Phần III)
 * - essay: Tự luận (chấm tay / rubric)
 */

const { calculateTrueFalseScore } = require('./trueFalseUtils');

const DEFAULT_SHORT_ANSWER_SCORING_CONFIG = {
  allow_comma_dot_equivalence: true,  // Cho phép 2,5 tương đương 2.5
  case_sensitive: false,              // Phân biệt hoa/thường (quan trọng cho Tin học)
  trim_whitespace: true,              // Tự động bỏ khoảng trắng thừa
  numeric_equivalence: false,         // Cho phép tương đương số học (1/2 tương đương 0.5)
  answer_format: 'decimal',           // "integer" | "decimal" | "text" | "expression" | "exam_sheet"
  max_characters: null                // Giới hạn ký tự (mô phỏng phiếu thi tốt nghiệp THPT)
};

/**
 * Phân tích số học (hỗ trợ phân số a/b và số thực với dấu phẩy hoặc chấm)
 */
function parseNumericFractionOrDecimal(valStr) {
  if (valStr === undefined || valStr === null) return null;
  const s = String(valStr).trim().replace(/[\u2013\u2014\u2212]/g, '-').replace(/\s+/g, '');
  // 1. Phân số dạng a/b (ví dụ "1/2", "-3/4")
  const fracMatch = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den !== 0) return num / den;
  }
  // 2. Số nguyên hoặc số thập phân chuẩn (dấu chấm hoặc dấu phẩy)
  if (/^-?\d+([.,]\d+)?$/.test(s)) {
    const f = parseFloat(s.replace(',', '.'));
    if (!isNaN(f)) return f;
  }
  return null;
}

/**
 * Chấm điểm tự động cho câu hỏi trả lời ngắn (Phần III)
 */
function gradeShortAnswer(studentAns, correctAnswers, scoringConfig = {}) {
  if (studentAns === undefined || studentAns === null) return false;
  let sAns = String(studentAns);

  let config = { ...DEFAULT_SHORT_ANSWER_SCORING_CONFIG };
  if (typeof scoringConfig === 'string') {
    try {
      const parsed = JSON.parse(scoringConfig);
      if (parsed && typeof parsed === 'object') config = { ...config, ...parsed };
    } catch (e) {}
  } else if (scoringConfig && typeof scoringConfig === 'object') {
    config = { ...config, ...scoringConfig };
  }

  const policy = config.grading_policy || {};
  const allowCommaDot = policy.allow_comma_dot_equivalence !== undefined
    ? policy.allow_comma_dot_equivalence
    : (config.allow_comma_dot_equivalence !== undefined ? config.allow_comma_dot_equivalence : true);
  const caseSensitive = policy.case_sensitive !== undefined
    ? policy.case_sensitive
    : (config.case_sensitive !== undefined ? config.case_sensitive : false);
  const trimWhitespace = policy.trim_whitespace !== undefined
    ? policy.trim_whitespace
    : (config.trim_whitespace !== undefined ? config.trim_whitespace : true);
  const numericEquivalence = policy.numeric_equivalence !== undefined
    ? policy.numeric_equivalence
    : (config.numeric_equivalence !== undefined ? config.numeric_equivalence : false);

  const answerFormat = config.answer_format || 'decimal';
  const examConstraints = config.exam_constraints || {};
  const isExamSheet = answerFormat === 'exam_sheet' || examConstraints.mode === 'exam_sheet_4';
  const maxCharacters = examConstraints.max_characters || config.max_characters || 4;
  const isNumericType = ['decimal', 'integer', 'exam_sheet'].includes(answerFormat);

  // 1. Xử lý khoảng trắng:
  if (trimWhitespace) {
    sAns = sAns.trim();
    if (isNumericType) {
      sAns = sAns.replace(/\s+/g, '');
    }
  }

  if (sAns.length === 0) return false;

  // 2. Chuẩn hóa ký tự âm (\u2013 en-dash, \u2014 em-dash, \u2212 minus -> ASCII -)
  sAns = sAns.replace(/[\u2013\u2014\u2212]/g, '-');

  // 3. Ràng buộc phiếu thi THPT 4 ô:
  if (isExamSheet) {
    const maxLen = Number(maxCharacters) || 4;
    if (sAns.length > maxLen) return false;
    if (!/^[0-9,.\-]+$/.test(sAns)) return false;
  }

  const normalizeValue = (val) => {
    if (val === undefined || val === null) return '';
    let s = String(val);
    if (trimWhitespace) {
      s = s.trim();
      if (isNumericType) {
        s = s.replace(/\s+/g, '');
      }
    }
    s = s.replace(/[\u2013\u2014\u2212]/g, '-');

    if (answerFormat === 'text' || answerFormat === 'expression') {
      if (!caseSensitive) {
        s = s.toLowerCase();
      }
      return s;
    }

    if (allowCommaDot) {
      if (/^-?\d+([.,]\d+)?$/.test(s)) {
        s = s.replace(',', '.');
      }
    }

    if (!caseSensitive) {
      s = s.toLowerCase();
    }

    return s;
  };

  const sNorm = normalizeValue(sAns);

  // Chuẩn hóa danh sách đáp án đúng
  let rawList = [];
  if (Array.isArray(correctAnswers)) {
    rawList = correctAnswers;
  } else if (typeof correctAnswers === 'string') {
    try {
      const parsed = JSON.parse(correctAnswers);
      if (Array.isArray(parsed)) rawList = parsed;
      else rawList = [correctAnswers];
    } catch (e) {
      rawList = [correctAnswers];
    }
  }

  if (rawList.length === 0) return false;

  // So khớp chuỗi tiêu chuẩn
  const normalizedCorrect = rawList.map(normalizeValue).filter(Boolean);
  if (normalizedCorrect.includes(sNorm)) {
    return true;
  }

  // 4. So khớp tương đương số học khi cờ numeric_equivalence được kích hoạt
  if (numericEquivalence) {
    const studentNum = parseNumericFractionOrDecimal(sAns);
    if (studentNum !== null) {
      for (const correctVal of rawList) {
        const correctNum = parseNumericFractionOrDecimal(correctVal);
        if (correctNum !== null && Math.abs(studentNum - correctNum) < 1e-6) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Chấm điểm 1 câu hỏi độc lập
 * @param {Object} qDef Định nghĩa câu hỏi (kèm correct_answers, max_score, question_type)
 * @param {Object} ans Câu trả lời của học sinh
 * @param {Object} override Điều chỉnh đáp án của GV (nếu có: full_credit, accept_multiple, override_answers)
 * @returns {Object} { scoreObtained, isCorrect, details }
 */
function gradeSingleQuestion(qDef, ans = {}, override = null) {
  if (!qDef) return { scoreObtained: 0.0, isCorrect: false };

  const qType = qDef.question_type || 'single_choice';
  const maxScore = Number(qDef.max_score !== undefined ? qDef.max_score : (qDef.default_score !== undefined ? qDef.default_score : 0.25));

  // 1. Trường hợp giáo viên tặng điểm toàn bộ (full_credit)
  if (override && override.type === 'full_credit') {
    return {
      scoreObtained: maxScore,
      isCorrect: true,
      isOverridden: true,
      overrideReason: override.reason || 'Tặng điểm theo quyết định của giám khảo'
    };
  }

  if (qType === 'essay') {
    // Tự luận: điểm do giáo viên chấm thủ công
    const manualScore = ans.manual_score !== undefined && ans.manual_score !== null ? Number(ans.manual_score) : 0.0;
    return {
      scoreObtained: Math.min(manualScore, maxScore),
      isCorrect: manualScore >= maxScore,
      isEssay: true
    };
  }

  // Thu thập câu trả lời của thí sinh
  let selected = [];
  if (ans.selected_options_json) {
    selected = typeof ans.selected_options_json === 'string' ? JSON.parse(ans.selected_options_json) : ans.selected_options_json;
  } else if (ans.true_false_answers) {
    selected = ans.true_false_answers;
  } else if (ans.selected_options) {
    selected = ans.selected_options;
  } else if (ans.short_answer !== undefined) {
    selected = ans.short_answer;
  }

  // Thu thập đáp án đúng (ưu tiên override nếu có)
  let correct = null;
  if (override && override.override_answers) {
    correct = override.override_answers;
  } else if (qDef.correct_answers !== undefined && qDef.correct_answers !== null) {
    correct = qDef.correct_answers;
  } else if (qDef.correct_answers_json) {
    try { correct = JSON.parse(qDef.correct_answers_json); } catch (e) { correct = qDef.correct_answers_json; }
  } else if (qDef.short_answer) {
    correct = [qDef.short_answer];
  }

  if (typeof correct === 'string') {
    try { correct = JSON.parse(correct); } catch (e) {}
  }

  let scoreObtained = 0.0;
  let isCorrect = false;
  let details = null;

  // 2. Chấm theo từng loại câu hỏi:
  if (qType === 'single_choice') {
    const studentChoice = Array.isArray(selected) && selected.length > 0 ? selected[0] : selected;
    let acceptableAnswers = Array.isArray(correct) ? correct : [correct];
    
    // Nếu giáo viên bật accept_multiple
    if (override && override.type === 'accept_multiple' && Array.isArray(override.acceptable_options)) {
      acceptableAnswers = override.acceptable_options;
    }

    if (studentChoice && acceptableAnswers.includes(studentChoice)) {
      scoreObtained = maxScore;
      isCorrect = true;
    }
  } else if (qType === 'true_false') {
    const tfResult = calculateTrueFalseScore(selected, correct, maxScore);
    scoreObtained = tfResult.scoreObtained;
    isCorrect = tfResult.isAllCorrect;
    details = tfResult.details;
  } else if (qType === 'multiple_choice') {
    const selSorted = [...(Array.isArray(selected) ? selected : [])].sort().join(',');
    const corSorted = [...(Array.isArray(correct) ? correct : [])].sort().join(',');
    if (selSorted === corSorted && corSorted.length > 0) {
      scoreObtained = maxScore;
      isCorrect = true;
    }
  } else if (qType === 'short_answer') {
    const studentText = typeof selected === 'string' ? selected : (ans.short_answer || '');
    let acceptableList = Array.isArray(correct) && correct.length > 0 ? correct : [qDef.short_answer || ''];
    if (override && override.acceptable_answers && Array.isArray(override.acceptable_answers)) {
      acceptableList = [...acceptableList, ...override.acceptable_answers];
    }
    const scoringConfig = qDef.scoring_config || qDef.scoring_config_json;

    if (gradeShortAnswer(studentText, acceptableList, scoringConfig)) {
      scoreObtained = maxScore;
      isCorrect = true;
    }
  }

  return {
    scoreObtained: Math.round(scoreObtained * 100) / 100,
    isCorrect,
    details,
    isOverridden: !!override
  };
}

/**
 * Chấm điểm toàn bộ một bài thi của thí sinh
 * @param {Array} questions Danh sách câu hỏi trong đề (có correct_answers & max_score)
 * @param {Object|Array} studentAnswers Bài làm của học sinh { [questionId]: answerPayload } hoặc mảng
 * @param {Object} overrides Bản đồ điều chỉnh đáp án của ca thi { [questionId]: overrideConfig }
 * @returns {Object} { totalScore, mcqScore, essayScore, totalQuestions, answeredCount, correctCount, perQuestionDetails }
 */
function gradeSubmission(questions = [], studentAnswers = {}, overrides = {}) {
  let answersMap = {};
  if (Array.isArray(studentAnswers)) {
    studentAnswers.forEach(a => {
      const qId = a.question_id || a.questionId || a.id;
      if (qId) answersMap[qId] = a;
    });
  } else if (studentAnswers && typeof studentAnswers === 'object') {
    answersMap = studentAnswers;
  }

  let totalScore = 0.0;
  let mcqScore = 0.0;
  let essayScore = 0.0;
  let answeredCount = 0;
  let correctCount = 0;
  const perQuestionDetails = {};

  questions.forEach(q => {
    const qId = q.id || q.question_id;
    const ans = answersMap[qId] || {};
    const override = overrides[qId] || null;

    // Kiểm tra học sinh có trả lời không
    const hasAnswer = (
      (ans.selected_options && ans.selected_options.length > 0) ||
      (ans.selected_options_json && ans.selected_options_json !== '[]') ||
      (ans.true_false_answers && Object.keys(ans.true_false_answers).length > 0) ||
      (ans.short_answer && String(ans.short_answer).trim().length > 0) ||
      (ans.essay_content && String(ans.essay_content).trim().length > 0)
    );
    if (hasAnswer) answeredCount++;

    const result = gradeSingleQuestion(q, ans, override);

    if (q.question_type === 'essay') {
      essayScore += result.scoreObtained;
    } else {
      mcqScore += result.scoreObtained;
      if (result.isCorrect) correctCount++;
    }

    perQuestionDetails[qId] = {
      ...result,
      maxScore: Number(q.max_score || 0.25)
    };
  });

  mcqScore = Math.round(mcqScore * 100) / 100;
  essayScore = Math.round(essayScore * 100) / 100;
  totalScore = Math.round((mcqScore + essayScore) * 100) / 100;

  return {
    totalScore,
    mcqScore,
    essayScore,
    totalQuestions: questions.length,
    answeredCount,
    correctCount,
    perQuestionDetails,
    gradingVersion: 1
  };
}

module.exports = {
  gradeSingleQuestion,
  gradeSubmission,
  gradeShortAnswer,
  parseNumericFractionOrDecimal
};
