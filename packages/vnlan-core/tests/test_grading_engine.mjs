import assert from 'node:assert';
import {
  gradeSingleQuestion,
  gradeSubmission,
  gradeShortAnswer,
  calculateTrueFalseScore,
  parseNumericFractionOrDecimal
} from '../src/index.js';

console.log('================================================================');
console.log('  BỘ KIỂM THỬ TOÀN DIỆN VNLAN CORE GRADING ENGINE (V2026.1)     ');
console.log('================================================================');

let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`[PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${description}`);
    console.error(`       Lỗi: ${err.message}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// NHÓM 1: CÂU HỎI TRẮC NGHIỆM ĐƠN (single_choice)
// -------------------------------------------------------------
it('SC-01: Chọn đúng đáp án duy nhất -> Đạt điểm tối đa', () => {
  const q = { question_type: 'single_choice', correct_answers: ['B'], max_score: 0.25 };
  const res = gradeSingleQuestion(q, { selected_options: ['B'] });
  assert.strictEqual(res.scoreObtained, 0.25);
  assert.strictEqual(res.isCorrect, true);
});

it('SC-02: Chọn sai đáp án -> 0.0 điểm', () => {
  const q = { question_type: 'single_choice', correct_answers: ['B'], max_score: 0.25 };
  const res = gradeSingleQuestion(q, { selected_options: ['A'] });
  assert.strictEqual(res.scoreObtained, 0.0);
  assert.strictEqual(res.isCorrect, false);
});

it('SC-03: Thí sinh để trống -> 0.0 điểm', () => {
  const q = { question_type: 'single_choice', correct_answers: ['B'], max_score: 0.25 };
  const res = gradeSingleQuestion(q, { selected_options: [] });
  assert.strictEqual(res.scoreObtained, 0.0);
  assert.strictEqual(res.isCorrect, false);
});

// -------------------------------------------------------------
// NHÓM 2: TRẮC NGHIỆM NHIỀU ĐÁP ÁN (multiple_choice)
// -------------------------------------------------------------
it('MC-01: Chọn đủ và đúng toàn bộ tập hợp đáp án -> Đạt điểm tối đa', () => {
  const q = { question_type: 'multiple_choice', correct_answers: ['A', 'C'], max_score: 0.5 };
  const res = gradeSingleQuestion(q, { selected_options: ['C', 'A'] }); // Thứ tự đảo vẫn đúng
  assert.strictEqual(res.scoreObtained, 0.5);
  assert.strictEqual(res.isCorrect, true);
});

it('MC-02: Chọn thiếu đáp án -> 0.0 điểm', () => {
  const q = { question_type: 'multiple_choice', correct_answers: ['A', 'C'], max_score: 0.5 };
  const res = gradeSingleQuestion(q, { selected_options: ['A'] });
  assert.strictEqual(res.scoreObtained, 0.0);
  assert.strictEqual(res.isCorrect, false);
});

it('MC-03: Chọn thừa đáp án sai -> 0.0 điểm', () => {
  const q = { question_type: 'multiple_choice', correct_answers: ['A', 'C'], max_score: 0.5 };
  const res = gradeSingleQuestion(q, { selected_options: ['A', 'B', 'C'] });
  assert.strictEqual(res.scoreObtained, 0.0);
  assert.strictEqual(res.isCorrect, false);
});

// -------------------------------------------------------------
// NHÓM 3: ĐÚNG/SAI THEO CHUẨN BỘ GD&ĐT 2025 (true_false)
// Thang điểm lũy tiến: 0.10, 0.25, 0.50, 1.00
// -------------------------------------------------------------
it('TF-01: Đúng 1 ý trên 4 ý -> 0.10 điểm (10% maxScore)', () => {
  const q = {
    question_type: 'true_false',
    correct_answers: { a: 'T', b: 'F', c: 'T', d: 'F' },
    max_score: 1.0
  };
  // Thí sinh chỉ đoán đúng ý a, các ý khác sai hoặc bỏ trống
  const res = gradeSingleQuestion(q, { true_false_answers: { a: 'T', b: 'T', c: 'F', d: 'T' } });
  assert.strictEqual(res.scoreObtained, 0.10);
  assert.strictEqual(res.isCorrect, false);
});

it('TF-02: Đúng 2 ý trên 4 ý -> 0.25 điểm (25% maxScore)', () => {
  const q = {
    question_type: 'true_false',
    correct_answers: { a: 'T', b: 'F', c: 'T', d: 'F' },
    max_score: 1.0
  };
  const res = gradeSingleQuestion(q, { true_false_answers: { a: 'T', b: 'F', c: 'F', d: 'T' } });
  assert.strictEqual(res.scoreObtained, 0.25);
  assert.strictEqual(res.isCorrect, false);
});

it('TF-03: Đúng 3 ý trên 4 ý -> 0.50 điểm (50% maxScore)', () => {
  const q = {
    question_type: 'true_false',
    correct_answers: { a: 'T', b: 'F', c: 'T', d: 'F' },
    max_score: 1.0
  };
  const res = gradeSingleQuestion(q, { true_false_answers: { a: 'T', b: 'F', c: 'T', d: 'T' } });
  assert.strictEqual(res.scoreObtained, 0.50);
  assert.strictEqual(res.isCorrect, false);
});

it('TF-04: Đúng cả 4 ý -> 1.00 điểm (100% maxScore)', () => {
  const q = {
    question_type: 'true_false',
    correct_answers: { a: 'T', b: 'F', c: 'T', d: 'F' },
    max_score: 1.0
  };
  const res = gradeSingleQuestion(q, { true_false_answers: { a: 'T', b: 'F', c: 'T', d: 'F' } });
  assert.strictEqual(res.scoreObtained, 1.00);
  assert.strictEqual(res.isCorrect, true);
});

it('TF-05: Bỏ trống hoàn toàn không chọn ý nào -> 0.00 điểm (không bị ăn điểm F mặc định)', () => {
  const q = {
    question_type: 'true_false',
    correct_answers: { a: 'F', b: 'F', c: 'F', d: 'F' },
    max_score: 1.0
  };
  const res = gradeSingleQuestion(q, { true_false_answers: {} });
  assert.strictEqual(res.scoreObtained, 0.00);
  assert.strictEqual(res.isCorrect, false);
});

// -------------------------------------------------------------
// NHÓM 4: TRẢ LỜI NGẮN (short_answer)
// -------------------------------------------------------------
it('SA-01: Tương đương dấu phẩy và dấu chấm (2,5 khớp 2.5)', () => {
  const q = {
    question_type: 'short_answer',
    correct_answers: ['2.5'],
    max_score: 0.25,
    scoring_config: { allow_comma_dot_equivalence: true }
  };
  const res = gradeSingleQuestion(q, { short_answer: '2,5' });
  assert.strictEqual(res.scoreObtained, 0.25);
  assert.strictEqual(res.isCorrect, true);
});

it('SA-02: Chuẩn hóa dấu âm en-dash và em-dash (-5)', () => {
  const q = {
    question_type: 'short_answer',
    correct_answers: ['-5'],
    max_score: 0.25
  };
  // Ký tự unicode minus \u2212
  const res = gradeSingleQuestion(q, { short_answer: '\u22125' });
  assert.strictEqual(res.scoreObtained, 0.25);
  assert.strictEqual(res.isCorrect, true);
});

it('SA-03: Tương đương phân số số học (1/2 tương đương 0.5 khi bật numeric_equivalence)', () => {
  const q = {
    question_type: 'short_answer',
    correct_answers: ['0.5'],
    max_score: 0.25,
    scoring_config: { grading_policy: { numeric_equivalence: true } }
  };
  const res = gradeSingleQuestion(q, { short_answer: '1/2' });
  assert.strictEqual(res.scoreObtained, 0.25);
  assert.strictEqual(res.isCorrect, true);
});

it('SA-04: Ràng buộc phiếu thi 4 ô THPT (vượt quá 4 ký tự bị từ chối)', () => {
  const q = {
    question_type: 'short_answer',
    correct_answers: ['12345'],
    max_score: 0.25,
    scoring_config: { answer_format: 'exam_sheet', exam_constraints: { max_characters: 4 } }
  };
  const res = gradeSingleQuestion(q, { short_answer: '12345' });
  assert.strictEqual(res.isCorrect, false); // Quá 4 ký tự phiếu thi
});

// -------------------------------------------------------------
// NHÓM 5: ĐIỀU CHỈNH ĐÁP ÁN CỦA GIÁM KHẢO (TEACHER OVERRIDES)
// -------------------------------------------------------------
it('OVR-01: Tặng điểm toàn bộ (full_credit) câu bị lỗi đề', () => {
  const q = { id: 'q-err', question_type: 'single_choice', correct_answers: ['A'], max_score: 0.25 };
  const override = { type: 'full_credit', reason: 'Đề in mờ' };
  // Học sinh chọn sai D nhưng được tặng điểm
  const res = gradeSingleQuestion(q, { selected_options: ['D'] }, override);
  assert.strictEqual(res.scoreObtained, 0.25);
  assert.strictEqual(res.isCorrect, true);
  assert.strictEqual(res.isOverridden, true);
});

it('OVR-02: Chấp nhận nhiều đáp án (accept_multiple)', () => {
  const q = { id: 'q-ambig', question_type: 'single_choice', correct_answers: ['A'], max_score: 0.25 };
  const override = { type: 'accept_multiple', acceptable_options: ['A', 'C'] };
  const res = gradeSingleQuestion(q, { selected_options: ['C'] }, override);
  assert.strictEqual(res.scoreObtained, 0.25);
  assert.strictEqual(res.isCorrect, true);
});

// -------------------------------------------------------------
// NHÓM 6: CHẤM TOÀN BỘ BÀI THI (gradeSubmission)
// -------------------------------------------------------------
it('SUB-01: Chấm bài thi tổng hợp đa phần I, II, III, IV', () => {
  const questions = [
    { id: 'q1', question_type: 'single_choice', correct_answers: ['A'], max_score: 0.25 },
    { id: 'q2', question_type: 'single_choice', correct_answers: ['B'], max_score: 0.25 },
    { id: 'q3', question_type: 'true_false', correct_answers: { a: 'T', b: 'T', c: 'T', d: 'T' }, max_score: 1.0 },
    { id: 'q4', question_type: 'short_answer', correct_answers: ['3.14'], max_score: 0.5 },
    { id: 'q5', question_type: 'essay', max_score: 2.0 }
  ];

  const studentAnswers = {
    q1: { selected_options: ['A'] }, // Đúng -> 0.25
    q2: { selected_options: ['C'] }, // Sai -> 0.00
    q3: { true_false_answers: { a: 'T', b: 'T', c: 'F', d: 'F' } }, // Đúng 2 ý -> 0.25
    q4: { short_answer: '3,14' },    // Đúng -> 0.50
    q5: { essay_content: 'Bài văn...', manual_score: 1.5 } // Tự luận -> 1.50
  };

  const result = gradeSubmission(questions, studentAnswers);

  // MCQ Score = 0.25 + 0.00 + 0.25 + 0.50 = 1.00
  assert.strictEqual(result.mcqScore, 1.00);
  // Essay Score = 1.50
  assert.strictEqual(result.essayScore, 1.50);
  // Total = 2.50
  assert.strictEqual(result.totalScore, 2.50);
  assert.strictEqual(result.totalQuestions, 5);
  assert.strictEqual(result.answeredCount, 5);
  assert.strictEqual(result.gradingVersion, 1);
});

console.log('================================================================');
console.log(`  TỔNG KẾT: ${passedTests} PASS, ${failedTests} FAIL`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
