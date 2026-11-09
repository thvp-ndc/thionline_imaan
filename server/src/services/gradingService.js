const db = require('../db');
const XLSX = require('xlsx');

const { calculateTrueFalseScore, resolveCorrectAnswers } = require('./trueFalseUtils');
const { formatToLocalTime } = require('../utils/timeUtils');

const DEFAULT_SHORT_ANSWER_SCORING_CONFIG = {
  allow_comma_dot_equivalence: true,  // Cho phép 2,5 tương đương 2.5
  case_sensitive: false,              // Phân biệt hoa/thường (quan trọng cho Tin học)
  trim_whitespace: true,              // Tự động bỏ khoảng trắng thừa đầu/cuối/giữa
  numeric_equivalence: false,         // Cho phép tương đương số học (1/2 tương đương 0.5, 10 tương đương 10.0)
  answer_format: 'decimal',           // "integer" | "decimal" | "text" | "expression" | "exam_sheet"
  max_characters: null                // Giới hạn ký tự (chỉ set khi mô phỏng phiếu thi tốt nghiệp, mặc định null)
};

/**
 * Helper phân tích số học (hỗ trợ phân số a/b và số thực)
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
 * Chấm điểm tự động cho câu hỏi trả lời ngắn (Phần III) theo chuẩn 3 lớp V2.0 Hardened:
 * 1. answer_format (định dạng dữ liệu)
 * 2. grading_policy (chính sách so khớp: allow_comma_dot_equivalence, case_sensitive, trim_whitespace, numeric_equivalence)
 * 3. exam_constraints (ràng buộc phiếu thi 4 ô THPT)
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
  // Nếu trim_whitespace: true: Xóa khoảng trắng đầu/cuối; đối với dạng số, xóa toàn bộ khoảng trắng xen giữa các chữ số (TC-20)
  if (trimWhitespace) {
    sAns = sAns.trim();
    if (isNumericType) {
      sAns = sAns.replace(/\s+/g, '');
    }
  }

  if (sAns.length === 0) return false;

  // 2. Chuẩn hóa ký tự âm (\u2013 en-dash, \u2014 em-dash, \u2212 minus -> ASCII -) (TC-05, TC-16)
  sAns = sAns.replace(/[\u2013\u2014\u2212]/g, '-');

  // 3. Xử lý định dạng theo phiếu thi THPT 4 ô (TC-10):
  if (isExamSheet) {
    const maxLen = Number(maxCharacters) || 4;
    if (sAns.length > maxLen) return false;
    if (!/^[0-9,.\-]+$/.test(sAns)) return false;
  }

  // Helper chuẩn hóa 1 chuỗi giá trị đáp án
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

  // 4. So khớp tương đương số học khi cờ numeric_equivalence được kích hoạt (TC-17)
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

class GradingService {
  /**
   * Chấm điểm 1 câu hỏi độc lập (MCQ, True/False, Short Answer)
   */
  gradeQuestionAnswer(qDef, ans) {
    if (!qDef || qDef.question_type === 'essay') return 0.0;
    
    const maxScore = Number(qDef.max_score !== undefined ? qDef.max_score : (qDef.default_score !== undefined ? qDef.default_score : 0.25));
    let selected = [];
    if (ans.selected_options_json) {
      selected = typeof ans.selected_options_json === 'string' ? JSON.parse(ans.selected_options_json) : ans.selected_options_json;
    } else if (ans.true_false_answers) {
      selected = ans.true_false_answers;
    } else if (ans.selected_options) {
      selected = ans.selected_options;
    }

    const correct = Array.isArray(qDef.correct_answers) 
      ? qDef.correct_answers 
      : (qDef.correct_answers_json ? JSON.parse(qDef.correct_answers_json) : (qDef.correct_answers || []));

    let score = 0.0;
    if (qDef.question_type === 'single_choice') {
      if (Array.isArray(selected) && selected.length > 0 && selected[0] === (Array.isArray(correct) ? correct[0] : correct)) {
        score = maxScore;
      }
    } else if (qDef.question_type === 'true_false') {
      const tfResult = calculateTrueFalseScore(selected, correct, maxScore);
      score = tfResult.scoreObtained;
    } else if (qDef.question_type === 'multiple_choice') {
      const selSorted = [...(Array.isArray(selected) ? selected : [])].sort().join(',');
      const corSorted = [...(Array.isArray(correct) ? correct : [])].sort().join(',');
      if (selSorted === corSorted && corSorted.length > 0) {
        score = maxScore;
      }
    } else if (qDef.question_type === 'short_answer') {
      const studentAns = ans.short_answer !== undefined ? ans.short_answer : '';
      const correctList = Array.isArray(correct) && correct.length > 0
        ? correct
        : (qDef.short_answer ? [qDef.short_answer] : []);
      const scoringConfig = qDef.scoring_config || qDef.scoring_config_json;

      if (gradeShortAnswer(studentAns, correctList, scoringConfig)) {
        score = maxScore;
      }
    }

    return score;
  }

  autoGradeAttempt(attemptId) {
    const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    if (!attempt) return null;

    // 1. Thu thập câu hỏi từ attempt's exam_paper_json (đối với đề sinh từ ma trận hoặc đề xáo trộn ngẫu nhiên)
    const attemptQuestionsMap = {};
    let paperQuestions = [];
    if (attempt.exam_paper_json) {
      try {
        const paper = JSON.parse(attempt.exam_paper_json);
        paperQuestions = paper.questions || [];
        paperQuestions.forEach(q => {
          attemptQuestionsMap[q.id] = q;
        });
      } catch (e) {
        console.error('Error parsing attempt exam_paper_json:', e);
      }
    }

    // 2. Thu thập câu hỏi từ bảng questions (đối với đề thi tĩnh truyền thống)
    const sessionRow = db.prepare('SELECT exam_id FROM exam_sessions WHERE id = ?').get(attempt.session_id);
    const dbQuestionsMap = {};
    if (sessionRow && sessionRow.exam_id) {
      const dbQuestions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(sessionRow.exam_id);
      dbQuestions.forEach(q => {
        let sCfg = null;
        if (q.scoring_config_json) {
          try { sCfg = JSON.parse(q.scoring_config_json); } catch (e) {}
        }
        let ca = [];
        if (q.correct_answers_json) {
          try { ca = JSON.parse(q.correct_answers_json); } catch (e) { ca = [q.correct_answers_json]; }
        } else if (q.short_answer) {
          ca = [q.short_answer];
        }
        dbQuestionsMap[q.id] = {
          ...q,
          options: q.options_json ? JSON.parse(q.options_json) : [],
          correct_answers: ca,
          scoring_config: sCfg
        };
      });
    }

    // 3. Lấy tất cả câu trả lời của thí sinh (KHÔNG DÙNG JOIN questions vì câu hỏi từ ma trận nằm trong exam_paper_json)
    const answers = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(attemptId);

    let totalMcqScore = 0.0;
    const updateAnswerScore = db.prepare('UPDATE student_answers SET auto_score = ? WHERE id = ?');

    db.exec('BEGIN;');
    try {
      for (const ans of answers) {
        const qDef = attemptQuestionsMap[ans.question_id] || dbQuestionsMap[ans.question_id];
        if (!qDef) continue;

        if (qDef.question_type !== 'essay') {
          const score = this.gradeQuestionAnswer(qDef, ans);
          const result = updateAnswerScore.run(score, ans.id);
          if (result.changes !== 1) {
            throw new Error(`Không cập nhật được điểm câu trả lời ${ans.id}`);
          }
          ans.auto_score = score;
          totalMcqScore += score;
        }
      }
      totalMcqScore = Math.round(totalMcqScore * 100) / 100;

      // 4. Xử lý câu hỏi tự luận (nếu có)
      const allQuestions = paperQuestions.length > 0 ? paperQuestions : Object.values(dbQuestionsMap);
      const essayQuestions = allQuestions.filter(q => q.question_type === 'essay');
      const essayCount = essayQuestions.length;

      if (essayCount > 0) {
        const crypto = require('node:crypto');
        const insertEmpty = db.prepare(`
          INSERT OR IGNORE INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, auto_score, manual_score, teacher_feedback, updated_at)
          VALUES (?, ?, ?, '[]', '', 0.0, null, null, CURRENT_TIMESTAMP)
        `);
        for (const eq of essayQuestions) {
          const existing = db.prepare('SELECT id FROM student_answers WHERE attempt_id = ? AND question_id = ?').get(attemptId, eq.id);
          if (!existing) {
            insertEmpty.run(crypto.randomUUID(), attemptId, eq.id);
          }
        }
      }

      // 5. Tính điểm tự luận hiện tại đã chấm
      let totalEssayScore = 0.0;
      let gradedEssayCount = 0;
      for (const ans of answers) {
        const qDef = attemptQuestionsMap[ans.question_id] || dbQuestionsMap[ans.question_id];
        if (qDef && qDef.question_type === 'essay') {
          if (ans.manual_score !== null && ans.manual_score !== undefined) {
            totalEssayScore += Number(ans.manual_score);
            gradedEssayCount++;
          }
        }
      }
      totalEssayScore = Math.round(totalEssayScore * 100) / 100;

      const isGraded = (essayCount === 0 || gradedEssayCount >= essayCount) ? 1 : 0;
      const totalScore = Math.round((totalMcqScore + totalEssayScore) * 100) / 100;

      const attemptUpdateRes = db.prepare(`
        UPDATE student_attempts
        SET mcq_score = ?, essay_score = ?, total_score = ?, is_graded = ?
        WHERE id = ?
      `).run(totalMcqScore, totalEssayScore, totalScore, isGraded, attemptId);

      if (attemptUpdateRes.changes !== 1) {
        throw new Error(`Không cập nhật được trạng thái điểm của lượt thi ${attemptId}`);
      }

      db.exec('COMMIT;');

      // 6. Thống kê chuyên sâu từng phần theo chuẩn khảo thí Bộ GD&ĐT 2025
      // Truy vấn lại freshAnswers từ SQLite để đảm bảo tính đúng đắn dữ liệu
      const freshAnswers = db.prepare(
        'SELECT * FROM student_answers WHERE attempt_id = ? ORDER BY updated_at ASC, rowid ASC'
      ).all(attemptId);

      const ansMap = new Map();
      for (const a of freshAnswers) {
        ansMap.set(a.question_id, a);
      }

      let answeredCount = 0;
      let completedCount = 0;

      const part1Stats = { total: 0, answered: 0, completed: 0, correct: 0, score: 0.0 };
      const part2Stats = { total: 0, answered: 0, completed: 0, selected_sub: 0, total_sub: 0, correct_sub: 0, score: 0.0 };
      const part3Stats = { total: 0, answered: 0, completed: 0, correct: 0, score: 0.0 };
      const essayStats = { total: 0, answered: 0, completed: 0, score: 0.0, is_graded: isGraded };

      for (const q of allQuestions) {
        const ans = ansMap.get(q.id);
        const qType = q.question_type || 'single_choice';
        const qMaxScore = Number(q.max_score !== undefined ? q.max_score : (q.default_score !== undefined ? q.default_score : 0.25));

        if (qType === 'single_choice' || qType === 'multiple_choice') {
          part1Stats.total++;
          let hasAnswer = false;
          if (ans && ans.selected_options_json) {
            try {
              const parsed = typeof ans.selected_options_json === 'string' ? JSON.parse(ans.selected_options_json) : ans.selected_options_json;
              if (Array.isArray(parsed) && parsed.length > 0) hasAnswer = true;
            } catch (_) {}
          }
          if (hasAnswer) {
            part1Stats.answered++;
            part1Stats.completed++;
            answeredCount++;
            completedCount++;
            const s = Number(ans.auto_score || 0);
            part1Stats.score += s;
            if (s >= qMaxScore) part1Stats.correct++;
          }
        } else if (qType === 'true_false') {
          part2Stats.total++;
          part2Stats.total_sub += 4;
          let tfMap = {};
          if (ans && ans.selected_options_json) {
            try {
              const parsed = typeof ans.selected_options_json === 'string' ? JSON.parse(ans.selected_options_json) : ans.selected_options_json;
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                tfMap = parsed;
              } else if (Array.isArray(parsed)) {
                parsed.forEach(item => {
                  if (typeof item === 'string') {
                    const m = item.match(/^([a-d])\s*[:=]\s*(T|F|TRUE|FALSE|1|0|ĐÚNG|SAI)/i);
                    if (m) {
                      const val = m[2].toUpperCase();
                      tfMap[m[1].toLowerCase()] = (val === 'F' || val === 'FALSE' || val === '0' || val === 'SAI') ? 'F' : 'T';
                    } else if (['a', 'b', 'c', 'd'].includes(item.toLowerCase())) {
                      tfMap[item.toLowerCase()] = 'T';
                    }
                  }
                });
              }
            } catch (_) {}
          }
          // Hàm kiểm định giá trị Đúng/Sai nghiêm ngặt: chỉ chấp nhận giá trị thuộc tập quy ước chuẩn
          const isValidTFValue = (v) => {
            if (v === 'T' || v === 'F' || v === true || v === false || v === '1' || v === '0') return true;
            if (typeof v === 'string') {
              const u = v.trim().toUpperCase();
              return u === 'T' || u === 'F' || u === 'TRUE' || u === 'FALSE' || u === '1' || u === '0' || u === 'ĐÚNG' || u === 'SAI';
            }
            return false;
          };

          const validSubKeys = ['a', 'b', 'c', 'd'].filter(k => isValidTFValue(tfMap[k]));
          part2Stats.selected_sub += validSubKeys.length;

          if (validSubKeys.length > 0) {
            part2Stats.answered++;
            answeredCount++;
            if (validSubKeys.length === 4) {
              part2Stats.completed++;
              completedCount++;
            }
          }
          const s = Number(ans ? (ans.auto_score || 0) : 0);
          part2Stats.score += s;

          if (ans && ans.selected_options_json) {
            const correctData = q.correct_answers || (q.correct_answers_json ? (() => { try { return JSON.parse(q.correct_answers_json); } catch(_) { return []; } })() : []);
            const tfRes = calculateTrueFalseScore(tfMap, correctData, qMaxScore);
            part2Stats.correct_sub += (tfRes.correctCount || 0);
          }
        } else if (qType === 'short_answer') {
          part3Stats.total++;
          const text = ans && ans.short_answer ? String(ans.short_answer).trim() : '';
          if (text.length > 0) {
            part3Stats.answered++;
            part3Stats.completed++;
            answeredCount++;
            completedCount++;
            const s = Number(ans.auto_score ?? 0);
            part3Stats.score += s;
            if (s >= qMaxScore) part3Stats.correct++;
          }
        } else if (qType === 'essay') {
          essayStats.total++;
          const text = ans && ans.essay_content ? String(ans.essay_content).trim() : '';
          if (text.length > 0) {
            essayStats.answered++;
            essayStats.completed++;
            answeredCount++;
            completedCount++;
          }
          if (ans && ans.manual_score !== null && ans.manual_score !== undefined) {
            essayStats.score += Number(ans.manual_score);
          }
        }
      }

      part1Stats.score = Math.round(part1Stats.score * 100) / 100;
      part2Stats.score = Math.round(part2Stats.score * 100) / 100;
      part3Stats.score = Math.round(part3Stats.score * 100) / 100;
      essayStats.score = Math.round(essayStats.score * 100) / 100;

      // Kiểm tra tính nhất quán toán học tổng điểm S_total = S_I + S_II + S_III + S_essay
      const sumOfParts = Math.round((part1Stats.score + part2Stats.score + part3Stats.score + essayStats.score) * 100) / 100;
      if (Math.abs(sumOfParts - totalScore) > 0.05) {
        console.warn(`[Grading Consistency Warning] Tổng điểm các phần (${sumOfParts}) lệch so với totalScore (${totalScore}) tại attempt ${attemptId}`);
      }

      const totalQuestionsCount = allQuestions.length;

      return {
        attemptId,
        mcq_score: totalMcqScore,
        essay_score: totalEssayScore,
        total_score: totalScore,
        is_graded: isGraded,
        total_questions: totalQuestionsCount,
        answered_count: answeredCount,
        completed_count: completedCount,
        part1_stats: part1Stats,
        part2_stats: part2Stats,
        part3_stats: part3Stats,
        essay_stats: essayStats
      };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  gradeEssayAnswer({ answerId, manualScore, teacherFeedback = '' }) {
    const answer = db.prepare('SELECT * FROM student_answers WHERE id = ?').get(answerId);
    if (!answer) throw new Error('Không tìm thấy bài trả lời tự luận');

    const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(answer.attempt_id);
    let maxScore = 10.0;
    if (attempt && attempt.exam_paper_json) {
      try {
        const paper = JSON.parse(attempt.exam_paper_json);
        const q = (paper.questions || []).find(q => q.id === answer.question_id);
        if (q && q.max_score) maxScore = Number(q.max_score);
      } catch (e) {}
    } else {
      const qRow = db.prepare('SELECT max_score FROM questions WHERE id = ?').get(answer.question_id);
      if (qRow) maxScore = Number(qRow.max_score);
    }

    const score = Math.min(Math.max(0, Number(manualScore)), maxScore);

    db.prepare(`
      UPDATE student_answers
      SET manual_score = ?, teacher_feedback = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(score, teacherFeedback, answerId);

    // Recalculate attempt score
    return this.autoGradeAttempt(answer.attempt_id);
  }

  getEssaySubmissions(sessionId) {
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) return [];

    const attempts = db.prepare('SELECT * FROM student_attempts WHERE session_id = ? ORDER BY student_code ASC').all(sessionId);
    const result = [];

    for (const st of attempts) {
      let essayQuestions = [];
      if (st.exam_paper_json) {
        try {
          const paper = JSON.parse(st.exam_paper_json);
          essayQuestions = (paper.questions || []).filter(q => q.question_type === 'essay');
        } catch (e) {}
      } else if (session.exam_id) {
        essayQuestions = db.prepare(`SELECT * FROM questions WHERE exam_id = ? AND question_type = 'essay' ORDER BY order_index ASC`).all(session.exam_id);
      }

      if (essayQuestions.length === 0) continue;

      const answers = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(st.id);
      const ansMap = {};
      answers.forEach(a => { ansMap[a.question_id] = a; });

      essayQuestions.forEach((q, idx) => {
        const ans = ansMap[q.id];
        result.push({
          answer_id: ans ? ans.id : null,
          attempt_id: st.id,
          essay_content: ans ? ans.essay_content : '',
          manual_score: ans ? ans.manual_score : null,
          teacher_feedback: ans ? ans.teacher_feedback : null,
          updated_at: ans ? ans.updated_at : null,
          student_code: st.student_code,
          student_name: st.student_name,
          class_name: st.class_name,
          client_ip: st.client_ip,
          attempt_is_graded: st.is_graded,
          attempt_essay_score: st.essay_score,
          attempt_total_score: st.total_score,
          question_id: q.id,
          question_content: q.content,
          rubric_guide: q.rubric_guide || '',
          question_max_score: Number(q.max_score || 2.0),
          order_index: q.order_index || (idx + 1)
        });
      });
    }

    return result;
  }

  generateExcelReport(sessionId) {
    const session = db.prepare(`
      SELECT s.*, 
             COALESCE(e.title, m.title, s.title, 'Ca Thi') as exam_title
      FROM exam_sessions s
      LEFT JOIN exams e ON s.exam_id = e.id
      LEFT JOIN exam_matrices m ON s.matrix_id = m.id
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) throw new Error('Ca thi không tồn tại');

    const attempts = db.prepare(`
      SELECT a.*, s.dob FROM student_attempts a
      LEFT JOIN students s ON UPPER(a.student_code) = UPPER(s.student_code)
      WHERE a.session_id = ?
      ORDER BY a.student_code ASC
    `).all(sessionId);

    const data = attempts.map((a, idx) => ({
      'STT': idx + 1,
      'Số Báo Danh': a.student_code,
      'Họ và Tên': a.student_name,
      'Ngày Sinh': a.dob || '',
      'Lớp': a.class_name || '',
      'IP Máy': a.client_ip || '',
      'Điểm Trắc Nghiệm': a.mcq_score,
      'Điểm Tự Luận': a.essay_score,
      'Tổng Điểm (Thang 10)': a.total_score,
      'Trạng Thái Chấm': a.is_graded ? 'Đã hoàn tất' : 'Chờ chấm tự luận',
      'Số Lần Vi Phạm (Gian lận)': a.violations_count,
      'Trạng Thái Thi': a.status === 'submitted' ? 'Đã nộp bài' : (a.status === 'forced_submitted' ? 'Thu bài cưỡng chế' : 'Đang làm bài'),
      'Thời Gian Nộp': formatToLocalTime(a.submitted_at)
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Auto-fit column widths
    const colWidths = [
      { wch: 6 },
      { wch: 15 },
      { wch: 25 },
      { wch: 15 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 25 },
      { wch: 18 },
      { wch: 20 }
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'KetQuaThi');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      fileName: `KetQua_${session.session_code}_${(session.exam_title || 'De_Thi').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`,
      buffer: excelBuffer
    };
  }

  /**
   * Xây dựng bản đồ tra cứu cấu hình ghi đè đáp án của ca thi
   * Hỗ trợ tìm kiếm theo ID câu hỏi, ID ngân hàng và nội dung text (kể cả có thẻ HTML)
   */
  prepareOverridesMap(sessionOverrides) {
    if (!sessionOverrides || typeof sessionOverrides !== 'object') {
      return { activeOverrides: {}, contentOverrides: {}, contentOverridesStripped: {} };
    }
    const cleanText = (str) => (str || '').trim().replace(/\s+/g, ' ');
    const stripHtml = (str) => (str || '').replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    const contentOverrides = {};
    const contentOverridesStripped = {};

    Object.keys(sessionOverrides).forEach(key => {
      const ovr = sessionOverrides[key];
      if (ovr && ovr.question_content) {
        contentOverrides[cleanText(ovr.question_content)] = ovr;
        contentOverridesStripped[stripHtml(ovr.question_content)] = ovr;
      }
    });
    return { activeOverrides: sessionOverrides, contentOverrides, contentOverridesStripped };
  }

  /**
   * Áp dụng lớp phủ ghi đè đáp án (Answer Key Overrides) lên 1 câu hỏi cụ thể của thí sinh
   * Tự động điều chỉnh: options, correctAnswers, isCorrect, scoreObtained, tfDetails, isOverridden
   */
  applyOverridesToQuestion(q, overridesMap, selectedOptions = [], ans = null) {
    const { activeOverrides = {}, contentOverrides = {}, contentOverridesStripped = {} } = overridesMap || {};
    const cleanText = (str) => (str || '').trim().replace(/\s+/g, ' ');
    const stripHtml = (str) => (str || '').replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');

    let options = Array.isArray(q.options) ? q.options : (q.options_json ? (() => { try { return JSON.parse(q.options_json); } catch (_) { return []; } })() : []);
    let correctAnswers = resolveCorrectAnswers(q);
    const maxScore = Number(q.max_score !== undefined ? q.max_score : (q.default_score !== undefined ? q.default_score : 0.25));

    const qClean = cleanText(q.content);
    const qStripped = stripHtml(q.content);
    const override = activeOverrides[q.id]
      || (q.bank_question_id && activeOverrides[q.bank_question_id])
      || (qClean && contentOverrides[qClean])
      || (qStripped && contentOverridesStripped[qStripped]);

    let isCorrect = null;
    let scoreObtained = (ans && ans.auto_score !== null && ans.auto_score !== undefined) ? Number(ans.auto_score) : 0;
    if (q.question_type === 'essay') {
      scoreObtained = (ans && ans.manual_score !== null && ans.manual_score !== undefined) ? Number(ans.manual_score) : 0;
    }
    let tfDetails = null;
    let isOverridden = false;
    let overrideInfo = null;

    if (override && q.question_type !== 'essay') {
      isOverridden = true;
      overrideInfo = {
        action: override.action,
        notes: override.notes || ''
      };

      if (override.action === 'full_credit') {
        isCorrect = true;
        scoreObtained = maxScore;
      } else if (override.action === 'accept_any') {
        isCorrect = selectedOptions.length > 0;
        scoreObtained = isCorrect ? maxScore : 0;
      } else if (override.action === 'override_answer' || override.action === 'accept_multiple') {
        let mappedCorrectIds = [];
        const overrideTexts = override.correct_option_texts || [];

        if (Array.isArray(options) && overrideTexts.length > 0) {
          overrideTexts.forEach(txt => {
            const targetClean = cleanText(txt).toLowerCase();
            const targetStripped = stripHtml(txt).toLowerCase();

            const matchedOpt = options.find(o => {
              const optText = o.text || o.content || '';
              return cleanText(optText).toLowerCase() === targetClean ||
                     stripHtml(optText).toLowerCase() === targetStripped;
            });

            if (matchedOpt && !mappedCorrectIds.includes(matchedOpt.id)) {
              mappedCorrectIds.push(matchedOpt.id);
            }
          });
        }

        if (mappedCorrectIds.length === 0) {
          mappedCorrectIds = override.correct_option_ids || [];
        }

        if (q.question_type === 'single_choice') {
          correctAnswers = mappedCorrectIds;
          isCorrect = selectedOptions.length > 0 && mappedCorrectIds.includes(selectedOptions[0]);
          if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
            scoreObtained = isCorrect ? maxScore : 0;
          }
        } else if (q.question_type === 'multiple_choice') {
          correctAnswers = mappedCorrectIds;
          if (override.action === 'accept_multiple') {
            isCorrect = selectedOptions.length > 0 && selectedOptions.some(s => mappedCorrectIds.includes(s));
          } else {
            const selSorted = [...selectedOptions].sort().join(',');
            const corSorted = [...mappedCorrectIds].sort().join(',');
            isCorrect = selSorted === corSorted && corSorted.length > 0;
          }
          if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
            scoreObtained = isCorrect ? maxScore : 0;
          }
        } else if (q.question_type === 'true_false') {
          const tfTarget = override.correct_tf_map || (mappedCorrectIds && mappedCorrectIds.length > 0 ? mappedCorrectIds : override.correct_option_ids);
          correctAnswers = tfTarget;
          const tfResult = calculateTrueFalseScore(selectedOptions, tfTarget, maxScore);
          isCorrect = tfResult.isAllCorrect;
          tfDetails = tfResult.details;
          if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
            scoreObtained = tfResult.scoreObtained;
          }
        } else if (q.question_type === 'short_answer') {
          if (overrideTexts.length > 0) {
            correctAnswers = overrideTexts;
          }
          const studentAns = ans ? (ans.short_answer || '') : '';
          const scoringConfig = q.scoring_config || (q.scoring_config_json ? (() => { try { return JSON.parse(q.scoring_config_json); } catch (_) { return {}; } })() : {});
          isCorrect = gradeShortAnswer(studentAns, correctAnswers, scoringConfig);
          if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
            scoreObtained = isCorrect ? maxScore : 0;
          }
        }
      }
    } else {
      // Không có override, chấm chuẩn theo dữ liệu gốc
      if (q.question_type === 'single_choice') {
        isCorrect = selectedOptions.length > 0 && selectedOptions[0] === correctAnswers[0];
      } else if (q.question_type === 'true_false') {
        const tfResult = calculateTrueFalseScore(selectedOptions, correctAnswers, maxScore);
        isCorrect = tfResult.isAllCorrect;
        tfDetails = tfResult.details;
        if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
          scoreObtained = tfResult.scoreObtained;
        }
      } else if (q.question_type === 'multiple_choice') {
        const selSorted = [...selectedOptions].sort().join(',');
        const corSorted = [...correctAnswers].sort().join(',');
        isCorrect = selSorted === corSorted && corSorted.length > 0;
      } else if (q.question_type === 'short_answer') {
        const studentAns = ans ? (ans.short_answer || '') : '';
        const scoringConfig = q.scoring_config || (q.scoring_config_json ? (() => { try { return JSON.parse(q.scoring_config_json); } catch (_) { return {}; } })() : {});
        isCorrect = gradeShortAnswer(studentAns, correctAnswers, scoringConfig);
        if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
          scoreObtained = isCorrect ? maxScore : 0;
        }
      }
    }

    return {
      options,
      correctAnswers,
      isCorrect,
      scoreObtained,
      tfDetails,
      isOverridden,
      overrideInfo
    };
  }

  /**
   * Điều chỉnh đáp án ca thi & chấm lại toàn bộ ca thi
   */
  regradeSession(sessionId, overrides = null) {
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) throw new Error('Ca thi không tồn tại');

    let activeOverrides = overrides;
    if (activeOverrides !== null && activeOverrides !== undefined) {
      db.prepare('UPDATE exam_sessions SET answer_key_overrides_json = ? WHERE id = ?')
        .run(JSON.stringify(activeOverrides), sessionId);
    } else {
      try {
        activeOverrides = session.answer_key_overrides_json ? JSON.parse(session.answer_key_overrides_json) : {};
      } catch (e) {
        activeOverrides = {};
      }
    }

    if (!activeOverrides || typeof activeOverrides !== 'object') {
      activeOverrides = {};
    }

    // Load master questions (nếu có đề tĩnh)
    const masterQMap = {};
    if (session.exam_id) {
      const masterQuestions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(session.exam_id);
      masterQuestions.forEach(q => {
        masterQMap[q.id] = {
          ...q,
          options: q.options_json ? JSON.parse(q.options_json) : [],
          correct_answers: q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []
        };
      });
    }

    const attempts = db.prepare('SELECT * FROM student_attempts WHERE session_id = ?').all(sessionId);
    const updateAnswerScore = db.prepare('UPDATE student_answers SET auto_score = ? WHERE id = ?');
    const updateAttemptScores = db.prepare('UPDATE student_attempts SET mcq_score = ?, total_score = ? WHERE id = ?');

    // Xây dựng bản đồ overrides chuẩn hóa
    const overridesMap = this.prepareOverridesMap(activeOverrides);

    let rescoredCount = 0;

    for (const attempt of attempts) {
      let studentQMap = {};
      if (attempt.exam_paper_json) {
        try {
          const paper = JSON.parse(attempt.exam_paper_json);
          (paper.questions || []).forEach(q => {
            studentQMap[q.id] = q;
          });
        } catch (e) {}
      }

      // Lấy toàn bộ student_answers mà KHÔNG DÙNG JOIN questions
      const answers = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(attempt.id);

      let totalMcqScore = 0.0;

      for (const ans of answers) {
        const attemptQ = studentQMap[ans.question_id];
        const masterQ = masterQMap[ans.question_id];
        const qDef = attemptQ || masterQ;
        if (!qDef) continue;

        if (qDef.question_type === 'essay') {
          continue; // Giữ nguyên điểm tự luận do giáo viên chấm
        }

        let selected = [];
        if (ans.selected_options_json) {
          try { selected = JSON.parse(ans.selected_options_json); } catch (e) {}
        }

        const evalRes = this.applyOverridesToQuestion(qDef, overridesMap, selected, ans);
        const score = evalRes.scoreObtained;

        updateAnswerScore.run(score, ans.id);
        totalMcqScore += score;
      }

      totalMcqScore = Math.round(totalMcqScore * 100) / 100;
      const totalScore = Math.round((totalMcqScore + (attempt.essay_score || 0)) * 100) / 100;
      updateAttemptScores.run(totalMcqScore, totalScore, attempt.id);
      rescoredCount++;
    }

    return {
      success: true,
      sessionId,
      rescoredCount,
      overrides: activeOverrides
    };
  }
}

GradingService.prototype.gradeShortAnswer = gradeShortAnswer;
const serviceInstance = new GradingService();
serviceInstance.gradeShortAnswer = gradeShortAnswer;
serviceInstance.DEFAULT_SHORT_ANSWER_SCORING_CONFIG = DEFAULT_SHORT_ANSWER_SCORING_CONFIG;

module.exports = serviceInstance;
module.exports.gradeShortAnswer = gradeShortAnswer;
module.exports.DEFAULT_SHORT_ANSWER_SCORING_CONFIG = DEFAULT_SHORT_ANSWER_SCORING_CONFIG;
