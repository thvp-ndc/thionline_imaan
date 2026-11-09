/**
 * @vnlan/core - True/False Question Utilities
 * Tuân thủ chuẩn cấu trúc Bộ GD&ĐT 2025:
 * Thang điểm lũy tiến 4 ý:
 * - Đúng 1 ý: 0.10 điểm (10% maxScore)
 * - Đúng 2 ý: 0.25 điểm (25% maxScore)
 * - Đúng 3 ý: 0.50 điểm (50% maxScore)
 * - Đúng 4 ý: 1.00 điểm (100% maxScore)
 * - Đúng 0 ý: 0.00 điểm
 */

function extractTrueFalseChoice(data, letter) {
  if (!data || !letter) return null;
  const key = String(letter).trim().toLowerCase();

  // 1. Data dạng Object: { a: 'T', b: 'F' } hoặc { A: 'T' }
  if (typeof data === 'object' && !Array.isArray(data)) {
    const rawVal = data[key] !== undefined ? data[key] : (data[key.toUpperCase()] !== undefined ? data[key.toUpperCase()] : null);
    if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
      const v = String(rawVal).trim().toUpperCase();
      if (v === 'T' || v === 'Đ' || v === 'D' || v === 'TRUE' || v === '1') return 'T';
      if (v === 'F' || v === 'S' || v === 'FALSE' || v === '0') return 'F';
    }
    return null;
  }

  // 2. Data dạng Mảng: ['a:T', 'b:F'] hoặc ['a=T', 'b=F'] hoặc ['a-T', 'b-F']
  if (Array.isArray(data)) {
    const found = data.find(x => {
      if (typeof x !== 'string') return false;
      const lower = x.toLowerCase();
      return lower.startsWith(key + ':') || lower.startsWith(key + '=') || lower.startsWith(key + '-');
    });
    if (found) {
      const part = found.split(/[:=\-]/)[1]?.trim().toUpperCase();
      if (part === 'T' || part === 'Đ' || part === 'D' || part === 'TRUE' || part === '1') return 'T';
      if (part === 'F' || part === 'S' || part === 'FALSE' || part === '0') return 'F';
    }

    // Trường hợp mảng chỉ chứa các phím được chọn là Đúng: ['a', 'c']
    const hasKeyValue = data.some(x => typeof x === 'string' && (x.includes(':') || x.includes('=') || x.includes('-')));
    if (!hasKeyValue && data.length > 0) {
      const set = new Set(data.map(x => String(x).trim().toLowerCase()));
      const allValidLetters = data.every(x => typeof x === 'string' && ['a', 'b', 'c', 'd'].includes(x.trim().toLowerCase()));
      if (allValidLetters) {
        return set.has(key) ? 'T' : 'F';
      }
      if (set.has(key)) return 'T';
    }
  }

  return null;
}

function normalizeTrueFalseMap(val, defaultUnset = null) {
  const result = { a: defaultUnset, b: defaultUnset, c: defaultUnset, d: defaultUnset };
  if (!val) return result;

  for (const k of ['a', 'b', 'c', 'd']) {
    const choice = extractTrueFalseChoice(val, k);
    result[k] = choice !== null ? choice : defaultUnset;
  }

  return result;
}

function calculateTrueFalseScore(studentSelected, correctAnswer, maxScore = 1.0, subKeys = ['a', 'b', 'c', 'd']) {
  // Bài làm học sinh: nếu chưa chọn ý nào thì giữ nguyên null (không tự ý gán F)
  const studentMap = normalizeTrueFalseMap(studentSelected, null);
  // Đáp án chuẩn của đề thi: mặc định 'F' nếu thiếu
  const correctMap = normalizeTrueFalseMap(correctAnswer, 'F');

  let correctCount = 0;
  const details = {};

  subKeys.forEach(k => {
    const studentChoice = studentMap[k];
    const keyChoice = correctMap[k];
    // Đúng khi và chỉ khi thí sinh CÓ chọn và lựa chọn trùng với đáp án đúng
    const isItemCorrect = (studentChoice !== null && studentChoice !== undefined && studentChoice === keyChoice);
    if (isItemCorrect) correctCount++;
    details[k] = {
      studentChoice, // 'T', 'F', hoặc null (Chưa chọn)
      keyChoice,     // 'T' hoặc 'F'
      isCorrect: isItemCorrect
    };
  });

  const ratios = [0.0, 0.10, 0.25, 0.50, 1.00];
  const ratio = (subKeys.length === 4 && correctCount <= 4)
    ? (ratios[correctCount] ?? 0.0)
    : (correctCount / (subKeys.length || 1));

  const scoreObtained = Math.round(Number(maxScore) * ratio * 100) / 100;

  return {
    correctCount,
    totalSubItems: subKeys.length,
    ratio,
    scoreObtained,
    isAllCorrect: correctCount === subKeys.length,
    details
  };
}

function resolveCorrectAnswers(q) {
  if (!q) return [];
  let ca = [];
  if (q.correct_answers !== undefined && q.correct_answers !== null) {
    ca = q.correct_answers;
  } else if (q.correct_answers_json) {
    try { ca = JSON.parse(q.correct_answers_json); } catch (e) { ca = []; }
  }
  if (typeof ca === 'string') {
    try { ca = JSON.parse(ca); } catch (e) {}
  }
  return ca;
}

module.exports = {
  extractTrueFalseChoice,
  normalizeTrueFalseMap,
  calculateTrueFalseScore,
  resolveCorrectAnswers
};
