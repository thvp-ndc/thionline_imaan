/**
 * @vnlan/core - Entry Point
 * Nền tảng nghiệp vụ dùng chung của Hệ sinh thái Khảo thí Lai VNLAN
 */

const {
  extractTrueFalseChoice,
  normalizeTrueFalseMap,
  calculateTrueFalseScore,
  resolveCorrectAnswers
} = require('./trueFalseUtils');

const {
  gradeSingleQuestion,
  gradeSubmission,
  gradeShortAnswer,
  parseNumericFractionOrDecimal
} = require('./gradingEngine');

const {
  IExamRepository
} = require('./contracts/IExamRepository');

module.exports = {
  // Grading Engine
  gradeSingleQuestion,
  gradeSubmission,
  gradeShortAnswer,
  parseNumericFractionOrDecimal,

  // True/False Utils
  extractTrueFalseChoice,
  normalizeTrueFalseMap,
  calculateTrueFalseScore,
  resolveCorrectAnswers,

  // Architecture Contracts
  IExamRepository
};
