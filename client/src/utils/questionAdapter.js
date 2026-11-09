/**
 * Question Data Adapter - Chuẩn hóa dữ liệu câu hỏi 2 chiều giữa Canvas và Modal TipTap
 * Đảm bảo Single Source of Truth cho toàn bộ hệ thống Khảo thí VNLAN
 */

import { normalizeTrueFalseMap } from './trueFalseHelper';

export function generateQuestionUid() {
  return `uid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_SHORT_ANSWER_SCORING_CONFIG = {
  answer_format: 'decimal',
  grading_policy: {
    allow_comma_dot_equivalence: true,
    case_sensitive: false,
    trim_whitespace: true,
    numeric_equivalence: false
  },
  exam_constraints: {
    mode: 'free',
    max_characters: null,
    allowed_characters: null
  },
  // Flattened compatibility
  allow_comma_dot_equivalence: true,
  case_sensitive: false,
  trim_whitespace: true,
  numeric_equivalence: false,
  max_characters: null
};

/**
 * Chuẩn hóa 1 câu hỏi từ bất kỳ nguồn nào (Word import, CSDL cũ, Form state)
 * thành cấu trúc chuẩn 3 lớp ổn định
 */
export function normalizeQuestion(rawQ) {
  if (!rawQ || typeof rawQ !== 'object') {
    return {
      _uid: generateQuestionUid(),
      question_type: 'single_choice',
      content: '',
      options: [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' }
      ],
      correct_answers: ['A'],
      short_answer: '',
      scoring_config: null,
      rubric_guide: '',
      max_score: 0.25
    };
  }

  const qType = rawQ.question_type || 'single_choice';
  const isShort = qType === 'short_answer';
  const isTf = qType === 'true_false';

  // 1. Gán _uid ổn định nếu chưa có
  const uid = rawQ._uid || (rawQ.id ? `db_${rawQ.id}` : generateQuestionUid());

  // 2. Chuẩn hóa correct_answers
  let correctAnswers = [];
  if (isTf) {
    // Chuẩn hóa bảo toàn dữ liệu bằng Single Source of Truth
    correctAnswers = normalizeTrueFalseMap(rawQ.correct_answers, null);
  } else {
    if (Array.isArray(rawQ.correct_answers)) {
      correctAnswers = rawQ.correct_answers.map(String).map(s => s.trim()).filter(Boolean);
    } else if (typeof rawQ.correct_answers === 'string') {
      try {
        const parsed = JSON.parse(rawQ.correct_answers);
        if (Array.isArray(parsed)) {
          correctAnswers = parsed.map(String).map(s => s.trim()).filter(Boolean);
        } else if (parsed && typeof parsed === 'object') {
          correctAnswers = parsed;
        } else {
          correctAnswers = rawQ.correct_answers.trim() ? [rawQ.correct_answers.trim()] : [];
        }
      } catch (e) {
        correctAnswers = rawQ.correct_answers.trim() ? [rawQ.correct_answers.trim()] : [];
      }
    } else if (isShort && rawQ.short_answer) {
      correctAnswers = [String(rawQ.short_answer).trim()];
    }
  }

  // 3. Đồng bộ short_answer
  let shortAnswer = '';
  if (isShort) {
    shortAnswer = Array.isArray(correctAnswers) && correctAnswers.length > 0
      ? correctAnswers[0]
      : (rawQ.short_answer || '');
  }

  // 4. Chuẩn hóa scoring_config
  let scoringConfig = null;
  if (isShort) {
    const rawCfg = rawQ.scoring_config || (rawQ.scoring_config_json ? (typeof rawQ.scoring_config_json === 'string' ? JSON.parse(rawQ.scoring_config_json) : rawQ.scoring_config_json) : null) || {};
    const policy = rawCfg.grading_policy || {};
    const constraints = rawCfg.exam_constraints || {};

    const allowCommaDot = policy.allow_comma_dot_equivalence ?? rawCfg.allow_comma_dot_equivalence ?? true;
    const caseSensitive = policy.case_sensitive ?? rawCfg.case_sensitive ?? false;
    const trimWhitespace = policy.trim_whitespace ?? rawCfg.trim_whitespace ?? true;
    const numericEquiv = policy.numeric_equivalence ?? rawCfg.numeric_equivalence ?? false;
    const isSheet = rawCfg.answer_format === 'exam_sheet' || constraints.mode === 'exam_sheet_4';

    scoringConfig = {
      answer_format: rawCfg.answer_format || (isSheet ? 'exam_sheet' : 'decimal'),
      grading_policy: {
        allow_comma_dot_equivalence: allowCommaDot,
        case_sensitive: caseSensitive,
        trim_whitespace: trimWhitespace,
        numeric_equivalence: numericEquiv
      },
      exam_constraints: {
        mode: isSheet ? 'exam_sheet_4' : (constraints.mode || 'free'),
        max_characters: isSheet ? 4 : (constraints.max_characters ?? rawCfg.max_characters ?? null),
        allowed_characters: isSheet ? '^[0-9,.-]+$' : (constraints.allowed_characters ?? null)
      },
      allow_comma_dot_equivalence: allowCommaDot,
      case_sensitive: caseSensitive,
      trim_whitespace: trimWhitespace,
      numeric_equivalence: numericEquiv,
      max_characters: isSheet ? 4 : (constraints.max_characters ?? rawCfg.max_characters ?? null)
    };
  }

  // 5. Chuẩn hóa options
  let options = [];
  if (Array.isArray(rawQ.options)) {
    options = rawQ.options.map(opt => {
      const optText = String(opt.text !== undefined ? opt.text : (opt.content !== undefined ? opt.content : ''));
      return {
        id: String(opt.id || '').toUpperCase(),
        text: optText,
        content: optText,
        is_fixed: Boolean(opt.is_fixed)
      };
    });
  }

  return {
    ...rawQ,
    _uid: uid,
    question_type: qType,
    content: rawQ.content || '',
    options,
    correct_answers: correctAnswers,
    short_answer: shortAnswer,
    scoring_config: scoringConfig,
    rubric_guide: rawQ.rubric_guide || '',
    max_score: Number(rawQ.max_score !== undefined ? rawQ.max_score : (qType === 'short_answer' ? 0.5 : (qType === 'true_false' ? 1.0 : (qType === 'essay' ? 2.0 : 0.25))))
  };
}

/**
 * Deep clone an toàn câu hỏi để làm bản nháp độc lập
 */
export function deepCloneQuestion(q) {
  if (!q) return null;
  return JSON.parse(JSON.stringify(normalizeQuestion(q)));
}
